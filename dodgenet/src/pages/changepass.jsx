import React from 'react';
import '../App.css';

function Changepass() {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Войти</h1>
      <form style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px', margin: '0 auto' }}>
        <input type="text" placeholder="Логин" />
        <input type="email" placeholder="Email" />
        <input type="password" placeholder="Пароль" />
        <button type="submit">Подтвердить</button>
        
      </form>
    </div>
  );
}

export default Changepass;