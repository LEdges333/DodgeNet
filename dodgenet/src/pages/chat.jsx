import React from 'react';
import {Send, Paperclip, X, Mic, File as FileIcon} from 'lucide-react';
import {useState, useRef, useEffect, useLayoutEffect} from 'react';
import {useParams, useLocation} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {sendMessage, getMessage, contactsUser} from '../services/api';
import Avatar from '../components/Avatar';
import Attachment from '../components/Attachment';
import VoiceBar from '../components/VoiceBar';
import {useVoiceRecorder} from '../hooks/useVoiceRecorder';
import {formatSize, formatDuration} from '../utils/format';
import {MAX_FILE_SIZE, MAX_FILES_PER_MESSAGE} from '../services/envelope';
import '../App.css';


function Chat() {
  const { t } = useTranslation();

  const {userId} = useParams();

  // Who we are talking to. The contact list passes it when a contact is opened; when the page is opened
  // directly (reload, a saved link) it is looked up in the contact list.
  const location = useLocation();
  const [peer, setPeer] = useState(() => (location.state?.peer && String(location.state.peer.id) === userId ? location.state.peer : null));
  useEffect(() => {
    if (peer && String(peer.id) === userId) return undefined;
    let cancelled = false;
    contactsUser()
      .then((list) => { if (!cancelled) setPeer(list.find((c) => String(c.id) === userId) ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, peer]);
  const peerName = peer && String(peer.id) === userId ? peer : null;
  const [input, setInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [attachError, setAttachError] = useState(null); // { key, params }: a translation key, so it follows the language
  const fileInputRef = useRef(null);

  // Messages that are being sent, or could not be sent. They are shown at the end of the chat like any message,
  // so the input field and the chosen files are free again as soon as "Send" is pressed. A message that failed
  // (no connection...) stays with its text and files and can be sent again.
  const [pending, setPending] = useState([]); // { localId, userId, text, files: File[], meta: [], status: 'sending' | 'failed', error }
  const sendQueue = useRef(Promise.resolve());
  const lastLocalId = useRef(0);
  const openChat = useRef(userId);
  useEffect(() => { openChat.current = userId; }, [userId]);

  // Scrolling: the newest message stays in view, unless the user has scrolled up to read old ones.
  const chatWindowRef = useRef(null);
  const messagesRef = useRef(null);
  const stickToBottom = useRef(true);
  const scrollToBottom = () => {
    const el = chatWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const handleScroll = () => {
    const el = chatWindowRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useLayoutEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [chatMessages]);
  useEffect(() => {
    // Photos finish loading after the message is shown, and the attachment bar changes the height of the window:
    // both change the size, and the view must follow when we are at the bottom.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) scrollToBottom();
    });
    observer.observe(messagesRef.current);
    observer.observe(chatWindowRef.current);
    return () => observer.disconnect();
  }, []);

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

  // Sends one pending message. Messages go one after another, so they arrive in the order they were written,
  // even when an earlier one has a big file.
  // The connection status is not touched here: the requests themselves set it, and an error like
  // "file too large" does not mean that the connection is lost.
  const runSend = (item) => {
    sendQueue.current = sendQueue.current.then(async () => {
      setPending((list) => list.map((p) => (p.localId === item.localId ? { ...p, status: 'sending', error: null } : p)));
      try {
        const message = await sendMessage(item.userId, item.text, item.files, item.meta);
        setPending((list) => list.filter((p) => p.localId !== item.localId));
        if (openChat.current === item.userId) {
          stickToBottom.current = true;
          setChatMessages((prev) => [...prev, message]);
        }
      } catch (err) {
        setPending((list) => list.map((p) => (p.localId === item.localId ? { ...p, status: 'failed', error: err.message } : p)));
      }
    });
  };

  // Puts a message in the chat as "sending" and starts sending it. `meta[i]` describes files[i] (a voice message).
  const enqueue = (text, files, meta = []) => {
    const item = { localId: ++lastLocalId.current, userId, text, files, meta, status: 'sending', error: null };
    stickToBottom.current = true;
    setPending((list) => [...list, item]);
    runSend(item);
  };

  const handleSend = () => {
    // A message needs text or at least one file. Spaces alone are not a message.
    const text = input.trim() ? input : '';
    if (!text && attachedFiles.length === 0) return;

    // The input field and the files are cleared right away: the message now lives in the chat (as "sending").
    const files = attachedFiles;
    setInput('');
    setAttachedFiles([]);
    setAttachError(null);
    enqueue(text, files);
  };

  // Voice messages: record, listen, send. The recording is an ordinary attachment marked as "voice".
  const voice = useVoiceRecorder();
  const { discard: discardVoice } = voice;
  useEffect(() => { discardVoice(); }, [userId, discardVoice]);   // a recording belongs to one chat

  const startVoice = async () => {
    setAttachError(null);
    try {
      await voice.start();
    } catch (err) {
      setAttachError({ key: `chat.voice.errors.${err.code ?? 'failed'}` });
    }
  };
  const sendVoice = (file, meta) => enqueue('', [file], [meta]);
  const voiceError = voice.error ? { key: `chat.voice.errors.${voice.error}` } : null;
  const shownError = attachError ?? voiceError;
  const canSend = input.trim() !== '' || attachedFiles.length > 0;

  const discardPending = (item) => setPending((list) => list.filter((p) => p.localId !== item.localId));
  useEffect(() => {
    let cancelled = false;   // a late answer for a chat we have already left must not overwrite the open one
    const loadMessages = async () => {
        try {
            const data = await getMessage(userId);
            if (cancelled) return;
            stickToBottom.current = true;
            setChatMessages(data);
        } catch (err) {
            console.error(err);
        }
    };
 
    loadMessages();
    return () => { cancelled = true; };
}, [userId]);

  return (
    <div className="messenger-card">
      <div className="chat-header">
        {peerName && (
          <Avatar userId={peerName.id} version={peerName.avatar_version} name={peerName.username} size={42} />
        )}
        <h2>{peerName ? peerName.username : t('chat.title')}</h2>
      </div>

      <div className="chat-window" ref={chatWindowRef} onScroll={handleScroll}>
        <div className="chat-messages" ref={messagesRef}>
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

        {pending.filter((p) => p.userId === userId).map((p) => (
          <div key={`pending-${p.localId}`} className="message-row send">
            <div className={`message message-send message-pending${p.status === 'failed' ? ' message-failed' : ''}`}>
              {p.text && <div className="message-text">{p.text}</div>}
              {p.files.map((file, i) => (
                <div className="attachment" key={i}>
                  {p.meta?.[i]?.kind === 'voice' ? (
                    <div className="attachment-file">
                      <Mic size={18} aria-hidden="true" />
                      <span className="attachment-name">{t('chat.voice.message')}</span>
                      <span className="attachment-size">{formatDuration(p.meta[i].duration)}</span>
                    </div>
                  ) : (
                    <div className="attachment-file">
                      <FileIcon size={18} aria-hidden="true" />
                      <span className="attachment-name" title={file.name}>{file.name}</span>
                      <span className="attachment-size">{formatSize(file.size)}</span>
                    </div>
                  )}
                </div>
              ))}
              <div className="message-status" role={p.status === 'failed' ? 'alert' : 'status'}>
                {p.status === 'sending' ? t('chat.sending') : (
                  <>
                    <span>{t('chat.notSent')}{p.error ? `: ${p.error}` : ''}</span>
                    <button type="button" onClick={() => runSend(p)}>{t('chat.retry')}</button>
                    <button type="button" onClick={() => discardPending(p)}>{t('chat.discard')}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className="composer">
      {(attachedFiles.length > 0 || shownError) && (
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
          {shownError && <p className="error-text">{t(shownError.key, shownError.params)}</p>}
        </div>
      )}

      <div className="input-area">
        {voice.phase !== 'idle' ? (
          <VoiceBar voice={voice} onSend={sendVoice} />
        ) : (
          <>
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
              aria-label={t('chat.attach')}
              title={t('chat.attach')}
            >
              <Paperclip/>
            </button>
            <input 
              className="message-input"
              value={input}
              onChange={(e) => { setInput(e.target.value); voice.clearError(); }}
              placeholder={t('chat.placeholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            {canSend ? (
              <button className="send-button" onClick={handleSend} aria-label={t('chat.send')}>
                <Send/>
              </button>
            ) : (
              <button className="send-button mic-button" onClick={startVoice} aria-label={t('chat.voice.record')} title={t('chat.voice.record')}>
                <Mic/>
              </button>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

export default Chat;