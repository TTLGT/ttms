import { findTeamLead, type Team } from '@/types/team';
import { normalizeEmail } from './accessControl';
import type { DirectoryPerson } from './directory';
import type { Site } from '@/types/site';
import { groupMemberCount, isGroupMember, type WorkGroup } from '@/types/workGroup';

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
 *
 * The `@` is put back after encoding. It is legal in a path segment, and this
 * address exists to be pasted into a message — `erwin%40totaltransportlogistics.us`
 * is the same link and reads like a mistake. Everything else stays escaped.
 */
export function personHref(email: string): string {
  return `/dashboard/directory/${encodeURIComponent(normalizeEmail(email)).replace(/%40/g, '@')}`;
}

/**
 * The address back out of the URL, for the page that reads it.
 *
 * **`useParams()` does not decode.** It hands back the segment exactly as it
 * sits in the address bar, where a server component's `params` prop would have
 * been decoded already — so a link written by `personHref` above arrives with
 * any escape still in it, and matching on it finds nobody. That is not obvious
 * from the calling code, which is why the decode lives next to the encode
 * rather than in the page.
 *
 * A segment that decodes to nothing sensible is used as it stands: a stray `%`
 * is not a valid escape and throws, and "no such person" is a better answer
 * than a page that fails to render at all.
 */
export function personEmailFromParam(param: string | string[] | undefined): string {
  const raw = typeof param === 'string' ? param : '';
  try {
    return normalizeEmail(decodeURIComponent(raw));
  } catch {
    return normalizeEmail(raw);
  }
}

/**
 * One work group this person is in, with the colleagues it is shared with.
 *
 * The group is the answer to "why can this person see that client, and I
 * cannot" — a record owned by a group is visible to everyone in it and to
 * nobody else. Until now that answer lived only in Settings, several clicks
 * away from the person being asked about.
 *
 * `others` is who else is in it, resolved against the directory the viewer was
 * already given. `unnamed` is how many members that lookup could not put a
 * name to: dispatch reads the directory from profiles, so a suspended
 * colleague is a member they cannot name. Counted rather than dropped —
 * understating who can see a group's records is the one mistake this panel
 * must not make — and left unnamed rather than guessed at, because whether an
 * account is suspended is admin and HR's business, not dispatch's.
 */
export interface PersonGroup {
  group: WorkGroup;
  others: DirectoryPerson[];
  unnamed: number;
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
  /**
   * The work groups they belong to, name-ordered — empty for a viewer who was
   * not handed any, which is everyone but admin and dispatch. See the note on
   * the `groups` parameter below.
   */
  groups: PersonGroup[];
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
  /**
   * Every work group in the company, for the panel that says which ones this
   * person is in. Defaults to none, and none is what a viewer without
   * `ownership.change` is handed — see the page.
   *
   * That gate is editorial, not a boundary. `GET /api/work-groups` answers any
   * signed-in user, because every owner picker in the app needs the names, so
   * this is a decision about what is *useful* on a phone-book page rather than
   * about what could be found out — the same kind of call as the second phone
   * number in lib/directory.ts. Do not put anything genuinely private behind
   * it.
   */
  groups: WorkGroup[] = [],
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

  // Name order, so the panel reads the same way twice running: a group's
  // position must not depend on whether its members happen to have signed in.
  const personGroups: PersonGroup[] = groups
    .filter((g) => isGroupMember(g, person))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => {
      const others = people.filter(
        (p) => normalizeEmail(p.email) !== key && isGroupMember(group, p),
      );
      return {
        group,
        others,
        // Everyone in the group, less this person, less the ones just named.
        unnamed: Math.max(0, groupMemberCount(group) - 1 - others.length),
      };
    });

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
    groups: personGroups,
  };
}
