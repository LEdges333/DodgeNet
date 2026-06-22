import React from 'react';
import {Link} from 'react-router-dom'; 
import '../App.css';


function Registration() {
  return (
    <div className="register-main">
      <h1>Регистрация</h1>
      <form className="register-form">
        <input type="text" placeholder="Логин" />
        <input type="email" placeholder="Email" />
        <input type="password" placeholder="Пароль" />
        <button type="submit">Создать аккаунт</button>
      </form>
      <p>
        Уже есть аккаунт? 
        <Link to="/login">Войти</Link>
      </p>
    </div>
  );
}

export default Registration;

