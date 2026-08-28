import type { OtherPhoneRegion } from '@/lib/phone';

/**
 * A record of someone whose access was revoked, written to `removedUsers` at
 * the moment the allowlist entry is deleted.
 *
 * Removal is otherwise total and silent — the entry, the profile and the photo
 * all go — which left no way to answer "who took Ana off the system, and
 * when?" This is that answer, and it is the only trace that survives.
 *
 * **Append-only, and keyed by a generated id rather than the email.** Someone
 * can be added, removed, re-added and removed again; keying on the address
 * would overwrite the first removal with the second and quietly destroy the
 * very history this exists to keep.
 *
 * **Server-only.** It carries the same admin-only fields the allowlist entry
 * did — date of birth, personal email — so it is never read from the client
 * SDK. `/api/admin/users/removed` fetches it through the Admin SDK behind an
 * admin guard; `firestore.rules` denies the collection outright.
 *
 * **Kept forever.** The business owner decided this explicitly (2026-08-26):
 * removal records are never purged, aged out or trimmed. Do not add a cleanup
 * script, a TTL policy or a delete path to this collection — it is the only
 * evidence someone was ever on the system, and the only place their details
 * survive a removal that turns out to have been a mistake.
 */
export interface RemovedUser {
  /** The Firestore document id. Not stored in the document itself. */
  id: string;
  email: string;

  // ── Who they were, as of the moment they were removed ──────────────────────
  firstName?: string;
  lastName?: string;
  displayName?: string;
  personalEmail?: string;
  /** Payroll name as of removal — see AllowedUser.legalName. */
  legalName?: string;
  phone?: string;
  /** The second number and its country — see AllowedUser.phoneOther. */
  phoneOther?: string;
  phoneOtherRegion?: OtherPhoneRegion;
  /** Legacy, on archives written before the field moved. Read via otherPhone(). */
  phoneGt?: string;
  extension?: string;
  dateOfBirth?: string;
  startDate?: string;
  siteId?: string | null;
  teamId?: string | null;
  isAdmin: boolean;
  isDispatcher: boolean;
  isFinance: boolean;
  isHr?: boolean;
  /**
   * Whether they were already suspended when removed. Worth keeping: a removal
   * that follows a suspension is a normal offboarding, whereas removing an
   * active account is the one someone may need to ask about.
   */
  wasSuspended: boolean;
  /** Their old `users/{uid}` id, or null if they never signed in. */
  uid: string | null;
  invitedBy?: string;

  /**
   * ISO 8601 strings, not Timestamps — the only shape this type is ever seen
   * in. These rows arrive over JSON from /api/admin/users/removed, and a
   * Firestore Timestamp serialises to a bare `{_seconds, _nanoseconds}` with
   * no `toDate()` on the far side. The route converts them, so nothing
   * downstream has to know that.
   */
  invitedAt: string | null;
  lastLoginAt: string | null;

  // ── The removal itself ─────────────────────────────────────────────────────
  removedAt: string | null;
  /** The admin's email, or their uid if the token carried no address. */
  removedBy: string;
  removedByUid: string;
}

/**
 * There is deliberately no `photoPath`. The photo is deleted from Storage as
 * part of the removal, so recording where it used to be would only preserve a
 * path to a file that is gone.
 */

/** The name to show, falling back to the address when no name was ever set. */
export function removedUserName(user: RemovedUser): string {
  const joined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return joined || (user.displayName ?? '').trim() || user.email;
}

/** The roles they held, as labels. Empty means they were a plain broker. */
export function removedUserRoles(user: RemovedUser): string[] {
  return [
    user.isAdmin && 'Admin',
    user.isDispatcher && 'Dispatcher',
    user.isFinance && 'Finance',
    user.isHr && 'HR',
  ].filter(Boolean) as string[];
}
