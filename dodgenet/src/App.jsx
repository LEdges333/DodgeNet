import React, { useState } from 'react'; 
import './App.css';
import { Routes, Route, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';


import Profile from './pages/profile';
import Settings from './pages/settings';
import Chat from './pages/chat';
import ChatList from './pages/chatlist';
import Registration from './pages/registration';
import ConnectionStatus from './components/ConnectionStatus';
import Login from './pages/login';

function App() {
  const { t } = useTranslation();
  const [status, setStatus] = useState({ isOnline: true, node: 'Primary' });

  return (
    <div className="app-container">
      {/* sidebar for navigation */}
      <div className="side-bar">
        <div>
          <h2>DodgeNet</h2>
          <span>{t('app.tagline')}</span>
        </div>

        {/* Links Menu */}
        <nav className="nav-bar">
          <Link className="Link" to="/">{t('nav.chat')}</Link>
          <Link className="Link" to="/profile">{t('nav.profile')}</Link>
          <Link className="Link" to="/settings">{t('nav.settings')}</Link>
        </nav>

        {/* secure */}
        <ConnectionStatus status={status} />
      </div>

      {/* Main content area */}
      <div className="main-content">
        <Routes>
          {/* Contact page (chat list) */}
          <Route path="/" element={<ChatList />} />
          <Route path="/chatlist" element={<ChatList />} />
          {/* Chat page with a specific user */}
          <Route 
            path="/chat/:userId" 
            element={<Chat status={status} setStatus={setStatus} />} 
          />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/registration" element={<Registration />} /> 
          <Route path="/login" element={<Login />} />        
        </Routes>
      </div>
    </div>
  );
}

export default App;
