import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import '../App.css';

function Profile() {
  
  const user = {
    name: "Иван Иванов",
    email: "ivan@example.com",
    status: "Активен"
  };

  return (
    <div >
      <h2>Мой профиль</h2>
      <p><strong>Имя:</strong> {user.name}</p>
      <p><strong>Email:</strong> {user.email}</p>
      <p><strong>Статус:</strong> {user.status}</p>
      <button>Редактировать профиль</button>
      <button>Выйти</button>
      <nav className="nav-bar">
        <Link className="Link" to="/settings">Настройки</Link>
        <Link className="Link" to="/registration">Регистрация</Link>
      </nav>
      <div className="profile-content">
       
      </div>
    </div>
    
  );
}




export default Profile;