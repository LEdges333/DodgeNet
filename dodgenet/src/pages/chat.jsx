import React from 'react';
import {Send} from 'lucide-react';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useNavigate} from 'react-router-dom';
import {useParams} from 'react-router-dom';
import {useEffect} from 'react';
import {sendMessage, getMessage} from '../services/api';
import ConnectionStatus from '../components/ConnectionStatus';
import '../App.css';


function Chat({ status, setStatus}) {

  const {userId} = useParams();
  const [input, setInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);

  const myId = Number(localStorage.getItem('userId'));

  const handleSend = async () => {
    // Protection against empty messages (spaces)
    if (!input.trim()) return;
 
    try {
        //  text to the server
        const message = await sendMessage(userId, input);
 
        // the servers response to the message list
        setChatMessages(prev => [...prev, message]);
 
        // node status update
        setStatus({
            isOnline: true,
            node: 'Primary',
        });
 
        // clearing the input field for the next message
        setInput(""); 
        
    } catch (err) {
        setStatus({
            isOnline: false,
            node: "None",
        });
        alert(err.message);
    }
  };
  useEffect(() => {
    const loadMessages = async () => {
        try {
            const data = await getMessage(userId);
            setChatMessages(data);
        } catch (err) {
            console.error(err);
        }
    };
 
    loadMessages();
}, [userId]);

  return (
    <div className="messenger-card">
      <div className="header">
        <h2>DodgeNet Chat</h2>
        <ConnectionStatus status={status} />
      </div>

      <div className="chat-window">
        {chatMessages.map((msg) => {
          const isMine = msg.sender_id === myId;
          return (
            <div
              key={msg.id}
              className={`message-row ${isMine ? 'send' : 'get'}`}
            >
              <div className={`message ${isMine ? 'message-send' : 'message-get'}`}>
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      <div className="input-area">
        <input 
          className="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter Message..."
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="send-button" onClick={handleSend}>
          <Send/>
        </button>
      </div>
    </div>
  );
}

export default Chat;