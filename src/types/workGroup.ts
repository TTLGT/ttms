import type { Timestamp } from 'firebase/firestore';

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
