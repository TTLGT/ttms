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

// ── Party visibility ─────────────────────────────────────────────────────────

/**
 * Roles that see every client, shipper and consignee regardless of ownership.
 * Keep in sync with `canSeeAllParties()` in firestore.rules.
 */
export interface RoleFlags {
  isAdmin?: boolean;
  isDispatcher?: boolean;
  isFinance?: boolean;
  /** Work groups this user belongs to, mirrored onto their profile. */
  groupIds?: string[];
}

export function canSeeAllParties(profile: RoleFlags | null | undefined): boolean {
  if (!profile) return false;
  return profile.isAdmin === true || profile.isDispatcher === true || profile.isFinance === true;
}

/**
 * Whether `uid` may see a party's details. Ownership is the boundary: a party
 * with no owner at all is shared reference data, but one owned by a rep — even
 * a rep who has no TMS account yet — is private to them.
 */
export function canSeeParty(
  party: {
    assignedToUids?: string[];
    assignedToName?: string;
    assignedToGroupIds?: string[];
  },
  uid: string,
  profile: RoleFlags | null | undefined,
): boolean {
  if (canSeeAllParties(profile)) return true;

  const owners = party.assignedToUids ?? [];
  if (owners.includes(uid)) return true;

  const groups = party.assignedToGroupIds ?? [];
  const mine   = profile?.groupIds ?? [];
  if (groups.some((g) => mine.includes(g))) return true;

  return owners.length === 0
    && groups.length === 0
    && !(party.assignedToName ?? '').trim();
}

/** Who may decide an access request: any current owner, or any admin. */
export function canDecideRequest(
  request: { ownerUids?: string[] },
  uid: string,
  profile: RoleFlags | null | undefined,
): boolean {
  if (profile?.isAdmin === true) return true;
  return (request.ownerUids ?? []).includes(uid);
}
