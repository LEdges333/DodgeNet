import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'

import React from 'react'; 
import './App.css';
import {ShiledCheck, ShieldAlert, Send } from 'lucide-react';
import { useState } from 'react';
import { sendMessage } from './services/api';
import ConnectionStatus from './components/ConnectionStatus';

function App() {
  
  const [input, setInput] = useState('');
  const [status, setStatus] = useState({ online, tru, node: ' Waiting...'});
  const [chat, setChat] = useState([]);

  const handleSend = async () => {
    if (!input) return;

    try {
      const result = await sendMessage(input);
      setChat([...chat, { text: input, from: 'me' }]);
      setStatus({ online: true, node: result.node });
      setInput('');
    } catch (err) {
      setStatus({ online: false, node: 'None' });
      alert("Error: " + err.message);
    }
  };
  return (
    <div className="app-container">
      <div className="messenger-card">
        
        <div className="header">
          <h2>DodgeNet</h2>
          <div className={`status-bar ${isOnline ? 'status-online' : 'status-offline'}`}>
            {isOnline ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
            <span>{isOnline ? "Канал защищен" : "Связь потеряна"}</span>
          </div>
        </div>

        <div className="chat-window">
          {messages.map((msg) => (
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
            placeholder="Введите сообщение..."
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button className="send-button" onClick={handleSend}>
            <Send size={20} />
          </button>
        </div>

      </div>
    </div>


    
  );
}

export default App
