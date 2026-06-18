import React, { useState } from 'react'; 
import './App.css';
import { ShieldCheck, ShieldAlert, Send } from 'lucide-react';
import { sendMessage } from './services/api';
// Если ConnectionStatus пока не используется, его можно закомментировать
// import ConnectionStatus from './components/ConnectionStatus';

function App() {
  const [input, setInput] = useState('');
  
  // ИСПРАВЛЕНИЕ 1: Правильный синтаксис объекта (ключ: значение)
  const [status, setStatus] = useState({ isOnline: true, node: 'Waiting...' });
  
  // ИСПРАВЛЕНИЕ 2: Оставляем название chat
  const [chat, setChat] = useState([]);

  const handleSend = async () => {
    if (!input) return;

    try {
      const result = await sendMessage(input);
      // ИСПРАВЛЕНИЕ 3: Добавил генерацию id (Date.now()), чтобы React не ругался на отсутствие ключей
      setChat([...chat, { id: Date.now(), text: input, from: 'me' }]);
      setStatus({ isOnline: true, node: result.node });
      setInput('');
    } catch (err) {
      setStatus({ isOnline: false, node: 'None' });
      alert("Error: " + err.message);
    }
  };

  return (
    <div className="app-container">
      <div className="messenger-card">
        
        <div className="header">
          <h2>DodgeNet</h2>
          {/* ИСПРАВЛЕНИЕ 4: Обращаемся к isOnline через объект status */}
          <div className={`status-bar ${status.isOnline ? 'status-online' : 'status-offline'}`}>
            {status.isOnline ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
            <span>{status.isOnline ? "Канал защищен" : "Связь потеряна"}</span>
          </div>
        </div>

        <div className="chat-window">
          {/* ИСПРАВЛЕНИЕ 5: Используем chat вместо messages */}
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

export default App;
