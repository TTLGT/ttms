import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ALLOWED_USERS_COLLECTION, canSeeDirectory, type RoleFlags } from './accessControl';
import type {
  AllowedUser,
  AllowedUserDetails,
  AllowedUserRole,
  InviteResult,
} from '@/types/allowedUser';
import type { RemovedUser } from '@/types/removedUser';
import type { RoleFlagSet } from '@/types/permission';

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
 * The access entries this reader is allowed to work with.
 *
 * Two paths, and which one is taken is decided by one permission:
 *
 * - `people.view` — an admin or HR — reads the collection straight from
 *   Firestore, as this page always has. The rules allow it.
 * - A **Sales Manager** has no such permission and the rules refuse them the
 *   collection, deliberately: it carries every colleague's payroll details and
 *   a rule cannot narrow a collection read to one team. They go through the
 *   route instead, which returns their team and nobody else.
 *
 * Callers do not need to know which happened. They get the rows they are
 * entitled to, in the same shape, either way.
 */
export async function listManageableUsers(
  profile: RoleFlags | null | undefined,
): Promise<AllowedUser[]> {
  if (canSeeDirectory(profile)) return listAllowedUsers();

  const data = await authedFetch<{ users?: AllowedUser[] }>('/api/admin/users');
  return (data.users ?? []).sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * The per-person block that can be filled in while adding one new person.
 * Site and team are excluded because they are passed separately — they apply
 * to the whole batch, and these fields never can.
 */
export type NewPersonDetails = Omit<AllowedUserDetails, 'siteId' | 'teamId'>;

/**
 * What every write of a details block reports back: the labels of any phone
 * numbers the server could not read and therefore did not store. Empty on the
 * normal path. The caller is expected to show it — a number that was dropped
 * silently is the whole reason this is plumbed through rather than ignored.
 */
export interface PhoneReport {
  skippedPhones: string[];
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
  roles: RoleFlagSet = {},
  /** Applied to every address in the batch, because a site can be. */
  siteId: string | null = null,
  /** Likewise — a pasted list is usually one team's worth of new hires. */
  teamId: string | null = null,
  /**
   * Name, legal name, phones, dates and personal email for the person being
   * added. The server ignores this unless `emails` holds exactly one address —
   * none of it can be true of a batch.
   */
  details: NewPersonDetails | null = null,
): Promise<PhoneReport & { results: InviteResult[] }> {
  const data = await authedFetch<{ results: InviteResult[]; skippedPhones?: string[] }>(
    '/api/admin/users',
    {
      method: 'POST',
      body: JSON.stringify({ emails, ...roles, siteId, teamId, details }),
    },
  );
  return { results: data.results ?? [], skippedPhones: data.skippedPhones ?? [] };
}

/**
 * Attach or clear a profile photo. Separate from the details patch because the
 * upload has already happened by the time this runs — the file is in Storage,
 * and this is what records where.
 */
export async function setAllowedUserPhoto(
  email: string,
  photoPath: string | null,
): Promise<void> {
  await authedFetch('/api/admin/users', {
    method: 'PATCH',
    body: JSON.stringify({ email, field: 'photoPath', value: photoPath }),
  });
}

/**
 * Update someone's name, phones, extension, site and team in one request.
 *
 * Returns the phones the server could not read: those are saved blank, and the
 * caller has to say so rather than let a number quietly disappear from the row.
 */
export async function setAllowedUserDetails(
  email: string,
  details: AllowedUserDetails,
): Promise<PhoneReport> {
  const data = await authedFetch<{ skippedPhones?: string[] }>('/api/admin/users', {
    method: 'PATCH',
    body: JSON.stringify({ email, details }),
  });
  return { skippedPhones: data.skippedPhones ?? [] };
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

/**
 * Replace the permissions granted to one person on top of their role.
 *
 * The whole set goes at once rather than one key per request: it is a set, and
 * a half-applied sequence of toggles is a person with an ability nobody meant
 * to give them. The server decides what the caller is allowed to hand over —
 * see updateGrants in /api/admin/users.
 */
export async function setAllowedUserPermissions(
  email: string,
  permissions: string[],
): Promise<string[]> {
  const data = await authedFetch<{ grantedPermissions?: string[] }>('/api/admin/users', {
    method: 'PATCH',
    body: JSON.stringify({ email, field: 'grantedPermissions', value: permissions }),
  });
  return data.grantedPermissions ?? permissions;
}

/**
 * Suspend or restore someone. Suspending keeps the entry and its roles but
 * blocks sign-in and kills any live session; restoring puts it all back.
 */
export async function setAllowedUserSuspended(email: string, suspended: boolean): Promise<void> {
  await authedFetch('/api/admin/users', {
    method: 'PATCH',
    body: JSON.stringify({ email, field: 'suspended', value: suspended }),
  });
}

export async function revokeUser(email: string): Promise<void> {
  await authedFetch(`/api/admin/users?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
}

/**
 * The removal log, newest first.
 *
 * Unlike `listAllowedUsers`, this does not read Firestore directly: the log
 * keeps date of birth and personal email for people who have left, so the
 * collection is closed to the client SDK entirely and this route is the only
 * way to it.
 */
export async function listRemovedUsers(): Promise<{
  users: RemovedUser[];
  truncated: boolean;
}> {
  const data = await authedFetch<{ users: RemovedUser[]; truncated: boolean }>(
    '/api/admin/users/removed',
  );
  return { users: data.users ?? [], truncated: data.truncated === true };
}
