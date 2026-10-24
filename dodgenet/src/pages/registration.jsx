import React from 'react';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useNavigate} from 'react-router-dom';
import {registerUser} from '../services/api';
import {useTranslation} from 'react-i18next';
import '../App.css';


function Registration() {
  const { t } = useTranslation();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Hook for redirection after successful registration
  const navigate = useNavigate();

  // The registration function (moved here)
  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      await registerUser(username, email, password);
      alert(t('registration.success'));
      navigate('/login');
    } catch (error) {
      alert(t('registration.error', { message: error.message }));
      console.error('Error Details:', error);
    }
  };

  return (
    <div className="register-main">
      <h1>{t('registration.title')}</h1>
      {/* We bind the function to the form submission event */}
      <form className="register-form" onSubmit={handleRegister}>
        <input 
          type="text" 
          placeholder={t('registration.usernamePlaceholder')} 
          value={username}
          onChange={(e) => setUsername(e.target.value)} // Updating the status
          required
        />
        <input 
          type="email" 
          placeholder={t('registration.emailPlaceholder')} 
          value={email}
          onChange={(e) => setEmail(e.target.value)} // Updating the status
          required
        />
        <input 
          type="password" 
          placeholder={t('registration.passwordPlaceholder')} 
          value={password}
          onChange={(e) => setPassword(e.target.value)} // Updating the status
          required
        />
        <button type="submit">{t('registration.submit')}</button>
      </form>
      <p>
        {t('registration.hasAccount')}{' '}
        <Link to="/login">{t('registration.signIn')}</Link>
      </p>
    </div>
  );
}

export default Registration;

