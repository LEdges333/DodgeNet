import React from 'react';
import '../App.css';

function Login() {
  return (
    <div className="register-main">
      <h1>Войти</h1>
      <form className="register-form">
        <input type="email" placeholder="Email" />
        <input type="text" placeholder="Логин" />
        <input type="password" placeholder="Пароль" />
        <button type="submit">Забыли логин или пароль?</button>
        
      </form>
    </div>
  );
}

export default Login;