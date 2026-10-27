import React, { useState, useEffect } from 'react';
import { File as FileIcon, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { downloadAttachment } from '../services/api';
import { isInlineImage } from '../services/envelope';
import '../App.css';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// One attached file inside a message bubble.
// Photos (jpeg, png, gif, webp) are shown in the chat; every other file is only offered for download.
// The file is downloaded and decrypted in the browser; the name, type and size come from the
// encrypted message envelope (already validated), never from the server.
function Attachment({ file }) {
  const { t } = useTranslation();
  const isImage = isInlineImage(file);

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

  const handleDownload = async () => {
    setBusy(true);
    setFailed(false);
    try {
      let href = imageUrl;
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
