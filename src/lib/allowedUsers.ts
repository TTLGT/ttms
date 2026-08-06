import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ALLOWED_USERS_COLLECTION } from './accessControl';
import type { AllowedUser, AllowedUserRole } from '@/types/allowedUser';

/**
 * Client helpers for the sign-in allowlist.
 *
 * Reads go straight to Firestore (admins can read the collection per rules);
 * every mutation goes through /api/admin/users, because granting access also
 * has to touch Firebase Auth (custom claims, token revocation, enable/disable)
 * which only the Admin SDK can do.
 */

async function authedFetch(input: string, init: RequestInit = {}): Promise<void> {
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

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Request failed');
  }
}

export async function listAllowedUsers(): Promise<AllowedUser[]> {
  const snap = await getDocs(collection(db, ALLOWED_USERS_COLLECTION));
  return snap.docs
    .map((d) => d.data() as AllowedUser)
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function inviteUser(
  email: string,
  roles: { isAdmin?: boolean; isDispatcher?: boolean; isFinance?: boolean } = {},
): Promise<void> {
  await authedFetch('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, ...roles }),
  });
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
