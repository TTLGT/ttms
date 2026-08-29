import type { DirectoryPerson } from './directory';
import { otherPhone } from './phone';

/**
 * Ordering the directory list by one of its columns.
 *
 * This lives beside the directory rather than inside the table because the
 * page owns *which* people are on screen — it searches and filters them — and
 * the order they are in is the same kind of decision. The table renders the
 * headings and says which one was clicked; everything about what that click
 * means is here, so there is one place to look when a column sorts oddly.
 *
 * Two rules run through all of it:
 *
 * - **Blank cells sink to the bottom, whichever way round the sort is.** Half
 *   the people in the phone book have no second number and no start date, and
 *   an ascending sort that opened with a screen of dashes would hide the very
 *   thing it was asked to show.
 * - **Ties fall back to name, then address, always ascending.** Sorting by
 *   office descending should reverse the offices, not shuffle the people
 *   inside each one — and two colleagues called Maria must not swap places
 *   between loads.
 */

export type SortKey =
  | 'name'
  | 'site'
  | 'team'
  | 'extension'
  | 'phone'
  | 'other'
  | 'startDate'
  | 'dateOfBirth'
  | 'email';

export type SortDir = 'asc' | 'desc';

/** Name, ascending — the order the list has always arrived in. */
export const DEFAULT_SORT_KEY: SortKey = 'name';
export const DEFAULT_SORT_DIR: SortDir = 'asc';

const SORT_KEYS: SortKey[] = [
  'name', 'site', 'team', 'extension', 'phone',
  'other', 'startDate', 'dateOfBirth', 'email',
];

/** Guards the two values coming out of the URL, where anyone can type them. */
export function isSortKey(value: string | null | undefined): value is SortKey {
  return !!value && (SORT_KEYS as string[]).includes(value);
}

export function isSortDir(value: string | null | undefined): value is SortDir {
  return value === 'asc' || value === 'desc';
}

/** The office and team names, which only the page can resolve. */
export interface SortNames {
  siteName: (id: string | null | undefined) => string | null;
  teamName: (id: string | null | undefined) => string | null;
}

/** Digits only, so how a number was punctuated never decides where it sorts. */
function digits(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/**
 * What a column is worth for the purpose of ordering: a number where the
 * column is counted, a string where it is read, and null for empty.
 */
function sortValue(
  p: DirectoryPerson,
  key: SortKey,
  names: SortNames,
): string | number | null {
  switch (key) {
    case 'name':
      return p.displayName;

    case 'site':
      return names.siteName(p.siteId);

    case 'team':
      return names.teamName(p.teamId);

    case 'extension': {
      // Extensions are counted, not spelled: 9 belongs before 10, where a
      // letter sort would put it after 100. Anything with a character in it
      // is left as text rather than guessed at.
      const raw = (p.extension ?? '').trim();
      if (!raw) return null;
      return /^\d+$/.test(raw) ? Number(raw) : raw;
    }

    case 'phone':
      return digits(p.phone) || null;

    case 'other': {
      // Country first, then the number, which is also how the cell reads.
      const other = otherPhone(p);
      return other.value ? `${other.region} ${digits(other.value)}` : null;
    }

    // Both dates are stored as YYYY-MM-DD, so ordering them as text is
    // ordering them by date. Nothing here needs to parse them.
    case 'startDate':
      return p.startDate || null;

    case 'dateOfBirth':
      return p.dateOfBirth || null;

    case 'email':
      return p.email;
  }
}

/** The last word in every comparison — see the note at the top of the file. */
function byName(a: DirectoryPerson, b: DirectoryPerson): number {
  return a.displayName.localeCompare(b.displayName) || a.email.localeCompare(b.email);
}

/**
 * A copy of `people` in the requested order. Never sorts in place: the list it
 * is handed is the page's filtered array, and React state is not ours to
 * rearrange.
 *
 * A column the viewer cannot see — a payroll date in a broker's URL — sorts to
 * nothing rather than erroring: every value is absent, so every row ties and
 * the list falls back to name order.
 */
export function sortDirectory(
  people: DirectoryPerson[],
  key: SortKey,
  dir: SortDir,
  names: SortNames,
): DirectoryPerson[] {
  const sign = dir === 'desc' ? -1 : 1;

  return [...people].sort((a, b) => {
    const av = sortValue(a, key, names);
    const bv = sortValue(b, key, names);

    // Deliberately outside the direction flip below: blanks stay at the
    // bottom of both orders.
    if (av === null || bv === null) {
      if (av === bv) return byName(a, b);
      return av === null ? 1 : -1;
    }

    const cmp =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        // `numeric` so a "Suite 2" office lands before "Suite 10", and base
        // sensitivity so a capital letter is not its own group.
        : String(av).localeCompare(String(bv), undefined, {
            numeric: true,
            sensitivity: 'base',
          });

    return cmp ? cmp * sign : byName(a, b);
  });
}
