import { findTeamLead, type Team } from '@/types/team';
import type { DirectoryPerson } from './directory';

/**
 * The directory rearranged into the reporting chart: one group per team, the
 * lead at the top of it, everyone else underneath.
 *
 * There is no new data behind this and no new field on anybody. A team already
 * names its lead (`leadUid`, or `leadEmail` while that person has never signed
 * in) and everybody already carries the team they sit on, which is the whole
 * of the org chart this company has — see the note at the top of
 * types/team.ts. All this does is turn "each person has a team" round into
 * "each team has people", which is the direction the question is asked in.
 *
 * **The chart is one level deep on purpose.** Everyone on a team reports to
 * that team's lead, full stop; there is no notion of a team sitting under
 * another team. The one place a second level shows through is `leadReportsTo`
 * below, and it is read off the lead's own team rather than invented here.
 *
 * Like the sorting beside it, this is shaping rather than fetching: the page
 * has already loaded the people and the teams, and hands both over.
 */

export interface OrgGroup {
  /** The team, or null for the trailing "no team set" group. */
  team: Team | null;
  /**
   * Who the team reports to, resolved against the **whole** directory rather
   * than the filtered list — a team's lead is still its lead when a search or
   * an office filter has hidden them, and blanking the name would make the
   * team read as leaderless when it is not. `leadFiltered` says which of the
   * two happened so the view can label it.
   */
  lead: DirectoryPerson | null;
  /** True when the lead is only shown because of the rule above: they are not
   *  in the filtered list the rest of this group is drawn from. */
  leadFiltered: boolean;
  /** Everyone else on the team, in the order the page handed them over —
   *  name order. The lead is never repeated here. */
  members: DirectoryPerson[];
  /**
   * The second level: the team the lead themselves sits on, when it is not
   * this one, and that team's lead.
   *
   * Exactly one hop. A chart deep enough to need walking is a chart that can
   * contain a loop — two leads each sitting on the other's team is a perfectly
   * ordinary way to set this data up, and a walk would hang on it. One hop
   * answers "and who does she report to?", which is the only follow-up this
   * view gets asked.
   */
  leadReportsTo: { team: Team; lead: DirectoryPerson | null } | null;
}

/**
 * Build the chart.
 *
 * `visible` is the filtered and searched list — what the other two views draw.
 * `all` is the unfiltered one, used only to put a name to a lead. `teams` is
 * every team, so a team can appear in the chart in name order rather than in
 * whatever order its first member turned up.
 *
 * With nothing filtering, every team appears, empty ones included — an org
 * chart is one of the few places where "this team has nobody on it" is the
 * answer somebody wants. Once a search or a filter is on, a team appears only
 * while it still has somebody on screen.
 */
export function buildOrgChart(
  visible: DirectoryPerson[],
  all: DirectoryPerson[],
  teams: Team[],
): OrgGroup[] {
  const shown = new Set(visible.map((p) => p.email));
  // Whether anything is narrowing the list at all, which decides how empty a
  // team is allowed to be and still be drawn — see the skip below.
  const unfiltered = visible.length === all.length;

  // Everybody's team, by id, so a team that has been deleted out from under a
  // profile does not silently swallow the people still pointing at it — they
  // fall through to the "no team set" group below, where at least they are
  // visible and someone can fix it.
  const known = new Map(teams.map((t) => [t.id, t] as const));

  const byTeam = new Map<string, DirectoryPerson[]>();
  const noTeam: DirectoryPerson[] = [];
  for (const p of visible) {
    const team = p.teamId ? known.get(p.teamId) : undefined;
    if (!team) { noTeam.push(p); continue; }
    const list = byTeam.get(team.id);
    if (list) list.push(p);
    else byTeam.set(team.id, [p]);
  }

  const groups: OrgGroup[] = [];

  for (const team of [...teams].sort((a, b) => a.name.localeCompare(b.name))) {
    const lead = findTeamLead(team, all);
    const members = (byTeam.get(team.id) ?? []).filter((p) => p.email !== lead?.email);
    const leadShown = lead ? shown.has(lead.email) : false;

    // Emptied by the filter — which is not the same as "a team with nobody on
    // it". An empty team is worth drawing, because "this team has no one on it
    // and no lead named" is exactly the thing an org chart is opened to find;
    // a team whose people are merely hidden by the current search is noise
    // between the ones being looked at.
    if (members.length === 0 && !leadShown && !unfiltered) continue;

    // The lead's own team, when it is somebody else's. A lead sitting on the
    // team they lead is the ordinary case and has nothing further to say.
    const above = lead?.teamId && lead.teamId !== team.id ? known.get(lead.teamId) : undefined;

    groups.push({
      team,
      lead,
      leadFiltered: lead !== null && !leadShown,
      members,
      leadReportsTo: above ? { team: above, lead: findTeamLead(above, all) } : null,
    });
  }

  // Always last, and only when there is somebody in it. This is the group the
  // chart exists to shrink: everyone here is unplaced, and the fix is a team
  // in Settings rather than anything on this page.
  if (noTeam.length > 0) {
    groups.push({ team: null, lead: null, leadFiltered: false, members: noTeam, leadReportsTo: null });
  }

  return groups;
}
