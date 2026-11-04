import { useState, useRef, useEffect, useCallback } from 'react';
import { startRecording, MAX_VOICE_SECONDS } from '../services/voice';

// The recording state machine of the chat:
//
//   idle --start()--> starting (the browser may be asking for permission)
//        --> recording --stop()--> review (listen to it) --take()--> idle  (the message goes to the chat)
//   discard() throws everything away from any state, and so does leaving the chat page.
//
// The microphone is released as soon as recording ends, however it ends.

const EXTENSIONS = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };

function fileName(mime) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `voice-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${EXTENSIONS[mime] ?? 'webm'}`;
}

export function useVoiceRecorder({ maxSeconds = MAX_VOICE_SECONDS } = {}) {
  const [phase, setPhase] = useState('idle');
  const [startedAt, setStartedAt] = useState(0);        // performance.now() of the moment recording began
  const [review, setReview] = useState(null);           // { file, url, duration, mime }
  const [error, setError] = useState(null);             // an error code of services/voice.js
  const [limitReached, setLimitReached] = useState(false);

  const phaseRef = useRef('idle');                      // the same as `phase`, but readable right away
  const controller = useRef(null);
  const reviewRef = useRef(null);
  const attempt = useRef(0);                            // changes when a start is abandoned or the page is left
  const levelListener = useRef(null);                   // the recording bar registers its own function here
  const setLevelListener = useCallback((listener) => { levelListener.current = listener; }, []);

  const changePhase = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const releaseReview = useCallback(() => {
    if (reviewRef.current) URL.revokeObjectURL(reviewRef.current.url);
    reviewRef.current = null;
    setReview(null);
  }, []);

  const showReview = useCallback(({ blob, mime, duration }) => {
    const file = new File([blob], fileName(mime), { type: mime });
    reviewRef.current = { file, url: URL.createObjectURL(blob), duration, mime };
    setReview(reviewRef.current);
    changePhase('review');
  }, [changePhase]);

  const discard = useCallback(() => {
    attempt.current += 1;
    controller.current?.cancel();
    controller.current = null;
    releaseReview();
    setLimitReached(false);
    changePhase('idle');
  }, [changePhase, releaseReview]);

  // Starts recording. Throws a VoiceError (code: 'denied', 'no_device'...) when it cannot.
  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    setError(null);
    setLimitReached(false);
    changePhase('starting');
    const mine = ++attempt.current;

    let recording;
    try {
      recording = await startRecording({
        maxSeconds,
        onLevel: (level) => levelListener.current?.(level),
        onLimit: (result, failure) => {
          if (mine !== attempt.current) return;
          controller.current = null;
          if (failure || !result) {
            setError(failure?.code ?? 'failed');
            changePhase('idle');
            return;
          }
          setLimitReached(true);
          showReview(result);
        },
      });
    } catch (failure) {
      if (mine === attempt.current) changePhase('idle');
      throw failure;
    }

    if (mine !== attempt.current) {       // discarded while the browser was asking for permission
      recording.cancel();
      return;
    }
    controller.current = recording;
    setStartedAt(performance.now());
    changePhase('recording');
  }, [changePhase, maxSeconds, showReview]);

  const stop = useCallback(async () => {
    const recording = controller.current;
    if (phaseRef.current !== 'recording' || !recording) return;
    const mine = attempt.current;
    try {
      const result = await recording.stop();
      if (!result || mine !== attempt.current) return;      // discarded while stopping
      controller.current = null;
      showReview(result);
    } catch (failure) {
      if (mine !== attempt.current) return;
      controller.current = null;
      setError(failure.code ?? 'failed');
      changePhase('idle');
    }
  }, [changePhase, showReview]);

  // The recording is sent: hands it over and goes back to idle.
  const take = useCallback(() => {
    const taken = reviewRef.current;
    if (!taken) return null;
    releaseReview();
    setLimitReached(false);
    changePhase('idle');
    return { file: taken.file, meta: { kind: 'voice', duration: taken.duration } };
  }, [changePhase, releaseReview]);

  const clearError = useCallback(() => setError(null), []);

  // Leaving the page (or closing the chat) must never leave the microphone open.
  useEffect(() => () => {
    attempt.current += 1;
    controller.current?.cancel();
    controller.current = null;
    if (reviewRef.current) URL.revokeObjectURL(reviewRef.current.url);
  }, []);

  return { phase, startedAt, review, error, limitReached, maxSeconds, setLevelListener, start, stop, discard, take, clearError };
}
