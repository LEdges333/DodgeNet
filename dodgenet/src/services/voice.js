// Recording a voice message with the microphone.
//
//   const recording = await startRecording({ onLevel, onLimit });
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
  constructor(code) {
    super(code);
    this.code = code;
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
//   onLevel(0..1)            how loud it is now (about 12 times a second), for the level indicator
//   onLimit(result, error)   the maximum length was reached: the recording was stopped by itself
export async function startRecording({ onLevel, onLimit, maxSeconds = MAX_VOICE_SECONDS } = {}) {
  const unavailable = voiceUnavailableReason();
  if (unavailable) throw new VoiceError(unavailable);

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    throw new VoiceError(errorCodeFor(error));
  }

  const releaseMicrophone = () => stream.getTracks().forEach((track) => track.stop());  // turns the browser's red dot off

  let recorder;
  try {
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: BITS_PER_SECOND } : undefined);
  } catch {
    releaseMicrophone();
    throw new VoiceError('failed');
  }

  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  // level indicator
  let audioContext = null;
  let frame = null;
  if (onLevel && typeof window.AudioContext !== 'undefined') {
    try {
      audioContext = new window.AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
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
    } catch {
      audioContext = null;   // no level indicator, the recording itself is not affected
    }
  }

  const startedAt = performance.now();
  let result = null;          // the promise of stop(), so that stopping twice does the same thing once
  let limitTimer = null;

  const release = () => {
    clearTimeout(limitTimer);
    if (frame !== null) cancelAnimationFrame(frame);
    audioContext?.close?.().catch(() => {});
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
        if (blob.size === 0) return reject(new VoiceError('failed'));
        resolve({ blob, mime, duration: Math.round(duration * 10) / 10 });
      };
      recorder.onerror = () => { release(); reject(new VoiceError('failed')); };
      try {
        if (recorder.state === 'inactive') recorder.onstop();
        else recorder.stop();
      } catch {
        release();
        reject(new VoiceError('failed'));
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

  recorder.start(250);   // a piece of the recording every 250 ms, so little is lost if something goes wrong

  limitTimer = setTimeout(() => {
    stop().then((r) => onLimit?.(r, null)).catch((e) => onLimit?.(null, e));
  }, maxSeconds * 1000);

  return { stop, cancel };
}
