import sodium from 'libsodium-wrappers';

// All keys are stored/transmitted as base64 strings so that they can be placed in localStorage and JSON

// Generates a new key pair (public + private) for the crypto box. Called once during registration.
export async function generateKeyPair() {
  await sodium.ready;
  const keypair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(keypair.publicKey),
    privateKey: sodium.to_base64(keypair.privateKey),
  };
}

// Encrypts the text for a specific recipient. Returns { ciphertext, nonce } — both base64, ready to be sent to the server as is
export async function encryptMessage(plaintext, recipientPublicKeyB64, myPrivateKeyB64) {
  await sodium.ready;

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const recipientPublicKey = sodium.from_base64(recipientPublicKeyB64);
  const myPrivateKey = sodium.from_base64(myPrivateKeyB64);

  const ciphertext = sodium.crypto_box_easy(
    sodium.from_string(plaintext),
    nonce,
    recipientPublicKey,
    myPrivateKey
  );

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
  };
}

/**
 * Decrypts the message.
 * otherPublicKeyB64 — the recipient’s public key; due to the symmetry of Diffie‑Hellman, so that
 * to decrypt both incoming and outgoing messages in correspondence with the same contact you need same public key of this contact).
 */
export async function decryptMessage(ciphertextB64, nonceB64, otherPublicKeyB64, myPrivateKeyB64) {
  await sodium.ready;

  try {
    const ciphertext = sodium.from_base64(ciphertextB64);
    const nonce = sodium.from_base64(nonceB64);
    const otherPublicKey = sodium.from_base64(otherPublicKeyB64);
    const myPrivateKey = sodium.from_base64(myPrivateKeyB64);

    const decrypted = sodium.crypto_box_open_easy(ciphertext, nonce, otherPublicKey, myPrivateKey);
    return sodium.to_string(decrypted);
  } catch (e) {
    // Invalid key, corrupted data, not our message
    return '[Couldnt decrypt the message]';
  }
}

// Local storage of your own keys

export function saveKeyPair(publicKey, privateKey) {
  localStorage.setItem('publicKey', publicKey);
  localStorage.setItem('privateKey', privateKey);
}

export function getMyPrivateKey() {
  return localStorage.getItem('privateKey');
}

export function getMyPublicKey() {
  return localStorage.getItem('publicKey');
}

export function hasKeyPair() {
  return Boolean(localStorage.getItem('privateKey') && localStorage.getItem('publicKey'));
}