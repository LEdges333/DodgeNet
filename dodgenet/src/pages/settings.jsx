import React from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '../i18n';
import '../App.css';

function Settings() {
  const { t, i18n } = useTranslation();

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
    </div>
  );
}

export default Settings;
