'use client';

import { ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from './firebase';
import { formatFileSize } from '@/types/orderFile';
import {
  MAX_IT_FILE_BYTES,
  itTicketFilePath,
  type ItTicket,
  type ItTicketCategory,
  type ItTicketMessage,
  type ItTicketPriority,
  type ItTicketStatus,
} from '@/types/itTicket';

/**
 * IT tickets from the browser. Files go straight into the bucket (the
 * caller's own create-only folder); everything else through /api/it-tickets.
 * See src/types/itTicket.ts.
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

/**
 * Fired after anything that changes what the nav badge would count, so the
 * sidebar refreshes at once rather than on its next timer.
 */
export const IT_TICKETS_CHANGED = 'ttms:it-tickets-changed';
function changed() {
  window.dispatchEvent(new Event(IT_TICKETS_CHANGED));
}

/**
 * The last page somebody was on before opening IT support, kept per tab by
 * the dashboard layout. Offered on the form as "where it happened" — the
 * one thing people never think to say and IT always has to ask.
 */
export const LAST_PAGE_KEY = 'ttms.itSupport.lastPage';

export function lastPage(): string {
  try {
    return window.sessionStorage.getItem(LAST_PAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberPage(path: string): void {
  try {
    window.sessionStorage.setItem(LAST_PAGE_KEY, path);
  } catch {
    // A blocked sessionStorage only loses the hint.
  }
}

/** Browser, platform and window size — what IT asks first. */
export function deviceSummary(): string {
  const nav = window.navigator;
  return `${nav.userAgent} · screen ${window.screen.width}×${window.screen.height} · window ${window.innerWidth}×${window.innerHeight}`;
}

// ─── Files ──────────────────────────────────────────────────────────────────

/** 32 random characters — unguessable, and safe in a path. */
function newFileId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface UploadedFile {
  fileId: string;
  name: string;
}

/**
 * Uploads one file into the caller's own folder. It belongs to no ticket
 * until the ticket or reply that names it has been saved — the server checks
 * it is really there and records it then.
 */
export async function uploadItFile(file: File, onProgress?: (percent: number) => void): Promise<UploadedFile> {
  if (file.size > MAX_IT_FILE_BYTES) {
    throw new Error(`${file.name} is ${formatFileSize(file.size)}. The most a file can be is ${formatFileSize(MAX_IT_FILE_BYTES)}.`);
  }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const fileId = newFileId();
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, itTicketFilePath(uid, fileId)), file, {
      contentType: file.type || 'application/octet-stream',
    });
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => reject(new Error(err.code === 'storage/unauthorized'
        ? `${file.name} was refused. Files can be at most 25 MB.`
        : err.message)),
      () => resolve(),
    );
  });
  // A pasted screenshot arrives as "image.png" — name it so the list of
  // files on a ticket is not five things called image.png.
  const name = file.name && file.name !== 'image.png'
    ? file.name
    : `screenshot-${fileId.slice(0, 6)}.png`;
  return { fileId, name };
}

// ─── Tickets ────────────────────────────────────────────────────────────────

export async function listItTickets(): Promise<ItTicket[]> {
  const res = await fetch('/api/it-tickets', { headers: await authHeaders() });
  return (await unwrap<{ tickets: ItTicket[] }>(res)).tickets;
}

export async function getItTicket(id: string): Promise<{ ticket: ItTicket; messages: ItTicketMessage[] }> {
  const res = await fetch(`/api/it-tickets/${encodeURIComponent(id)}`, { headers: await authHeaders() });
  const out = await unwrap<{ ticket: ItTicket; messages: ItTicketMessage[] }>(res);
  // Opening it may have cleared an unread mark.
  changed();
  return out;
}

export async function createItTicket(input: {
  title: string;
  text: string;
  category: ItTicketCategory;
  priority: ItTicketPriority;
  page: string;
  device: string;
  attachments: UploadedFile[];
}): Promise<ItTicket> {
  const res = await fetch('/api/it-tickets', {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const { ticket } = await unwrap<{ ticket: ItTicket }>(res);
  changed();
  return ticket;
}

export async function replyToItTicket(id: string, input: {
  text: string;
  attachments: UploadedFile[];
  internal?: boolean;
  status?: ItTicketStatus;
}): Promise<void> {
  const res = await fetch(`/api/it-tickets/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await unwrap(res);
  changed();
}

export async function updateItTicket(id: string, patch: {
  status?: ItTicketStatus;
  priority?: ItTicketPriority;
  category?: ItTicketCategory;
}): Promise<ItTicket> {
  const res = await fetch(`/api/it-tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const { ticket } = await unwrap<{ ticket: ItTicket }>(res);
  changed();
  return ticket;
}

export async function itTicketBadge(): Promise<number> {
  const res = await fetch('/api/it-tickets/badge', { headers: await authHeaders() });
  return (await unwrap<{ count: number }>(res)).count;
}
