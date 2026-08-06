/**
 * Single source of truth for who may sign in.
 *
 * Access is an explicit allowlist: an admin must add someone to the
 * `allowedUsers` collection before they can sign in. Email domain no longer
 * grants access on its own.
 *
 * BOOTSTRAP_ADMIN_EMAILS is the lockout escape hatch — these accounts are
 * always allowed and always admin, even with an empty allowlist. Keep this
 * list in sync with `isBootstrapAdmin()` in firestore.rules.
 */

export const BOOTSTRAP_ADMIN_EMAILS: readonly string[] = [
  'it@totaltransportlogistics.us',
  'operations@totaltransportlogistics.us',
  'dispatch@totaltransportlogistics.us',
];

/** Allowlist documents are keyed by the normalized email, so lookups are exact. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isBootstrapAdmin(email: string | null | undefined): boolean {
  return BOOTSTRAP_ADMIN_EMAILS.includes(normalizeEmail(email));
}

export const ALLOWED_USERS_COLLECTION = 'allowedUsers';
export const USERS_COLLECTION = 'users';
