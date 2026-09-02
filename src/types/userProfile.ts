import type { Timestamp } from 'firebase/firestore';
import type { OtherPhoneRegion } from '@/lib/phone';

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
  /**
   * Read-only access to the people directory. Mirrored here because the
   * Firestore rules on `allowedUsers` test this profile, not the allowlist
   * entry. It grants nothing operational — see AllowedUser.isHr.
   */
  isHr?: boolean;
  /** Admin-level power over the team they lead — see AllowedUser.isSalesManager. */
  isSalesManager?: boolean;
  /** Below a broker — see AllowedUser.isIntern. */
  isIntern?: boolean;
  /**
   * Everything this person may do: their roles expanded, plus anything granted
   * to them individually. Computed by `effectivePermissions()` and rewritten
   * on every sign-in and on every change to their entry.
   *
   * **This is the array the Firestore rules read.** They do no role maths of
   * their own any more, which is what keeps a rule and a screen from
   * disagreeing. Absent on profiles written before permissions existed; `can()`
   * falls back to deriving it from the role flags for those.
   */
  permissions?: string[];
  /** Work groups this user belongs to — the mirror the rules test. */
  groupIds?: string[];
  /**
   * For a Sales Manager, everyone on the teams they lead. Empty for everybody
   * else. Kept current by src/lib/teamScope.ts — see RoleFlags.managedUids in
   * src/lib/accessControl.ts for why it is mirrored rather than looked up.
   */
  managedUids?: string[];
  /** Managed people who have never signed in, held by email until they do. */
  managedEmails?: string[];
  /** Mirrored from the allowlist entry so server guards and rules can see it. */
  suspended?: boolean;
  /** Contact details, mirrored from the allowlist entry on every sign-in. */
  /** US work number. */
  phone?: string;
  /** The second number and its country — see AllowedUser.phoneOther. */
  phoneOther?: string;
  phoneOtherRegion?: OtherPhoneRegion;
  /** Legacy, still mirrored so clearing it propagates. Read via otherPhone(). */
  phoneGt?: string;
  extension?: string;
  siteId?: string | null;
  /**
   * Which team they report through. Mirrored, unlike the payroll fields on the
   * allowlist entry: reporting structure is ordinary directory information.
   */
  teamId?: string | null;
  /** Storage path, not a URL — see AllowedUser.photoPath. */
  photoPath?: string | null;
  createdAt: Timestamp;
}
