import React, { useState, useEffect, useRef, useCallback } from 'react';
import { File as FileIcon, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { downloadAttachment } from '../services/api';
import { isInlineImage, isInlineAudio } from '../services/envelope';
import AudioPlayer from './AudioPlayer';
import { formatSize } from '../utils/format';
import '../App.css';

// One attached file inside a message bubble.
// Photos (jpeg, png, gif, webp) are shown in the chat, sound (voice messages and sound files) gets a player;
// every other file is only offered for download.
// The file is downloaded and decrypted in the browser; the name, type and size come from the
// encrypted message envelope (already validated), never from the server.
function Attachment({ file }) {
  const { t } = useTranslation();
  const isImage = isInlineImage(file);
  const isAudio = !isImage && isInlineAudio(file);

  const [imageUrl, setImageUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Photos load by themselves. The object URL is created and released by the same effect.
  useEffect(() => {
    if (!isImage) return undefined;

    let cancelled = false;
    let objectUrl = null;

    downloadAttachment(file)
      .then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, isImage]);

  // Sound is downloaded only when the person presses play (or download), not by itself like photos.
  const audioUrl = useRef(null);
  const getAudioUrl = useCallback(async () => {
    if (!audioUrl.current) {
      const bytes = await downloadAttachment(file);
      audioUrl.current = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
    }
    return audioUrl.current;
  }, [file]);
  useEffect(() => () => {
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
  }, []);

  const handleDownload = async () => {
    setBusy(true);
    setFailed(false);
    try {
      let href = imageUrl ?? audioUrl.current;
      let temporary = false;
      if (!href) {
        // Not an octet-stream blob of the sender's choosing: whatever the type says, it is saved as a file.
        const bytes = await downloadAttachment(file);
        href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
        temporary = true;
      }
      const link = document.createElement('a');
      link.href = href;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (temporary) setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (isAudio) {
    return (
      <div className="attachment">
        <AudioPlayer
          voice={file.kind === 'voice'}
          label={file.kind === 'voice' ? t('chat.voice.message') : file.name}
          duration={file.duration ?? 0}
          mime={file.mime}
          getUrl={getAudioUrl}
          onDownload={handleDownload}
          downloading={busy}
        />
        {failed && <p className="attachment-note">{t('chat.fileError')}</p>}
      </div>
    );
  }

  return (
    <div className="attachment">
      {isImage && imageUrl && <img className="attachment-image" src={imageUrl} alt={file.name} />}
      {isImage && !imageUrl && !failed && <p className="attachment-note">{t('chat.loadingFile')}</p>}

      <div className="attachment-file">
        <FileIcon size={18} aria-hidden="true" />
        <span className="attachment-name" title={file.name}>{file.name}</span>
        <span className="attachment-size">{formatSize(file.size)}</span>
        <button
          type="button"
          className="attachment-download"
          onClick={handleDownload}
          disabled={busy}
          aria-label={`${t('chat.download')}: ${file.name}`}
          title={t('chat.download')}
        >
          <Download size={16} aria-hidden="true" />
        </button>
      </div>

      {failed && <p className="attachment-note">{t('chat.fileError')}</p>}
    </div>
  );
}

export default Attachment;
