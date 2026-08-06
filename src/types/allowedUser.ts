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
  isAdmin: boolean;
  isDispatcher: boolean;
  isFinance: boolean;
  invitedBy: string;
  invitedAt: Timestamp | null;
  /** Filled in on first sign-in — null means the invite is still pending. */
  uid: string | null;
  lastLoginAt: Timestamp | null;
}

export type AllowedUserRole = 'isAdmin' | 'isDispatcher' | 'isFinance';
