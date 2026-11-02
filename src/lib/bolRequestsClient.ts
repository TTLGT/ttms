'use client';

import { auth } from './firebase';
import type { BolRecipient, BolRequest, BolVersion } from '@/types/bolRequest';

/** BOL requests from the browser. See src/types/bolRequest.ts. */

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' };
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function getBolRequest(
  orderId: string,
): Promise<{ request: BolRequest | null; isSender: boolean; recipients: BolRecipient[] }> {
  return unwrap(await fetch(`/api/orders/${orderId}/bol-request`, { headers: await authHeaders() }));
}

export async function sendBol(orderId: string, recipients: string[]): Promise<{ request: BolRequest | null }> {
  return unwrap(await fetch(`/api/orders/${orderId}/bol-request`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ action: 'send', recipients }),
  }));
}

export async function markBolRequestDone(orderId: string): Promise<{ request: BolRequest }> {
  return unwrap(await fetch(`/api/orders/${orderId}/bol-request`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ action: 'done' }),
  }));
}

export async function listBolVersions(orderId: string): Promise<BolVersion[]> {
  return (await unwrap<{ versions: BolVersion[] }>(
    await fetch(`/api/orders/${orderId}/bol/versions`, { headers: await authHeaders() }),
  )).versions;
}

/**
 * One earlier BOL, stamped VOID by the server, as a `blob:` URL typed as a PDF
 * so the browser's viewer draws it. The caller revokes it when done.
 */
export async function bolVersionPdf(orderId: string, versionId: string): Promise<{ url: string; name: string }> {
  const res = await fetch(
    `/api/orders/${orderId}/bol/versions?version=${encodeURIComponent(versionId)}`, { headers: await authHeaders() },
  );
  if (!res.ok) await unwrap(res);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'BOL VOID.pdf';
  return { url: URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })), name };
}

export async function listBolRequests(): Promise<BolRequest[]> {
  return (await unwrap<{ requests: BolRequest[] }>(await fetch('/api/bol-requests', { headers: await authHeaders() }))).requests;
}
