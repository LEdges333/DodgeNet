import React from 'react';
import {useState, useRef} from 'react';
import { Link } from 'react-router-dom';
import {useNavigate} from 'react-router-dom';
import {useEffect} from 'react';
import {profilUser, uploadAvatar, deleteAvatar} from '../services/api';
import {makeAvatarBlob, MAX_AVATAR_SOURCE_BYTES} from '../services/image';
import Avatar from '../components/Avatar';
import {useTranslation} from 'react-i18next';
import i18n from '../i18n';
import '../App.css';

function Profile() {
  const { t } = useTranslation();
  
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const navigate = useNavigate();

  // profile photo
  const photoInputRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState(null); // { key, params } or { text }

  const handlePhotoChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so that the same file can be chosen again
    if (!file) return;

    setPhotoMsg(null);
    setPhotoBusy(true);
    try {
      const blob = await makeAvatarBlob(file);       // a square 256x256 picture, made in the browser
      const version = await uploadAvatar(blob);
      setUser((u) => ({ ...u, avatar_version: version }));
    } catch (err) {
      setPhotoMsg(
        err.code
          ? { key: `profile.photo.errors.${err.code}`, params: { max: MAX_AVATAR_SOURCE_BYTES / (1024 * 1024) } }
          : { text: err.message }
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoRemove = async () => {
    setPhotoMsg(null);
    setPhotoBusy(true);
    try {
      await deleteAvatar();
      setUser((u) => ({ ...u, avatar_version: null }));
    } catch (err) {
      setPhotoMsg({ text: err.message });
    } finally {
      setPhotoBusy(false);
    }
  };

  
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
  localStorage.removeItem("activeUsername");
  localStorage.removeItem("userId");
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
    <div className="profile-page">
      <h2>{t('profile.title')}</h2>

      <div className="profile-photo">
        <Avatar userId={user.id} version={user.avatar_version} name={user.username} size={96} alt={user.username} />
        <div className="profile-photo-actions">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            hidden
            data-testid="photo-input"
            onChange={handlePhotoChosen}
          />
          <button type="button" className="settings-button" disabled={photoBusy} onClick={() => photoInputRef.current?.click()}>
            {t('profile.photo.change')}
          </button>
          {user.avatar_version != null && (
            <button type="button" className="settings-button secondary" disabled={photoBusy} onClick={handlePhotoRemove}>
              {t('profile.photo.remove')}
            </button>
          )}
          {photoMsg && <p className="error-text">{photoMsg.key ? t(photoMsg.key, photoMsg.params) : photoMsg.text}</p>}
        </div>
      </div>

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