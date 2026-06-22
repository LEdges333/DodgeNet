import React, { useState } from 'react'; 
import './App.css';
import { Routes, Route, Link, useLocation } from 'react-router-dom'; // для ссылок
import { ShieldCheck, ShieldAlert, Send } from 'lucide-react';
import { sendMessage } from './services/api';


import Profile from './pages/profile';
import Chat from './pages/chat';
import Registration from './pages/registration';
import Settings from './pages/settings';
import ConnectionStatus from './components/ConnectionStatus';
import Login from './pages/login';

function App() {
  const location = useLocation();
  const [input, setInput] = useState('');
  const [status, setStatus] = useState({ isOnline: true, node: 'Waiting...' });
  const [chatMessages, setChatMessages] = useState([]);

  const handleSend = async () => {
    if (!input) return;

    try {
      const result = await sendMessage(input)
      setChatMessages([...chatMessages, { id: Date.now(), text: input, from: 'me' }]);
      setStatus({ isOnline: true, node: result.node });
      setInput('');
    } catch (err) {
      setStatus({ isOnline: false, node: 'None' });
      alert("Error: " + err.message);
    }
  };

  return (
    <div className="app-container">
       {/* БОКОВАЯ ПАНЕЛЬ (Сайдбар для навигации) */}
      <div className="side-bar">
        <div>
          <h2 >DodgeNet</h2>
          <span >Secure Messenger</span>
        </div>

        {/* Меню ссылок */}
        <nav className="nav-bar">
          <Link className="Link" to="/">💬 Чат</Link>
          <Link className="Link" to="/profile">👤 Профиль</Link>       
        </nav>

        {/* Индикатор безопасности соединения внизу панели */}
        <div >
          <div >
            {status.isOnline ? <ShieldCheck size={18} color="#22c55e" /> : <ShieldAlert size={18} color="#ef4444" />}
            <span >
              {status.isOnline ? "Канал защищен" : "Связь потеряна"}
            </span>
          </div>
          <div >Узел: {status.node}</div>
        </div>
      </div>

      {/* Здесь отображается только активный компонент */}
      <div className="main-content">
        <Routes>
          <Route path="/" element={
            <Chat 
              status={status} 
              chat={chatMessages} 
              input={input} 
              setInput={setInput} 
              handleSend={handleSend}/>} />
          <Route path="/profile" element={<Profile />}/>
          <Route path="/settings" element={<Settings />}/>
          <Route path="/registration" element={<Registration />}/> 
          <Route path="/login" element={<Login />}/>         
        </Routes>
      </div>
    </div>
  );
}

export default App;
