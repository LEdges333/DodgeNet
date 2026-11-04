import React, { useRef, useState } from 'react';
import { Play, Pause, Download, Mic, Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../utils/format';
import '../App.css';

const SPEEDS = [1, 1.5, 2];

// A small player: play / pause, a position slider, the time, the speed, and (optionally) a download button.
// The sound is only loaded when "play" is pressed for the first time, through getUrl() (a function that returns
// the address of the sound; for a message it downloads and decrypts the file first).
//   voice     true for a voice message (a microphone icon and the "Voice message" title), false for a sound file
//   label     the title (the file name for a sound file)
//   duration  the length in seconds as the sender wrote it down (shown before the sound is loaded)
//   mime      the type of the sound, to know whether this browser can play it
function AudioPlayer({ voice = false, label, duration = 0, mime, getUrl, onDownload, downloading = false }) {
  const { t } = useTranslation();
  const audioRef = useRef(null);
  const loadedRef = useRef(false);

  const [status, setStatus] = useState('idle');      // idle | loading | ready | error | unplayable
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration);
  const [rate, setRate] = useState(1);

  // Fetches the sound and prepares the <audio> element. Returns the element, or null if that was not possible.
  const load = async () => {
    const audio = audioRef.current;
    if (loadedRef.current) return audio;
    setStatus('loading');
    try {
      const url = await getUrl();
      if (!audio.canPlayType(mime)) {
        setStatus('unplayable');
        return null;
      }
      audio.src = url;
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = resolve;
        audio.onerror = () => reject(new Error('media'));
        audio.load();
      });
      audio.onloadedmetadata = null;
      audio.onerror = null;

      // A file recorded in the browser has no length in its header (duration is Infinity) and cannot be rewound.
      // Jumping to the far end makes the browser find out the real length; then we go back to the start.
      if (!Number.isFinite(audio.duration)) {
        await new Promise((resolve) => {
          const done = () => { audio.removeEventListener('timeupdate', done); resolve(); };
          audio.addEventListener('timeupdate', done);
          audio.currentTime = 1e7;
          setTimeout(done, 1500);
        });
        audio.currentTime = 0;
      }
      if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration);

      loadedRef.current = true;
      setStatus('ready');
      return audio;
    } catch {
      setStatus('error');
      return null;
    }
  };

  const toggle = async () => {
    const audio = await load();
    if (!audio) return;
    if (audio.paused) {
      audio.playbackRate = rate;
      try {
        await audio.play();
      } catch {
        setStatus('error');
      }
    } else {
      audio.pause();
    }
  };

  const seek = (event) => {
    const value = Number(event.target.value);
    if (audioRef.current) audioRef.current.currentTime = value;
    setCurrent(value);
  };

  const changeSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const ready = status === 'ready' && total > 0;

  return (
    <div className="audio-player">
      <div className="audio-row">
        <button
          type="button"
          className="audio-play"
          onClick={toggle}
          disabled={status === 'loading'}
          aria-label={playing ? t('chat.voice.pause') : t('chat.voice.play')}
          title={playing ? t('chat.voice.pause') : t('chat.voice.play')}
        >
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>

        <div className="audio-main">
          <div className="audio-title">
            {voice ? <Mic size={14} aria-hidden="true" /> : <Music size={14} aria-hidden="true" />}
            <span title={label}>{label}</span>
          </div>
          <input
            type="range"
            className="audio-seek"
            min="0"
            max={ready ? total : 1}
            step="0.1"
            value={ready ? Math.min(current, total) : 0}
            onChange={seek}
            disabled={!ready}
            aria-label={t('chat.voice.seek')}
          />
          <div className="audio-meta">
            <span className="audio-time">
              {status === 'loading'
                ? t('chat.loadingFile')
                : (total > 0 ? `${formatDuration(current)} / ${formatDuration(total)}` : formatDuration(current))}
            </span>
            <button type="button" className="audio-speed" onClick={changeSpeed} aria-label={t('chat.voice.speed')} title={t('chat.voice.speed')}>
              {rate}×
            </button>
          </div>
        </div>

        {onDownload && (
          <button
            type="button"
            className="attachment-download"
            onClick={onDownload}
            disabled={downloading}
            aria-label={`${t('chat.download')}: ${label}`}
            title={t('chat.download')}
          >
            <Download size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {status === 'unplayable' && <p className="attachment-note">{t('chat.voice.cantPlay')}</p>}
      {status === 'error' && <p className="attachment-note">{t('chat.fileError')}</p>}

      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
        onTimeUpdate={() => setCurrent(audioRef.current.currentTime)}
      />
    </div>
  );
}

export default AudioPlayer;
