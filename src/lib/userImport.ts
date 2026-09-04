import { FieldValue, adminAuth, adminDb } from './firebase-admin';
import { headerKey, parseCsv, unescapeCell } from './csv';
import {
  ALLOWED_EMAIL_DOMAIN,
  ALLOWED_USERS_COLLECTION,
  SITES_COLLECTION,
  TEAMS_COLLECTION,
  USERS_COLLECTION,
  isAllowedEmailDomain,
  isBootstrapAdmin,
  normalizeEmail,
} from './accessControl';
import { isCalendarDate } from '@/types/allowedUser';
import { ROLE_LABELS, ROLE_ORDER, type RoleKey } from '@/types/permission';
import { syncPermissionsFor } from './userSync';
import { syncManagedScopes } from './teamScope';
import {
  DEFAULT_OTHER_REGION,
  PHONE_LABEL,
  normalizePhone,
  otherPhone,
  phoneSkipMessage,
  type OtherPhoneRegion,
} from './phone';
import {
  COLUMN_LABELS as LABELS,
  IGNORED_COLUMNS,
  matchColumn,
  type ColumnKey,
} from './userImportColumns';

/**
 * Bulk create and update people on the sign-in allowlist from a spreadsheet.
 *
 * Two rules shape everything below, and both come from this being an admin
 * tool pointed at the live company directory:
 *
 * 1. **A blank cell never clears a value.** The spreadsheet is a source of
 *    updates, not a replacement for the record. Someone who exports the list,
 *    fills in the two columns they know about and uploads it back must not
 *    wipe the phone numbers they left alone. Clearing a field is done in the
 *    row editor, where it is unmistakably deliberate.
 *
 * 2. **A row is applied whole or not at all.** A row with a date nobody can
 *    parse is rejected outright rather than written with that one column
 *    dropped — a half-applied row looks successful and quietly loses data.
 *    The single exception is a phone number of the wrong length, which is
 *    dropped on its own and reported; the reasoning is at that block below.
 *
 * The import can only add and update. It never suspends, never revokes, and
 * never reads anything into someone's *absence* from the file: a directory
 * export that happens to be missing a person must not lock them out.
 */

/** Upper bound on one file. Well above the size of the company, and it keeps
 *  the request inside the route's 60s budget even if every row changes. */
export const MAX_IMPORT_ROWS = 500;

export type UserImportAction =
  | 'add'          // not on the list yet — will be created
  | 'update'       // on the list, and the file carries something new
  | 'unchanged'    // on the list, nothing in the file differs
  | 'invalid'      // rejected: bad email, unparseable date, unknown site…
  | 'wrong-domain' // rejected: outside the company domain
  | 'duplicate'    // the same address appeared on an earlier row
  | 'error';       // the write itself failed

/**
 * One thing wrong with one cell, named by column rather than only described in
 * prose.
 *
 * `message` alone was enough while the report was something to read and act on
 * in Excel. It is not enough to *offer a fix*: the panel has to know which box
 * to put in front of the admin, which is what `column` is for. The two travel
 * together — the message is what a person reads, the column is what the UI
 * keys on — and both describe the same fault.
 */
export interface ImportProblem {
  column: ColumnKey;
  message: string;
}

export interface UserImportRow {
  /** Line number in the file, header included, so it matches what Excel shows. */
  line: number;
  email: string;
  /** Best-known name for the row, purely so the preview is readable. */
  name: string;
  action: UserImportAction;
  /** Labels of the fields this row changes — the preview lists them verbatim. */
  changes: string[];
  /** Why it was rejected, or a caveat about what was applied. */
  message: string;
  /**
   * The same faults, per cell. Empty on a row with nothing wrong with it, and
   * on one that failed to write — a save that did not happen is not the fault
   * of any particular column.
   */
  problems: ImportProblem[];
}

export interface UserImportReport {
  /** False means the writes actually happened. */
  applied: boolean;
  rows: UserImportRow[];
  counts: {
    add: number;
    update: number;
    unchanged: number;
    /** Everything that will not be written: invalid, wrong-domain, duplicate, error. */
    rejected: number;
    /**
     * Phone cells that were not a number of the right length. Counted apart
     * from `rejected` because they do not reject anything: the rest of the row
     * is still applied, and only that one cell is dropped.
     */
    phonesSkipped: number;
  };
  /** Headers that were understood, echoed back so a mis-named column is visible. */
  matchedColumns: string[];
  /** Headers that were not understood and were ignored. */
  unknownColumns: string[];
}

/** Thrown for problems with the file as a whole, not with one row. */
export class UserImportError extends Error {}

// ── Value parsing ────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Read a date cell into `YYYY-MM-DD`, or return null if it cannot be read
 * confidently. Confidently is the operative word: a wrong birthday that
 * imported cleanly is worse than a row the admin has to go and fix.
 *
 * Accepted: `2020-03-04`, `2020/03/04`, `3/4/2020` (US order — this is a US
 * brokerage and the files come out of en-US Excel), `Mar 4, 2020`, `4 Mar 2020`,
 * `4-Mar-2020` (the format the People list shows and the HR sheets are kept in),
 * and any of those with a time after them, which is how Excel hands back a
 * cell it decided was a datetime.
 *
 * Deliberately refused:
 * - Two-digit years. '55' is 1955 for a birthday and 2055 for nothing at all,
 *   and there is no reading that is right for both columns.
 * - Day-first slash dates like `25/12/1990`. Guessing per-cell from whether
 *   the first number exceeds 12 would read two rows of the same column in two
 *   different orders, which is exactly how a silent off-by-a-month happens.
 */
function parseDateCell(raw: string): string | null {
  // Drop a trailing time — `csvDate` writes one, and Excel adds one whenever it
  // decides a column is a datetime.
  const value = raw.trim().replace(/[ T]\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i, '').trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);

  const us = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (us) {
    const [, month, day, year] = us;
    if (+month > 12) return null; // day-first — see above
    return build(+year, +month, +day);
  }

  // "Mar 4, 2020" / "March 4 2020"
  const monthFirst = value.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (monthFirst) {
    const month = MONTH_NAMES[monthFirst[1].slice(0, 3).toLowerCase()];
    return month ? build(+monthFirst[3], month, +monthFirst[2]) : null;
  }

  // "4 Mar 2020" and "25-Nov-2000". The hyphenated day-month-year form is
  // what the HR spreadsheets are kept in, so it has to read straight back in.
  const dayFirst = value.match(/^(\d{1,2})[\s\-/.]\s*([a-z]{3,9})\.?,?[\s\-/.]\s*(\d{4})$/i);
  if (dayFirst) {
    const month = MONTH_NAMES[dayFirst[2].slice(0, 3).toLowerCase()];
    return month ? build(+dayFirst[3], month, +dayFirst[1]) : null;
  }

  return null;

  function build(year: number, month: number, day: number): string | null {
    const out = `${year}-${pad(month)}-${pad(day)}`;
    // Catches 2020-02-31 and anything else that is shaped right but not real.
    return isCalendarDate(out) ? out : null;
  }
}

/**
 * Sanity bounds, checked after parsing. A birthday cannot be in the future and
 * nobody on this list was born in the 1800s, so both of those are a typo in the
 * year — usually a transposed digit — rather than data worth keeping. A start
 * date is allowed to be in the future, because someone who starts next month is
 * entered before they start; two years is as far ahead as that ever runs.
 */
function dateOutOfRange(key: 'dateOfBirth' | 'startDate', value: string): string | null {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  if (value < '1900-01-01') return 'the year looks wrong';
  if (key === 'dateOfBirth' && value > todayIso) return 'it is in the future';
  if (key === 'startDate' && value > `${today.getFullYear() + 2}-12-31`) {
    return 'it is more than two years away';
  }
  return null;
}

type Roles = Record<RoleKey, boolean>;

const NO_ROLES: Roles = Object.fromEntries(
  ROLE_ORDER.map((role) => [role, false]),
) as Roles;

/**
 * Read a roles cell. Broker is not a flag — it is the absence of every other
 * role — so "Broker", "None" and "-" all mean the same thing: clear them.
 * A blank cell is different again, and means "do not touch the roles at all".
 */
function parseRolesCell(raw: string): Roles | 'unrecognised' {
  const roles = { ...NO_ROLES };

  for (const token of raw.toLowerCase().split(/[,;/|+&]|\s+/)) {
    const t = token.trim().replace(/[.]$/, '');
    if (!t) continue;
    if (t === 'admin' || t === 'administrator') roles.isAdmin = true;
    else if (t === 'dispatcher' || t === 'dispatch') roles.isDispatcher = true;
    else if (t === 'finance' || t === 'accounting') roles.isFinance = true;
    else if (t === 'hr' || t === 'payroll') roles.isHr = true;
    // Two words in a spreadsheet cell, so both spellings and the obvious
    // abbreviation are taken. A cell that means one of these and is not
    // understood costs somebody their role silently, which is worse than
    // being generous about how it was typed.
    else if (t === 'sales' || t === 'salesmanager' || t === 'manager' || t === 'sm') {
      roles.isSalesManager = true;
    }
    else if (t === 'intern' || t === 'trainee') roles.isIntern = true;
    // The default. Named explicitly so a cell can say "leave them a broker"
    // rather than the admin having to know that empty would not do that.
    else if (t === 'broker' || t === 'none' || t === '-') continue;
    else return 'unrecognised';
  }

  return roles;
}

// ── Planning ─────────────────────────────────────────────────────────────────

/**
 * Fields copied onto `users/{uid}` when they change, so the app sees the update
 * without waiting for the person to sign in again.
 *
 * Date of birth, personal email, start date and legal name are deliberately
 * absent: `users/{uid}` is readable by every signed-in user (see
 * firestore.rules), and those four are for admins and HR only. They stay on the
 * allowlist entry, which is the document the rules gate on.
 *
 * `teamId` IS mirrored — who someone reports to is ordinary directory
 * information, and the app shows it next to their name.
 *
 * Exported because the profile-request approver in lib/profileFields.ts writes
 * the same fields one at a time and has to make the same mirror decision. Two
 * lists of what reaches `users/{uid}` would be two chances to leak a payroll
 * field onto a document every signed-in user can read.
 */
export const MIRRORED_FIELDS = [
  'firstName', 'lastName', 'displayName',
  // `phoneGt` is mirrored even though nothing writes a value to it any more:
  // it is written blank whenever the second number changes, and that blanking
  // has to reach `users/{uid}` too or the old number would linger there.
  'phone', 'phoneOther', 'phoneOtherRegion', 'phoneGt', 'extension',
  'siteId', 'teamId',
  ...ROLE_ORDER,
  // The effective permission list is mirrored too — it is what the rules read,
  // and a role change that did not carry it would leave the entry saying one
  // thing and the system enforcing another until the next sign-in. Written by
  // syncPermissionsFor() rather than being in the patch, so it is named here
  // only to document that it is not forgotten.
] as const;

interface Plan extends UserImportRow {
  /** Fields to write. Empty on any row that will not be written. */
  patch: Record<string, unknown>;
  /** How many phone cells on this row were dropped — see the counts above. */
  phonesSkipped: number;
  /** True when a role flag differs, which also forces a token refresh. */
  rolesChanged: boolean;
  existing: FirebaseFirestore.DocumentData | null;
}

interface Actor {
  email: string;
  uid: string;
}

export async function importUsersCsv(
  text: string,
  actor: Actor,
  options: { apply: boolean },
): Promise<UserImportReport> {
  // Blank rows are dropped, but each surviving row keeps the line number it had
  // in the file — that number is how the admin finds the row again in Excel, so
  // it must not shift because of an empty line further up.
  const grid = parseCsv(text)
    .map((cells, index) => ({ cells, line: index + 1 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim()));
  if (grid.length === 0) throw new UserImportError('That file is empty.');

  const [{ cells: headerRow }, ...dataRows] = grid;

  const columns = new Map<ColumnKey, number>();
  const matchedColumns: string[] = [];
  const unknownColumns: string[] = [];

  headerRow.forEach((header, index) => {
    const key = matchColumn(header);
    if (key) {
      // First one wins, so a duplicated column cannot silently shadow the one
      // the admin filled in.
      if (!columns.has(key)) {
        columns.set(key, index);
        matchedColumns.push(LABELS[key]);
      }
      return;
    }
    const plain = headerKey(header);
    if (plain && !IGNORED_COLUMNS.includes(plain)) unknownColumns.push(header.trim());
  });

  if (!columns.has('email')) {
    throw new UserImportError(
      'No Email column found. The first row must name the columns — download the template to see the headers this accepts.',
    );
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new UserImportError(
      `That file has ${dataRows.length} rows — ${MAX_IMPORT_ROWS} is the most this can take at once.`,
    );
  }

  // Read both collections once up front: planning every row against them in
  // memory keeps a 500-row file to two queries rather than a thousand reads.
  const [allowSnap, siteSnap, teamSnap] = await Promise.all([
    adminDb.collection(ALLOWED_USERS_COLLECTION).get(),
    adminDb.collection(SITES_COLLECTION).get(),
    adminDb.collection(TEAMS_COLLECTION).get(),
  ]);

  const existingByEmail = new Map(allowSnap.docs.map((d) => [d.id, d.data()]));
  const siteIdByName = new Map(siteSnap.docs.map((d) => [headerKey(String(d.data().name ?? '')), d.id]));
  const teamIdByName = new Map(teamSnap.docs.map((d) => [headerKey(String(d.data().name ?? '')), d.id]));

  const cell = (row: string[], key: ColumnKey): string => {
    const index = columns.get(key);
    // unescapeCell undoes the apostrophe our own export adds in front of
    // anything Excel would otherwise treat as a formula.
    return index === undefined ? '' : unescapeCell(row[index] ?? '');
  };

  const seen = new Set<string>();
  const plans: Plan[] = dataRows.map(({ cells, line }) =>
    planRow(cells, line, { cell, existingByEmail, siteIdByName, teamIdByName, seen, actor }),
  );

  if (options.apply) {
    for (const plan of plans) {
      if (plan.action !== 'add' && plan.action !== 'update') continue;
      try {
        await applyPlan(plan, actor);
      } catch {
        // Also where a row planned as new lands if the person was added by
        // someone else in between — `create` refuses rather than overwrite.
        plan.action = 'error';
        plan.message = 'Could not be saved. Check this row again — someone may have just changed it.';
        plan.changes = [];
        // Nothing was written, so a phone note about this row would only be one
        // more thing to read on a row the admin has to redo anyway. There is no
        // cell to point at either: the row was fine, the write was not.
        plan.phonesSkipped = 0;
        plan.problems = [];
      }
    }

    // A file can move people between teams and hand out Sales Manager in the
    // same pass, so the scopes are rebuilt once at the end rather than per row.
    await syncManagedScopes().catch((e) => {
      console.error('[userImport] refreshing managed scopes failed', e);
    });
  }

  const rows: UserImportRow[] = plans.map(
    ({ line, email, name, action, changes, message, problems }) => ({
      line, email, name, action, changes, message, problems,
    }),
  );

  return {
    applied: options.apply,
    rows,
    counts: {
      add:       rows.filter((r) => r.action === 'add').length,
      update:    rows.filter((r) => r.action === 'update').length,
      unchanged: rows.filter((r) => r.action === 'unchanged').length,
      rejected:  rows.filter((r) =>
        r.action === 'invalid' || r.action === 'wrong-domain' ||
        r.action === 'duplicate' || r.action === 'error').length,
      // Counted off the plans rather than the rows: a rejected row builds a
      // fresh plan and never carries a phone note, which is what we want — a
      // row that was not written has nothing to say about one cell on it.
      phonesSkipped: plans.reduce((n, plan) => n + plan.phonesSkipped, 0),
    },
    matchedColumns,
    unknownColumns,
  };
}

function planRow(
  row: string[],
  line: number,
  ctx: {
    cell: (row: string[], key: ColumnKey) => string;
    existingByEmail: Map<string, FirebaseFirestore.DocumentData>;
    siteIdByName: Map<string, string>;
    teamIdByName: Map<string, string>;
    seen: Set<string>;
    actor: Actor;
  },
): Plan {
  const { cell, existingByEmail, siteIdByName, teamIdByName, seen, actor } = ctx;

  const email = normalizeEmail(cell(row, 'email'));
  const displayFallback = [cell(row, 'firstName'), cell(row, 'lastName')].filter(Boolean).join(' ');

  // `column` is the cell to put in front of the admin when they ask to fix the
  // row in place. Every rejection has one: there is no way to refuse a row
  // without having read something specific that was wrong with it.
  const reject = (action: UserImportAction, message: string, column: ColumnKey): Plan => ({
    line, email, name: displayFallback, action, changes: [], message,
    problems: [{ column, message }],
    patch: {}, rolesChanged: false, existing: null, phonesSkipped: 0,
  });

  if (!email) return reject('invalid', 'No email address on this row.', 'email');
  if (!EMAIL_RE.test(email)) return reject('invalid', 'Not a valid email address.', 'email');
  if (!isAllowedEmailDomain(email)) {
    return reject('wrong-domain', `Only @${ALLOWED_EMAIL_DOMAIN} addresses can be added.`, 'email');
  }
  if (seen.has(email)) {
    return reject(
      'duplicate',
      'This address appears earlier in the file — this row was skipped.',
      'email',
    );
  }
  seen.add(email);

  const existing = existingByEmail.get(email) ?? null;
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];
  const notes: string[] = [];
  const problems: ImportProblem[] = [];

  /** Record a field change, but only when the file actually says something new. */
  const set = (key: string, label: string, value: unknown) => {
    const before = existing ? existing[key] ?? null : null;
    // A new entry starts from the same blanks `invite()` writes, so setting a
    // field to '' on one is not a change worth reporting.
    const unchanged = existing
      ? before === value || ((before ?? '') === '' && (value ?? '') === '')
      : (value ?? '') === '';
    if (unchanged) return;
    patch[key] = value;
    changes.push(label);
  };

  const personalEmail = cell(row, 'personalEmail');
  if (personalEmail && !EMAIL_RE.test(personalEmail)) {
    return reject(
      'invalid',
      `Personal email “${personalEmail}” is not a valid address.`,
      'personalEmail',
    );
  }

  // ── Text fields. Blank never clears — see the note at the top of the file.
  const textFields: [ColumnKey, string][] = [
    ['firstName', 'firstName'], ['lastName', 'lastName'], ['legalName', 'legalName'],
    ['personalEmail', 'personalEmail'], ['extension', 'extension'],
  ];
  for (const [column, field] of textFields) {
    const value = cell(row, column);
    if (value) set(field, LABELS[column], value);
  }

  // ── Phones, rewritten to one shape on the way in — see lib/phone.ts.
  //
  // A cell that is not a number of the right length is the one thing here that
  // does NOT reject its row. Rule 2 at the top of this file says a row applies
  // whole or not at all, and this is a deliberate exception to it: a mistyped
  // phone number is the most common thing wrong with one of these files, and
  // throwing away a correct name, team and start date over one digit would
  // send the admin back to Excel for the whole row. The cell is dropped, the
  // row is applied, and the number is named both in the row's message and in
  // the summary count, so it cannot pass unnoticed.
  //
  // Dropped means *not written*, not written as blank: on someone who already
  // has a number, a bad cell leaves the good number alone. That is rule 1 —
  // the spreadsheet is a source of updates, not a replacement for the record.
  let phonesSkipped = 0;

  const rawUs = cell(row, 'phone');
  if (rawUs) {
    const { value, rejected } = normalizePhone(rawUs, 'US');
    if (rejected) {
      phonesSkipped++;
      const message = phoneSkipMessage(rawUs, 'US', Boolean(existing?.phone));
      notes.push(message);
      problems.push({ column: 'phone', message });
    } else {
      set('phone', LABELS.phone, value);
    }
  }

  // The second number is one field on the person and one column per country in
  // the file, so the heading is what says which country the digits are. A row
  // that fills both country columns is describing one field two ways, and
  // there is no honest way to pick a winner — neither is taken, and the row is
  // still applied, exactly as an unreadable number is.
  const otherColumns: [ColumnKey, OtherPhoneRegion][] = [
    ['phoneGt', 'GT'], ['phoneMx', 'MX'],
  ];
  const filledOther = otherColumns.filter(([column]) => cell(row, column));

  if (filledOther.length > 1) {
    phonesSkipped++;
    const message =
      'This row has a Guatemala number and a Mexico number. A person has one '
      + 'second number, so neither was saved — leave the column that does not '
      + 'apply blank.';
    notes.push(message);
    for (const [column] of filledOther) problems.push({ column, message });
  } else if (filledOther.length === 1) {
    const [column, region] = filledOther[0];
    const raw = cell(row, column);
    const { value, rejected } = normalizePhone(raw, region);
    if (rejected) {
      phonesSkipped++;
      const kept = Boolean(existing && otherPhone(existing).value);
      const message = phoneSkipMessage(raw, region, kept);
      notes.push(message);
      problems.push({ column, message });
    } else {
      set('phoneOther', PHONE_LABEL[region], value);
      // Written whenever the number is, never on its own: a region with no
      // number behind it says nothing, and reporting it as a change would put
      // "Guatemala phone" in the summary for a row that only moved a birthday.
      if (patch.phoneOther !== undefined) patch.phoneOtherRegion = region;
      // Clear where this number used to live, in the same write. Not reported
      // as a change: to the admin this is one number, not two fields.
      if (existing?.phoneGt) patch.phoneGt = '';
    }
  }

  // displayName is stored rather than derived, so it has to be recomputed from
  // the merged name — not from whichever half this file happened to carry.
  if ('firstName' in patch || 'lastName' in patch) {
    const first = (patch.firstName ?? existing?.firstName ?? '') as string;
    const last  = (patch.lastName  ?? existing?.lastName  ?? '') as string;
    patch.displayName = [first, last].filter(Boolean).join(' ');
  }

  // ── Dates
  for (const key of ['dateOfBirth', 'startDate'] as const) {
    const raw = cell(row, key);
    if (!raw) continue;

    const parsed = parseDateCell(raw);
    if (!parsed) {
      return reject(
        'invalid',
        `${LABELS[key]} “${raw}” was not understood. Write it as 4-Mar-1990 or 1990-03-04.`,
        key,
      );
    }
    const problem = dateOutOfRange(key, parsed);
    if (problem) {
      return reject('invalid', `${LABELS[key]} “${raw}” was rejected because ${problem}.`, key);
    }

    set(key, LABELS[key], parsed);
  }

  // ── Site, matched by name
  const siteCell = cell(row, 'site');
  if (siteCell) {
    // The one blank-adjacent value that does clear a field, because there is no
    // other way to say "no site" in a spreadsheet cell.
    const clearing = ['none', 'no site', '-'].includes(headerKey(siteCell));
    const siteId = clearing ? null : siteIdByName.get(headerKey(siteCell)) ?? null;
    if (!clearing && !siteId) {
      return reject(
        'invalid',
        `There is no site called “${siteCell}”. Add it under Sites first.`,
        'site',
      );
    }
    const before = existing?.siteId ?? null;
    if (before !== siteId) {
      patch.siteId = siteId;
      changes.push(LABELS.site);
    }
  }

  // ── Team, matched by name. Same shape as the site block above.
  const teamCell = cell(row, 'team');
  if (teamCell) {
    const clearing = ['none', 'no team', '-'].includes(headerKey(teamCell));
    const teamId = clearing ? null : teamIdByName.get(headerKey(teamCell)) ?? null;
    if (!clearing && !teamId) {
      return reject(
        'invalid',
        `There is no team called “${teamCell}”. Add it under Teams first.`,
        'team',
      );
    }
    const before = existing?.teamId ?? null;
    if (before !== teamId) {
      patch.teamId = teamId;
      changes.push(LABELS.team);
    }
  }

  // ── Roles
  let rolesChanged = false;
  const rolesCell = cell(row, 'roles');
  if (rolesCell) {
    const roles = parseRolesCell(rolesCell);
    if (roles === 'unrecognised') {
      return reject(
        'invalid',
        `Roles “${rolesCell}” was not understood. Use Admin, Dispatcher, Finance, HR, Sales Manager, Intern — separated by commas — or Broker for none.`,
        'roles',
      );
    }

    const before = Object.fromEntries(
      ROLE_ORDER.map((role) => [role, existing?.[role] === true]),
    ) as Roles;
    const differs = (Object.keys(roles) as (keyof Roles)[]).some((k) => before[k] !== roles[k]);

    // The same two guards the role buttons enforce. Rather than reject the row
    // — which would also throw away the name and phone number on it — the role
    // change alone is dropped and called out, because the admin's real intent
    // for the row is almost never the one column they are not allowed to touch.
    const demotingSelf      = differs && !roles.isAdmin && before.isAdmin && email === normalizeEmail(actor.email);
    const demotingBootstrap = differs && !roles.isAdmin && isBootstrapAdmin(email);

    if (demotingSelf) {
      notes.push('Your own admin role cannot be removed here, so the Roles column was left alone.');
    } else if (demotingBootstrap) {
      notes.push('This is a protected bootstrap admin, so the Roles column was left alone.');
    } else if (differs) {
      Object.assign(patch, roles);
      rolesChanged = true;
      const held = ROLE_ORDER.filter((role) => roles[role]).map((role) => ROLE_LABELS[role]);
      changes.push(`${LABELS.roles} → ${held.length ? held.join(', ') : 'Broker'}`);
    }
  }

  if (existing?.suspended === true) {
    notes.push('This person is suspended — their details were updated, but they still cannot sign in.');
  }

  const name = [
    patch.firstName ?? existing?.firstName ?? '',
    patch.lastName  ?? existing?.lastName  ?? '',
  ].filter(Boolean).join(' ');

  const action: UserImportAction = existing
    ? (changes.length > 0 ? 'update' : 'unchanged')
    : 'add';

  return {
    line,
    email,
    name,
    action,
    changes,
    message: notes.join(' '),
    problems,
    patch,
    rolesChanged,
    existing,
    phonesSkipped,
  };
}

// ── Applying ─────────────────────────────────────────────────────────────────

async function applyPlan(plan: Plan, actor: Actor): Promise<void> {
  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(plan.email);

  if (plan.action === 'add') {
    // Same shape `invite()` writes, so an entry created here and one created
    // by typing it in on the Add People panel are indistinguishable afterwards.
    //
    // `create`, not `set`: the plan the admin approved said this person was not
    // on the list. If they are by now — added from another tab while the
    // preview sat on screen — this must fail loudly rather than overwrite a
    // real entry with a row of blanks.
    await ref.create({
      email:         plan.email,
      firstName:     '',
      lastName:      '',
      displayName:   '',
      personalEmail: '',
      legalName:     '',
      phone:            '',
      phoneOther:       '',
      phoneOtherRegion: DEFAULT_OTHER_REGION,
      phoneGt:          '',
      extension:        '',
      dateOfBirth:   '',
      startDate:     '',
      photoPath:     null,
      siteId:        null,
      teamId:        null,
      isAdmin:       false,
      isDispatcher:  false,
      isFinance:     false,
      isHr:          false,
      uid:           null,
      invitedBy:     actor.email || actor.uid,
      invitedAt:     FieldValue.serverTimestamp(),
      lastLoginAt:   null,
      suspended:     false,
      suspendedAt:   null,
      suspendedBy:   null,
      ...plan.patch,
    });

    // Someone who was revoked before is still disabled in Auth; re-adding them
    // has to lift that or they get an allowlist entry they cannot use.
    const authUser = await adminAuth.getUserByEmail(plan.email).catch(() => null);
    if (authUser?.disabled) await adminAuth.updateUser(authUser.uid, { disabled: false });
    return;
  }

  await ref.update(plan.patch);

  const uid = plan.existing?.uid;
  if (!uid) return;

  const mirror = Object.fromEntries(
    Object.entries(plan.patch).filter(([key]) =>
      (MIRRORED_FIELDS as readonly string[]).includes(key)),
  );
  if (Object.keys(mirror).length > 0) {
    await adminDb.collection(USERS_COLLECTION).doc(uid).set(mirror, { merge: true });
  }

  // A role change moves the permissions it expands to, and that list is what
  // the rules read. Mirrored here rather than left to the next sign-in, for the
  // same reason every other field on this row is.
  if (plan.rolesChanged) {
    await syncPermissionsFor(plan.email).catch(() => {});
    // Storage rules read roles off the ID token, so a role change only lands
    // once the token is reissued.
    await adminAuth.revokeRefreshTokens(uid).catch(() => {});
  }
}
