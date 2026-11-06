// Recording a voice message with the microphone.
//
//   const recording = await startRecording({ onLevel, onEnd });
//   const { blob, duration, mime } = await recording.stop();     // or recording.cancel()
//
// The sound is recorded by the browser (MediaRecorder) as Opus in a WebM, Ogg or MP4 container, at a low bit rate:
// a minute of speech is about 160 KB. Nothing leaves the device here: the recording becomes an ordinary attachment,
// which is encrypted in the browser before it is uploaded (see api.js / crypto.js).
//
// Errors are VoiceError objects with a `code`: 'insecure' | 'unsupported' | 'denied' | 'no_device' | 'failed' |
// 'too_short'. The interface turns them into text (chat.voice.errors.<code>).

import { MAX_VOICE_SECONDS } from './envelope';

export { MAX_VOICE_SECONDS };
export const MIN_VOICE_SECONDS = 0.6;       // shorter is an accidental click, not a message
const BITS_PER_SECOND = 32000;

// In the order of preference. The first one this browser can record is used.
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4',
];

export class VoiceError extends Error {
  // `detail` is the technical name of what went wrong ("NotReadableError"); it is shown next to a "failed" message,
  // so that a person who reports a problem can tell what it was.
  constructor(code, detail = null) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

// null when recording is possible, otherwise the reason (an error code).
export function voiceUnavailableReason() {
  if (typeof MediaRecorder === 'undefined') return 'unsupported';
  if (!navigator.mediaDevices?.getUserMedia) {
    // browsers hide the microphone from pages that are not served over HTTPS (localhost is fine)
    return window.isSecureContext === false ? 'insecure' : 'unsupported';
  }
  return null;
}

function pickMimeType() {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

// ONE audio context for the whole page, used only for the level indicator. A new one per recording used to be
// created and closed; browsers allow only a few (Chrome: 6) and free closed ones late, so after a few recordings
// the indicator silently stopped working (the recording itself was fine).
let sharedContext = null;
function getAudioContext() {
  if (typeof window.AudioContext === 'undefined') return null;
  if (!sharedContext || sharedContext.state === 'closed') {
    try {
      sharedContext = new window.AudioContext();
    } catch (error) {
      console.warn('[voice] the level indicator is not available:', error);
      sharedContext = null;
    }
  }
  return sharedContext;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Opens the microphone. Right after a recording the device can still be "busy" (typical with Bluetooth headsets,
// which switch their mode, and with some drivers): the browser then fails with NotReadableError / AbortError,
// and the same request a moment later works. So those two are retried, twice, with a short wait.
const RETRY_DELAYS_MS = [250, 700];

async function openMicrophone() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      const busy = error?.name === 'NotReadableError' || error?.name === 'AbortError';
      if (!busy || attempt >= RETRY_DELAYS_MS.length) throw error;
      console.warn(`[voice] the microphone is busy (${error.name}), trying again`);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function errorCodeFor(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no_device';
    default:
      return 'failed';
  }
}

// Starts recording. Resolves when the microphone is open and recording has begun
// (the browser may ask the person for permission first, which can take a while).
//   onLevel(0..1)                  how loud it is now (about 12 times a second), for the level indicator
//   onEnd(result, error, reason)   the recording ended by itself: reason is 'limit' (maximum length),
//                                  'device' (the microphone was disconnected / taken away) or 'error'
export async function startRecording({ onLevel, onEnd, maxSeconds = MAX_VOICE_SECONDS } = {}) {
  const unavailable = voiceUnavailableReason();
  if (unavailable) throw new VoiceError(unavailable);

  let stream;
  try {
    stream = await openMicrophone();
  } catch (error) {
    console.warn('[voice] cannot open the microphone:', error);
    throw new VoiceError(errorCodeFor(error), error?.name ?? null);
  }

  const releaseMicrophone = () => stream.getTracks().forEach((track) => track.stop());  // turns the browser's red dot off

  let recorder;
  try {
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: BITS_PER_SECOND } : undefined);
  } catch (error) {
    console.warn('[voice] cannot start the recorder:', error);
    releaseMicrophone();
    throw new VoiceError('failed', error?.name ?? 'MediaRecorder');
  }

  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  // level indicator (it never affects the recording itself)
  const audioContext = onLevel ? getAudioContext() : null;
  let source = null;
  let analyser = null;
  let frame = null;
  if (audioContext) {
    try {
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let lastReport = 0;
      const tick = (now) => {
        frame = requestAnimationFrame(tick);
        if (now - lastReport < 80) return;
        lastReport = now;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) sum += ((value - 128) / 128) ** 2;
        onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 3));
      };
      frame = requestAnimationFrame(tick);
    } catch (error) {
      console.warn('[voice] the level indicator is not available:', error);
      source = null;
    }
  }

  const startedAt = performance.now();
  let result = null;          // the promise of stop(), so that stopping twice does the same thing once
  let limitTimer = null;

  const release = () => {
    clearTimeout(limitTimer);
    if (frame !== null) cancelAnimationFrame(frame);
    source?.disconnect();
    analyser?.disconnect();
    audioContext?.suspend?.().catch(() => {});   // the shared context rests until the next recording
    releaseMicrophone();
  };

  const stop = () => {
    if (result) return result;
    result = new Promise((resolve, reject) => {
      const duration = (performance.now() - startedAt) / 1000;
      recorder.onstop = () => {
        release();
        if (duration < MIN_VOICE_SECONDS) return reject(new VoiceError('too_short'));
        const mime = (recorder.mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
        const blob = new Blob(chunks, { type: mime });
        if (blob.size === 0) {
          console.warn('[voice] the recorder produced no data');
          return reject(new VoiceError('failed', 'no data'));
        }
        resolve({ blob, mime, duration: Math.round(duration * 10) / 10 });
      };
      try {
        if (recorder.state === 'inactive') recorder.onstop();
        else recorder.stop();
      } catch (error) {
        console.warn('[voice] cannot stop the recorder:', error);
        release();
        reject(new VoiceError('failed', error?.name ?? 'MediaRecorder'));
      }
    });
    return result;
  };

  // Throws the recording away. Safe to call at any time and more than once.
  const cancel = () => {
    if (!result) {
      result = Promise.resolve(null);
      recorder.onstop = null;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
      release();
    }
  };

  // The recording ends by itself: the time is up, the microphone was disconnected (a headset switched off, a
  // Bluetooth profile change, an unplugged cable: the browser ends the track), or the recorder failed.
  const endByItself = (reason) => {
    if (result) return;
    stop().then((r) => onEnd?.(r, null, reason)).catch((e) => onEnd?.(null, e, reason));
  };
  stream.getAudioTracks().forEach((track) => { track.onended = () => endByItself('device'); });
  recorder.onerror = (event) => {
    console.warn('[voice] the recorder failed:', event?.error ?? event);
    endByItself('error');
  };

  recorder.start(250);   // a piece of the recording every 250 ms, so little is lost if something goes wrong

  limitTimer = setTimeout(() => endByItself('limit'), maxSeconds * 1000);

  return { stop, cancel };
}
