import React from 'react';
import '../App.css';

function Settings() {
  return (
    <div className="settings-screen">
      <h2>Настройки узлов DodgeNet</h2>
      
      <div className="settings-block">
        <label>Резервный IP-адрес:</label>
        <input type="text" placeholder="192.168.x.x" />
        <button>Добавить узел</button>
      </div>
      
    </div>
  );
}

export default Settings;