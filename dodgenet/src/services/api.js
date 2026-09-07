import axios from 'axios';
import { generateKeyPair, encryptMessage, decryptMessage, saveKeyPair, getMyPrivateKey, getMyPublicKey } from './crypto';



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

    saveKeyPair(publicKey, privateKey);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Registration error');
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
    }
 
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || error.response?.data?.error || 'Login error');
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
    throw new Error(
      error.response?.data?.error || error.response?.data?.message || 'The profile could not be loaded'
    );
  }
};


// Sending a message - encrypts it before sending.
export const sendMessage = async (receiverId, text) => {
  const myPrivateKey = getMyPrivateKey();
 
  if (!myPrivateKey) {
    throw new Error('Encryption keys not found. Log in again');
  }
 
  const recipientPublicKey = await getPublicKeyOf(receiverId);
  if (!recipientPublicKey) {
    throw new Error('The recipient does not have a public key — the message cannot be encrypted');
  }
 
  const { ciphertext, nonce } = await encryptMessage(text, recipientPublicKey, myPrivateKey);
 
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
      sender_id: Number(localStorage.getItem('userId')),
      receiver_id: Number(receiverId),
    };
  } catch (error) {
    throw new Error('All communication channels are unavailable');
  }
};

// Contact list
export const contactsUser = async () => {
  const myPrivateKey = getMyPrivateKey();

  try {
    const response = await requestWithFailover('/api/contacts', {
      method: 'get',
      headers: authHeader(),
    });

    if (!myPrivateKey) {
      return response.data;
    }

    const contactsWithDecrypted = await Promise.all(
      response.data.map(async (contact) => {
        if (!contact.last_message || contact.last_message === 'No messages.' || !contact.last_nonce) {
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
          return { ...contact, last_message: decrypted };
        } catch (e) {
          return { ...contact, last_message: 'Encrypted message'};
        }
      })
    );

    return contactsWithDecrypted;
  } catch (error) {
    throw new Error(
      error.response?.data?.error || 'Failed to load contacts'
    );
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

    if (!myPrivateKey) {
      return response.data; 
    }

    const otherPublicKey = await getPublicKeyOf(receiverId);

    const decryptedMessages = await Promise.all(
      response.data.map(async (msg) => ({
        ...msg,
        text: await decryptMessage(msg.text, msg.nonce, otherPublicKey, myPrivateKey),
      }))
    );

    return decryptedMessages;
  } catch (error) {
    throw new Error(
      error.response?.data?.error || 'Failed to load messages'
    );
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
    throw new Error(
      error.response?.data?.error || 'Adding contact error'
    );
  }
};