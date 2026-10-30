// Preparing a profile photo in the browser: any picture -> a square 256x256 WebP (or JPEG).
// The server only ever receives this small re-encoded image. Re-encoding also removes everything
// that was hidden in the original file (camera model, GPS position, ...), which is good for privacy.

export const AVATAR_SIZE = 256;
export const MAX_AVATAR_SOURCE_BYTES = 10 * 1024 * 1024; // do not even try to open bigger pictures

function imageError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Throws an error with code 'not_image', 'too_large' or 'unreadable'.
export async function makeAvatarBlob(file) {
  if (!file.type.startsWith('image/')) throw imageError('not_image');
  if (file.size > MAX_AVATAR_SOURCE_BYTES) throw imageError('too_large');

  let bitmap;
  try {
    // "from-image": rotate the picture the way the camera says (a phone photo is often stored sideways)
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw imageError('unreadable'); // broken file, or a format this browser cannot open (for example HEIC)
  }

  // take the biggest square from the middle of the picture
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close?.();

  let blob = await canvasToBlob(canvas, 'image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') {
    // this browser cannot write WebP (it silently gives PNG): use JPEG, on a white background
    // (JPEG has no transparency)
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
  }
  if (!blob) throw imageError('unreadable');
  return blob;
}
