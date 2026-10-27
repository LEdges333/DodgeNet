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


// ---------------------------------------------------------------------------------------------
// File encryption (attachments)
//
// Every file gets its own random 256-bit key and is encrypted with libsodium's secretstream
// (XChaCha20-Poly1305) in 64 KiB chunks. The result is  header (24 bytes) + chunk + chunk + ...
// Each chunk is authenticated and chained to the previous ones, the last one carries a FINAL tag:
// so a changed, reordered, cut-off or extended file is detected when it is decrypted.
// The key is NOT stored anywhere on the server: it travels inside the (end-to-end encrypted)
// message envelope, see envelope.js.
// ---------------------------------------------------------------------------------------------

const FILE_CHUNK_SIZE = 64 * 1024;

export async function encryptFile(bytes) {
  await sodium.ready;
  const stream = sodium.crypto_secretstream_xchacha20poly1305_init_push;
  const TAG_MESSAGE = sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
  const TAG_FINAL = sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL;

  const key = sodium.crypto_secretstream_xchacha20poly1305_keygen();
  const { state, header } = stream(key);

  const parts = [header];
  let offset = 0;
  do {
    const end = Math.min(offset + FILE_CHUNK_SIZE, bytes.length);
    const isLast = end >= bytes.length;
    parts.push(
      sodium.crypto_secretstream_xchacha20poly1305_push(
        state, bytes.subarray(offset, end), null, isLast ? TAG_FINAL : TAG_MESSAGE
      )
    );
    offset = end;
  } while (offset < bytes.length);

  return { data: concatBytes(parts), key: sodium.to_base64(key) };
}

// Throws keyError('corrupt_file') if the key is wrong or the data was changed, cut or extended.
export async function decryptFile(data, keyBase64) {
  await sodium.ready;
  const HEADER = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES;
  const CIPHER_CHUNK = FILE_CHUNK_SIZE + sodium.crypto_secretstream_xchacha20poly1305_ABYTES;
  const TAG_FINAL = sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL;

  try {
    if (data.length <= HEADER) throw new Error('too short');
    const key = sodium.from_base64(keyBase64);
    const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(data.subarray(0, HEADER), key);

    const parts = [];
    let offset = HEADER;
    let sawFinal = false;
    while (offset < data.length) {
      if (sawFinal) throw new Error('data after the final chunk');
      const end = Math.min(offset + CIPHER_CHUNK, data.length);
      const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, data.subarray(offset, end));
      if (!result) throw new Error('chunk rejected');
      parts.push(result.message);
      if (result.tag === TAG_FINAL) sawFinal = true;
      offset = end;
    }
    if (!sawFinal) throw new Error('file is cut off');
    return concatBytes(parts);
  } catch {
    throw keyError('corrupt_file');
  }
}

function concatBytes(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
