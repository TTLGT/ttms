import type { Timestamp } from 'firebase/firestore';

/**
 * An entry in the sign-in allowlist, stored at `allowedUsers/{normalizedEmail}`.
 *
 * Created by an admin before the person has ever signed in, so `uid` and
 * `lastLoginAt` stay null until their first successful sign-in. The role flags
 * here are the source of truth; they are copied onto `users/{uid}` on login.
 */
export interface AllowedUser {
  email: string;
  /**
   * Set by an admin, and the source of truth for the name. Wins over the name
   * Google reports at sign-in.
   */
  firstName?: string;
  lastName?: string;
  /**
   * The two above joined, kept in step by the API. Stored rather than derived
   * because the rest of the app — work groups, party approvals — reads a
   * single name off `users/{uid}` and has no business splitting it.
   */
  displayName?: string;
  /**
   * The US work number. Kept under the original `phone` key: it is what the
   * profile mirror and everything reading a single number already point at,
   * and renaming it would only buy a migration.
   */
  phone?: string;
  /** Guatemala number, for the people who have one as well as the US line. */
  phoneGt?: string;
  /** Desk extension, kept apart from `phone` so it stays dialable on its own. */
  extension?: string;
  /**
   * A personal address, for reaching someone when the company account is gone
   * or unreachable. Never an identity: sign-in is keyed on `email` alone, and
   * this field is deliberately not checked against the allowlist.
   */
  personalEmail?: string;
  /**
   * The name as it appears on payroll and legal paperwork, for the people
   * whose everyday name is not the one on the form — a maiden name, a full
   * compound surname, a middle name nobody uses at work.
   *
   * One free-text field rather than parts, on purpose: it exists to be copied
   * verbatim onto a payroll document, and splitting it would invite exactly
   * the guessing at compound surnames that `splitName` below warns about.
   *
   * Admin- and HR-only, and grouped with the two fields below rather than the
   * contact ones above: it is never mirrored onto `users/{uid}`.
   */
  legalName?: string;
  /**
   * Which team they report through — `teams/{id}`, or null for unassigned.
   * Unlike the fields below this one IS mirrored onto `users/{uid}`: who
   * someone reports to is ordinary org-chart information, not payroll data.
   */
  teamId?: string | null;
  /**
   * Calendar dates, stored as `YYYY-MM-DD` text rather than Timestamps. A
   * birthday and a start date have no time and no timezone — as a Timestamp
   * they would land at midnight UTC and read back a day early for anyone west
   * of it. Text also sorts chronologically for free and round-trips through
   * `<input type="date">` unchanged.
   *
   * These two, along with `legalName` and `personalEmail` above, are NOT
   * mirrored onto `users/{uid}`: that document is readable by every signed-in
   * user, and a birthday, a private address and a payroll name are for admins
   * and HR only.
   */
  dateOfBirth?: string;
  startDate?: string;
  /**
   * Storage path of the profile photo, not a download URL — URLs expire and
   * change, the path does not. Resolved with getDownloadURL when displayed.
   */
  photoPath?: string | null;
  /** Which site they work out of — `sites/{id}`, or null for unassigned. */
  siteId?: string | null;
  isAdmin: boolean;
  isDispatcher: boolean;
  isFinance: boolean;
  /**
   * Read-only access to the people directory, including the payroll fields
   * above. HR is the one role that grants no operational access at all — an
   * HR user sees no more clients or loads than a plain broker, and cannot
   * grant a role, suspend anyone or edit an entry. Absent on documents
   * written before the role existed; treat as false.
   */
  isHr?: boolean;
  invitedBy: string;
  invitedAt: Timestamp | null;
  /** Filled in on first sign-in — null means the invite is still pending. */
  uid: string | null;
  lastLoginAt: Timestamp | null;
  /**
   * Temporarily blocked without losing the entry. The roles above are kept
   * as-is so restoring puts the person back exactly where they were —
   * unlike revoking, which deletes the entry outright.
   * Absent on documents written before suspension existed; treat as false.
   */
  suspended?: boolean;
  suspendedAt?: Timestamp | null;
  suspendedBy?: string | null;
}

/** Derived, not stored: an entry is exactly one of these at any moment. */
export type AccessStatus = 'active' | 'pending' | 'suspended';

export function accessStatus(user: Pick<AllowedUser, 'uid' | 'suspended'>): AccessStatus {
  if (user.suspended === true) return 'suspended';
  return user.uid ? 'active' : 'pending';
}

export type AllowedUserRole = 'isAdmin' | 'isDispatcher' | 'isFinance' | 'isHr';

/** The contact fields an admin edits together, as one patch. */
export interface AllowedUserDetails {
  firstName: string;
  lastName: string;
  /** Payroll name — blank when it is the same as first + last. */
  legalName: string;
  personalEmail: string;
  phone: string;
  phoneGt: string;
  extension: string;
  /** Both `YYYY-MM-DD`, or '' for not recorded. */
  dateOfBirth: string;
  startDate: string;
  siteId: string | null;
  teamId: string | null;
}

/** The name to show, or '' when nobody has entered one. */
export function fullName(user: Pick<AllowedUser, 'firstName' | 'lastName' | 'displayName'>): string {
  const joined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return joined || (user.displayName ?? '').trim();
}

/**
 * Best-effort split of a single name into first and last, used only to seed
 * the editor for an entry saved before the two were separate fields. Splits on
 * the LAST space, so "Maria del Carmen Ruiz" keeps everything but "Ruiz" as
 * the first name rather than guessing at compound surnames.
 */
export function splitName(name: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return { firstName: '', lastName: '' };

  const cut = trimmed.lastIndexOf(' ');
  if (cut === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, cut), lastName: trimmed.slice(cut + 1) };
}

// ── Calendar dates ────────────────────────────────────────────────────────────

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Whether `value` is a real `YYYY-MM-DD` date and not merely shaped like one.
 * Round-tripping through Date catches 2025-02-30 and 2025-13-01, which a
 * regex alone would wave through. Parsed in UTC to match how the string was
 * built — nothing here is ever displayed from this Date.
 */
export function isCalendarDate(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;

  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** A valid `YYYY-MM-DD`, or '' for anything else — including junk input. */
export function normalizeCalendarDate(value: unknown): string {
  const v = typeof value === 'string' ? value.trim() : '';
  return isCalendarDate(v) ? v : '';
}

/**
 * Format `YYYY-MM-DD` for display, e.g. "Mar 4, 1990".
 *
 * The parts are read off the string rather than handed to `new Date(value)`,
 * which parses a bare date as UTC midnight and then renders it in local time —
 * showing every date a day early for anyone in the Americas, this office
 * included.
 */
export function formatCalendarDate(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!isCalendarDate(v)) return '';

  const [year, month, day] = v.split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
}

/**
 * Years elapsed since `value`, or null if it is not a date. Used for the
 * "N years" note beside a start date; counts completed years, so someone who
 * started eleven months ago reads as 0 rather than 1.
 */
export function yearsSince(value: string | null | undefined): number | null {
  const v = (value ?? '').trim();
  if (!isCalendarDate(v)) return null;

  const [y, m, d] = v.split('-').map(Number);
  const now = new Date();
  let years = now.getFullYear() - y;
  // Roll back a year until the anniversary has actually passed this year.
  const monthNow = now.getMonth() + 1;
  if (monthNow < m || (monthNow === m && now.getDate() < d)) years -= 1;
  return years;
}

/** Outcome of a single address in a bulk invite, one row per address sent. */
export type InviteStatus = 'added' | 'exists' | 'suspended' | 'invalid' | 'wrong-domain' | 'error';

export interface InviteResult {
  email: string;
  status: InviteStatus;
  message: string;
}
