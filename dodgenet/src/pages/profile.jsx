import React from 'react';
import {useState} from 'react';
import { Link } from 'react-router-dom';
import {useNavigate} from 'react-router-dom';
import {useEffect} from 'react';
import {profilUser} from '../services/api';
import {useTranslation} from 'react-i18next';
import i18n from '../i18n';
import '../App.css';

function Profile() {
  const { t } = useTranslation();
  
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const navigate = useNavigate();

  
  useEffect(() => {
  const loadProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const data = await profilUser();
      setUser(data);
    } catch (err) {
      setError(err.message || i18n.t('profile.networkError'));
    } finally {
      setLoading(false);
    }
  };

  loadProfile();
}, [navigate]);


const handleLogout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  navigate("/login");
};


// 4. Conditional rendering: what to show while we’re waiting for a response from the server.
  if (loading) {
    return <p>{t('profile.loading')}</p>;
  }

  if (error) {
    return (
      <div>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={handleLogout}>{t('profile.backToLogin')}</button>
      </div>
    );
  }

  if (!user) {
    return <p>{t('profile.noData')}</p>;
  }


  return (
    <div >
      <h2>{t('profile.title')}</h2>
      <p><strong>{t('profile.name')}</strong> {user.username}</p>
      <p><strong>{t('profile.email')}</strong> {user.email}</p>

      <button>{t('profile.edit')}</button>
      <button onClick={handleLogout}>{t('profile.exit')}</button>
      <nav className="nav-bar">
        <Link className="Link" to="/registration">{t('profile.signUp')}</Link>
      </nav>
      <div className="profile-content">
       
      </div>
    </div>     
  );
}

export default Profile;