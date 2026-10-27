import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { contactsUser as getContacts, addContact } from '../services/api';
import '../App.css';

function ChatList() {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // States for the addition form
  const [showForm, setShowForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  // Text shown under a contact's name: the last message, or what it consists of.
  const preview = (contact) => {
    if (contact.decrypt_failed) return t('chatList.encrypted');
    if (contact.last_unsupported) return t('chat.unsupported');
    if (contact.last_message) return contact.last_message;
    if (contact.last_files === 1) return t('chatList.attachment');
    if (contact.last_files > 1) return t('chatList.attachments', { count: contact.last_files });
    return t('chatList.noMessages');
  };

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

  // First load. State is only set when the answer arrives (not inside the effect itself).
  useEffect(() => {
    let cancelled = false;
    getContacts()
      .then((data) => { if (!cancelled) setContacts(data); })
      .catch((err) => console.error(err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
    return <div className="chat-list"><p>{t('chatList.loading')}</p></div>;
  }

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <h2>{t('chatList.title')}</h2>
        <button 
          className="add-contact-btn"
          onClick={() => {
            setShowForm(!showForm);
            setError('');
          }}
        >
          {showForm ? <X size={18} /> : <UserPlus size={18} />}
          <span>{showForm ? t('chatList.cancel') : t('chatList.add')}</span>
        </button>
      </div>

      {showForm && (
        <form className="add-contact-form" onSubmit={handleAddContact}>
          <div className="input-group">
            <input
              type="text"
              placeholder={t('chatList.usernamePlaceholder')}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              disabled={isSubmitting}
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '...' : t('chatList.search')}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </form>
      )}

      {/* Contact list */}
      {contacts.length === 0 ? (
        <p className="empty-text">{t('chatList.empty')}</p>
      ) : (
        contacts.map(contact => (
          <div
            key={contact.id}
            className="contact-card"
            onClick={() => navigate(`/chat/${contact.id}`)}
          >
            <h3>{contact.username}</h3>
            <p>{preview(contact)}</p>
          </div>
        ))
      )}
    </div>
  );
}

export default ChatList;