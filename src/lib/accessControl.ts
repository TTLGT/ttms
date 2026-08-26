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

/**
 * Invites are restricted to company addresses. This does NOT grant access —
 * the `allowedUsers` entry is still the only thing that authorizes an account.
 * It only stops an admin from adding an outside address by mistake, which is
 * how a typo'd domain used to become a permanently pending entry.
 */
export const ALLOWED_EMAIL_DOMAIN = 'totaltransportlogistics.us';

export function isAllowedEmailDomain(email: string | null | undefined): boolean {
  return normalizeEmail(email).endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

/**
 * Splits a pasted block of addresses into a normalized, de-duplicated list.
 * Accepts newlines, commas, semicolons or spaces as separators so a column
 * copied out of a spreadsheet works as-is. Order of first appearance is kept.
 */
export function parseEmailList(input: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (input ?? '').split(/[\s,;]+/)) {
    const email = normalizeEmail(part);
    if (email) seen.add(email);
  }
  return [...seen];
}

export const ALLOWED_USERS_COLLECTION = 'allowedUsers';
export const USERS_COLLECTION = 'users';
export const SITES_COLLECTION = 'sites';
/**
 * Append-only record of revoked access. Written by the DELETE in
 * /api/admin/users and read only through the Admin SDK — see RemovedUser.
 */
export const REMOVED_USERS_COLLECTION = 'removedUsers';

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
 * Broker is the default role: what someone has when no elevated role is set.
 * A broker works their own book — their clients, their loads — and sees only
 * the parties they own or that nobody owns. Admin, dispatcher and finance are
 * additions on top, so holding one means you are no longer a plain broker.
 *
 * Deliberately derived rather than stored as `isBroker`. A stored flag would
 * allow an account that is neither a broker nor anything else, a state nothing
 * in the rules enforces and which would silently keep full baseline access.
 */
export function isBroker(roles: RoleFlags | null | undefined): boolean {
  if (!roles) return false;
  return roles.isAdmin !== true && roles.isDispatcher !== true && roles.isFinance !== true;
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
