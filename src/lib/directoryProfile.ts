import { findTeamLead, type Team } from '@/types/team';
import { normalizeEmail } from './accessControl';
import type { DirectoryPerson } from './directory';
import type { Site } from '@/types/site';

/**
 * One person, pulled out of the directory with everything that places them:
 * their office, their team, who they report to, and who sits beside them.
 *
 * Like lib/directoryOrg.ts this is shaping rather than fetching — the page has
 * already loaded the people, the sites and the teams, and hands all three
 * over. It lives here rather than in the page for the same reason the org
 * chart does: "who are this person's teammates" is a question with a right
 * answer, and the answer has to match what the chart draws or the two screens
 * will disagree about the same team.
 *
 * Nothing here decides what a viewer may *see*. That was settled in
 * lib/directory.ts, which built the list this is given — a viewer who is not
 * admin or HR is handed people with no payroll fields on them at all. Read the
 * note at the top of that file before adding anything to this one.
 */

/**
 * The address of one colleague's page.
 *
 * The email is the key rather than the uid, because it is the one identifier
 * everybody on the allowlist has — somebody set up last week who has not
 * signed in yet has no uid, and a link that only worked for people Google had
 * already seen would break on exactly the new hires the directory gets opened
 * for. Lowercased on the way in so the same person has one address however
 * their entry was typed.
 *
 * Every view links through here so all four agree on the shape of the URL.
 */
export function personHref(email: string): string {
  return `/dashboard/directory/${encodeURIComponent(normalizeEmail(email))}`;
}

export interface PersonProfile {
  person: DirectoryPerson;
  /** Their office, with its address — null when none is set, or when the site
   *  was deleted out from under the profile. */
  site: Site | null;
  /** The team they sit on, same caveat. */
  team: Team | null;
  /**
   * Who they report to: the lead of their own team, resolved against the whole
   * directory. Null when the team names no lead, when the named lead is not
   * somebody this viewer can see, or when this person *is* the lead — that
   * last case is `isLead` below rather than a person reporting to themselves.
   */
  lead: DirectoryPerson | null;
  /** True when they lead the team they sit on. */
  isLead: boolean;
  /**
   * Everyone else on their team, in the order the caller handed them over —
   * name order. The lead is left out, because they are already shown above as
   * the person this one reports to, and a name in both places reads as two
   * different people.
   */
  teammates: DirectoryPerson[];
  /**
   * Teams they lead other than their own — a lead who sits on one team and
   * runs another. Named rather than expanded into more lists of people: the
   * org chart is the view for reading a team out in full, and this is one line
   * saying where else to look.
   */
  alsoLeads: Team[];
}

/**
 * Find one person and everything around them, or null when the directory this
 * viewer was given holds nobody at that address.
 *
 * Null is a real answer rather than a failure. An ordinary user's directory is
 * built from profiles, so somebody invited but never signed in — and anybody
 * suspended — is genuinely absent from it, and the page says so instead of
 * pretending the link is broken.
 */
export function buildPersonProfile(
  email: string,
  people: DirectoryPerson[],
  teams: Team[],
  sites: Site[],
): PersonProfile | null {
  const key    = normalizeEmail(email);
  const person = people.find((p) => normalizeEmail(p.email) === key);
  if (!person) return null;

  const team = person.teamId ? teams.find((t) => t.id === person.teamId) ?? null : null;
  const site = person.siteId ? sites.find((s) => s.id === person.siteId) ?? null : null;

  // Resolved against the whole directory, the same as the org chart does it: a
  // team's lead is still its lead when they are somebody this page is not
  // otherwise showing.
  const teamLead = team ? findTeamLead(team, people) : null;
  const isLead   = teamLead !== null && normalizeEmail(teamLead.email) === key;

  const teammates = team
    ? people.filter(
        (p) =>
          p.teamId === team.id
          && normalizeEmail(p.email) !== key
          // The lead is shown above rather than in the list — except when this
          // person is the lead, in which case there is nobody above and their
          // reports are the whole list.
          && (isLead || normalizeEmail(p.email) !== normalizeEmail(teamLead?.email ?? '')),
      )
    : [];

  return {
    person,
    site,
    team,
    lead:  isLead ? null : teamLead,
    isLead,
    teammates,
    alsoLeads: teams
      .filter((t) => t.id !== team?.id && findTeamLead(t, people)?.email === person.email)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
