import type { OtherPhoneRegion } from '@/lib/phone';
import { ROLE_LABELS, ROLE_ORDER } from './permission';

/**
 * A record of someone whose access was revoked, written to `removedUsers` at
 * the moment the allowlist entry is deleted.
 *
 * Removal is otherwise total and silent — the entry and the profile both go —
 * which left no way to answer "who took Ana off the system, and when?" This is
 * that answer, and it is the only trace that survives. The photo is the one
 * thing kept alongside it; see `photoPath` below.
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
 *
 * **A row is never deleted on restore either.** Putting somebody back writes
 * `restoredAt` onto the row and leaves everything else exactly as it was, so
 * the log still says they were removed on the 3rd and that the removal was
 * undone on the 5th. Deleting the row would make a mistaken removal disappear
 * along with the mistake, which is the opposite of what a log is for.
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
  /** Absent on archives written before these roles existed. */
  isSalesManager?: boolean;
  isIntern?: boolean;
  /**
   * The permissions they had been given individually, on top of their roles.
   * Kept because "what could this person do" is the question a removal record
   * is read to answer, and after permissions became divisible the roles alone
   * no longer answer it.
   */
  grantedPermissions?: string[];
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
   * Where their photo still sits in Storage.
   *
   * The file is deliberately **not** deleted with the rest of the account. A
   * removal record is read by somebody trying to work out who a former
   * colleague was, often months later, and a face answers that faster than a
   * legal name does — and the photo is also what makes a restored person look
   * like themselves again instead of arriving back as an initial in a circle.
   *
   * Absent on rows written before that decision (2026-09-22), when the photo
   * was deleted along with the entry. Those rows fall back to the initial,
   * which is why this is optional rather than backfilled: the files they
   * pointed at are gone.
   */
  photoPath?: string | null;

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

  // ── Putting them back ──────────────────────────────────────────────────────
  /**
   * When this removal was undone, or null/absent if it never was.
   *
   * Set by `/api/admin/users/restore`, which rebuilds the allowlist entry from
   * the fields above. It is what stops the same row being restored twice and
   * what the panel reads to say "restored" instead of offering the button
   * again — and it is why the row is marked rather than deleted.
   */
  restoredAt?: string | null;
  /** The admin who put them back: their email, or their uid if none. */
  restoredBy?: string;
  restoredByUid?: string;
}

/** Whether this removal has already been undone. */
export function isRestored(user: RemovedUser): boolean {
  return !!user.restoredAt;
}

/** The name to show, falling back to the address when no name was ever set. */
export function removedUserName(user: RemovedUser): string {
  const joined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return joined || (user.displayName ?? '').trim() || user.email;
}

/** The roles they held, as labels. Empty means they were a plain broker. */
export function removedUserRoles(user: RemovedUser): string[] {
  return ROLE_ORDER.filter((role) => user[role] === true).map((role) => ROLE_LABELS[role]);
}
