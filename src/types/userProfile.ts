import type { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  /** The parts `displayName` is composed from, mirrored from the allowlist. */
  firstName?: string;
  lastName?: string;
  isAdmin: boolean;
  isDispatcher?: boolean;
  isFinance?: boolean;
  /** Mirrored from the allowlist entry so server guards and rules can see it. */
  suspended?: boolean;
  /** Contact details, mirrored from the allowlist entry on every sign-in. */
  /** US work number. */
  phone?: string;
  phoneGt?: string;
  extension?: string;
  siteId?: string | null;
  /** Storage path, not a URL — see AllowedUser.photoPath. */
  photoPath?: string | null;
  createdAt: Timestamp;
}
