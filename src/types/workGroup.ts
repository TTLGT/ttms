import type { Timestamp } from 'firebase/firestore';
import { normalizeEmail } from '@/lib/accessControl';

/**
 * A named set of users that can own clients, shippers and consignees.
 *
 * Ownership by group solves the BATS records assigned to a team rather than a
 * person ("TTL Gabe's Team", "Total Transport Logistics"). Everyone in the
 * group sees the group's records; nobody else does.
 *
 * Membership is mirrored onto each member's `users/{uid}.groupIds`, which is
 * what security rules actually test. Rules cannot query, so without that mirror
 * a party owned by a group would need an unbounded number of document reads to
 * evaluate. Keep the two in step — the API writes both in one transaction.
 */
export interface WorkGroup {
  id: string;
  name: string;
  memberUids: string[];
  /**
   * Members who are on the allowlist but have never signed in, held by email
   * because there is no uid to list until they first authenticate.
   *
   * An admin has to be able to build out a group before the people in it have
   * logged in — otherwise a new hire cannot be set up until their first day.
   * /api/auth/session drains the matching entry into `memberUids` and mirrors
   * the group onto the new profile's `groupIds` in the same pass, so the
   * mirror rules depend on is correct from their very first page load.
   */
  memberEmails: string[];
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Is this person in this group?
 *
 * Both halves of the membership are checked, because a group holds people two
 * ways: by uid once they have signed in, by email until then. Asking about
 * only one of them reads a new hire as being in no group at all — which is
 * exactly the person whose access someone is most likely to be checking.
 *
 * Shaped like `findTeamLead()` in src/types/team.ts: a caller passes whatever
 * kind of person record it has, so long as it carries the two identifiers.
 */
export function isGroupMember(
  group: Pick<WorkGroup, 'memberUids' | 'memberEmails'>,
  person: { email: string; uid?: string | null },
): boolean {
  if (person.uid && (group.memberUids ?? []).includes(person.uid)) return true;

  const email = normalizeEmail(person.email);
  if (!email) return false;
  return (group.memberEmails ?? []).some((e) => normalizeEmail(e) === email);
}

/**
 * How many people are in a group.
 *
 * Counted from the group rather than from however many members a viewer's
 * directory happens to resolve. Dispatch reads the directory from profiles,
 * so a suspended member is somebody they cannot name — and a count that
 * quietly dropped them would understate who can see the group's records,
 * which is the one thing this number is asked for.
 */
export function groupMemberCount(group: Pick<WorkGroup, 'memberUids' | 'memberEmails'>): number {
  return (group.memberUids ?? []).length + (group.memberEmails ?? []).length;
}
