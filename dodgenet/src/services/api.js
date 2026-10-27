import axios from 'axios';
import i18n from '../i18n';
import { errorMessage } from './errors';
import { generateKeyPair, encryptMessage, decryptMessage, saveKeyPair, getMyPrivateKey, adoptLegacyKeys, importKeyFile, keyError, encryptFile, decryptFile } from './crypto';
import { buildEnvelope, parseEnvelope, sanitizeFileName, MAX_FILES_PER_MESSAGE, MAX_FILE_SIZE } from './envelope';



const FRONTS = [
  'http://localhost:5000',
];

/*
 * A universal wrapper around axios that tries multiple frontends in case of unavailability.
 * It uses all API functions — since all frontends point to the same backend,
 * there is no risk of data desynchronization between the "nodes"
 */
async function requestWithFailover(path, options = {}) {
  let lastError;

  for (const front of FRONTS) {
    try {
      const response = await axios({
        url: `${front}${path}`,
        timeout: 4000,
        ...options,
      });
      return response;
    } catch (error) {
      // A 4xx answer means the server was reached and refused the request on purpose
      // (wrong password, file too large...). Another front would refuse it too, so do not retry.
      if (error.response && error.response.status < 500) throw error;

      lastError = error;
      console.warn(`The front ${front} is unavailable, trying the next one.`);
    }
  }

  throw lastError;
}

function authHeader() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

// Cache of the interlocutors public keys
const publicKeyCache = new Map();

async function getPublicKeyOf(userId) {
  if (publicKeyCache.has(userId)) {
    return publicKeyCache.get(userId);
  }

  const response = await requestWithFailover(`/api/user-key/${userId}`, {
    method: 'get',
    headers: authHeader(),
  });

  const publicKey = response.data.public_key;
  publicKeyCache.set(userId, publicKey);
  return publicKey;
}

// Registration - generates a key pair locally; the private key never leaves the client.
export const registerUser = async (username, email, password) => {
  try {
    const { publicKey, privateKey } = await generateKeyPair();

    const response = await requestWithFailover('/registration', {
      method: 'post',
      data: { username, email, password, public_key: publicKey },
    });

    saveKeyPair(username, publicKey, privateKey);
    return response.data;
  } catch (error) {
    throw new Error(errorMessage(error, 'errors.registration'));
  }
};

// Login
export const loginUser = async (username, password) => {
  try {
    const response = await requestWithFailover('/login', {
      method: 'post',
      data: { username, password },
    });
 
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('username', response.data.username || username);
      localStorage.setItem('activeUsername', response.data.username || username);
      localStorage.setItem('userId', response.data.user_id);

      // Keys saved by an older version (one pair per browser) are moved to this account if they match.
      try {
        const serverPublicKey = await getPublicKeyOf(response.data.user_id);
        await adoptLegacyKeys(response.data.username || username, serverPublicKey);
      } catch (e) {
        console.warn('Could not check the local keys:', e);
      }
    }
 
    return response.data;
  } catch (error) {
    throw new Error(errorMessage(error, 'errors.login'));
  }
};

// Profile
export const profilUser = async () => {
  try {
    const response = await requestWithFailover('/api/profile', {
      method: 'get',
      headers: authHeader(),
    });
    return response.data;
  } catch (error) {
    throw new Error(errorMessage(error, 'errors.profile'));
  }
};


// Change password. The keys are not affected: they are not derived from the password.
export const changePassword = async (oldPassword, newPassword, confirmation) => {
  try {
    const response = await requestWithFailover('/api/change-password', {
      method: 'post',
      data: { old_password: oldPassword, new_password: newPassword, confirmation },
      headers: authHeader(),
    });
    return response.data;
  } catch (error) {
    throw new Error(errorMessage(error, 'errors.changePassword'));
  }
};


// Import of a key backup file for the account that is logged in now.
// The key is accepted only if its public key equals the one the server has for this account,
// so a file of another account (or a forged one) can never replace the local keys.
export const importKeys = async (file, passphrase) => {
  const username = localStorage.getItem('activeUsername');
  const userId = localStorage.getItem('userId');
  if (!username || !userId) throw keyError('generic');

  const { publicKey, privateKey } = await importKeyFile(file, passphrase);

  let serverPublicKey;
  try {
    serverPublicKey = await getPublicKeyOf(userId);
  } catch {
    throw keyError('generic');
  }
  if (serverPublicKey !== publicKey) throw keyError('wrong_account');

  saveKeyPair(username, publicKey, privateKey);
};


// Sending a message - encrypts it before sending.
// A message can contain text, files, or both. `files` is an array of browser File objects.
// Each file is encrypted in the browser and uploaded first; its id and key then go into the
// message envelope, which is encrypted like any other message.
export const sendMessage = async (receiverId, text, files = []) => {
  const myPrivateKey = getMyPrivateKey();
 
  if (!myPrivateKey) {
    throw new Error(i18n.t('errors.noKeys'));
  }

  if (!text && files.length === 0) {
    throw new Error(i18n.t('errors.emptyMessage'));
  }
  if (files.length > MAX_FILES_PER_MESSAGE) {
    throw new Error(i18n.t('chat.errors.tooManyFiles', { max: MAX_FILES_PER_MESSAGE }));
  }
  for (const file of files) {
    if (file.size === 0) throw new Error(i18n.t('chat.errors.emptyFile', { name: file.name }));
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(i18n.t('chat.errors.fileTooLarge', { name: file.name, max: MAX_FILE_SIZE / (1024 * 1024) }));
    }
  }
 
  const recipientPublicKey = await getPublicKeyOf(receiverId);
  if (!recipientPublicKey) {
    throw new Error(i18n.t('errors.noRecipientKey'));
  }

  // Encrypt and upload the files one by one (so only one file is in memory at a time).
  const attachments = [];
  for (const file of files) {
    const { data, key } = await encryptFile(new Uint8Array(await file.arrayBuffer()));
    const id = await uploadAttachment(receiverId, data);
    attachments.push({
      id,
      key,
      name: sanitizeFileName(file.name),
      mime: file.type || 'application/octet-stream',
      size: file.size,
    });
  }

  const { ciphertext, nonce } = await encryptMessage(
    buildEnvelope(text, attachments), recipientPublicKey, myPrivateKey
  );
 
  try {
    const response = await requestWithFailover('/api/send-message', {
      method: 'post',
      data: { receiver_id: receiverId, text: ciphertext, nonce },
      headers: authHeader(),
    });
 
    // We return the original text for instant display.
    return {
      id: response.data.id || Date.now(),
      text,
      files: attachments,
      sender_id: Number(localStorage.getItem('userId')),
      receiver_id: Number(receiverId),
    };
  } catch {
    throw new Error(i18n.t('errors.channelsUnavailable'));
  }
};

// Uploads an encrypted file. The server only gets ciphertext and learns nothing about the file.
async function uploadAttachment(recipientId, encryptedBytes) {
  try {
    const response = await requestWithFailover(`/api/attachments?recipient_id=${encodeURIComponent(recipientId)}`, {
      method: 'post',
      data: encryptedBytes,
      headers: { ...authHeader(), 'Content-Type': 'application/octet-stream' },
      timeout: 120000,            // a big file needs more than the 4 seconds of ordinary requests
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data.id;
  } catch (error) {
    throw new Error(errorMessage(error, 'errors.uploadFailed'));
  }
}

// Downloads and decrypts an attachment described in a message envelope. Returns a Uint8Array.
export const downloadAttachment = async (file) => {
  let response;
  try {
    response = await requestWithFailover(`/api/attachments/${file.id}`, {
      method: 'get',
      headers: authHeader(),
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: Infinity,
    });
  } catch (error) {
    throw new Error(errorMessage(error, 'errors.downloadFailed'));
  }

  const bytes = await decryptFile(new Uint8Array(response.data), file.key);
  // The size written in the envelope must match, otherwise the file is not what the sender described.
  if (bytes.length !== file.size) throw keyError('corrupt_file');
  return bytes;
};

// Contact list
export const contactsUser = async () => {
  const myPrivateKey = getMyPrivateKey();

  try {
    const response = await requestWithFailover('/api/contacts', {
      method: 'get',
      headers: authHeader(),
    });

    // The server sends the literal "No messages" for an empty conversation.
    // We turn it into null so the UI can show it in the selected language.
    const contacts = response.data.map((c) =>
      c.last_message === 'No messages' ? { ...c, last_message: null } : c
    );

    // No keys for this account on this device: nothing can be decrypted.
    if (!myPrivateKey) {
      return contacts.map((c) =>
        c.last_message && c.last_nonce ? { ...c, last_message: null, decrypt_failed: true } : c
      );
    }

    const contactsWithDecrypted = await Promise.all(
      contacts.map(async (contact) => {
        if (!contact.last_message || !contact.last_nonce) {
          return contact;
        }
        try {
          const theirPublicKey = await getPublicKeyOf(contact.id);
          const decrypted = await decryptMessage(
            contact.last_message,
            contact.last_nonce,
            theirPublicKey,
            myPrivateKey
          );
          if (decrypted === null) {
            return { ...contact, last_message: null, decrypt_failed: true };
          }
          // The preview shows the text; for a message with only files the list shows "Attachment".
          const envelope = parseEnvelope(decrypted);
          return {
            ...contact,
            last_message: envelope.text || null,
            last_files: envelope.files.length,
            last_unsupported: envelope.unsupported,
          };
        } catch {
          return { ...contact, last_message: null, decrypt_failed: true };
        }
      })
    );

    return contactsWithDecrypted;
  } catch (error) {
    throw new Error(errorMessage(error, 'errors.loadContacts'));
  }
};

// Message history
export const getMessage = async (receiverId) => {
  const myPrivateKey = getMyPrivateKey();

  try {
    const response = await requestWithFailover(`/api/messages/${receiverId}`, {
      method: 'get',
      headers: authHeader(),
    });

    // No keys for this account on this device: nothing can be decrypted.
    if (!myPrivateKey) {
      return response.data.map((msg) =>
        msg.nonce ? { ...msg, text: null, decrypt_failed: true } : msg
      );
    }

    const otherPublicKey = await getPublicKeyOf(receiverId);

    const decryptedMessages = await Promise.all(
      response.data.map(async (msg) => {
        // A message without a nonce was stored before encryption existed: it is plain text.
        if (!msg.nonce) return msg;

        const plaintext = await decryptMessage(msg.text, msg.nonce, otherPublicKey, myPrivateKey);
        if (plaintext === null) return { ...msg, text: null, decrypt_failed: true };

        const { text, files, unsupported } = parseEnvelope(plaintext);
        return { ...msg, text, files, unsupported };
      })
    );

    return decryptedMessages;
  } catch (error) {
    throw new Error(errorMessage(error, 'errors.loadMessages'));
  }
};

// Add contact
export const addContact = async (username) => {
  try {
    const response = await requestWithFailover('/api/contacts/add', {
      method: 'post',
      data: { username },
      headers: authHeader(),
    });
    return response.data;
  } catch (error) {
    throw new Error(errorMessage(error, 'errors.addContact'));
  }
};