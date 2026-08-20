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
  /** Set by an admin. Wins over the name Google reports at sign-in. */
  displayName?: string;
  phone?: string;
  /** Desk extension, kept apart from `phone` so it stays dialable on its own. */
  extension?: string;
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
  displayName: string;
  phone: string;
  extension: string;
  siteId: string | null;
}

/** Outcome of a single address in a bulk invite, one row per address sent. */
export type InviteStatus = 'added' | 'exists' | 'suspended' | 'invalid' | 'wrong-domain' | 'error';

export interface InviteResult {
  email: string;
  status: InviteStatus;
  message: string;
}
