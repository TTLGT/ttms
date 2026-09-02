import type { DirectoryPerson } from './directory';

/**
 * How the printed extension sheet is put together — what it is grouped by,
 * what order the people come in, and which columns it carries.
 *
 * These live here rather than inside the sheet component because they are
 * decided in one place (the dialog) and applied in another (the sheet), and
 * because the choice is remembered between prints: the person who prints the
 * dispatch board's list every month should not have to set it up every month.
 *
 * The defaults are the sheet this started as — by team, in name order, one
 * team to a page, three columns. Everything here is a way of saying "not that,
 * this time", so a first-time user who ignores the dialog entirely gets what
 * they would have got before it existed.
 */

export type SheetGroupBy = 'team' | 'site' | 'none';
export type SheetOrder   = 'name' | 'extension';

export interface SheetOptions {
  groupBy: SheetGroupBy;
  order: SheetOrder;
  /** Start each group on a fresh page. Meaningless when nothing is grouped. */
  pageBreak: boolean;
  /** Columns beside the name, the extension and the work line. */
  showOffice: boolean;
  showTeam: boolean;
  showRole: boolean;
  /** The company email address. Off by default — see the note in the dialog. */
  showEmail: boolean;
}

export const DEFAULT_SHEET_OPTIONS: SheetOptions = {
  groupBy: 'team',
  order: 'name',
  pageBreak: true,
  showOffice: false,
  showTeam: false,
  showRole: false,
  showEmail: false,
};

/** The headings over people who have not been given a team or an office yet. */
export const NO_TEAM_HEADING = 'No team set';
export const NO_SITE_HEADING = 'No office set';
/** What the single group is called when the sheet is not grouped at all. */
export const UNGROUPED_HEADING = 'Extension list';

// ── Remembering the choice ───────────────────────────────────────────────────

const STORAGE_KEY = 'ttms.extensionSheet';

/**
 * The last set-up this browser used.
 *
 * Per browser rather than per account, and deliberately: this is a preference
 * about a piece of paper, not about a person. Storing it on the profile would
 * mean a write to Firestore every time somebody ticked a box, and a sheet
 * printed from the front desk's shared machine should come out the way that
 * machine last printed it.
 *
 * Every field is checked on the way back in. A value left over from an older
 * version of this file — a grouping that no longer exists — falls back to its
 * default rather than producing a sheet grouped by nothing.
 */
export function loadSheetOptions(): SheetOptions {
  if (typeof window === 'undefined') return DEFAULT_SHEET_OPTIONS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHEET_OPTIONS;
    const saved = JSON.parse(raw) as Partial<SheetOptions>;
    return {
      groupBy: saved.groupBy === 'site' || saved.groupBy === 'none' || saved.groupBy === 'team'
        ? saved.groupBy : DEFAULT_SHEET_OPTIONS.groupBy,
      order: saved.order === 'extension' || saved.order === 'name'
        ? saved.order : DEFAULT_SHEET_OPTIONS.order,
      pageBreak:  typeof saved.pageBreak  === 'boolean' ? saved.pageBreak  : DEFAULT_SHEET_OPTIONS.pageBreak,
      showOffice: typeof saved.showOffice === 'boolean' ? saved.showOffice : DEFAULT_SHEET_OPTIONS.showOffice,
      showTeam:   typeof saved.showTeam   === 'boolean' ? saved.showTeam   : DEFAULT_SHEET_OPTIONS.showTeam,
      showRole:   typeof saved.showRole   === 'boolean' ? saved.showRole   : DEFAULT_SHEET_OPTIONS.showRole,
      showEmail:  typeof saved.showEmail  === 'boolean' ? saved.showEmail  : DEFAULT_SHEET_OPTIONS.showEmail,
    };
  } catch {
    // Private browsing, storage switched off, or something that is not JSON.
    // A sheet in the default shape is a fine answer to all three.
    return DEFAULT_SHEET_OPTIONS;
  }
}

export function saveSheetOptions(options: SheetOptions): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Not worth telling anybody about: the sheet still prints, it just will
    // not remember how next time.
  }
}

// ── Ordering ─────────────────────────────────────────────────────────────────

/**
 * Extensions in the order somebody reading down a phone list expects: 101,
 * 102, 110 — not 101, 110, 102, which is what comparing them as text gives.
 *
 * People with no extension go to the bottom whichever way round the list is.
 * They are the ones the sheet has nothing to say about, and a list of
 * extensions that opens with four blanks looks like it failed to load.
 */
function byExtension(a: DirectoryPerson, b: DirectoryPerson): number {
  const ax = (a.extension ?? '').trim();
  const bx = (b.extension ?? '').trim();
  if (!ax && !bx) return a.displayName.localeCompare(b.displayName);
  if (!ax) return 1;
  if (!bx) return -1;

  const an = Number(ax);
  const bn = Number(bx);
  // Numeric only when both really are numbers. An extension written "2-1140"
  // or "x220" compares as text, which at least keeps it beside its neighbours.
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return ax.localeCompare(bx, undefined, { numeric: true });
}

function sortPeople(people: DirectoryPerson[], order: SheetOrder): DirectoryPerson[] {
  // Copied before sorting: `people` is the page's list, and sorting in place
  // would silently reorder what is on screen behind the print dialog.
  const copy = [...people];
  return order === 'extension'
    ? copy.sort(byExtension)
    : copy.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.email.localeCompare(b.email));
}

// ── Grouping ─────────────────────────────────────────────────────────────────

export interface SheetGroup {
  /** Null for the leftovers — no team, no office — and for no grouping. */
  id: string | null;
  /** What the heading says. */
  name: string;
  people: DirectoryPerson[];
}

/**
 * The people, in the shape the sheet prints them.
 *
 * Groups come out alphabetically with the unassigned one last, wherever its
 * heading would otherwise sort — a sheet is read down from a team or an office
 * name, and "no team" is the leftovers rather than a team called N.
 *
 * A team or office whose name has not loaded yet falls back to its id rather
 * than to a blank heading: an unlabelled block of extensions is worse than an
 * ugly label, because the reader cannot tell whose they are.
 */
export function sheetGroups(
  people: DirectoryPerson[],
  options: SheetOptions,
  names: {
    siteName: (id: string | null | undefined) => string | null;
    teamName: (id: string | null | undefined) => string | null;
  },
): SheetGroup[] {
  const sorted = sortPeople(people, options.order);

  if (options.groupBy === 'none') {
    return [{ id: null, name: UNGROUPED_HEADING, people: sorted }];
  }

  const byTeam  = options.groupBy === 'team';
  const resolve = byTeam ? names.teamName : names.siteName;
  const fallback = byTeam ? NO_TEAM_HEADING : NO_SITE_HEADING;

  const groups = new Map<string, SheetGroup>();
  for (const person of sorted) {
    const id  = (byTeam ? person.teamId : person.siteId) ?? null;
    const key = id ?? '';
    let group = groups.get(key);
    if (!group) {
      group = { id, name: id ? (resolve(id) ?? id) : fallback, people: [] };
      groups.set(key, group);
    }
    // Pushed in the order they arrive, so each group keeps the order chosen
    // above rather than one decided twice in two places.
    group.people.push(person);
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.id) return 1;
    if (!b.id) return -1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * How many pages this will come out as, near enough, for the dialog to say so
 * before anybody presses print.
 *
 * A guess, not a promise: it assumes about 40 rows to a page, which is right
 * for the three-column sheet at this type size and roughly right for the wide
 * one. The point is to catch the mistake worth catching — "one team to a page"
 * left on while printing the whole company, which is eleven sheets of paper
 * nobody meant to use.
 */
export const ROWS_PER_PAGE = 40;

export function estimatePages(groups: SheetGroup[], options: SheetOptions): number {
  if (options.groupBy !== 'none' && options.pageBreak) {
    return groups.reduce((n, g) => n + Math.max(1, Math.ceil(g.people.length / ROWS_PER_PAGE)), 0);
  }
  // Running on, the headings still take room, but not enough to be worth
  // pretending this is exact.
  const rows = groups.reduce((n, g) => n + g.people.length + 1, 0);
  return Math.max(1, Math.ceil(rows / ROWS_PER_PAGE));
}
