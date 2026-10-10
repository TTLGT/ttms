'use client';

import { auth } from './firebase';
import type { AgreementParty, SaRequest, SaReview, SaRound } from '@/types/saRequest';

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

export type { SaReview } from '@/types/saRequest';

/** Each party's request route — see src/lib/agreementRequestRoutes.ts. */
const route = (orderId: string, party: AgreementParty) =>
  `/api/orders/${orderId}/${party === 'carrier' ? 'ca-request' : 'sa-request'}`;

export async function getSaRequest(
  orderId: string, party: AgreementParty = 'client',
): Promise<{ request: SaRequest | null; isReviewer: boolean; review: SaReview }> {
  return unwrap(await fetch(route(orderId, party), { headers: await authHeaders() }));
}

export async function requestSa(orderId: string, note: string, party: AgreementParty = 'client'): Promise<SaRequest> {
  const res = await fetch(route(orderId, party), {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ note }),
  });
  return (await unwrap<{ request: SaRequest }>(res)).request;
}

async function patch(orderId: string, party: AgreementParty, body: Record<string, unknown>): Promise<SaRequest> {
  const res = await fetch(route(orderId, party), {
    method: 'PATCH', headers: await authHeaders(), body: JSON.stringify(body),
  });
  return (await unwrap<{ request: SaRequest }>(res)).request;
}

export const setSaCc = (orderId: string, cc: string[], party: AgreementParty = 'client') => patch(orderId, party, { cc });
export const tickSaCheck = (orderId: string, check: string, value: boolean, party: AgreementParty = 'client') =>
  patch(orderId, party, { check, value });
export const returnSaRequest = (orderId: string, reason: string, party: AgreementParty = 'client') =>
  patch(orderId, party, { action: 'return', reason });
export const markSaDone = (orderId: string, party: AgreementParty = 'client') => patch(orderId, party, { action: 'done' });

export async function sendShipperAgreement(orderId: string): Promise<string> {
  const res = await fetch(`/api/orders/${orderId}/send-shipper-agreement`, { method: 'POST', headers: await authHeaders() });
  return (await unwrap<{ sentTo: string }>(res)).sentTo;
}

/** The carrier's agreement (rate confirmation). */
export async function sendCarrierAgreement(orderId: string): Promise<string> {
  const res = await fetch(`/api/orders/${orderId}/send-agreement`, { method: 'POST', headers: await authHeaders() });
  return (await unwrap<{ sentTo: string }>(res)).sentTo;
}

/** Sends whichever party's agreement this is. */
export const sendAgreementFor = (orderId: string, party: AgreementParty) =>
  party === 'carrier' ? sendCarrierAgreement(orderId) : sendShipperAgreement(orderId);

export async function listSaRequests(): Promise<{ requests: SaRequest[]; isReviewer: boolean }> {
  return unwrap(await fetch('/api/sa-requests', { headers: await authHeaders() }));
}

/** Every review round this load has had for one agreement, newest first. See SaRound. */
export async function listSaRounds(orderId: string, party: AgreementParty = 'client'): Promise<SaRound[]> {
  const res = await fetch(`/api/orders/${orderId}/sa-rounds?party=${party}`, { headers: await authHeaders() });
  return (await unwrap<{ rounds: SaRound[] }>(res)).rounds;
}
