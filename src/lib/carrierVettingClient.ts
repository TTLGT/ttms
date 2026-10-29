'use client';

import { auth } from './firebase';
import type { CarrierVetting, VettingPrint } from '@/types/carrierVetting';

/** The browser's side of carrier vetting records — see src/types/carrierVetting.ts. */

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? fallback);
  return data as T;
}

const base = (orderId: string) => `/api/orders/${encodeURIComponent(orderId)}/vetting`;

export async function listCarrierVettings(orderId: string): Promise<CarrierVetting[]> {
  const res = await fetch(base(orderId), { headers: await authHeaders() });
  return (await json<{ records: CarrierVetting[] }>(res, 'Could not load the vetting records')).records;
}

export async function saveCarrierVetting(orderId: string): Promise<CarrierVetting> {
  const res = await fetch(base(orderId), { method: 'POST', headers: await authHeaders() });
  return (await json<{ record: CarrierVetting }>(res, 'Could not save the vetting record')).record;
}

/** Every Carrier Selection File handed out for one record, newest first. */
export async function listVettingPrints(orderId: string, vettingId: string): Promise<VettingPrint[]> {
  const res = await fetch(`${base(orderId)}/${encodeURIComponent(vettingId)}/prints`, { headers: await authHeaders() });
  return (await json<{ prints: VettingPrint[] }>(res, 'Could not load the earlier PDFs')).prints;
}

/**
 * Builds the Carrier Selection File and saves it. The server keeps this exact
 * copy before handing it over. Fetched with the ID token
 * and handed over as a file, because a plain link cannot carry the header.
 */
export async function downloadVettingPdf(orderId: string, vettingId: string): Promise<void> {
  const res = await fetch(`${base(orderId)}/${encodeURIComponent(vettingId)}/pdf`, { headers: await authHeaders() });
  if (!res.ok) await json(res, 'Could not build the Carrier Selection File');
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'Carrier Selection File.pdf';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Opens a file kept with a record in a new tab. The tab is opened before the
 * link is fetched, in the same click: opened after an await, the browser
 * takes it for a pop-up and blocks it.
 */
export async function openVettingFile(
  orderId: string,
  vettingId: string,
  which: 'saferWeb' | 'insurance' | 'print',
  printId = '',
): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const q = `which=${which}${printId ? `&printId=${encodeURIComponent(printId)}` : ''}`;
    const res = await fetch(`${base(orderId)}/${encodeURIComponent(vettingId)}/file?${q}`, { headers: await authHeaders() });
    const { url } = await json<{ url: string }>(res, 'Could not open the file');
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
