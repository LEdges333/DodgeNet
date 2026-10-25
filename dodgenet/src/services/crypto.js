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
  } catch {
    // Invalid key, corrupted data, not our message.
    // null means "could not decrypt"; the UI shows a localized placeholder for it.
    return null;
  }
}

// Local storage of your own keys.
// Every account has its own pair: publicKey_<username> / privateKey_<username>.
// The account is the one that is logged in now (localStorage 'activeUsername', set at login).
// Without the per-user names, registering a second account in the same browser
// overwrote the keys of the first one and its messages could no longer be decrypted.

export function saveKeyPair(username, publicKey, privateKey) {
  localStorage.setItem(`publicKey_${username}`, publicKey);
  localStorage.setItem(`privateKey_${username}`, privateKey);
}

export function getMyPrivateKey() {
  const username = localStorage.getItem('activeUsername');
  return username ? localStorage.getItem(`privateKey_${username}`) : null;
}

export function getMyPublicKey() {
  const username = localStorage.getItem('activeUsername');
  return username ? localStorage.getItem(`publicKey_${username}`) : null;
}

export function hasKeyPair() {
  return Boolean(getMyPrivateKey() && getMyPublicKey());
}

// Older versions kept one key pair for the whole browser ('publicKey' / 'privateKey').
// At login we move it to the account it belongs to, but only after checking that it really is
// that account's key: the public key computed from the old private key must equal
// the public key the server has for this user. A pair that belongs to someone else is left alone.
export async function adoptLegacyKeys(username, serverPublicKeyB64) {
  if (localStorage.getItem(`privateKey_${username}`)) return false;

  const legacyPrivate = localStorage.getItem('privateKey');
  const legacyPublic = localStorage.getItem('publicKey');
  if (!legacyPrivate || !legacyPublic) return false;

  await sodium.ready;
  try {
    const derived = sodium.to_base64(
      sodium.crypto_scalarmult_base(sodium.from_base64(legacyPrivate))
    );
    if (derived !== serverPublicKeyB64) return false;
  } catch {
    return false;
  }

  saveKeyPair(username, legacyPublic, legacyPrivate);
  localStorage.removeItem('privateKey');
  localStorage.removeItem('publicKey');
  return true;
}


// ---------------------------------------------------------------------------------------------
// Key backup file (export / import)
//
// The file contains the private key encrypted with a password chosen by the user:
//   password --PBKDF2-SHA256 (600k iterations, random salt)--> AES-256-GCM key.
// The username and the public key are bound to the ciphertext as "additional data", so editing
// them in the file makes decryption fail. WebCrypto is used (not libsodium) because the standard
// libsodium build has no Argon2id. WebCrypto needs HTTPS or localhost.
// Errors carry a `code` ('no_keys', 'no_crypto', 'invalid_file', 'wrong_passphrase'); the UI translates them.
// ---------------------------------------------------------------------------------------------

const KEY_FILE_APP = 'dodgenet-keys';
const KEY_FILE_VERSION = 1;
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_MIN_ITERATIONS = 100000;   // a file asking for less/more is rejected
const PBKDF2_MAX_ITERATIONS = 5000000;

export function keyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function webCryptoSubtle() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw keyError('no_crypto');
  return subtle;
}

async function deriveFileKey(passphrase, salt, iterations, usage) {
  const subtle = webCryptoSubtle();
  // NFKC: the same password typed on another keyboard/OS must give the same bytes
  const material = await subtle.importKey(
    'raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

function fileAad(username, publicKey) {
  return new TextEncoder().encode(`${KEY_FILE_APP}|${KEY_FILE_VERSION}|${username}|${publicKey}`);
}

// Builds the backup file (a plain object, ready for JSON.stringify) for the account that is logged in now.
export async function exportKeyFile(passphrase) {
  await sodium.ready;
  const subtle = webCryptoSubtle();

  const username = localStorage.getItem('activeUsername');
  const publicKey = getMyPublicKey();
  const privateKey = getMyPrivateKey();
  if (!username || !publicKey || !privateKey) throw keyError('no_keys');

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveFileKey(passphrase, salt, PBKDF2_ITERATIONS, ['encrypt']);
  const encrypted = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: fileAad(username, publicKey) },
      key,
      sodium.from_base64(privateKey)
    )
  );

  return {
    app: KEY_FILE_APP,
    version: KEY_FILE_VERSION,
    username,
    publicKey,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: sodium.to_base64(salt) },
    cipher: { name: 'AES-GCM', iv: sodium.to_base64(iv) },
    encryptedPrivateKey: sodium.to_base64(encrypted),
  };
}

// Opens a backup file. Returns { username, publicKey, privateKey } and does NOT save anything:
// the caller must first check that the key belongs to the right account.
export async function importKeyFile(file, passphrase) {
  await sodium.ready;

  const looksValid =
    file && typeof file === 'object' &&
    file.app === KEY_FILE_APP && file.version === KEY_FILE_VERSION &&
    typeof file.username === 'string' && typeof file.publicKey === 'string' &&
    typeof file.encryptedPrivateKey === 'string' &&
    file.kdf?.name === 'PBKDF2' && typeof file.kdf.salt === 'string' &&
    Number.isInteger(file.kdf.iterations) &&
    file.kdf.iterations >= PBKDF2_MIN_ITERATIONS && file.kdf.iterations <= PBKDF2_MAX_ITERATIONS &&
    file.cipher?.name === 'AES-GCM' && typeof file.cipher.iv === 'string';
  if (!looksValid) throw keyError('invalid_file');

  let salt, iv, encrypted;
  try {
    salt = sodium.from_base64(file.kdf.salt);
    iv = sodium.from_base64(file.cipher.iv);
    encrypted = sodium.from_base64(file.encryptedPrivateKey);
  } catch {
    throw keyError('invalid_file');
  }
  if (iv.length !== 12) throw keyError('invalid_file');

  const subtle = webCryptoSubtle();
  let privateKeyBytes;
  try {
    const key = await deriveFileKey(passphrase, salt, file.kdf.iterations, ['decrypt']);
    privateKeyBytes = new Uint8Array(
      await subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: fileAad(file.username, file.publicKey) },
        key,
        encrypted
      )
    );
  } catch {
    // wrong password, or the file was edited/damaged (AES-GCM cannot tell these apart)
    throw keyError('wrong_passphrase');
  }

  // The decrypted private key must really belong to the public key written in the file.
  try {
    const derived = sodium.to_base64(sodium.crypto_scalarmult_base(privateKeyBytes));
    if (derived !== file.publicKey) throw keyError('invalid_file');
  } catch (e) {
    throw e.code ? e : keyError('invalid_file');
  }

  return { username: file.username, publicKey: file.publicKey, privateKey: sodium.to_base64(privateKeyBytes) };
}
