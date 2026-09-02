'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { otherPhone, telHref } from '@/lib/phone';
import { useDateFormatters } from '@/lib/useDateFormatters';
import type { SortKey } from '@/lib/directorySort';
import type { DirectoryColumn } from '@/lib/directoryColumns';
import { UserAvatar } from '@/components/settings/UserAvatar';
import MessagePersonButton from '@/components/chat/MessagePersonButton';
import RoleBadges from '@/components/people/RoleBadges';
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
 *
 * **Which columns exist is not decided here.** The page hands over the list —
 * narrowed to what the viewer may see, then to what they have switched on in
 * the picker — and everything below draws exactly that. See
 * lib/directoryColumns.ts. Each row builds a cell for every column key, so a
 * heading can never end up over the wrong values, or over none at all.
 */

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
  column: DirectoryColumn;
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
  people, siteName, teamName, full, columns,
  siteFilter, teamFilter, onFilterSite, onFilterTeam,
  sortKey, sortDir, onSort,
}: DirectoryTableProps) {
  // Dates are shown in whatever format the company has set, like every other
  // date in the app — never a format this file picks for itself.
  const { formatCalendarDate } = useDateFormatters();

  return (
    /* The table can still be wider than a laptop screen with every admin
       column switched on, so it scrolls inside its own box — the page itself
       never does. Switching columns off in the picker is the other way out. */
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

            /**
             * One cell per column key, whichever columns are on screen.
             *
             * Keyed by the column rather than written out as a row, so a
             * column without a cell is a type error. The alternative — a
             * header row and a body row that each decide for themselves what
             * to draw — held together only while nothing could be switched
             * off, and would slide apart by one the first time anything was.
             *
             * The payroll cells are built for every viewer and drawn for
             * nobody but admin and HR: those fields are simply absent from an
             * ordinary viewer's copy of a person, and their columns are absent
             * from `columns`.
             */
            const cells: Record<SortKey, ReactNode> = {
              name: (
                <td key="name" className="px-4 py-2.5">
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
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-900">
                          {p.displayName}
                        </span>
                        {/* Put on the name rather than in a column of its own:
                            the columns are configurable and this is an action,
                            not a field — there is nothing to sort or filter on.
                            Hidden until the row is hovered so it does not
                            compete with the names when scanning an office. */}
                        <span className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                          <MessagePersonButton uid={p.uid} name={p.displayName} label="" iconSize={13} />
                        </span>
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
              ),

              role: (
                <td key="role" className="px-4 py-2.5">
                  <RoleBadges person={p} size="small" />
                </td>
              ),

              site: (
                <td key="site" className="px-4 py-2.5 text-sm">
                  <FilterCell
                    label={site}
                    active={siteFilter === p.siteId}
                    onClick={() => onFilterSite(p.siteId ?? '')}
                  />
                </td>
              ),

              // Unprefixed here, unlike on a card: the column heading already
              // says these are teams.
              team: (
                <td key="team" className="px-4 py-2.5 text-sm">
                  <FilterCell
                    label={team}
                    active={teamFilter === p.teamId}
                    onClick={() => onFilterTeam(p.teamId ?? '')}
                  />
                </td>
              ),

              extension: (
                <td key="extension" className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                  {p.extension || <Blank />}
                </td>
              ),

              phone: (
                <td key="phone" className="whitespace-nowrap px-4 py-2.5 text-sm">
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
              ),

              other: (
                <td key="other" className="whitespace-nowrap px-4 py-2.5 text-sm">
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
              ),

              startDate: (
                <td key="startDate" className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                  {formatCalendarDate(p.startDate) || <Blank />}
                </td>
              ),

              dateOfBirth: (
                <td key="dateOfBirth" className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                  {formatCalendarDate(p.dateOfBirth) || <Blank />}
                </td>
              ),

              email: (
                <td key="email" className="px-4 py-2.5 text-sm">
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
              ),
            };

            return (
              <tr
                key={p.email}
                // `group` so the message button on the name can reveal itself
                // on hover — see the name cell above.
                className={`group ${p.suspended ? 'bg-red-50/50' : 'transition hover:bg-gray-50'}`}
              >
                {columns.map((c) => cells[c.key])}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
