/**
 * Shrinking a picture in the browser before it is sent — see
 * prepareLoadPhoto(). Kept apart from loadPhotos.ts, which signs in through
 * Firebase, so the public driver page (src/app/driver) can use it too.
 */

import { MAX_PHOTO_BYTES, MAX_THUMB_BYTES, PHOTO_MAX_EDGE, PHOTO_THUMB_EDGE } from '@/types/loadPhoto';

export interface PreparedPhoto {
  photo: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the picture'))), 'image/jpeg', quality);
  });
}

function draw(bitmap: ImageBitmap, longEdge: number): HTMLCanvasElement {
  const scale  = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize pictures');
  // White under anything transparent: a PNG screenshot with an alpha channel
  // would otherwise turn black when flattened into a JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Encodes at falling quality until it fits, so a very detailed photo still goes. */
async function fit(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  for (const q of [0.85, 0.75, 0.65, 0.5]) {
    const blob = await toJpeg(canvas, q);
    if (blob.size <= maxBytes) return blob;
  }
  throw new Error('That picture is too detailed to send even after shrinking it');
}

/**
 * Shrinks a picture to what the upload route accepts: a JPEG no longer than
 * PHOTO_MAX_EDGE on its long side, and a thumbnail.
 *
 * Done here because the server has no image library and Vercel will not take
 * a request over 4.5 MB. Re-encoding has two side effects, both wanted: the
 * phone's rotation flag is applied (createImageBitmap honours it), so nothing
 * shows up sideways; and the location and camera details a phone writes into
 * a photo are dropped rather than stored against a load.
 */
export async function prepareLoadPhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // Nearly always an iPhone HEIC opened in Chrome or Edge on a PC, which
    // cannot decode that format. Safari can, and an iPhone uploading through
    // the browser normally converts to JPEG by itself.
    throw new Error(`${file.name} could not be opened. If it is an iPhone photo (HEIC), save it as JPEG or upload it from the phone.`);
  }
  try {
    const full  = draw(bitmap, PHOTO_MAX_EDGE);
    const small = draw(bitmap, PHOTO_THUMB_EDGE);
    const [photo, thumb] = await Promise.all([fit(full, MAX_PHOTO_BYTES), fit(small, MAX_THUMB_BYTES)]);
    return { photo, thumb, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}
