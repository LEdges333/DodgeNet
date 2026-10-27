// Message envelope.
//
// Everything that goes into a message is put into one small JSON document BEFORE encryption:
//
//   { "v": 1, "text": "optional caption", "files": [ { id, key, name, mime, size }, ... ] }
//
// - text and files are both optional, but a message needs at least one of them;
// - for every file: `id` is the encrypted file on the server, `key` decrypts it, and the name, type and
//   size are known only to the two people in the conversation (the server sees none of them);
// - "v" is the format version, so the envelope can grow later without breaking old messages.
//
// Messages written before envelopes existed are plain strings; parseEnvelope() shows them as text.
//
// The sender controls everything inside a received envelope, so parseEnvelope() validates it strictly.

export const ENVELOPE_VERSION = 1;
export const MAX_FILES_PER_MESSAGE = 5;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MiB (original file, before encryption)

const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;      // a 32-byte key in URL-safe base64 without padding
const MAX_NAME_LENGTH = 100;
const MAX_MIME_LENGTH = 100;
const MIME_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

// Images that are shown inside the chat. SVG is deliberately not here: it can contain scripts.
export const INLINE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function isInlineImage(file) {
  return INLINE_IMAGE_TYPES.includes(file.mime);
}

// A file name comes from another person: remove path parts and characters that are unsafe in file names.
export function sanitizeFileName(name) {
  const cleaned = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '') // control and bidi-override characters
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^[.\s]+/, '')
    .trim();
  const shortened = cleaned.length > MAX_NAME_LENGTH ? cleaned.slice(0, MAX_NAME_LENGTH).trim() : cleaned;
  return shortened || 'file';
}

export function buildEnvelope(text, files = []) {
  return JSON.stringify({ v: ENVELOPE_VERSION, text: text || '', files });
}

const UNSUPPORTED = { text: '', files: [], unsupported: true };

function validFile(f) {
  return (
    f && typeof f === 'object' &&
    typeof f.id === 'string' && ID_PATTERN.test(f.id) &&
    typeof f.key === 'string' && KEY_PATTERN.test(f.key) &&
    typeof f.name === 'string' &&
    typeof f.mime === 'string' && f.mime.length <= MAX_MIME_LENGTH && MIME_PATTERN.test(f.mime) &&
    Number.isInteger(f.size) && f.size > 0 && f.size <= MAX_FILE_SIZE
  );
}

// Returns { text, files, unsupported }. It never throws.
export function parseEnvelope(plaintext) {
  let data;
  try {
    data = JSON.parse(plaintext);
  } catch {
    return { text: String(plaintext ?? ''), files: [], unsupported: false }; // old plain-text message
  }

  const isEnvelope = data && typeof data === 'object' && !Array.isArray(data) && typeof data.v === 'number';
  if (!isEnvelope) {
    // valid JSON, but not ours (for example the old message "123" or "null"): it is plain text
    return { text: String(plaintext ?? ''), files: [], unsupported: false };
  }

  if (data.v !== ENVELOPE_VERSION) return UNSUPPORTED;       // written by a newer version of the app
  if (data.text !== undefined && typeof data.text !== 'string') return UNSUPPORTED;
  const rawFiles = data.files ?? [];
  if (!Array.isArray(rawFiles) || rawFiles.length > MAX_FILES_PER_MESSAGE) return UNSUPPORTED;
  if (!rawFiles.every(validFile)) return UNSUPPORTED;

  const text = data.text ?? '';
  const files = rawFiles.map((f) => ({
    id: f.id, key: f.key, mime: f.mime, size: f.size, name: sanitizeFileName(f.name),
  }));
  if (!text && files.length === 0) return UNSUPPORTED;       // an empty message cannot be valid

  return { text, files, unsupported: false };
}
