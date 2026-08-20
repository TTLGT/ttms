import type { Timestamp } from 'firebase/firestore';

/**
 * A physical location people work out of — an office, a terminal, a yard.
 *
 * Sites are reference data, not an access boundary: assigning someone to a site
 * records where they sit and who to call, and changes nothing about what they
 * can see. Ownership is still decided by roles and work groups.
 *
 * A user's site is stored as `siteId` on their allowlist entry and mirrored
 * onto their profile, so deleting a site has to clear both (see the DELETE in
 * /api/sites/[siteId]).
 */
export interface Site {
  id: string;
  name: string;
  /** Optional — a site is useful with just a name. */
  address: string;
  createdAt: Timestamp | null;
  createdBy: string;
  updatedAt: Timestamp | null;
}
