import React, { useEffect, useState } from 'react';
import { Trash2, Square, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AudioPlayer from './AudioPlayer';
import { formatDuration } from '../utils/format';
import '../App.css';

// The timer and the level indicator live here, not in the chat page: they change several times a second,
// and the whole chat must not be drawn again each time.
function RecordingBar({ voice }) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  const { setLevelListener, startedAt } = voice;
  useEffect(() => {
    setLevelListener(setLevel);
    const timer = setInterval(() => setElapsed((performance.now() - startedAt) / 1000), 200);
    return () => {
      clearInterval(timer);
      setLevelListener(null);
    };
  }, [setLevelListener, startedAt]);

  return (
    <div className="voice-bar" role="group" aria-label={t('chat.voice.recording')}>
      <button type="button" className="voice-icon-button" onClick={voice.discard} aria-label={t('chat.voice.delete')} title={t('chat.voice.delete')}>
        <Trash2 size={20} aria-hidden="true" />
      </button>
      <span className="voice-rec-dot" aria-hidden="true" />
      <span className="voice-time" data-testid="voice-time">{formatDuration(elapsed)}</span>
      <span className="voice-level" aria-hidden="true"><i style={{ transform: `scaleX(${level})` }} /></span>
      <button type="button" className="voice-stop" onClick={voice.stop} aria-label={t('chat.voice.stop')} title={t('chat.voice.stop')}>
        <Square size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

// What the composer shows instead of the input field while a voice message is being made.
function VoiceBar({ voice, onSend }) {
  const { t } = useTranslation();
  const { phase, review, discard } = voice;

  // Escape throws the recording away.
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') discard(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [discard]);

  if (phase === 'starting') {
    return (
      <div className="voice-bar" role="status">
        <button type="button" className="voice-icon-button" onClick={discard} aria-label={t('chat.voice.delete')} title={t('chat.voice.delete')}>
          <Trash2 size={20} aria-hidden="true" />
        </button>
        <span className="voice-status">{t('chat.voice.starting')}</span>
      </div>
    );
  }

  if (phase === 'recording') {
    return <RecordingBar key={voice.startedAt} voice={voice} />;
  }

  if (phase === 'review' && review) {
    const send = () => {
      const taken = voice.take();
      if (taken) onSend(taken.file, taken.meta);
    };
    return (
      <div className="voice-bar voice-review">
        <button type="button" className="voice-icon-button" onClick={discard} aria-label={t('chat.voice.delete')} title={t('chat.voice.delete')}>
          <Trash2 size={20} aria-hidden="true" />
        </button>
        <div className="voice-review-player">
          <AudioPlayer voice label={t('chat.voice.message')} duration={review.duration} mime={review.mime} getUrl={async () => review.url} />
          {voice.note === 'limit' && <p className="attachment-note">{t('chat.voice.maxReached')}</p>}
          {voice.note === 'device' && <p className="attachment-note">{t('chat.voice.deviceLost')}</p>}
        </div>
        <button type="button" className="send-button" onClick={send} aria-label={t('chat.voice.send')} title={t('chat.voice.send')}>
          <Send />
        </button>
      </div>
    );
  }

  return null;
}

export default VoiceBar;
