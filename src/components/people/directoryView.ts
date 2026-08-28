import type { DirectoryPerson } from '@/lib/directory';

/**
 * What both directory views are handed.
 *
 * The two views — cards and list — show the same people and differ only in
 * shape, so they take the same props and the page can swap one for the other
 * without knowing anything about either. Searching, filtering and the office
 * and team lookups all stay on the page: they are the same work whichever view
 * is on screen, and doing them twice would let the two drift.
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
 * The list view takes two things the cards do not: clicking an office or a
 * team in a column filters the page down to it.
 *
 * Only those two columns are offered, because they are the only ones where the
 * same value repeats down the list. Filtering to one extension or one email
 * address would leave exactly one row on screen — the person you were already
 * looking at.
 */
export interface DirectoryTableProps extends DirectoryViewProps {
  /** What is filtered now: 'all', 'none' for unassigned, or an id. */
  siteFilter: string;
  teamFilter: string;
  /** Called with the id in the row that was clicked. The page decides what
   *  that means — clicking the office already filtered on clears it. */
  onFilterSite: (id: string) => void;
  onFilterTeam: (id: string) => void;
}
