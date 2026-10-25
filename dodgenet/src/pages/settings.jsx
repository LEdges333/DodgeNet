import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '../i18n';
import { THEMES, getTheme, setTheme } from '../theme';
import KeyBackup from '../components/KeyBackup';
import '../App.css';

function Settings() {
  const { t, i18n } = useTranslation();
  const [theme, setThemeState] = useState(getTheme);
  // The keys belong to the account that is logged in, so the section is shown only then.
  const isLoggedIn = Boolean(localStorage.getItem('token') && localStorage.getItem('activeUsername'));

  const handleThemeChange = (e) => {
    setTheme(e.target.value);
    setThemeState(e.target.value);
  };

  return (
    <div className="settings-page">
      <h2>{t('settings.title')}</h2>

      <div className="settings-row">
        <label htmlFor="language-select">{t('settings.language')}</label>
        <select
          id="language-select"
          className="settings-select"
          value={i18n.language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <label htmlFor="theme-select">{t('settings.theme')}</label>
        <select
          id="theme-select"
          className="settings-select"
          value={theme}
          onChange={handleThemeChange}
        >
          {THEMES.map((name) => (
            <option key={name} value={name}>
              {t(`settings.themes.${name}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <span>{t('settings.password')}</span>
        <Link className="settings-link" to="/change-password">
          {t('settings.changePassword')}
        </Link>
      </div>

      {isLoggedIn && <KeyBackup />}
    </div>
  );
}

export default Settings;
