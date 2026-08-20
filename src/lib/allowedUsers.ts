import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ALLOWED_USERS_COLLECTION } from './accessControl';
import type { AllowedUser, AllowedUserRole, InviteResult } from '@/types/allowedUser';

/**
 * Client helpers for the sign-in allowlist.
 *
 * Reads go straight to Firestore (admins can read the collection per rules);
 * every mutation goes through /api/admin/users, because granting access also
 * has to touch Firebase Auth (custom claims, token revocation, enable/disable)
 * which only the Admin SDK can do.
 */

async function authedFetch<T>(input: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');

  const idToken = await user.getIdToken();
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export async function listAllowedUsers(): Promise<AllowedUser[]> {
  const snap = await getDocs(collection(db, ALLOWED_USERS_COLLECTION));
  return snap.docs
    .map((d) => d.data() as AllowedUser)
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Grant access to one or many people in a single request.
 *
 * A rejected address (bad syntax, outside domain, already on the list) does not
 * fail the batch — it comes back as its own result row, so the caller can show
 * exactly which addresses landed and which did not.
 */
export async function inviteUsers(
  emails: string[],
  roles: { isAdmin?: boolean; isDispatcher?: boolean; isFinance?: boolean } = {},
): Promise<InviteResult[]> {
  const data = await authedFetch<{ results: InviteResult[] }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ emails, ...roles }),
  });
  return data.results ?? [];
}

export async function setAllowedUserRole(
  email: string,
  field: AllowedUserRole,
  value: boolean,
): Promise<void> {
  await authedFetch('/api/admin/users', {
    method: 'PATCH',
    body: JSON.stringify({ email, field, value }),
  });
}

export async function revokeUser(email: string): Promise<void> {
  await authedFetch(`/api/admin/users?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
}
