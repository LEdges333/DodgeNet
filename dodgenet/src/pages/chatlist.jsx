import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, X } from 'lucide-react';
import { contactsUser as getContacts, addContact } from '../services/api';
import '../App.css';

function ChatList() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // States for the addition form
  const [showForm, setShowForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  // Were moving the loading function out so that we can call it again after adding something.
  const loadContacts = async () => {
    try {
      const data = await getContacts();
      setContacts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setError('');
    setIsSubmitting(true);

    try {
      await addContact(newUsername.trim());
      setNewUsername('');
      setShowForm(false);
      
      // Updating the contact list
      await loadContacts(); 
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="chat-list"><p>Uploading contacts...</p></div>;
  }

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <h2>Contacts</h2>
        <button 
          className="add-contact-btn"
          onClick={() => {
            setShowForm(!showForm);
            setError('');
          }}
        >
          {showForm ? <X size={18} /> : <UserPlus size={18} />}
          <span>{showForm ? 'Cancel' : 'Add'}</span>
        </button>
      </div>

      {showForm && (
        <form className="add-contact-form" onSubmit={handleAddContact}>
          <div className="input-group">
            <input
              type="text"
              placeholder="Enter username..."
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              disabled={isSubmitting}
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '...' : 'Search'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </form>
      )}

      {/* Contact list */}
      {contacts.length === 0 ? (
        <p className="empty-text">You don't have any contacts yet</p>
      ) : (
        contacts.map(contact => (
          <div
            key={contact.id}
            className="contact-card"
            onClick={() => navigate(`/chat/${contact.id}`)}
          >
            <h3>{contact.username}</h3>
            <p>{contact.last_message}</p>
          </div>
        ))
      )}
    </div>
  );
}

export default ChatList;