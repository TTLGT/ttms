import type { DirectoryPerson } from '@/lib/directory';
import type { DirectoryColumn } from '@/lib/directoryColumns';
import type { SortDir, SortKey } from '@/lib/directorySort';
import type { Team } from '@/types/team';

/**
 * What every directory view is handed.
 *
 * The three views — cards, list and org chart — show the same people and
 * differ only in shape, so they share these props and the page can swap one
 * for another without knowing anything about any of them. Searching, filtering
 * and the office and team lookups all stay on the page: they are the same work
 * whichever view is on screen, and doing them three times would let them
 * drift.
 */
export interface DirectoryViewProps {
  people: DirectoryPerson[];
  /** Office and team names, resolved by the page — it loads both lists once. */
  siteName: (id: string | null | undefined) => string | null;
  teamName: (id: string | null | undefined) => string | null;
  /**
   * The admin and HR view: the second phone number, the payroll fields, and
   * whether an account is pending or suspended. Decided by the page, applied
   * the same way by both views so a field cannot appear in one and not the
   * other.
   *
   * This flag decides what is *drawn*, and is not what keeps the payroll
   * fields private — lib/directory.ts never loads them for anyone else, so
   * they are absent rather than hidden. Read the note at the top of that file
   * before treating this as a guard.
   */
  full: boolean;
}

/**
 * The list view takes three things the cards do not: clicking an office or a
 * team in a column filters the page down to it, the headings sort, and the
 * columns themselves can be switched off.
 *
 * Only those two columns can be filtered on, because they are the only ones
 * where the same value repeats down the list. Filtering to one extension or
 * one email address would leave exactly one row on screen — the person you
 * were already looking at.
 */
export interface DirectoryTableProps extends DirectoryViewProps {
  /**
   * The columns to draw, in order, already narrowed twice by the page: to what
   * this viewer may see, and then to what they have left switched on in the
   * picker. The table draws these and nothing else — see
   * lib/directoryColumns.ts for what the list can hold and why `full` alone no
   * longer decides it.
   */
  columns: DirectoryColumn[];
  /** What is filtered now: 'all', 'none' for unassigned, or an id. */
  siteFilter: string;
  teamFilter: string;
  /** Called with the id in the row that was clicked. The page decides what
   *  that means — clicking the office already filtered on clears it. */
  onFilterSite: (id: string) => void;
  onFilterTeam: (id: string) => void;
  /**
   * Which column the list is ordered by, and which way round. The rows arrive
   * already in that order — the table draws the arrow and reports the click,
   * and never sorts anything itself, so the count above the table and the
   * order inside it always describe the same list.
   */
  sortKey: SortKey;
  sortDir: SortDir;
  /** Called with the column whose heading was clicked. Clicking the column
   *  already sorted on reverses it; any other column starts ascending. */
  onSort: (key: SortKey) => void;
}

/**
 * The org chart takes the teams themselves, which neither other view needs:
 * cards and list only ever put a team's *name* next to a person, and the page
 * hands them `teamName` for that. This view is drawn team-first, so it needs
 * the leads and the ids as well.
 *
 * It also takes the unfiltered list beside the filtered one. A team's lead is
 * still its lead when a search has hidden them, and a chart that blanked the
 * name would say the team is leaderless — see the note on OrgGroup.
 */
export interface DirectoryOrgProps extends DirectoryViewProps {
  /** Every team, so the chart can be drawn in team order. */
  teams: Team[];
  /** Everyone the viewer may see, before the search and the two filters. */
  allPeople: DirectoryPerson[];
  /** Which team is filtered now: 'all', 'none' for unassigned, or an id.
   *  Clicking a team's heading filters down to it, the same as clicking the
   *  team in the list view. */
  teamFilter: string;
  onFilterTeam: (id: string) => void;
}
