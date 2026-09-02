import type { Timestamp } from 'firebase/firestore';
import { normalizeEmail } from '@/lib/accessControl';

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
   * has been named — or when the named lead has not signed in yet and is being
   * held in `leadEmail` below. A uid rather than an email wherever one exists,
   * so a lead who changes address keeps the link.
   */
  leadUid: string | null;
  /**
   * The lead's email, used only while that person has never signed in and so
   * has no uid to point at.
   *
   * A team lead is very often the new hire the team is being built around, and
   * making the org chart wait for their first Google sign-in meant a whole
   * team read as leaderless during setup. This is the same holding pattern
   * work groups use for `memberEmails`: `claimPendingAssignments()` moves the
   * address into `leadUid` at that first sign-in, so nothing downstream ever
   * has to match on both.
   *
   * At most one of the two is ever set. Absent on teams written before this
   * existed; treat as null.
   */
  leadEmail?: string | null;
  createdAt: Timestamp | null;
  createdBy: string;
  updatedAt: Timestamp | null;
}

/**
 * The person a team reports to, found in a list of allowlist entries — whether
 * they are recorded by uid or, before their first sign-in, by email.
 *
 * Callers pass the list they already have rather than this reaching for one,
 * because every screen that shows a lead is showing other people beside them
 * and has loaded the allowlist anyway.
 *
 * `uid` is optional on the way in so a directory entry can be passed straight
 * through — there, somebody who has never signed in has no uid rather than a
 * null one. It makes no difference to the match: a team pointing at a uid can
 * only be matched by somebody who has one.
 */
export function findTeamLead<T extends { email: string; uid?: string | null }>(
  team: Pick<Team, 'leadUid' | 'leadEmail'>,
  people: T[],
): T | null {
  if (team.leadUid) return people.find((p) => p.uid === team.leadUid) ?? null;

  const email = normalizeEmail(team.leadEmail);
  if (!email) return null;
  return people.find((p) => normalizeEmail(p.email) === email) ?? null;
}
