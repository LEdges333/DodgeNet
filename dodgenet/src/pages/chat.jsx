import React from 'react';
import { ShieldCheck, ShieldAlert, Send } from 'lucide-react';
import '../App.css';

function Chat({ status, chat, input, setInput, handleSend }) {
  return (
    <div className="messenger-card">
      <div className="header">
        <h2>DodgeNet Chat</h2>
        <div className="status-container">
          <div className={`status-row ${status.isOnline ? 'online' : 'offline'}`}>
            {status.isOnline ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
            <span>
              {status.isOnline ? "Канал защищен" : "Связь потеряна"}
            </span>
          </div>
          <div className="node-info">
            Узел: {status.node}
          </div>
        </div>
      </div>

      <div className="chat-window">
        {chat.map((msg) => (
          <div key={msg.id} className="message me">
            {msg.text}
          </div>
        ))}
      </div>

      <div className="input-area">
        <input 
          className="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter Message..."
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="send-button" onClick={handleSend}>
          <Send/>
        </button>
      </div>
    </div>
  );
}

export default Chat;