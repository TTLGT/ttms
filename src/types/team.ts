import type { Timestamp } from 'firebase/firestore';

/**
 * A reporting unit — GT, Top Brokers, Hibrid, Staff.
 *
 * A team answers "who does this person report to": everyone on a team reports
 * to that team's lead. Teams often line up with sites, because a team is
 * frequently everyone in one office, but the two are separate fields on
 * purpose — a team can span offices and an office can hold several teams.
 *
 * Like sites, and unlike work groups, **a team is not an access boundary.**
 * Putting someone on a team records where they sit in the org chart and
 * changes nothing about what they can see; visibility is still decided by
 * roles and work groups. That separation is the whole point: recording that
 * Maria reports to Gabe must never also hand her Gabe's book of business.
 *
 * A user's team is stored as `teamId` on their allowlist entry and mirrored
 * onto their profile, so deleting a team has to clear both (see the DELETE in
 * /api/teams/[teamId]).
 */
export interface Team {
  id: string;
  name: string;
  /**
   * The `users/{uid}` of the person this team reports to, or null when nobody
   * has been named. A uid rather than an email so a lead who changes address
   * keeps the link, and so the picker can only offer someone who has actually
   * signed in and therefore has a profile to point at.
   */
  leadUid: string | null;
  createdAt: Timestamp | null;
  createdBy: string;
  updatedAt: Timestamp | null;
}
