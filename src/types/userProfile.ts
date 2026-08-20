import type { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isDispatcher?: boolean;
  isFinance?: boolean;
  /** Mirrored from the allowlist entry so server guards and rules can see it. */
  suspended?: boolean;
  /** Contact details, mirrored from the allowlist entry on every sign-in. */
  phone?: string;
  extension?: string;
  siteId?: string | null;
  createdAt: Timestamp;
}
