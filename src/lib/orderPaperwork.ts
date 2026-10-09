'use client';

import { auth } from './firebase';
import type { ReadinessItem } from '@/types/orderReadiness';

/**
 * The browser's side of an order's paperwork before it goes out: what is still
 * missing, and the quote PDF. See src/types/orderReadiness.ts.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

export async function fetchOrderReadiness(orderId: string): Promise<ReadinessItem[]> {
  const res = await fetch(`/api/orders/${orderId}/readiness`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not check the order');
  return (data as { items: ReadinessItem[] }).items;
}

/**
 * Builds the quote PDF and saves it. Fetched with the ID token and handed to
 * the browser as a file, because a plain link cannot carry the Authorization
 * header and the route will not answer without it.
 */
export async function downloadQuotePdf(orderId: string, fallbackName: string): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/quote-pdf`, { headers: await authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Could not build the quote');
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** One version of the client's Shipper Agreement on a load. See src/lib/signedAgreements.ts. */
export interface AgreementVersion {
  ref: string;
  version: number;
  sentAt: number | null;
  sentTo: string;
  signed: { name: string; title: string; at: number; device: string } | null;
  supersededAt: number | null;
  current: boolean;
  revoked: boolean;
}

export async function listAgreementVersions(orderId: string): Promise<AgreementVersion[]> {
  const res = await fetch(`/api/orders/${orderId}/agreements`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not load the SA versions');
  return (data as { versions: AgreementVersion[] }).versions;
}

/**
 * Saves one version of the SA as a PDF — `ref` from the list, or none for
 * the newest signed one. Fetched with the ID token, like the quote.
 */
export async function downloadAgreementPdf(orderId: string, ref?: string): Promise<void> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const res = await fetch(`/api/orders/${orderId}/agreements/pdf${q}`, { headers: await authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Could not build the SA');
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'Shipper Agreement.pdf';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
