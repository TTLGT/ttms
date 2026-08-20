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
   * Storage path of the profile photo, not a download URL — URLs expire and
   * change, the path does not. Resolved with getDownloadURL when displayed.
   */
  photoPath?: string | null;
  /** Which site they work out of — `sites/{id}`, or null for unassigned. */
  siteId?: string | null;
  isAdmin: boolean;
  isDispatcher: boolean;
  isFinance: boolean;
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

export type AllowedUserRole = 'isAdmin' | 'isDispatcher' | 'isFinance';

/** The contact fields an admin edits together, as one patch. */
export interface AllowedUserDetails {
  firstName: string;
  lastName: string;
  phone: string;
  phoneGt: string;
  extension: string;
  siteId: string | null;
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

/** Outcome of a single address in a bulk invite, one row per address sent. */
export type InviteStatus = 'added' | 'exists' | 'suspended' | 'invalid' | 'wrong-domain' | 'error';

export interface InviteResult {
  email: string;
  status: InviteStatus;
  message: string;
}
