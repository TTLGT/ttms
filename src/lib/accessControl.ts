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
 * Reporting units. Reference data like sites, NOT an access boundary — see
 * src/types/team.ts. Nothing in this file grants visibility on a team.
 */
export const TEAMS_COLLECTION = 'teams';
/**
 * The access boundary, as opposed to the org chart above. A work group can own
 * parties and orders; membership is mirrored onto `users/{uid}.groupIds`,
 * which is what the rules actually test.
 */
export const WORK_GROUPS_COLLECTION = 'workGroups';
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
  /**
   * Read-only access to the people directory. Deliberately absent from
   * `canSeeAllParties` below — HR is a back-office role and has no business
   * seeing the brokers' clients.
   */
  isHr?: boolean;
  /** Work groups this user belongs to, mirrored onto their profile. */
  groupIds?: string[];
}

export function canSeeAllParties(profile: RoleFlags | null | undefined): boolean {
  if (!profile) return false;
  // isHr is intentionally not in this list. HR reads the people directory and
  // nothing else; adding it here would hand payroll staff every client in the
  // company. If a new role is added, decide this deliberately rather than by
  // pattern-matching the line above.
  return profile.isAdmin === true || profile.isDispatcher === true || profile.isFinance === true;
}

/**
 * Broker is the default role: what someone has when no other role is set.
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
  return roles.isAdmin !== true
    && roles.isDispatcher !== true
    && roles.isFinance !== true
    && roles.isHr !== true;
}

/**
 * Who may read the people directory — the allowlist entries and the payroll
 * fields on them (legal name, date of birth, personal email, start date).
 *
 * Admins manage it; HR only reads it. Keep in sync with the `allowedUsers`
 * read rule in firestore.rules, which is what actually enforces this — this
 * function only decides what the Settings page renders.
 */
export function canSeeDirectory(profile: RoleFlags | null | undefined): boolean {
  if (!profile) return false;
  return profile.isAdmin === true || profile.isHr === true;
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
    assignedToEmails?: string[];
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

  // `assignedToEmails` has to be part of the unowned test even though it can
  // never grant access here: a party owned by an invited-but-never-signed-in
  // rep carries only that field, and leaving it out would read as "nobody owns
  // this" and publish their book of business to everyone until they logged in.
  return owners.length === 0
    && groups.length === 0
    && (party.assignedToEmails ?? []).length === 0
    && !(party.assignedToName ?? '').trim();
}

/**
 * Whether `uid` may see and edit an order.
 *
 * Deliberately stricter than canSeeParty: an order nobody owns is visible only
 * to admin, dispatch and finance, where an unowned *party* is shared reference
 * data anyone may use. The asymmetry is intentional. A party with no owner is
 * usually just a facility nobody has claimed — harmless to share — whereas an
 * order is the commercial record of a live load, with rates on it, so the safe
 * default is closed. A BATS order whose rep name never resolved therefore sits
 * with the privileged roles until someone assigns it, rather than becoming
 * visible to the whole company.
 *
 * Keep in sync with orderVisible() in firestore.rules.
 */
export function canSeeOrder(
  order: {
    assignedToUids?: string[];
    assignedToGroupIds?: string[];
    clientOwnerUids?: string[];
    clientOwnerGroupIds?: string[];
  },
  uid: string,
  profile: RoleFlags | null | undefined,
): boolean {
  if (canSeeAllParties(profile)) return true;

  const mine = profile?.groupIds ?? [];

  // Two independent routes in: owning the order, or owning its client. The
  // second is why clientOwner* is mirrored onto the order at all — see the
  // field comments in src/types/order.ts.
  if ((order.assignedToUids ?? []).includes(uid)) return true;
  if ((order.clientOwnerUids ?? []).includes(uid)) return true;

  const groups = [...(order.assignedToGroupIds ?? []), ...(order.clientOwnerGroupIds ?? [])];
  return groups.some((g) => mine.includes(g));
}

/**
 * Whether `uid` may set or change the lead source on a record.
 *
 * Deliberately narrower than "can edit this record". Anyone who can see an
 * order can currently edit it, which includes dispatch and finance — but the
 * source is what commission and marketing spend get argued over, so it is
 * restricted to the people who actually own the relationship, plus admins who
 * have to be able to fix a mistake.
 *
 * A record nobody owns therefore has no one but an admin who can set it. That
 * falls out of the rule rather than being a special case, and it is the safe
 * direction: an unowned party is shared reference data that any user can see,
 * so letting them all write its source would be the same free-for-all that
 * unrestricted ownership writes used to be.
 *
 * Keep in sync with canEditSource() in firestore.rules.
 */
export function canEditSource(
  record: {
    assignedToUids?: string[];
    assignedToGroupIds?: string[];
  },
  uid: string,
  profile: RoleFlags | null | undefined,
): boolean {
  if (profile?.isAdmin) return true;

  if ((record.assignedToUids ?? []).includes(uid)) return true;

  const mine = profile?.groupIds ?? [];
  return (record.assignedToGroupIds ?? []).some((g) => mine.includes(g));
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
