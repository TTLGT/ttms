/**
 * Single source of truth for who may sign in, and what they may do once in.
 *
 * Access is an explicit allowlist: an admin must add someone to the
 * `allowedUsers` collection before they can sign in. Email domain no longer
 * grants access on its own.
 *
 * BOOTSTRAP_ADMIN_EMAILS is the lockout escape hatch — these accounts are
 * always allowed and always admin, even with an empty allowlist. Keep this
 * list in sync with `isBootstrapAdmin()` in firestore.rules.
 *
 * ## Ability is a list of permissions, not a role
 *
 * Every question below ("may they see this client?", "may they send the
 * agreement?") resolves to one named permission — see src/types/permission.ts
 * for the catalog and for how a role expands into a set of them. A role is a
 * convenient bundle; the permission is what is actually tested.
 *
 * The effective set is computed server-side and mirrored onto
 * `users/{uid}.permissions`, which is what the security rules read. `can()`
 * below reads the same array, so a screen and a rule are answering from the
 * same list rather than from two copies of the same role maths.
 */

import {
  effectivePermissions,
  type Permission,
  type RoleFlagSet,
} from '@/types/permission';

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
 * Reporting units — and, for exactly one role, an access boundary.
 *
 * A team is still org-chart reference data for everybody else: being on a team
 * grants nothing, and being its lead grants nothing either. The exception is a
 * lead who also holds `isSalesManager`, whose team membership becomes their
 * scope. That is deliberately the only way a team affects access; see
 * src/lib/teamScope.ts, which turns a team's membership into the
 * `managedUids` mirror the rules test.
 */
export const TEAMS_COLLECTION = 'teams';
/**
 * The other access boundary: a work group can own parties and orders, and
 * membership is mirrored onto `users/{uid}.groupIds`, which is what the rules
 * actually test. Unlike a team, a work group is about records rather than
 * people — it says who shares a book of business, not who reports to whom.
 */
export const WORK_GROUPS_COLLECTION = 'workGroups';
/**
 * Append-only record of revoked access. Written by the DELETE in
 * /api/admin/users and read only through the Admin SDK — see RemovedUser.
 */
export const REMOVED_USERS_COLLECTION = 'removedUsers';

// ── The profile every question below is asked about ──────────────────────────

/**
 * The slice of `users/{uid}` that decides what somebody may do.
 *
 * `permissions` is the effective list — roles already expanded and individual
 * grants folded in. It is optional only because a profile written before
 * permissions existed will not carry one; `can()` falls back to deriving the
 * list from the role flags for exactly that case, so nobody's access changes
 * on the day this ships and nobody has to sign in again to keep working.
 */
export interface RoleFlags extends RoleFlagSet {
  /** Effective permissions, mirrored from the allowlist entry at sign-in. */
  permissions?: string[];
  /** Work groups this user belongs to, mirrored onto their profile. */
  groupIds?: string[];
  /**
   * The people a Sales Manager manages: everyone on the teams they lead.
   *
   * Mirrored onto their own profile rather than looked up, because rules
   * cannot query — the same reason `groupIds` is mirrored, and the same reason
   * an order carries its client's owners. Kept current by src/lib/teamScope.ts.
   *
   * Empty or absent for everybody else. A lead who is not a Sales Manager gets
   * no mirror, because leading a team grants them nothing.
   */
  managedUids?: string[];
  /**
   * Managed people who have never signed in, held by email for the same reason
   * `assignedToEmails` exists: there is no uid to list until they authenticate.
   * A record assigned to a pending hire is owned by them, and their manager
   * should see it on the hire's first day rather than on their first login.
   */
  managedEmails?: string[];
}

/**
 * Whether this profile holds a permission.
 *
 * Admin is short-circuited rather than looked up. An admin's mirrored list
 * does contain every permission, but relying on that would mean a mirror that
 * failed to write could lock the last admin out of the screen they need to fix
 * it — and the lockout escape hatch exists precisely because that class of
 * mistake is unrecoverable.
 */
export function can(
  profile: RoleFlags | null | undefined,
  permission: Permission,
): boolean {
  if (!profile) return false;
  if (profile.isAdmin === true) return true;

  // A profile from before permissions existed. Deriving the list from its role
  // flags gives it exactly the access it had yesterday, which is the only
  // correct answer here — see the field comment above.
  const held = profile.permissions ?? effectivePermissions(profile, []);
  return held.includes(permission);
}

/** Convenience for the several screens that ask about more than one at once. */
export function canAny(
  profile: RoleFlags | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => can(profile, p));
}

// ── Party visibility ─────────────────────────────────────────────────────────

/** The three roles a party can play. Mirrors PartyRole in src/types/party.ts. */
export const PARTY_ROLES = ['client', 'shipper', 'consignee'] as const;
export type PartyRoleName = (typeof PARTY_ROLES)[number];

/** The `.viewAll` permission belonging to one party role. */
export function viewAllPermission(role: PartyRoleName): Permission {
  return `${role}s.viewAll` as Permission;
}

/** The `.view` permission belonging to one party role. */
export function viewPermission(role: PartyRoleName): Permission {
  return `${role}s.view` as Permission;
}

/**
 * Which kinds of party this person may open at all, before ownership is even
 * considered.
 *
 * Everybody who is not an intern holds all three, so this is the empty
 * question for almost every caller. It exists because an unowned party is
 * shared reference data — visible to anyone who asks — and "anyone" now
 * includes an account that is not supposed to be looking at clients. Without
 * this gate, the one role built to see less would see every unclaimed record
 * in the company.
 */
export function viewablePartyRoles(profile: RoleFlags | null | undefined): PartyRoleName[] {
  return PARTY_ROLES.filter((role) => can(profile, viewPermission(role)));
}

/**
 * May this person open a party of this kind — or, given a party's own roles,
 * any of the kinds it plays?
 *
 * A party carrying no roles is matched by holding any of the three, on the
 * same reasoning as the wholesale test below: it predates roles being written,
 * and it is not a record that belongs to nobody.
 */
export function canOpenParty(
  profile: RoleFlags | null | undefined,
  roles: string[] | undefined,
): boolean {
  const viewable = viewablePartyRoles(profile);
  if (viewable.length === 0) return false;
  if (!roles || roles.length === 0) return true;
  return roles.some((r) => (viewable as string[]).includes(r));
}

/**
 * Which kinds of party this person sees wholesale, whoever owns them.
 *
 * Returned as a list rather than a boolean because the server queries by it:
 * somebody with every client but not every shipper gets a collection query for
 * clients and the ordinary ownership union for the rest. See partyAccess.ts.
 */
export function viewAllPartyRoles(profile: RoleFlags | null | undefined): PartyRoleName[] {
  return PARTY_ROLES.filter((role) => can(profile, viewAllPermission(role)));
}

/**
 * Does this person see every party of every kind?
 *
 * The narrow question the old `canSeeAllParties()` answered, kept for the
 * places that genuinely need the blanket — counting the whole collection, or
 * deciding whether the ownership union can be skipped altogether.
 */
export function canSeeEveryParty(profile: RoleFlags | null | undefined): boolean {
  return viewAllPartyRoles(profile).length === PARTY_ROLES.length;
}

/** Does this person see every load in the company? */
export function canSeeAllOrders(profile: RoleFlags | null | undefined): boolean {
  return can(profile, 'orders.viewAll');
}

// ── Team scope: the Sales Manager's reach ────────────────────────────────────

/**
 * Is this person one of the people the profile manages?
 *
 * Both halves are checked because a team member who has never signed in is
 * held by email — see `managedEmails`. A caller that knows only one of the two
 * should pass the one it has.
 */
export function managesUid(
  profile: RoleFlags | null | undefined,
  uid: string | null | undefined,
): boolean {
  if (!uid) return false;
  return (profile?.managedUids ?? []).includes(uid);
}

export function managesEmail(
  profile: RoleFlags | null | undefined,
  email: string | null | undefined,
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return (profile?.managedEmails ?? []).map(normalizeEmail).includes(normalized);
}

/**
 * Does this record belong to somebody on the profile's team?
 *
 * The single test behind every Sales Manager ability. A record is theirs to
 * work on when one of their people owns it — by uid, or by the email it is
 * being held under until that person first signs in.
 *
 * Group ownership is deliberately not part of this. A work group can hold
 * people from several teams, so "my report is in that group" does not make the
 * group's whole book the manager's business — that is what the group is for.
 */
export function managesRecord(
  record: {
    assignedToUids?: string[];
    assignedToEmails?: string[];
    clientOwnerUids?: string[];
  },
  profile: RoleFlags | null | undefined,
): boolean {
  const managedUids   = profile?.managedUids ?? [];
  const managedEmails = (profile?.managedEmails ?? []).map(normalizeEmail);
  if (managedUids.length === 0 && managedEmails.length === 0) return false;

  const owners = [
    ...(record.assignedToUids ?? []),
    ...(record.clientOwnerUids ?? []),
  ];
  if (owners.some((uid) => managedUids.includes(uid))) return true;

  return (record.assignedToEmails ?? [])
    .map(normalizeEmail)
    .some((email) => managedEmails.includes(email));
}

/**
 * Whether the actor may act on another person's account — edit their details,
 * suspend them, change what they are allowed to do.
 *
 * Two ways in: managing people company-wide, or being the Sales Manager whose
 * team this person is on. The second is why a target has to be named by both
 * uid and email — a new hire who has not signed in yet has no uid, and they
 * are exactly the person a manager most often needs to set up.
 */
export function canManagePerson(
  actor: RoleFlags | null | undefined,
  target: { uid?: string | null; email?: string | null },
): boolean {
  if (can(actor, 'people.manage')) return true;
  if (actor?.isSalesManager !== true) return false;
  return managesUid(actor, target.uid) || managesEmail(actor, target.email);
}

/**
 * Broker is the default role: what someone has when no other role is set.
 * A broker works their own book — their clients, their loads — and sees only
 * the parties they own or that nobody owns. Every other role is an addition on
 * top, so holding one means you are no longer a plain broker.
 *
 * Intern is the one role that is *less* than this, and it is a role for that
 * reason: it cannot be expressed as the absence of the others.
 *
 * Deliberately derived rather than stored as `isBroker`. A stored flag would
 * allow an account that is neither a broker nor anything else, a state nothing
 * in the rules enforces and which would silently keep full baseline access.
 */
export function isBroker(roles: RoleFlagSet | null | undefined): boolean {
  if (!roles) return false;
  return roles.isAdmin !== true
    && roles.isDispatcher !== true
    && roles.isFinance !== true
    && roles.isHr !== true
    && roles.isSalesManager !== true
    && roles.isIntern !== true;
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
  return can(profile, 'people.view');
}

/**
 * Whether `uid` may see a party's details. Ownership is the boundary: a party
 * with no owner at all is shared reference data, but one owned by a rep — even
 * a rep who has no TMS account yet — is private to them.
 *
 * Three ways past ownership: holding the `.viewAll` for a role this party
 * plays, managing the person who owns it, or the party being unowned.
 *
 * A party carrying no roles at all is matched by any `.viewAll`. Roles are
 * written when a party is created as a client, a shipper or a consignee, so an
 * empty list means a record that predates that or arrived through an import —
 * and before permissions were split by role, dispatch and finance saw it.
 * Keeping it visible to them is the behaviour that was there, rather than a
 * record that quietly belongs to nobody.
 */
export function canSeeParty(
  party: {
    roles?: string[];
    assignedToUids?: string[];
    assignedToName?: string;
    assignedToGroupIds?: string[];
    assignedToEmails?: string[];
  },
  uid: string,
  profile: RoleFlags | null | undefined,
): boolean {
  if (profile?.isAdmin === true) return true;

  // The gate before ownership: somebody who may not open this kind of record
  // at all does not reach it by nobody owning it. See canOpenParty().
  if (!canOpenParty(profile, party.roles)) return false;

  const seesAll = viewAllPartyRoles(profile);
  const roles   = party.roles ?? [];
  if (seesAll.length > 0 && roles.length === 0) return true;
  if (roles.some((r) => (seesAll as string[]).includes(r))) return true;

  const owners = party.assignedToUids ?? [];
  if (owners.includes(uid)) return true;

  const groups = party.assignedToGroupIds ?? [];
  const mine   = profile?.groupIds ?? [];
  if (groups.some((g) => mine.includes(g))) return true;

  if (managesRecord(party, profile)) return true;

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
 * to the roles that see every load, where an unowned *party* is shared
 * reference data anyone may use. The asymmetry is intentional. A party with no
 * owner is usually just a facility nobody has claimed — harmless to share —
 * whereas an order is the commercial record of a live load, with rates on it,
 * so the safe default is closed. A BATS order whose rep name never resolved
 * therefore sits with the privileged roles until someone assigns it, rather
 * than becoming visible to the whole company.
 *
 * Keep in sync with orderVisible() in firestore.rules.
 */
export function canSeeOrder(
  order: {
    assignedToUids?: string[];
    assignedToGroupIds?: string[];
    assignedToEmails?: string[];
    clientOwnerUids?: string[];
    clientOwnerGroupIds?: string[];
  },
  uid: string,
  profile: RoleFlags | null | undefined,
): boolean {
  // The gate first, before every other route in — including seeing every load.
  // Somebody who may not open the Orders section at all does not get past it
  // by being handed a wholesale permission, and the order of these two tests
  // is what firestore.rules does too. Reversing it here would put a screen and
  // a rule into disagreement about the same person.
  if (!can(profile, 'orders.view')) return false;
  if (canSeeAllOrders(profile)) return true;

  const mine = profile?.groupIds ?? [];

  // Two independent routes in: owning the order, or owning its client. The
  // second is why clientOwner* is mirrored onto the order at all — see the
  // field comments in src/types/order.ts.
  if ((order.assignedToUids ?? []).includes(uid)) return true;
  if ((order.clientOwnerUids ?? []).includes(uid)) return true;

  const groups = [...(order.assignedToGroupIds ?? []), ...(order.clientOwnerGroupIds ?? [])];
  if (groups.some((g) => mine.includes(g))) return true;

  // A third route, and the only one that is about people rather than records:
  // a Sales Manager sees what their team is working, by either of the two
  // routes above applied to any of their reports.
  return managesRecord(order, profile);
}

/**
 * Whether `uid` may set or change the lead source on a record.
 *
 * Deliberately narrower than "can edit this record". Anyone who can see an
 * order can currently edit it, which includes dispatch and finance — but the
 * source is what commission and marketing spend get argued over, so it is
 * restricted to the people who actually own the relationship, plus whoever
 * holds `source.editAny` to fix a mistake.
 *
 * A record nobody owns therefore has no one but those people who can set it.
 * That falls out of the rule rather than being a special case, and it is the
 * safe direction: an unowned party is shared reference data that any user can
 * see, so letting them all write its source would be the same free-for-all
 * that unrestricted ownership writes used to be.
 *
 * Keep in sync with canEditSource() in firestore.rules.
 */
export function canEditSource(
  record: {
    assignedToUids?: string[];
    assignedToEmails?: string[];
    assignedToGroupIds?: string[];
  },
  uid: string,
  profile: RoleFlags | null | undefined,
): boolean {
  if (can(profile, 'source.editAny')) return true;

  if ((record.assignedToUids ?? []).includes(uid)) return true;

  const mine = profile?.groupIds ?? [];
  if ((record.assignedToGroupIds ?? []).some((g) => mine.includes(g))) return true;

  // A manager arguing attribution on their own team's record is the same
  // person who would be asked to settle it.
  return managesRecord(record, profile);
}

/**
 * Who may decide an access request: any current owner, anyone holding
 * `access.decideAny`, or the Sales Manager of an owner.
 *
 * The manager branch is what makes a request answerable when the owner is out
 * — which, before this, meant waiting for an admin.
 */
export function canDecideRequest(
  request: { ownerUids?: string[] },
  uid: string,
  profile: RoleFlags | null | undefined,
): boolean {
  if (can(profile, 'access.decideAny')) return true;
  if ((request.ownerUids ?? []).includes(uid)) return true;

  // A request records its owners by uid only — it is raised against a record
  // somebody is actively working, so they have signed in. There is no email
  // half to match here, unlike on the records themselves.
  return managesRecord({ assignedToUids: request.ownerUids }, profile);
}
