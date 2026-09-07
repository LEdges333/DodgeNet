import { ShieldCheck, ShieldAlert } from 'lucide-react';

function ConnectionStatus({ status }) {
  return (
    <div className="status-container">
      <div className={`status-row ${status.isOnline ? 'online' : 'offline'}`}>
        {status.isOnline ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        <span className="status-label">
          {status.isOnline ? "Channel is protected" : "Connection lost"}
        </span>
      </div>
      <div className="node-info">Node: {status.node}</div>
    </div>
  );
}

export default ConnectionStatus;
