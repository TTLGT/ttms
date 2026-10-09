'use client';

import { ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from './firebase';
import { trackActivity } from './attendance';
import {
  MAX_ORDER_FILE_BYTES,
  formatFileSize,
  orderFilePath,
  type OrderFile,
  type OrderFileKind,
} from '@/types/orderFile';

/**
 * An order's other files from the browser. The upload goes straight into the
 * bucket (the prefix is create-only); everything else goes through the API.
 * See src/types/orderFile.ts.
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

export async function listOrderFiles(orderId: string): Promise<OrderFile[]> {
  const res = await fetch(`/api/orders/${orderId}/files`, { headers: await authHeaders() });
  return (await unwrap<{ files: OrderFile[] }>(res)).files;
}

/** 32 random characters — unguessable, and safe in a path and a document id. */
function newFileId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Uploads one file and files it on the order. Two steps, and the second is the
 * one that counts: until the server has checked and recorded it, the object in
 * the bucket belongs to nobody and nobody can read it.
 */
export async function uploadOrderFile(
  orderId: string,
  file: File,
  meta: { kind: OrderFileKind; note: string },
  onProgress?: (percent: number) => void,
): Promise<OrderFile> {
  if (file.size > MAX_ORDER_FILE_BYTES) {
    throw new Error(`${file.name} is ${formatFileSize(file.size)}. The most a file can be is ${formatFileSize(MAX_ORDER_FILE_BYTES)}.`);
  }
  const fileId = newFileId();
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, orderFilePath(orderId, fileId)), file, {
      contentType: file.type || 'application/octet-stream',
    });
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => reject(new Error(err.code === 'storage/unauthorized'
        ? 'The upload was refused. Files can be at most 25 MB.'
        : err.message)),
      () => resolve(),
    );
  });

  const res = await fetch(`/api/orders/${orderId}/files`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, name: file.name, kind: meta.kind, note: meta.note }),
  });
  const { file: saved } = await unwrap<{ file: OrderFile }>(res);
  trackActivity('documentsUploaded');
  return saved;
}

export async function updateOrderFile(
  orderId: string, fileId: string, patch: { kind?: OrderFileKind; note?: string },
): Promise<OrderFile> {
  const res = await fetch(`/api/orders/${orderId}/files/${fileId}`, {
    method: 'PATCH',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return (await unwrap<{ file: OrderFile }>(res)).file;
}

export async function deleteOrderFile(orderId: string, fileId: string): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/files/${fileId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  await unwrap(res);
}
