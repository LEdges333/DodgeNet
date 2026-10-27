import React from 'react';
import {Send, Paperclip, X} from 'lucide-react';
import {useState, useRef} from 'react';
import {Link} from 'react-router-dom';
import {useParams} from 'react-router-dom';
import {useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {sendMessage, getMessage} from '../services/api';
import ConnectionStatus from '../components/ConnectionStatus';
import Attachment from '../components/Attachment';
import {MAX_FILE_SIZE, MAX_FILES_PER_MESSAGE} from '../services/envelope';
import '../App.css';


function Chat({ status, setStatus}) {
  const { t } = useTranslation();

  const {userId} = useParams();
  const [input, setInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [attachError, setAttachError] = useState(null); // { key, params }: a translation key, so it follows the language
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);

  const myId = Number(localStorage.getItem('userId'));

  // Files chosen with the paperclip. Wrong ones are skipped with an explanation, the rest are kept.
  const handleFilesChosen = (e) => {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = ''; // so that the same file can be chosen again later
    setAttachError(null);

    const next = [...attachedFiles];
    for (const file of chosen) {
      if (file.size === 0) {
        setAttachError({ key: 'chat.errors.emptyFile', params: { name: file.name } });
      } else if (file.size > MAX_FILE_SIZE) {
        setAttachError({ key: 'chat.errors.fileTooLarge', params: { name: file.name, max: MAX_FILE_SIZE / (1024 * 1024) } });
      } else if (next.length >= MAX_FILES_PER_MESSAGE) {
        setAttachError({ key: 'chat.errors.tooManyFiles', params: { max: MAX_FILES_PER_MESSAGE } });
        break;
      } else {
        next.push(file);
      }
    }
    setAttachedFiles(next);
  };

  const removeFile = (index) => {
    setAttachError(null);
    setAttachedFiles((files) => files.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (sending) return;
    // A message needs text or at least one file. Spaces alone are not a message.
    if (!input.trim() && attachedFiles.length === 0) return;

    setSending(true);
    setAttachError(null);
    try {
        // text and files to the server
        const message = await sendMessage(userId, input.trim() ? input : '', attachedFiles);
 
        // the servers response to the message list
        setChatMessages(prev => [...prev, message]);
 
        // node status update
        setStatus({
            isOnline: true,
            node: 'Primary',
        });
 
        // clearing the input field and the files for the next message
        setInput(""); 
        setAttachedFiles([]);
        
    } catch (err) {
        setStatus({
            isOnline: false,
            node: "None",
        });
        alert(err.message);
    } finally {
        setSending(false);
    }
  };
  useEffect(() => {
    const loadMessages = async () => {
        try {
            const data = await getMessage(userId);
            setChatMessages(data);
        } catch (err) {
            console.error(err);
        }
    };
 
    loadMessages();
}, [userId]);

  return (
    <div className="messenger-card">
      <div className="header">
        <h2>{t('chat.title')}</h2>
        <ConnectionStatus status={status} />
      </div>

      <div className="chat-window">
        {chatMessages.map((msg) => {
          const isMine = msg.sender_id === myId;
          return (
            <div
              key={msg.id}
              className={`message-row ${isMine ? 'send' : 'get'}`}
            >
              <div className={`message ${isMine ? 'message-send' : 'message-get'}${msg.decrypt_failed || msg.unsupported ? ' message-undecrypted' : ''}`}>
                {msg.decrypt_failed && t('chat.cannotDecrypt')}
                {msg.unsupported && t('chat.unsupported')}
                {!msg.decrypt_failed && !msg.unsupported && (
                  <>
                    {msg.text && <div className="message-text">{msg.text}</div>}
                    {(msg.files ?? []).map((file) => (
                      <Attachment key={file.id} file={file} />
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(attachedFiles.length > 0 || attachError) && (
        <div className="attachment-bar">
          {attachedFiles.length > 0 && (
            <div className="attachment-chips">
              {attachedFiles.map((file, index) => (
                <span className="attachment-chip" key={`${file.name}-${index}`}>
                  <span className="attachment-chip-name" title={file.name}>{file.name}</span>
                  <button
                    type="button"
                    className="attachment-chip-remove"
                    onClick={() => removeFile(index)}
                    aria-label={`${t('chat.removeFile')}: ${file.name}`}
                    title={t('chat.removeFile')}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {attachError && <p className="error-text">{t(attachError.key, attachError.params)}</p>}
        </div>
      )}

      <div className="input-area">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          data-testid="file-input"
          onChange={handleFilesChosen}
        />
        <button
          type="button"
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          aria-label={t('chat.attach')}
          title={t('chat.attach')}
        >
          <Paperclip/>
        </button>
        <input 
          className="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.placeholder')}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="send-button" onClick={handleSend} disabled={sending} aria-label={t('chat.send')}>
          <Send/>
        </button>
      </div>
    </div>
  );
}

export default Chat;