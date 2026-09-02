/**
 * What a person is allowed to do, one named permission at a time.
 *
 * Before this existed, ability came only in role-sized lumps: sending a
 * carrier agreement meant being made a Dispatcher, which also handed over
 * every client in the company. A permission is the small unit underneath the
 * role — "send agreements", "see every client" — so somebody can be given the
 * one thing they need without the six things they do not.
 *
 * ## How the pieces fit
 *
 * - A **role** (`isAdmin`, `isDispatcher`, `isFinance`, `isHr`,
 *   `isSalesManager`, `isIntern`, or none of them, which means Broker) expands
 *   to a fixed set of permissions — `ROLE_PERMISSIONS` below.
 * - **Granted permissions** are the extras an admin ticks on one person,
 *   stored as `grantedPermissions` on their `allowedUsers` entry.
 * - The **effective** set is the union of the two, computed by
 *   `effectivePermissions()` and mirrored onto `users/{uid}.permissions`.
 *
 * That mirror is the important part. Security rules cannot import TypeScript
 * and cannot run a query, so before this they re-derived every role test in
 * their own dialect — six near-copies that had to be kept in step by hand.
 * Now they test one array: `'clients.viewAll' in permissions`. The role maths
 * happens once, here, on the server.
 *
 * ## Rules for changing this file
 *
 * - Permissions are **additive**. There is no deny. A permission someone holds
 *   by role cannot be taken away by ticking something off; remove the role
 *   instead. That keeps "what can this person do" answerable by reading one
 *   list rather than by replaying a sequence of grants and revocations.
 * - Adding a key here changes nothing on its own. Something has to test it —
 *   a nav item, an API guard, a security rule.
 * - Adding a key to `ROLE_PERMISSIONS` widens what an existing role can do the
 *   next time those people sign in. Say so out loud when you do it.
 * - **Renaming a key is a migration**, not a rename: the old string is sitting
 *   in `grantedPermissions` arrays and in mirrored `permissions` arrays in the
 *   live database, and the rules match on the string. Add the new one and
 *   backfill; do not rename in place.
 */

export const PERMISSIONS = [
  // ── Loads ────────────────────────────────────────────────────────────────
  'orders.view',
  'orders.create',
  'orders.viewAll',
  'orders.delete',
  'orders.sendAgreement',
  'orders.bol',
  'orders.invoice',

  // ── Clients, shippers, consignees ────────────────────────────────────────
  // Split by record type rather than one "see every party": the same party can
  // be the client on one load and the consignee on another, but the *sections*
  // are what people are given access to, and giving somebody every client
  // should not also give them every shipper.
  'clients.view',
  'clients.viewAll',
  'shippers.view',
  'shippers.viewAll',
  'consignees.view',
  'consignees.viewAll',
  'parties.delete',

  // ── Carriers and paperwork ───────────────────────────────────────────────
  'carriers.view',
  'carriers.edit',
  'documents.view',

  // ── Ownership and approvals ──────────────────────────────────────────────
  /** Reassign who owns a load or a party. Admin and dispatch today. */
  'ownership.change',
  /** Decide any access request, not only ones on records you own. */
  'access.decideAny',
  /** Approve a party request as a permanent handover rather than a one-off. */
  'access.grantOwnership',
  /** Set the lead source on a record you do not own. */
  'source.editAny',

  // ── People ───────────────────────────────────────────────────────────────
  /** The company phone book. Everyone but an intern has this by default. */
  'directory.view',
  /**
   * Take the directory out of the app: the printed extension sheet and the CSV.
   *
   * Separate from `directory.view` because looking someone up and producing a
   * file that then lives on a wall, in a mailbox or on a memory stick are two
   * different acts. Everyone can do the first; the second is for the people
   * whose job is keeping the list right — admin, HR and dispatch — and can be
   * handed to anybody else one person at a time.
   */
  'directory.export',
  /**
   * How much work a colleague is carrying: how many clients they own and how
   * many of their loads are still open, on their directory page.
   *
   * Separate from `directory.view` because it is a different question. The
   * phone book says how to reach somebody; this says what they are holding,
   * which is a management question and the sort of number that gets compared
   * between people. Admin, dispatch and finance hold it because all three
   * already see every load and every client — the panel tells them nothing
   * they could not count by hand.
   *
   * A Sales Manager is deliberately **not** given it here. Their reach is
   * their own team, not the company, so they get it one person at a time
   * through the team branch of `canSeeBookOfBusiness()` — the same shape as
   * `canManagePerson()`. Adding it to `isSalesManager` in ROLE_PERMISSIONS
   * would quietly hand them everybody's numbers.
   */
  'directory.book',
  /** The access list and the payroll fields on it — admin and HR. */
  'people.view',
  /** Add, remove, suspend, and change roles and permissions. */
  'people.manage',

  // ── Company ──────────────────────────────────────────────────────────────
  'analytics.view',
  'handbook.view',
  /** Company settings, offices, teams, work groups and lead sources. */
  'settings.manage',

  // ── Everything else ──────────────────────────────────────────────────────
  'chat.use',
  /** The intern's own area: their guide, their onboarding survey, their tasks. */
  'intern.section',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Narrowing for anything arriving from a request body or the address bar. */
export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * How permissions are grouped on screen, and what each one is called.
 *
 * The wording is the thing an admin reads before handing something over, so it
 * says what the person will be able to do rather than naming the internal key.
 * Kept here beside the catalog so a permission cannot be added without a label
 * — an unlabelled switch in an access screen is how the wrong box gets ticked.
 */
export interface PermissionMeta {
  key: Permission;
  label: string;
  /** The consequence, in one line. Shown under the label. */
  detail: string;
}

export interface PermissionGroup {
  title: string;
  permissions: PermissionMeta[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Loads',
    permissions: [
      { key: 'orders.view',    label: 'See loads',        detail: 'Open the Orders section and see their own loads.' },
      { key: 'orders.create',  label: 'Create loads',     detail: 'Book a new load and edit the ones they can see.' },
      { key: 'orders.viewAll', label: 'See every load',   detail: 'Every load in the company, not only their own and their clients’.' },
      { key: 'orders.sendAgreement', label: 'Send agreements', detail: 'Email the carrier and shipper agreements for signature.' },
      { key: 'orders.bol',     label: 'Generate BOLs',    detail: 'Produce the bill of lading for a load.' },
      { key: 'orders.invoice', label: 'Generate invoices', detail: 'Produce the invoice for a load.' },
      { key: 'orders.delete',  label: 'Delete loads',     detail: 'Permanently remove a load. There is no undo.' },
    ],
  },
  {
    title: 'Clients, shippers and consignees',
    permissions: [
      { key: 'clients.view',       label: 'See clients',            detail: 'Open the Clients section and see their own.' },
      { key: 'clients.viewAll',    label: 'See every client',       detail: 'Every client in the company, whoever owns them.' },
      { key: 'shippers.view',      label: 'See shippers',           detail: 'Open the Shippers section and see their own.' },
      { key: 'shippers.viewAll',   label: 'See every shipper',      detail: 'Every shipper in the company, whoever owns them.' },
      { key: 'consignees.view',    label: 'See consignees',         detail: 'Open the Consignees section and see their own.' },
      { key: 'consignees.viewAll', label: 'See every consignee',    detail: 'Every consignee in the company, whoever owns them.' },
      { key: 'parties.delete',     label: 'Delete clients and facilities', detail: 'Permanently remove a client, shipper or consignee.' },
    ],
  },
  {
    title: 'Carriers and documents',
    permissions: [
      { key: 'carriers.view',  label: 'See carriers',    detail: 'Open the Carriers section.' },
      { key: 'carriers.edit',  label: 'Edit carriers',   detail: 'Add a carrier and change their details.' },
      { key: 'documents.view', label: 'See documents',   detail: 'Open the Documents section, for the loads they can already see.' },
    ],
  },
  {
    title: 'Ownership and approvals',
    permissions: [
      { key: 'ownership.change',      label: 'Reassign ownership',       detail: 'Change who owns a load, a client, a shipper or a consignee.' },
      { key: 'access.decideAny',      label: 'Decide any access request', detail: 'Approve or refuse requests on records they do not own — what an admin does today.' },
      { key: 'access.grantOwnership', label: 'Hand a client over',        detail: 'Approve a client request as a permanent handover, not just a one-off look.' },
      { key: 'source.editAny',        label: 'Set any lead source',       detail: 'Change what a record is attributed to, including records they do not own.' },
    ],
  },
  {
    title: 'People',
    permissions: [
      { key: 'directory.view', label: 'See the directory', detail: 'The company phone book. Everyone but an intern has this already.' },
      { key: 'directory.export', label: 'Print and export the directory', detail: 'The extension sheet for the wall, and the directory as a spreadsheet file.' },
      { key: 'directory.book',   label: 'See a colleague’s book of business', detail: 'How many clients somebody owns and how many of their loads are open. Everyone sees their own; a Sales Manager sees their team’s without this.' },
      { key: 'people.view',    label: 'See the access list', detail: 'Settings → People, including legal names, birthdays and personal addresses.' },
      { key: 'people.manage',  label: 'Manage people',     detail: 'Add and remove people, suspend them, and change roles and permissions.' },
    ],
  },
  {
    title: 'Company',
    permissions: [
      { key: 'analytics.view',  label: 'See analytics',   detail: 'The Analytics section — revenue, margin and volume across the company.' },
      { key: 'handbook.view',   label: 'See the handbook', detail: 'The admin handbook section.' },
      { key: 'settings.manage', label: 'Manage settings', detail: 'Company settings, offices, teams, work groups and lead sources.' },
    ],
  },
  {
    title: 'Other',
    permissions: [
      { key: 'chat.use',       label: 'Use chat',            detail: 'Message colleagues. Everyone has this already.' },
      { key: 'intern.section', label: 'See the intern area', detail: 'Their guide, their onboarding survey and their task list.' },
    ],
  },
];

/** Label for one key, for anywhere a permission has to be named in a sentence. */
export function permissionLabel(key: Permission): string {
  for (const group of PERMISSION_GROUPS) {
    const found = group.permissions.find((p) => p.key === key);
    if (found) return found.label;
  }
  return key;
}

// ── Roles ────────────────────────────────────────────────────────────────────

/**
 * The roles a person can hold, as they are stored on the allowlist entry.
 *
 * Broker is deliberately absent: it is what somebody has when none of these is
 * set, and storing it would allow an account that is neither a broker nor
 * anything else. See `isBroker()` in src/lib/accessControl.ts.
 */
export type RoleKey =
  | 'isAdmin'
  | 'isDispatcher'
  | 'isFinance'
  | 'isHr'
  | 'isSalesManager'
  | 'isIntern';

/**
 * What a plain broker can do — and therefore what everybody who is not an
 * intern can do, because every other role is these plus additions.
 *
 * An intern is the one role that starts below this line, which is why the
 * baseline is a named list rather than "whatever is not switched off".
 */
export const BASE_PERMISSIONS: readonly Permission[] = [
  'orders.view',
  'orders.create',
  'clients.view',
  'shippers.view',
  'consignees.view',
  'carriers.view',
  'carriers.edit',
  'documents.view',
  'directory.view',
  'chat.use',
];

/**
 * Every permission, for the role that has every permission.
 *
 * Spread from the catalog rather than listed, so a new permission is an admin
 * one the moment it is added. Any other spelling of this leaves an admin one
 * day unable to do something nobody thought to add them to.
 */
const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

/**
 * What each role expands to.
 *
 * The four original roles are written to grant exactly what they granted
 * before permissions existed — the point of the change was to make ability
 * divisible, not to quietly widen anybody. The two new roles are described
 * where they are declared below.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  isAdmin: ALL_PERMISSIONS,

  // Dispatch: every record, ownership changes, and the agreements. This is
  // what `canSeeAllParties()` plus the dispatcher-only API guards used to mean.
  isDispatcher: [
    ...BASE_PERMISSIONS,
    'orders.viewAll', 'clients.viewAll', 'shippers.viewAll', 'consignees.viewAll',
    'ownership.change', 'access.grantOwnership', 'orders.sendAgreement',
    // The extension sheet on the wall by the phones is dispatch's, and they
    // are the ones who notice first when a number on it is wrong.
    'directory.export',
    // Dispatch already sees every load and every client; the book-of-business
    // panel only saves them counting. It is how they decide who has room for
    // the next one.
    'directory.book',
  ],

  // Finance: every record, and the paperwork that bills for it.
  isFinance: [
    ...BASE_PERMISSIONS,
    'orders.viewAll', 'clients.viewAll', 'shippers.viewAll', 'consignees.viewAll',
    'orders.bol', 'orders.invoice',
    // Same reasoning as dispatch: finance sees every load already, and "how
    // much is still open against this broker" is a question they get asked.
    'directory.book',
  ],

  // HR: the access list and the payroll fields on it, on top of an ordinary
  // broker's own book. Deliberately no `.viewAll` of anything — a payroll
  // clerk has no business seeing every client in the company.
  // `directory.export` alongside it: keeping the list right is the job, and a
  // list nobody can print is one that gets retyped by hand into a spreadsheet
  // instead, which is how two versions of it start existing.
  isHr: [...BASE_PERMISSIONS, 'people.view', 'directory.export'],

  /**
   * Sales Manager: a broker, plus admin-level power over their own team.
   *
   * Nothing extra appears in this list, and that is the point — their reach is
   * not a wider set of permissions, it is the same admin abilities applied to
   * a smaller set of people. That scope comes from the Teams section: whoever
   * they are the lead of. See `managesUid()` in src/lib/accessControl.ts and
   * src/lib/teamScope.ts for how the scope is worked out and kept current.
   *
   * They are the only role a team's setup affects. Every other team lead is
   * just the person a team reports to, with whatever role they hold anyway.
   */
  isSalesManager: [...BASE_PERMISSIONS],

  /**
   * Intern: below a broker, and the only role that is.
   *
   * The directory at the same level a broker sees it, chat, and their own
   * area. No loads, no clients, no carriers, no documents. Anything else an
   * intern needs is handed over one permission at a time.
   */
  isIntern: ['directory.view', 'chat.use', 'intern.section'],
};

/** The roles someone holds, in the order they are shown everywhere. */
export const ROLE_ORDER: RoleKey[] = [
  'isAdmin', 'isDispatcher', 'isFinance', 'isHr', 'isSalesManager', 'isIntern',
];

export const ROLE_LABELS: Record<RoleKey, string> = {
  isAdmin:        'Admin',
  isDispatcher:   'Dispatcher',
  isFinance:      'Finance',
  isHr:           'HR',
  isSalesManager: 'Sales Manager',
  isIntern:       'Intern',
};

/**
 * What each role means, in one line — for the chip's tooltip and the access
 * screen. An admin picking a role should not have to read this file.
 */
export const ROLE_DETAILS: Record<RoleKey, string> = {
  isAdmin:        'Everything, everywhere.',
  isDispatcher:   'Every client and load, ownership changes, and the agreements.',
  isFinance:      'Every client and load, plus BOLs and invoices.',
  isHr:           'The access list and payroll details. No operational access.',
  isSalesManager: 'A broker, plus everything an admin can do for the team they lead in Settings → Teams.',
  isIntern:       'Below a broker: the directory, chat and their own area. Nothing else unless it is granted.',
};

/** The role flags as they sit on a stored record. */
export type RoleFlagSet = Partial<Record<RoleKey, boolean>>;

/**
 * Everything this person can do: what their roles grant, plus what was granted
 * to them individually.
 *
 * The one place role maths happens. Server-side only in practice — the result
 * is written to `users/{uid}.permissions`, and every other layer (the rules,
 * the API guards, the nav) reads that list rather than recomputing this.
 *
 * Unknown strings in `granted` are dropped rather than carried through: they
 * can only be a permission that was removed from the catalog, and a rules file
 * matching on strings should never be handed one nothing recognises.
 */
export function effectivePermissions(
  roles: RoleFlagSet | null | undefined,
  granted: readonly string[] | null | undefined,
): Permission[] {
  const held = new Set<Permission>();

  const anyRole = ROLE_ORDER.some((role) => roles?.[role] === true);
  // Broker is the absence of a role, so it has no entry in ROLE_PERMISSIONS to
  // look up. An account with no roles at all gets the baseline — which is what
  // being a broker means.
  if (!anyRole) for (const p of BASE_PERMISSIONS) held.add(p);

  for (const role of ROLE_ORDER) {
    if (roles?.[role] !== true) continue;
    for (const p of ROLE_PERMISSIONS[role]) held.add(p);
  }

  for (const p of granted ?? []) if (isPermission(p)) held.add(p);

  // Catalog order rather than insertion order, so two people with the same
  // abilities have identical arrays — which makes a stored list diffable and
  // keeps a mirror write from firing when nothing actually changed.
  return PERMISSIONS.filter((p) => held.has(p));
}

/**
 * The permissions this person has *only* because they were granted them —
 * the ones that would disappear if the grant were removed.
 *
 * Used by the access screen to draw a role-given permission as ticked and
 * locked, and a granted one as ticked and removable, so nobody tries to switch
 * off something their role is putting back.
 */
export function roleGivenPermissions(roles: RoleFlagSet | null | undefined): Set<Permission> {
  return new Set(effectivePermissions(roles, []));
}
