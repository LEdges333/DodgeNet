import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../services/api';
import { handleFormArrowNav } from '../utils/formNavigation';
import '../App.css';

function ChangePassword() {
  const { t } = useTranslation();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Quick check on the client; the server validates everything again.
    if (newPassword !== confirmation) {
      setError(t('serverErrors.password_mismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(oldPassword, newPassword, confirmation);
      setSuccess(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmation('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-main">
      <h1>{t('changePassword.title')}</h1>
      <form className="register-form" onSubmit={handleSubmit} onKeyDown={handleFormArrowNav}>
        <input
          type="password"
          placeholder={t('changePassword.oldPlaceholder')}
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <input
          type="password"
          placeholder={t('changePassword.newPlaceholder')}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <input
          type="password"
          placeholder={t('changePassword.confirmPlaceholder')}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="new-password"
          required
        />
        <button type="submit" disabled={isSubmitting}>
          {t('changePassword.submit')}
        </button>
        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{t('changePassword.success')}</p>}
      </form>
    </div>
  );
}

export default ChangePassword;
