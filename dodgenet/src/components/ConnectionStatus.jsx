import { useSyncExternalStore } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getConnection, subscribeConnection } from '../services/connection';

// Shows the real state of the connection (see services/connection.js): whether the last requests got
// through, and which front (CDN address) the app is talking to right now.
function ConnectionStatus() {
  const { t } = useTranslation();
  const connection = useSyncExternalStore(subscribeConnection, getConnection);

  return (
    <div className="status-container">
      <div className={`status-row ${connection.online ? 'online' : 'offline'}`}>
        {connection.online ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        <span className="status-label">
          {connection.online ? t('connection.protected') : t('connection.lost')}
        </span>
      </div>
      {connection.online && connection.front && (
        <div className="node-info" title={connection.origin}>
          {t('connection.via', { host: connection.front })}
        </div>
      )}
    </div>
  );
}

export default ConnectionStatus;
