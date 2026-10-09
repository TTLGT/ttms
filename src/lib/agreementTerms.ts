import { auth } from './firebase';

/**
 * Client access to the agreement terms, through /api/agreement-terms. Only the
 * Settings panel uses it, so nothing is cached.
 */

export type AgreementTermsResponse = {
  client: string;
  /** Nothing has been saved yet, or what was saved could not be read. */
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${await user.getIdToken()}`,
  };
}

export async function getAgreementTerms(): Promise<AgreementTermsResponse> {
  const res = await fetch('/api/agreement-terms', { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not load the agreement terms');
  return data as AgreementTermsResponse;
}

export async function saveAgreementTerms(client: string): Promise<string> {
  const res = await fetch('/api/agreement-terms', {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ client }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Could not save the agreement terms');
  return (data as { client: string }).client;
}
