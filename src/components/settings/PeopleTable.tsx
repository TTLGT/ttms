'use client';

import { Fragment, type ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { otherPhone } from '@/lib/phone';
import { useDateFormatters } from '@/lib/useDateFormatters';
import type { SortDir, SortField } from '@/lib/peopleSort';
import type { PeopleCardFieldState } from '@/lib/peopleCardFields';
import { accessStatus, fullName } from '@/types/allowedUser';
import type { AllowedUser, AllowedUserRole } from '@/types/allowedUser';
import { UserAvatar } from '@/components/settings/UserAvatar';
import PersonActions from '@/components/settings/PersonActions';
import PersonRoles from '@/components/settings/PersonRoles';
import StatusChip from '@/components/settings/StatusChip';

/**
 * The access list as one line per person — the auditing view.
 *
 * The cards answer "what do we have on this person"; this answers the question
 * the page exists for, across everybody at once: who is an admin, who has
 * never signed in, who is suspended. Thirty people fit on a screen instead of
 * four, and every value sits in the same column on every row, which is what
 * makes an odd one stand out.
 *
 * Two columns are therefore fixed and cannot be switched off: status and
 * roles. Everything else here is contact or payroll detail and follows the
 * Show picker, exactly as it does on the cards — one preference, both shapes,
 * so a reader who hides birthdays hides them everywhere.
 *
 * The role chips stay live for an admin. That is the point of the view: a role
 * that looks wrong can be fixed in the row where it was spotted, without
 * hunting the same person down in a different shape of the same list.
 */

/** An empty cell reads as a blank, not as a broken one. */
function Blank() {
  return <span className="text-gray-300">—</span>;
}

/** The optional columns, in the order the list draws them. */
const DETAIL_COLUMNS: {
  key: keyof PeopleCardFieldState;
  label: string;
  /** The heading sorts by this, where the list can be ordered by it at all. */
  sort?: SortField;
}[] = [
  { key: 'legalName',     label: 'Legal name' },
  { key: 'email',         label: 'Email',          sort: 'email' },
  { key: 'personalEmail', label: 'Personal email' },
  { key: 'phone',         label: 'Work phone',     sort: 'phone' },
  { key: 'phoneOther',    label: 'Other phone',    sort: 'phoneOther' },
  { key: 'site',          label: 'Office' },
  { key: 'team',          label: 'Team' },
  { key: 'startDate',     label: 'Started',        sort: 'startDate' },
  { key: 'dateOfBirth',   label: 'Born',           sort: 'dateOfBirth' },
];

/**
 * A heading that orders the list by its own column.
 *
 * The arrow shows on the column in use, and faintly under the pointer on the
 * others, so the header row stays a header row rather than a row of arrows.
 * Columns with nothing to order by — status, roles, office, team — are plain
 * headings: sorting by a role is what the Permissions filter above is for.
 */
function Heading({
  label, sort, sortField, sortDir, onSort,
}: {
  label: string;
  sort?: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const active = !!sort && sortField === sort;
  const Arrow  = active && sortDir === 'desc' ? ArrowDown : ArrowUp;

  if (!sort) {
    return (
      <th
        scope="col"
        className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
      >
        {label}
      </th>
    );
  }

  return (
    <th
      scope="col"
      // The only thing that says which way round the list is without seeing
      // the arrow.
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="whitespace-nowrap p-0 text-left"
    >
      <button
        onClick={() => onSort(sort)}
        title={active ? 'Click to reverse the order' : `Sort by ${label.toLowerCase()}`}
        className={`group flex w-full items-center gap-1 px-4 py-3 text-xs font-semibold uppercase tracking-wide transition hover:bg-gray-100 ${
          active ? 'text-brand-700' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}
        <Arrow
          size={12}
          className={active ? '' : 'opacity-0 transition-opacity group-hover:opacity-40'}
        />
      </button>
    </th>
  );
}

export default function PeopleTable({
  people, fields, canEdit, myEmail, isProtectedEmail, busy, editing,
  siteName, teamName, formatWhen, anchorId,
  sortField, sortDir, onSort,
  onMakeBroker, onToggleRole, onEdit, onSuspend, onRevoke, renderEditor,
}: {
  people: AllowedUser[];
  /** Which detail columns the reader has left switched on. */
  fields: PeopleCardFieldState;
  canEdit: boolean;
  /** The reader's own address, already lowercased. */
  myEmail: string;
  isProtectedEmail: (email: string) => boolean;
  busy: string | null;
  /** The email whose editor is open, or null. */
  editing: string | null;
  siteName: (id: string | null | undefined) => string | null;
  teamName: (id: string | null | undefined) => string | null;
  /** "Added" in the company's date format — the page owns the formatters. */
  formatWhen: (person: AllowedUser) => string;
  /** The id the settings search box scrolls to. */
  anchorId: (email: string) => string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onMakeBroker: (person: AllowedUser) => void;
  onToggleRole: (person: AllowedUser, field: AllowedUserRole) => void;
  onEdit: (person: AllowedUser) => void;
  onSuspend: (person: AllowedUser) => void;
  onRevoke: (person: AllowedUser) => void;
  /**
   * The editor, drawn by the page and dropped into a full-width row under the
   * person being edited. It stays on the page because it owns the draft state
   * and every save; the table only decides where it goes, so editing works the
   * same in whichever view the reader happened to be in.
   */
  renderEditor: (person: AllowedUser) => ReactNode;
}) {
  const { formatCalendarDate } = useDateFormatters();

  const columns = DETAIL_COLUMNS.filter(({ key }) => fields[key]);

  /**
   * The Person heading orders by first name, unless the list is already in
   * last-name order — then it stays on last name, so the arrow sits over the
   * column the list is actually sorted by and clicking it reverses that rather
   * than silently switching which half of the name is being used. Both orders
   * are still offered in full by the Sort by dropdown.
   */
  const personSort: SortField = sortField === 'lastName' ? 'lastName' : 'firstName';
  // Person, status, roles, the detail columns, and the buttons where there are
  // any — the number the editor's row has to span.
  const span = 3 + columns.length + (canEdit ? 1 : 0);

  return (
    /* Every detail column switched on is wider than a laptop screen, so the
       table scrolls inside its own box and the page never does. The Show
       picker is the other way out of a table that is too wide. */
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            <Heading label="Person" sort={personSort} sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <Heading label="Status" sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <Heading label="Roles"  sortField={sortField} sortDir={sortDir} onSort={onSort} />
            {columns.map((c) => (
              <Heading
                key={c.key}
                label={c.label}
                sort={c.sort}
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
              />
            ))}
            {canEdit && <th scope="col" className="px-4 py-3" />}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {people.map((p) => {
            const name        = fullName(p);
            const status      = accessStatus(p);
            const suspended   = status === 'suspended';
            const isSelf      = p.email.toLowerCase() === myEmail;
            const isProtected = isProtectedEmail(p.email);
            const other       = otherPhone(p);
            const open        = editing === p.email;
            // Same rule as the cards: a legal name that is the everyday name
            // again is noise, in a column as much as on a card.
            const legal =
              p.legalName && p.legalName.trim().toLowerCase() !== name.trim().toLowerCase()
                ? p.legalName.trim()
                : '';

            /**
             * One cell per detail column, keyed by the same key the picker
             * uses. Built as a map rather than written out as a row so a
             * column can never end up drawn under the wrong heading — the
             * header row and the body row read from the same list.
             */
            const cells: Record<keyof PeopleCardFieldState, ReactNode> = {
              legalName: (
                <td key="legalName" className="px-4 py-2.5 text-sm text-gray-600">
                  {legal || <Blank />}
                </td>
              ),
              email: (
                <td key="email" className="px-4 py-2.5 text-sm text-gray-600">
                  <span className="break-all">{p.email}</span>
                </td>
              ),
              personalEmail: (
                <td key="personalEmail" className="px-4 py-2.5 text-sm text-gray-600">
                  {p.personalEmail ? <span className="break-all">{p.personalEmail}</span> : <Blank />}
                </td>
              ),
              phone: (
                <td key="phone" className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                  {p.phone || p.extension ? (
                    <>
                      {p.phone}
                      {p.extension && (
                        <span className="text-gray-400">{p.phone ? ' · ' : ''}ext. {p.extension}</span>
                      )}
                    </>
                  ) : (
                    <Blank />
                  )}
                </td>
              ),
              phoneOther: (
                <td key="phoneOther" className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                  {other.value ? `${other.region} ${other.value}` : <Blank />}
                </td>
              ),
              site: (
                <td key="site" className="px-4 py-2.5 text-sm text-gray-600">
                  {siteName(p.siteId) || <Blank />}
                </td>
              ),
              team: (
                <td key="team" className="px-4 py-2.5 text-sm text-gray-600">
                  {teamName(p.teamId) || <Blank />}
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
            };

            return (
              /* The row and its editor are one entry in the list, so they are
                 keyed together — a fragment per person rather than two
                 siblings that React would have to match up on its own. */
              <Fragment key={p.email}>
                <tr
                  id={anchorId(p.email)}
                  className={`scroll-mt-44 transition target:bg-brand-50 ${
                    suspended ? 'bg-red-50/40' : open ? 'bg-brand-50/40' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar
                        photoPath={p.photoPath}
                        fallback={(name || p.email).charAt(0).toUpperCase()}
                        muted={suspended}
                        size={32}
                        expandable
                        name={name || p.email}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {name || p.email}
                          {isSelf && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                        </div>
                        {/* Added, and by whom, follows the name rather than
                            taking a column of its own: it is the one fact here
                            that is about the record instead of the person. */}
                        <div className="truncate text-[11px] text-gray-400">
                          {formatWhen(p)}
                          {isProtected && <span className="ml-1.5">· Protected</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-2.5">
                    <StatusChip status={status} />
                  </td>

                  <td className="px-4 py-2.5">
                    <PersonRoles
                      person={p}
                      canEdit={canEdit}
                      suspended={suspended}
                      isSelf={isSelf}
                      isProtected={isProtected}
                      busy={busy}
                      onMakeBroker={onMakeBroker}
                      onToggle={onToggleRole}
                      size="small"
                    />
                  </td>

                  {columns.map((c) => cells[c.key])}

                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <PersonActions
                        person={p}
                        editing={open}
                        suspended={suspended}
                        isSelf={isSelf}
                        isProtected={isProtected}
                        busy={busy}
                        onEdit={onEdit}
                        onSuspend={onSuspend}
                        onRevoke={onRevoke}
                      />
                    </td>
                  )}
                </tr>

                {/* The editor opens in place, under the row it belongs to,
                    rather than sending the reader to another view to make a
                    change they decided on here. */}
                {open && (
                  <tr className="bg-brand-50/40">
                    <td colSpan={span} className="px-4 pb-4">
                      {renderEditor(p)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
