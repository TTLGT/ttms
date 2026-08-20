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
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
