import type { SortKey } from './directorySort';

/**
 * Which columns the directory list offers, and which of them are switched off.
 *
 * This lives beside the sorting rather than inside the table for the same
 * reason that does: the page owns what is on screen — who is listed, in what
 * order — and which columns are drawn is the same kind of decision. The table
 * renders what it is handed and says which heading was clicked; everything
 * about what is available and what is hidden is here.
 *
 * A column is identified by the key it sorts on. There is exactly one column
 * per sort key and one sort key per column, so a hidden column can never leave
 * the list ordered by a heading nobody can see — the page checks for that case
 * and puts the order back to name.
 */

export interface DirectoryColumn {
  label: string;
  key: SortKey;
  /**
   * Admin and HR only. This is the single place that decision is made: the
   * table draws whatever columns it is given, so a payroll column cannot end
   * up in the header row without its cells, or the other way round.
   *
   * It decides what is *drawn*, and is not what keeps those fields private —
   * lib/directory.ts never loads them for anyone else. Read the note at the
   * top of that file before treating this as a guard.
   */
  full?: boolean;
  /** Cannot be switched off — see PICKABLE_COLUMNS below. */
  alwaysOn?: boolean;
}

/**
 * Every column, in the order it appears across the table.
 *
 * Label and sort key live in the same object so a column cannot end up sorting
 * by its neighbour: adding one here without deciding what it sorts by is a
 * type error rather than a surprise on screen.
 */
export const DIRECTORY_COLUMNS: DirectoryColumn[] = [
  // Name is always on. A row with no name is not a row anyone could use — the
  // photo and the address hang off it, and a list of extensions belonging to
  // nobody would be worse than no list.
  { label: 'Name',          key: 'name',        alwaysOn: true },
  { label: 'Office',        key: 'site' },
  { label: 'Team',          key: 'team' },
  { label: 'Ext.',          key: 'extension' },
  { label: 'Work phone',    key: 'phone' },
  { label: 'Other phone',   key: 'other',       full: true },
  { label: 'Start date',    key: 'startDate',   full: true },
  { label: 'Date of birth', key: 'dateOfBirth', full: true },
  { label: 'Email',         key: 'email' },
];

/** The columns this viewer could see, hidden or not. */
export function availableColumns(full: boolean): DirectoryColumn[] {
  return DIRECTORY_COLUMNS.filter((c) => full || !c.full);
}

/** The columns actually drawn: what they can see, minus what they switched off. */
export function visibleColumns(full: boolean, hidden: Set<SortKey>): DirectoryColumn[] {
  return availableColumns(full).filter((c) => c.alwaysOn || !hidden.has(c.key));
}

/** The columns the picker offers, which is every one that can be switched off. */
export function pickableColumns(full: boolean): DirectoryColumn[] {
  return availableColumns(full).filter((c) => !c.alwaysOn);
}

/**
 * The hidden columns as they travel in the URL — `?hide=other,dateOfBirth`.
 *
 * The *hidden* ones rather than the shown ones, so that the plain page keeps
 * meaning what it means today: no parameter is the full table, which is also
 * how the view, the filters and the sort behave. It has the second advantage
 * that a column added later shows up for everyone by default, instead of
 * staying invisible to whoever has an older link saved.
 */
export function parseHiddenColumns(param: string | null | undefined): Set<SortKey> {
  const keys = (param ?? '')
    .split(',')
    .map((s) => s.trim())
    // Anything unrecognised is dropped rather than blanking the table, and
    // `name` is dropped even when it is spelled correctly: it is not the
    // picker's to switch off, and a hand-typed URL does not get to either.
    .filter((s): s is SortKey =>
      DIRECTORY_COLUMNS.some((c) => c.key === s && !c.alwaysOn));

  return new Set(keys);
}

/**
 * Back into a parameter value, always in table order, so that switching the
 * same two columns off in either order produces the same link — the URL is
 * something people paste to each other, and two spellings of one view would
 * make the same list look like two.
 *
 * Empty string when nothing is hidden, which is the value the page treats as
 * the default and leaves out of the address bar entirely.
 */
export function serializeHiddenColumns(hidden: Set<SortKey>): string {
  return DIRECTORY_COLUMNS.filter((c) => !c.alwaysOn && hidden.has(c.key))
    .map((c) => c.key)
    .join(',');
}
