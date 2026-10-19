import { auth } from './firebase';
import type { TermsChangeRequest, TermsParty } from '@/types/agreementTerms';

/**
 * Client access to the agreement terms — the general ones in Settings, one
 * load's own on the order, and the requests for an admin to approve either.
 * Nothing is cached.
 */

export type PartyTermsResponse = {
  text: string;
  /** Nothing has been saved yet, or what was saved could not be read. */
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Changes waiting on an admin. */
  pending: TermsChangeRequest[];
};

export type AgreementTermsResponse = Record<TermsParty, PartyTermsResponse> & { canApprove: boolean };

export type OrderTermsResponse = Record<TermsParty, {
  /** This load's own terms, or null when it follows the general ones. */
  own: string | null;
  general: string;
  pending: TermsChangeRequest[];
}> & { canApprove: boolean };

/** `applied` false means it went to an admin, and nothing has changed yet. */
export type TermsSaveResult = { applied: true } | { applied: false; request: TermsChangeRequest };

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${await user.getIdToken()}`,
  };
}

async function call<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await fetch(url, { ...init, headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? fallback);
  return data as T;
}

export function getAgreementTerms(): Promise<AgreementTermsResponse> {
  return call('/api/agreement-terms', {}, 'Could not load the agreement terms');
}

export function saveAgreementTerms(party: TermsParty, text: string, reason = ''): Promise<TermsSaveResult> {
  return call('/api/agreement-terms', {
    method: 'PUT', body: JSON.stringify({ party, text, reason }),
  }, 'Could not save the agreement terms');
}

export function getOrderTerms(orderId: string): Promise<OrderTermsResponse> {
  return call(`/api/orders/${orderId}/terms`, {}, 'Could not load this load’s terms');
}

/** `text` null puts the load back on the general terms. */
export function saveOrderTerms(orderId: string, party: TermsParty, text: string | null, reason = ''): Promise<TermsSaveResult> {
  return call(`/api/orders/${orderId}/terms`, {
    method: 'PUT', body: JSON.stringify({ party, text, reason }),
  }, 'Could not save this load’s terms');
}

/** `detail` adds each pending request's `currentText` — the Approvals screen wants it; the badge does not. */
export async function listTermsRequests(box: 'incoming' | 'outgoing', detail = false): Promise<TermsChangeRequest[]> {
  const url = `/api/terms-requests?box=${box}${detail ? '&detail=1' : ''}`;
  return (await call<{ requests: TermsChangeRequest[] }>(url, {}, 'Could not load the terms requests')).requests;
}

export async function decideTermsRequest(
  id: string,
  action: 'approve' | 'deny' | 'withdraw',
  note = '',
): Promise<TermsChangeRequest> {
  return (await call<{ request: TermsChangeRequest }>(`/api/terms-requests/${id}`, {
    method: 'POST', body: JSON.stringify({ action, note }),
  }, 'Could not decide the request')).request;
}
