'use client';

import { auth } from './firebase';
import { trackActivity } from './attendance';
import {
  MAX_PHOTO_BYTES,
  MAX_THUMB_BYTES,
  PHOTO_MAX_EDGE,
  PHOTO_THUMB_EDGE,
  type LoadPhoto,
  type LoadPhotoRow,
  type PhotoStage,
} from '@/types/loadPhoto';

/**
 * Load pictures from the browser. Everything goes through the API — the bucket
 * prefix and the collection are both closed to the client SDK; see
 * src/types/loadPhoto.ts.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function listOrderPhotos(orderId: string): Promise<{ photos: LoadPhoto[]; coverPhotoId: string | null }> {
  const res = await fetch(`/api/orders/${orderId}/photos`, { headers: await authHeaders() });
  return unwrap(res);
}

/** Every picture on every load the reader can see, newest first. */
export async function listPhotoDocuments(): Promise<{ rows: LoadPhotoRow[]; capped: boolean }> {
  const res = await fetch('/api/documents/photos', { headers: await authHeaders() });
  return unwrap(res);
}

export async function setOrderCover(orderId: string, photoId: string | null): Promise<string | null> {
  const res = await fetch(`/api/orders/${orderId}/cover`, {
    method:  'PUT',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ photoId }),
  });
  const { coverPhotoId } = await unwrap<{ coverPhotoId: string | null }>(res);
  return coverPhotoId;
}

export async function updateLoadPhoto(
  orderId: string,
  photoId: string,
  patch: { caption?: string; stage?: PhotoStage; commodity?: string },
): Promise<LoadPhoto> {
  const res = await fetch(`/api/orders/${orderId}/photos/${photoId}`, {
    method:  'PATCH',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body:    JSON.stringify(patch),
  });
  const { photo } = await unwrap<{ photo: LoadPhoto }>(res);
  return photo;
}

/** Removes a picture. Answers with the load's profile picture afterwards. */
export async function deleteLoadPhoto(orderId: string, photoId: string): Promise<string | null> {
  const res = await fetch(`/api/orders/${orderId}/photos/${photoId}`, {
    method:  'DELETE',
    headers: await authHeaders(),
  });
  const { coverPhotoId } = await unwrap<{ coverPhotoId: string | null }>(res);
  return coverPhotoId;
}

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

/**
 * Sends one prepared picture. XHR rather than fetch because fetch still
 * reports no upload progress, and on a phone in a yard the bar is the only
 * sign the upload has not stalled.
 */
export async function uploadLoadPhoto(
  orderId: string,
  prepared: PreparedPhoto,
  meta: { caption: string; stage: PhotoStage; commodity: string },
  onProgress?: (percent: number) => void,
): Promise<{ photo: LoadPhoto; coverPhotoId: string | null }> {
  const form = new FormData();
  form.append('photo', prepared.photo, 'photo.jpg');
  form.append('thumb', prepared.thumb, 'thumb.jpg');
  form.append('width', String(prepared.width));
  form.append('height', String(prepared.height));
  form.append('caption', meta.caption);
  form.append('stage', meta.stage);
  form.append('commodity', meta.commodity);

  const headers = await authHeaders();
  const result = await new Promise<{ photo: LoadPhoto; coverPhotoId: string | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/orders/${orderId}/photos`);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error('The upload was interrupted'));
    xhr.onload = () => {
      let body: { error?: string; photo?: LoadPhoto; coverPhotoId?: string | null } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.photo) {
        resolve({ photo: body.photo, coverPhotoId: body.coverPhotoId ?? null });
      } else {
        reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.send(form);
  });
  // Counted with the other paperwork for the day's attendance record.
  trackActivity('documentsUploaded');
  return result;
}
