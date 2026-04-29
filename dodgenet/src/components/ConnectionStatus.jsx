import { ShieldCheck, ShieldAlert } from 'lucide-react';

const ConnectionStatus = ({ isOnline, currentNode }) => {
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg ${isOnline ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
      {isOnline ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
      <span className="text-sm font-medium">
        {isOnline ? `Active connections: ${currentNode}` : 'Channels are blocked'}
      </span>
    </div>
  );
};

export default ConnectionStatus;
