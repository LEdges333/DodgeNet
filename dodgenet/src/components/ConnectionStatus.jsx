import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function ConnectionStatus({ status }) {
  const { t } = useTranslation();
  return (
    <div className="status-container">
      <div className={`status-row ${status.isOnline ? 'online' : 'offline'}`}>
        {status.isOnline ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        <span className="status-label">
          {status.isOnline ? t('connection.protected') : t('connection.lost')}
        </span>
      </div>
      <div className="node-info">
        {t('connection.node', { name: t(`connection.nodes.${status.node}`, { defaultValue: status.node }) })}
      </div>
    </div>
  );
}

export default ConnectionStatus;
