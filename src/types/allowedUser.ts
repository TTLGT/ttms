import type { Timestamp } from 'firebase/firestore';
import type { OtherPhoneRegion } from '@/lib/phone';
import {
  ROLE_DETAILS,
  ROLE_LABELS,
  ROLE_ORDER,
  type RoleFlagSet,
  type RoleKey,
} from './permission';

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
  /**
   * The second number, for the people who have one as well as the US line —
   * a Guatemala or Mexico line. One field, with `phoneOtherRegion` saying
   * which country it is: see lib/phone.ts for why it is not a field per
   * country, and why the country cannot be inferred from the digits.
   */
  phoneOther?: string;
  /** 'GT' or 'MX'. Meaningless when `phoneOther` is blank. */
  phoneOtherRegion?: OtherPhoneRegion;
  /**
   * Where the second number lived when Guatemala was the only option.
   *
   * Still read — through `otherPhone()` in lib/phone.ts, never directly — so
   * entries nobody has re-saved keep showing their number without a database
   * migration having to run first. Every write clears it. Do not read this
   * field on its own; `otherPhone()` is the one place that knows both shapes.
   */
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
  /**
   * A broker with admin-level power over one team — the team they are the lead
   * of in Settings → Teams. This is the only role a team's setup affects: for
   * everybody else, leading a team records who reports to whom and grants
   * nothing. See ROLE_PERMISSIONS in src/types/permission.ts and
   * src/lib/teamScope.ts.
   *
   * Absent on documents written before the role existed; treat as false.
   */
  isSalesManager?: boolean;
  /**
   * Less than a broker, and the only role that is.
   *
   * An intern gets the directory, chat and their own area — no loads, no
   * clients, no carriers. Everything beyond that is handed over one permission
   * at a time in `grantedPermissions` below, which is why this exists as a
   * role rather than as an absence: "no roles set" already means broker, and a
   * broker sees the whole baseline.
   *
   * Absent on documents written before the role existed; treat as false.
   */
  isIntern?: boolean;
  /**
   * Permissions given to this person individually, on top of whatever their
   * role grants — the point of which is that somebody can be allowed to send
   * agreements without being made a Dispatcher and handed every client in the
   * company along with it.
   *
   * Additive only. A permission their role already grants cannot be taken away
   * by leaving it out here; remove the role instead. See the header of
   * src/types/permission.ts.
   *
   * This is the *grant*, not the effective set. The effective set — roles
   * expanded, grants folded in — is computed by `effectivePermissions()` and
   * mirrored onto `users/{uid}.permissions`, which is what the security rules
   * and the API guards read.
   */
  grantedPermissions?: string[];
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

/**
 * A stored role. The catalog lives in src/types/permission.ts, beside the
 * permissions each one expands to — a role and its meaning belong in the same
 * file, or the two drift the first time one is added.
 */
export type AllowedUserRole = RoleKey;

/**
 * The elevated roles, in the order they are shown wherever roles are listed.
 *
 * Broker is not among them: it is what everyone has until one of these is
 * granted, so it is derived rather than stored (see `isBroker` in
 * lib/accessControl) and drawn as its own chip in front of these.
 *
 * Built from ROLE_ORDER rather than typed out, so a role added to the catalog
 * appears on the access list, in its list view and in the CSV export without
 * three arrays having to be edited in step.
 */
export const ROLE_CHIPS: { field: AllowedUserRole; label: string; detail: string }[] =
  ROLE_ORDER.map((field) => ({
    field,
    label:  ROLE_LABELS[field],
    detail: ROLE_DETAILS[field],
  }));

/**
 * What someone is allowed to do, in words. Broker is the absence of the rest,
 * so it is spelled out rather than left as an empty row — a blank there reads
 * as "no roles loaded", not as "the default one".
 */
export function roleLabels(user: RoleFlagSet): string[] {
  const held = ROLE_CHIPS.filter(({ field }) => user[field]).map(({ label }) => label);
  return held.length > 0 ? held : ['Broker'];
}

/** The contact fields an admin edits together, as one patch. */
export interface AllowedUserDetails {
  firstName: string;
  lastName: string;
  /** Payroll name — blank when it is the same as first + last. */
  legalName: string;
  personalEmail: string;
  phone: string;
  /** The second number as typed; the region below says which country it is. */
  phoneOther: string;
  phoneOtherRegion: OtherPhoneRegion;
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

// Displaying a date lives in `src/lib/dateFormat.ts`, not here: the format is
// a company-wide setting, so every date on screen has to come out of one
// formatter that knows what the setting says.

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
