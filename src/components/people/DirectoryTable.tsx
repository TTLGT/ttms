'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { otherPhone, telHref } from '@/lib/phone';
import { useDateFormatters } from '@/lib/useDateFormatters';
import type { SortKey } from '@/lib/directorySort';
import { UserAvatar } from '@/components/settings/UserAvatar';
import type { DirectoryTableProps } from '@/components/people/directoryView';

/**
 * The directory as one line per person — the scanning view.
 *
 * The cards are for finding a colleague you are not sure how to spell; this is
 * for running an eye down a whole office looking for an extension. Everyone
 * fits on a screen or two instead of four, and every field sits in the same
 * column on every row, which is the thing a grid of cards cannot do.
 *
 * The photo stays, at thumbnail size, because it is still what makes a row
 * recognisable at a glance — and it is still clickable to see properly.
 *
 * Every column heading sorts by that column, which the cards cannot offer
 * either. The rows arrive already sorted — see lib/directorySort.ts; this file
 * draws the arrow and reports the click.
 */

/**
 * The columns, in order, each tied to what clicking its heading sorts by.
 *
 * Label and sort key live in the same object so a column cannot end up sorting
 * by its neighbour: adding a column here without deciding what it sorts by is
 * a type error rather than a surprise on screen. The ordering itself is in
 * lib/directorySort.ts — this file only says which column was clicked.
 */
interface Column {
  label: string;
  key: SortKey;
}

const BASE_COLUMNS: Column[] = [
  { label: 'Name',       key: 'name' },
  { label: 'Office',     key: 'site' },
  { label: 'Team',       key: 'team' },
  { label: 'Ext.',       key: 'extension' },
  { label: 'Work phone', key: 'phone' },
];

/** Admin and HR only, matching the cells further down. */
const FULL_COLUMNS: Column[] = [
  { label: 'Other phone',   key: 'other' },
  { label: 'Start date',    key: 'startDate' },
  { label: 'Date of birth', key: 'dateOfBirth' },
];

const EMAIL_COLUMN: Column = { label: 'Email', key: 'email' };

/** An empty cell reads as a blank, not as a broken one. */
function Blank() {
  return <span className="text-gray-300">—</span>;
}

/**
 * An office or a team, clickable to filter the page down to it.
 *
 * A button rather than a link: this changes what is on screen, it does not go
 * anywhere. Clicking the value already filtered on clears the filter, so the
 * same cell is both the way in and the way back out — which is why the tooltip
 * has to say which of the two a click will do.
 */
function FilterCell({
  label, active, onClick,
}: {
  label: string | null;
  active: boolean;
  onClick: () => void;
}) {
  if (!label) return <Blank />;

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={active ? `Showing only ${label} — click to show everyone` : `Show only ${label}`}
      className={`rounded text-left hover:underline ${
        active ? 'font-medium text-brand-700' : 'text-gray-600 hover:text-brand-700'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * A heading that sorts the list by its own column.
 *
 * The arrow only shows on the column actually in use, plus a faint one under
 * the pointer, so the header row stays a header row rather than nine arrows —
 * but every heading is a real button, so it is obvious there is something to
 * click once you are anywhere near one.
 */
function SortHeader({
  column, active, dir, onSort,
}: {
  column: Column;
  active: boolean;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const Arrow = active && dir === 'desc' ? ArrowDown : ArrowUp;

  return (
    <th
      scope="col"
      // Read out by screen readers, and the only thing that says which way
      // round the list is without seeing the arrow.
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="whitespace-nowrap p-0 text-left"
    >
      <button
        onClick={() => onSort(column.key)}
        title={active ? 'Click to reverse the order' : `Sort by ${column.label.toLowerCase()}`}
        className={`group flex w-full items-center gap-1 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition hover:bg-gray-100 ${
          active ? 'text-brand-700' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {column.label}
        <Arrow
          size={12}
          className={active ? '' : 'opacity-0 transition-opacity group-hover:opacity-40'}
        />
      </button>
    </th>
  );
}

export default function DirectoryTable({
  people, siteName, teamName, full, siteFilter, teamFilter, onFilterSite, onFilterTeam,
  sortKey, sortDir, onSort,
}: DirectoryTableProps) {
  // Dates are shown in whatever format the company has set, like every other
  // date in the app — never a format this file picks for itself.
  const { formatCalendarDate } = useDateFormatters();

  // The second number and the payroll dates are admin and HR only, so those
  // columns come and go with the view rather than standing empty for everyone
  // else. Legal name and personal email are not columns of their own: they sit
  // under the name and the address they belong with, which keeps the table
  // narrow enough to read.
  const columns = [...BASE_COLUMNS, ...(full ? FULL_COLUMNS : []), EMAIL_COLUMN];

  return (
    /* The table is wider than a laptop screen once the admin columns are on
       it, so it scrolls inside its own box — the page itself never does. */
    <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <SortHeader
                key={c.key}
                column={c}
                active={sortKey === c.key}
                dir={sortDir}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {people.map((p) => {
            const other = otherPhone(p);
            const site  = siteName(p.siteId);
            const team  = teamName(p.teamId);
            // Only worth a line when it is not simply the name again — most
            // people's legal name is what everyone already calls them.
            const legal =
              full && p.legalName && p.legalName.trim() !== p.displayName
                ? p.legalName.trim()
                : '';

            return (
              <tr
                key={p.email}
                className={p.suspended ? 'bg-red-50/50' : 'transition hover:bg-gray-50'}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar
                      photoPath={p.photoPath}
                      fallback={p.displayName.charAt(0).toUpperCase()}
                      muted={p.suspended}
                      size={32}
                      expandable
                      name={p.displayName}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {p.displayName}
                      </div>
                      {legal && (
                        <div className="truncate text-[11px] text-gray-500">{legal}</div>
                      )}
                      {/* Same rule as the cards: account status is not
                          directory information, and shows only for the two
                          roles who can act on it. */}
                      {full && (p.pending || p.suspended) && (
                        <div
                          className={`text-[11px] font-medium ${
                            p.suspended ? 'text-red-600' : 'text-amber-600'
                          }`}
                        >
                          {p.suspended ? 'Suspended' : 'Not signed in yet'}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                <td className="px-4 py-2.5 text-sm">
                  <FilterCell
                    label={site}
                    active={siteFilter === p.siteId}
                    onClick={() => onFilterSite(p.siteId ?? '')}
                  />
                </td>

                {/* Unprefixed here, unlike on a card: the column heading
                    already says these are teams. */}
                <td className="px-4 py-2.5 text-sm">
                  <FilterCell
                    label={team}
                    active={teamFilter === p.teamId}
                    onClick={() => onFilterTeam(p.teamId ?? '')}
                  />
                </td>

                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                  {p.extension || <Blank />}
                </td>

                <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                  {p.phone ? (
                    <a
                      href={telHref(p.phone, 'US')}
                      className="text-gray-600 hover:text-brand-700 hover:underline"
                    >
                      {p.phone}
                    </a>
                  ) : (
                    <Blank />
                  )}
                </td>

                {full && (
                  <>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                      {other.value ? (
                        <a
                          href={telHref(other.value, other.region)}
                          className="text-gray-600 hover:text-brand-700 hover:underline"
                        >
                          {other.region} {other.value}
                        </a>
                      ) : (
                        <Blank />
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                      {formatCalendarDate(p.startDate) || <Blank />}
                    </td>

                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                      {formatCalendarDate(p.dateOfBirth) || <Blank />}
                    </td>
                  </>
                )}

                <td className="px-4 py-2.5 text-sm">
                  <a
                    href={`mailto:${p.email}`}
                    className="text-gray-600 hover:text-brand-700 hover:underline"
                  >
                    {p.email}
                  </a>
                  {/* The personal address sits under the company one rather
                      than in a column of its own, and is labelled, because the
                      two are only ever told apart by which is which. */}
                  {full && p.personalEmail && (
                    <div className="text-[11px] text-gray-500">
                      Personal:{' '}
                      <a
                        href={`mailto:${p.personalEmail}`}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {p.personalEmail}
                      </a>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
