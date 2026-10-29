'use client';

import { auth } from './firebase';
import { trackActivity } from './attendance';
import {
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
  patch: { caption?: string; stage?: PhotoStage; commodity?: string; location?: string },
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

// The shrinking lives in imagePrep.ts, which has no Firebase in it, so the
// public driver page can use it without pulling in the sign-in SDK.
export { prepareLoadPhoto, type PreparedPhoto } from './imagePrep';
import type { PreparedPhoto } from './imagePrep';

/**
 * Sends one prepared picture. XHR rather than fetch because fetch still
 * reports no upload progress, and on a phone in a yard the bar is the only
 * sign the upload has not stalled.
 */
export async function uploadLoadPhoto(
  orderId: string,
  prepared: PreparedPhoto,
  meta: { caption: string; stage: PhotoStage; commodity: string; location: string },
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
  form.append('location', meta.location);

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
