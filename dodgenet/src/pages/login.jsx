import React from 'react';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useNavigate} from 'react-router-dom';
import {loginUser} from '../services/api';
import {useTranslation} from 'react-i18next';
import {handleFormArrowNav} from '../utils/formNavigation';
import '../App.css';

function Login() {
  const { t } = useTranslation();

  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const data = await loginUser(username, password);

      alert(t('login.welcome', { name: data.username }));
      navigate("/");
    } catch (error) {
            
      alert(error.message);
    }
  };

  return (
  <div className="register-main">
      <h1>{t('login.title')}</h1>
        <form
          className="register-form"
          onSubmit={handleLogin}
          onKeyDown={handleFormArrowNav}
          >
            <input
              type="text"
              placeholder={t('login.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">
              {t('login.submit')}
            </button>
        </form>
        <p>
          {t('login.noAccount')}{" "}
          <Link to="/registration">
            {t('login.signUp')}
          </Link>
        </p>
  </div>
  );
}

export default Login;