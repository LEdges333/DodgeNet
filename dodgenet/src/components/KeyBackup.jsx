import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportKeyFile, hasKeyPair } from '../services/crypto';
import { importKeys } from '../services/api';
import { handleFormArrowNav } from '../utils/formNavigation';
import '../App.css';

const MIN_PASSPHRASE_LENGTH = 8;
const MAX_FILE_SIZE = 100 * 1024; // a key file is about 1 KB; anything big is not ours

// Saves the file through the browser's download mechanism.
function downloadJson(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Settings section: save the encryption keys to a password-protected file and load them back.
function KeyBackup() {
  const { t, i18n } = useTranslation();

  const [hasKeys, setHasKeys] = useState(hasKeyPair);
  const [busy, setBusy] = useState(false);

  const [exportPass, setExportPass] = useState('');
  const [exportPassRepeat, setExportPassRepeat] = useState('');
  const [exportMsg, setExportMsg] = useState(null); // { ok, key } - a translation key, so it follows the language

  const [importFile, setImportFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0); // changing it empties the file input
  const [importPass, setImportPass] = useState('');
  const [importMsg, setImportMsg] = useState(null);

  const errorKey = (err) => {
    const key = `keys.errors.${err?.code}`;
    return i18n.exists(key) ? key : 'keys.errors.generic';
  };

  const handleExport = async (e) => {
    e.preventDefault();
    setExportMsg(null);

    if (exportPass.length < MIN_PASSPHRASE_LENGTH) {
      setExportMsg({ ok: false, key: 'keys.errors.passphraseShort' });
      return;
    }
    if (exportPass !== exportPassRepeat) {
      setExportMsg({ ok: false, key: 'keys.errors.passphraseMismatch' });
      return;
    }

    setBusy(true);
    try {
      const file = await exportKeyFile(exportPass);
      const safeName = file.username.replace(/[^\w.-]/g, '_');
      downloadJson(file, `dodgenet-keys-${safeName}.json`);
      setExportPass('');
      setExportPassRepeat('');
      setExportMsg({ ok: true, key: 'keys.exported' });
    } catch (err) {
      setExportMsg({ ok: false, key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    setImportMsg(null);

    if (!importFile) {
      setImportMsg({ ok: false, key: 'keys.errors.noFile' });
      return;
    }
    if (importFile.size > MAX_FILE_SIZE) {
      setImportMsg({ ok: false, key: 'keys.errors.invalid_file' });
      return;
    }

    setBusy(true);
    try {
      let parsed;
      try {
        parsed = JSON.parse(await importFile.text());
      } catch {
        setImportMsg({ ok: false, key: 'keys.errors.invalid_file' });
        return;
      }

      await importKeys(parsed, importPass);
      setHasKeys(true);
      setImportPass('');
      setImportFile(null);
      setFileInputKey((k) => k + 1);
      setImportMsg({ ok: true, key: 'keys.imported' });
    } catch (err) {
      setImportMsg({ ok: false, key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  };

  const renderMsg = (msg) =>
    msg && <p className={msg.ok ? 'success-text' : 'error-text'}>{t(msg.key)}</p>;

  return (
    <section className="settings-section">
      <h3>{t('keys.title')}</h3>
      <p className="settings-hint">{t('keys.description')}</p>

      <h4>{t('keys.exportTitle')}</h4>
      {hasKeys ? (
        <form className="key-backup-form" onSubmit={handleExport} onKeyDown={handleFormArrowNav}>
          <input
            type="password"
            className="settings-input"
            placeholder={t('keys.passphrase')}
            value={exportPass}
            onChange={(e) => setExportPass(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="settings-input"
            placeholder={t('keys.passphraseRepeat')}
            value={exportPassRepeat}
            onChange={(e) => setExportPassRepeat(e.target.value)}
            autoComplete="new-password"
          />
          <button type="submit" className="settings-button" disabled={busy}>
            {t('keys.exportButton')}
          </button>
          {renderMsg(exportMsg)}
          <p className="settings-hint">{t('keys.warning')}</p>
        </form>
      ) : (
        <p className="settings-hint">{t('keys.noLocalKeys')}</p>
      )}

      <h4>{t('keys.importTitle')}</h4>
      <form className="key-backup-form" onSubmit={handleImport} onKeyDown={handleFormArrowNav}>
        <input
          key={fileInputKey}
          type="file"
          className="settings-input"
          accept=".json,application/json"
          aria-label={t('keys.keyFile')}
          onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
        />
        <input
          type="password"
          className="settings-input"
          placeholder={t('keys.passphrase')}
          value={importPass}
          onChange={(e) => setImportPass(e.target.value)}
          autoComplete="current-password"
        />
        <button type="submit" className="settings-button" disabled={busy}>
          {t('keys.importButton')}
        </button>
        {renderMsg(importMsg)}
      </form>
    </section>
  );
}

export default KeyBackup;
