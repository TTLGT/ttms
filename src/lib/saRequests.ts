'use client';

import { auth } from './firebase';
import type { ReadinessItem } from '@/types/orderReadiness';
import type { FmcsaConcern } from '@/types/fmcsa';
import type { SaGateFacts, SaRequest } from '@/types/saRequest';

/** SA requests from the browser. See src/types/saRequest.ts. */

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

export interface SaReview {
  readiness: ReadinessItem[];
  sendTo: { name: string; email: string } | null;
  carrier: {
    name: string; dot: string; mc: string; phone: string; email: string;
    insuranceExpiration: number | null; insuranceOnFile: boolean;
    fmcsaCheckedAt: number | null; fmcsaPhone: string; fmcsaConcerns: FmcsaConcern[] | null;
  } | null;
  pickupDate: number | null;
  agreedRate: number;
  carrierPay: number;
  brokerFee: number;
  hasClientPayment: boolean;
  gate: SaGateFacts;
  accessorialHints: string[];
  /** The client's own addresses, for the CC picker. Empty for a non-reviewer. */
  clientContacts: { name: string; email: string }[];
}

export async function getSaRequest(orderId: string): Promise<{ request: SaRequest | null; isReviewer: boolean; review: SaReview }> {
  return unwrap(await fetch(`/api/orders/${orderId}/sa-request`, { headers: await authHeaders() }));
}

export async function requestSa(orderId: string, note: string): Promise<SaRequest> {
  const res = await fetch(`/api/orders/${orderId}/sa-request`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ note }),
  });
  return (await unwrap<{ request: SaRequest }>(res)).request;
}

async function patch(orderId: string, body: Record<string, unknown>): Promise<SaRequest> {
  const res = await fetch(`/api/orders/${orderId}/sa-request`, {
    method: 'PATCH', headers: await authHeaders(), body: JSON.stringify(body),
  });
  return (await unwrap<{ request: SaRequest }>(res)).request;
}

export const setSaCc = (orderId: string, cc: string[]) => patch(orderId, { cc });
export const tickSaCheck = (orderId: string, check: string, value: boolean) => patch(orderId, { check, value });
export const returnSaRequest = (orderId: string, reason: string) => patch(orderId, { action: 'return', reason });
export const markSaDone = (orderId: string) => patch(orderId, { action: 'done' });

export async function sendShipperAgreement(orderId: string): Promise<string> {
  const res = await fetch(`/api/orders/${orderId}/send-shipper-agreement`, { method: 'POST', headers: await authHeaders() });
  return (await unwrap<{ sentTo: string }>(res)).sentTo;
}

export async function listSaRequests(): Promise<{ requests: SaRequest[]; isReviewer: boolean }> {
  return unwrap(await fetch('/api/sa-requests', { headers: await authHeaders() }));
}
