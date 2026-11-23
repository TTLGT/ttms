'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown, ArrowUp, AtSign, Building2, Cake, CalendarDays, ChevronRight, Download,
  IdCard, LayoutGrid, LayoutList, List, Phone, Smartphone, UserPlus, UsersRound,
} from 'lucide-react';
import { listManageableUsers } from '@/lib/allowedUsers';
import { isBootstrapAdmin, isBroker, normalizeEmail } from '@/lib/accessControl';
import { PHONE_LABEL, otherPhone } from '@/lib/phone';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import { useAuth } from '@/context/AuthContext';
import {
  ROLE_CHIPS, accessStatus, fullName, splitName, yearsSince,
} from '@/types/allowedUser';
import { useDateFormatters } from '@/lib/useDateFormatters';
import type { DateLike } from '@/lib/dateFormat';
import type { AccessStatus, AllowedUser, AllowedUserRole } from '@/types/allowedUser';
import { ROLE_ORDER, type RoleKey } from '@/types/permission';
import {
  SORT_FIELDS, directionLabel, millis, sortText,
  type SortDir, type SortField,
} from '@/lib/peopleSort';
import { toCsv, csvDate, downloadCsv } from '@/lib/csv';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';
import { usePeopleCardFields } from '@/lib/peopleCardFields';
import { usePeopleView, type PeopleView } from '@/lib/peopleView';
import CardFieldPicker from '@/components/settings/CardFieldPicker';
import PeopleTable from '@/components/settings/PeopleTable';
import PersonRoles from '@/components/settings/PersonRoles';
import StatusChip from '@/components/settings/StatusChip';
import { LEGACY_ANCHORS, pageHref, personAnchorId, personHref } from '@/components/settings/settingsSections';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { EmptyState } from '@/components/settings/kit/ui';
import Fact from '@/components/people/Fact';
import { Bi } from '@/components/spanish/Es';

type StatusFilter = 'all' | 'active' | 'pending' | 'suspended';
/** 'broker' means "no elevated role" — the default everyone starts with. */
type RoleFilter   = 'all' | AllowedUserRole | 'broker';
/**
 * Site and team filters hold an id, so they need a value for "nobody has set
 * one" that an id can never collide with. Same sentinel the directory uses,
 * for the same reason: somebody has to be findable before they are assigned
 * to an office.
 */
const UNASSIGNED  = 'none';
type PlaceFilter  = 'all' | typeof UNASSIGNED | string;
type TileTone     = 'gray' | 'green' | 'amber' | 'red';

const TILE_TONE: Record<TileTone, string> = {
  gray:  'text-gray-900',
  green: 'text-green-600',
  amber: 'text-amber-600',
  red:   'text-red-600',
};

/** A count that doubles as the control for the filter it counts. */
function CountTile({
  label,
  count,
  tone = 'gray',
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: TileTone;
  active: boolean;
  onClick: () => void;
}) {

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-baseline gap-1.5 rounded-lg border px-3 py-1.5 transition ${
        active
          ? 'border-brand-300 bg-brand-50'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <span
        className={`text-sm font-semibold tabular-nums ${
          active ? 'text-brand-800' : TILE_TONE[tone]
        }`}
      >
        {count}
      </span>
      <span className={`text-xs font-medium ${active ? 'text-brand-700' : 'text-gray-500'}`}>
        {label}
      </span>
    </button>
  );
}

/** Does this person survive the office (or team) filter that is switched on? */
function inPlace(id: string | null | undefined, filter: PlaceFilter): boolean {
  if (filter === 'all')        return true;
  if (filter === UNASSIGNED)   return !id;
  return id === filter;
}

/** How many people sit under each id, for the tile counts. */
function tally(people: AllowedUser[], key: (p: AllowedUser) => string | null | undefined) {
  const counts: Record<string, number> = {};
  for (const p of people) {
    const id = key(p);
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Settings → People: everyone who can sign in, to find them.
 *
 * This page used to be where everything about a person was changed, in an
 * editor that opened under their card — 1,500 lines that held the list, the
 * editor, the roles, the permissions and the photo. Every change to somebody
 * is now made on their own page (/settings/people/[email]); this one finds
 * them, counts them and exports them. Adding people, the removal log and the
 * access history have pages of their own too.
 */
export default function SettingsPeoplePage() {
  const { user, profile, can } = useAuth();
  const router = useRouter();
  // Start dates and birthdays follow the company setting — Settings →
  // Operations → Date Format.
  const { formatCalendarDate, formatDateTime } = useDateFormatters();

  /**
   * Which details the cards show. A per-reader preference kept in this browser
   * — see lib/peopleCardFields. It hides nothing the reader could not read
   * anyway; admins and HR are the only ones who can open this page at all.
   */
  const cardFields = usePeopleCardFields();

  /**
   * Cards, compact cards or one line each — see lib/peopleView. The three show
   * the same people, filtered and ordered the same way; only the shape
   * changes, so everything below is about *which* people to draw and never
   * about how.
   */
  const [view, setView] = usePeopleView();
  const compact = view === 'compact';
  // "Added" is a fact about the record rather than about the person, so a
  // missing one says so in words instead of showing a dash.
  const formatWhen = (ts: DateLike) => formatDateTime(ts, 'date unknown');
  const [people, setPeople]     = useState<AllowedUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError]       = useState('');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter]     = useState<RoleFilter>('all');
  const [siteFilter, setSiteFilter]     = useState<PlaceFilter>('all');
  const [teamFilter, setTeamFilter]     = useState<PlaceFilter>('all');
  const [sortField, setSortField]       = useState<SortField>('firstName');
  const [sortDir, setSortDir]           = useState<SortDir>('asc');

  // Sites and teams are managed on the Organization tab; this page only needs
  // their names, to label each row and to fill the two pickers.
  const [sites, setSites] = useState<Site[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const siteName = (id: string | null | undefined) =>
    sites.find((x) => x.id === id)?.name ?? null;
  const teamName = (id: string | null | undefined) =>
    teams.find((x) => x.id === id)?.name ?? null;

  // Admins add people; a Sales Manager manages their own team on each
  // person's page; HR reads. The list itself is the same for all three.
  const canManageAll = can('people.manage');
  const canEdit      = canManageAll || profile?.isSalesManager === true;

  const myEmail = normalizeEmail(user?.email);

  const refresh = useCallback(async () => {
    // Admin and HR read the whole allowlist; a Sales Manager gets their team
    // and nobody else. See listManageableUsers for why that split exists.
    const list = await listManageableUsers(profile);
    setPeople(list);
    setLoadFailed(false);
  }, [profile]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    refresh()
      .catch((e) => {
        // Distinguish "the list is genuinely empty" from "we never got the
        // list" — otherwise a permissions error reads as missing data.
        setLoadFailed(true);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  // The layout above bounces anyone who is neither admin nor HR before this
  // renders, and the Firestore rules on `allowedUsers` refuse them again
  // independently of that. So there is nothing to check here.
  useEffect(() => {
    load();
  }, [load]);

  // Read on every visit rather than handed down from the Sites and Teams
  // panels, which now live on the Organization tab. That means a site renamed
  // or deleted over there is already correct by the time this page is opened —
  // the previous version had to patch stale ids in place because both lists
  // were on screen at once.
  useEffect(() => {
    void listSites().then(setSites).catch(() => {});
    void listTeams().then(setTeams).catch(() => {});
  }, []);

  /**
   * Exports exactly what is on screen — same filters, same order — because the
   * list an admin has narrowed down is the one they are asking for. The header
   * says how many rows that is, so an unexpected filter cannot go unnoticed.
   */
  function handleExport() {
    // These headings are the ones the importer reads back, so an export can be
    // edited in Excel and uploaded again — see COLUMNS in lib/userImportColumns.
    const header = [
      'First name', 'Last name', 'Full legal name', 'Email', 'Personal email',
      PHONE_LABEL.US, PHONE_LABEL.GT, PHONE_LABEL.MX, PHONE_LABEL.GB, 'Extension', 'Site', 'Team',
      'Date of birth', 'Start date',
      'Roles', 'Status', 'Added', 'Added by', 'Last sign-in',
    ];

    const rows = visiblePeople.map((p) => {
      const roles = ROLE_CHIPS.filter(({ field }) => p[field]).map(({ label }) => label);
      // One field on the person, one column per country in the file: the number
      // is written under its own country's heading and the other cell is left
      // blank, which is the shape the importer reads back.
      const other = otherPhone(p);
      return [
        p.firstName ?? '',
        p.lastName ?? '',
        p.legalName ?? '',
        p.email,
        p.personalEmail ?? '',
        p.phone ?? '',
        other.region === 'GT' ? other.value : '',
        other.region === 'MX' ? other.value : '',
        other.region === 'GB' ? other.value : '',
        p.extension ?? '',
        siteName(p.siteId) ?? '',
        // By name, not id — the importer matches teams by name, so an export
        // edited in Excel goes back in without anyone touching a document id.
        teamName(p.teamId) ?? '',
        // Left as YYYY-MM-DD rather than prettified: Excel reads that as a real
        // date, and it is the format the importer takes back without argument.
        p.dateOfBirth ?? '',
        p.startDate ?? '',
        // Broker is the absence of the others, so it is spelled out here rather
        // than leaving the cell blank and making the reader infer it.
        roles.length > 0 ? roles.join(', ') : 'Broker',
        accessStatus(p),
        csvDate(p.invitedAt),
        p.invitedBy ?? '',
        csvDate(p.lastLoginAt),
      ];
    });

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`people-with-access-${stamp}.csv`, toCsv([header, ...rows]));
  }

  // Counted off the full list, not the filtered one, so the tiles keep showing
  // the whole picture while a filter is applied. Role counts overlap — one
  // person can hold several roles — so they do not sum to the total.
  const counts = useMemo(() => {
    const roleCount = (p: AllowedUser) => ROLE_ORDER.filter((role) => p[role]).length;
    return {
      all:          people.length,
      active:       people.filter((p) => accessStatus(p) === 'active').length,
      pending:      people.filter((p) => accessStatus(p) === 'pending').length,
      suspended:    people.filter((p) => accessStatus(p) === 'suspended').length,
      // One tile per role, keyed by the flag, so a role added to the catalog
      // gets its tile without this list having to be found and extended.
      ...Object.fromEntries(
        ROLE_ORDER.map((role) => [role, people.filter((p) => p[role]).length]),
      ) as Record<RoleKey, number>,
      broker:       people.filter(isBroker).length,
      multiRole:    people.filter((p) => roleCount(p) > 1).length,
      // Counted by id rather than by name: two sites can be renamed to the
      // same thing, and a person points at the id either way.
      bySite:       tally(people, (p) => p.siteId),
      byTeam:       tally(people, (p) => p.teamId),
      noSite:       people.filter((p) => !p.siteId).length,
      noTeam:       people.filter((p) => !p.teamId).length,
    };
  }, [people]);

  const visiblePeople = useMemo(() => {
    const rows = people.filter((p) => {
      if (statusFilter !== 'all' && accessStatus(p) !== statusFilter) return false;
      if (!inPlace(p.siteId, siteFilter)) return false;
      if (!inPlace(p.teamId, teamFilter)) return false;
      if (roleFilter === 'broker') return isBroker(p);
      if (roleFilter !== 'all')    return !!p[roleFilter];
      return true;
    });
    const flip = sortDir === 'asc' ? 1 : -1;

    return rows.sort((a, b) => {
      if (sortField === 'added') {
        const at = millis(a.invitedAt);
        const bt = millis(b.invitedAt);
        // Undated entries go last in both directions — they say nothing about
        // when they were added, so neither end of the list is right for them.
        if (at === null || bt === null) return at === bt ? 0 : at === null ? 1 : -1;
        // 'asc' reads as oldest first here, which is what the label promises.
        return (at - bt) * flip;
      }

      const at = sortText(a, sortField);
      const bt = sortText(b, sortField);
      if (!at || !bt) {
        // Same rule as undated: a blank field is unknown, not empty-string-first.
        if (at !== bt) return at ? -1 : 1;
        return a.email.localeCompare(b.email) * flip;
      }

      // Email breaks ties so two people sharing a first name — or an extension
      // — keep a stable order rather than whatever the filter pass produced.
      return (at.localeCompare(bt) || a.email.localeCompare(b.email)) * flip;
    });
  }, [people, statusFilter, roleFilter, siteFilter, teamFilter, sortField, sortDir]);

  const filtered =
    statusFilter !== 'all' || roleFilter !== 'all' ||
    siteFilter !== 'all'   || teamFilter !== 'all';

  /**
   * Clicking a heading in the list view. The column already in use reverses;
   * any other starts ascending — a click on a new heading is asking "who comes
   * first", not for whatever direction the last column happened to be in.
   *
   * It writes the same two pieces of state the Sort by dropdown does, so the
   * dropdown, the arrow in the header row and the order on screen can never
   * describe three different things.
   */
  const sortBy = (field: SortField) => {
    if (field === sortField) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  function clearFilters() {
    setStatusFilter('all');
    setRoleFilter('all');
    setSiteFilter('all');
    setTeamFilter('all');
  }


  // An old link to a section that used to live on this page — #add-people,
  // #removed-people, #access-history — goes to the page that holds it now.
  useEffect(() => {
    const hit = LEGACY_ANCHORS[decodeURIComponent(window.location.hash.slice(1))];
    if (hit && hit.page !== 'people') router.replace(pageHref(hit.page, hit.anchor));
  }, [router]);

  return (
    <div>
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <section id="people-list" className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-start gap-4 px-6 py-4">
          <p className="min-w-0 flex-1 text-sm text-gray-500">
            {canEdit
              ? <Bi>Click anybody to see and change their details, roles and permissions. Everyone is a Broker unless they are given a role.</Bi>
              : <Bi>Everyone who can sign in, with the details on file for them — including payroll details nobody outside this page can see. Changing any of it is an admin job.</Bi>}
          </p>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold leading-none tabular-nums text-gray-900">{counts.all}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {counts.all === 1 ? 'Person' : 'People'}
              </p>
            </div>
            {canManageAll && (
              <Link href={pageHref('invite')}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                <UserPlus size={15} /> <span data-es>Invite people</span>
              </Link>
            )}
          </div>
        </div>

        {!loading && !loadFailed && people.length > 0 && (
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span data-es className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 w-24 flex-shrink-0">
                Status
              </span>
              <CountTile
                label="Everyone"
                count={counts.all}
                active={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
              />
              <CountTile
                label="Active"
                count={counts.active}
                tone="green"
                active={statusFilter === 'active'}
                onClick={() => setStatusFilter('active')}
              />
              <CountTile
                label="Pending"
                count={counts.pending}
                tone="amber"
                active={statusFilter === 'pending'}
                onClick={() => setStatusFilter('pending')}
              />
              <CountTile
                label="Suspended"
                count={counts.suspended}
                tone="red"
                active={statusFilter === 'suspended'}
                onClick={() => setStatusFilter('suspended')}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span data-es className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 w-24 flex-shrink-0">
                Permissions
              </span>
              <CountTile
                label="Everyone"
                count={counts.all}
                active={roleFilter === 'all'}
                onClick={() => setRoleFilter('all')}
              />
              <CountTile
                label="Broker"
                count={counts.broker}
                active={roleFilter === 'broker'}
                onClick={() => setRoleFilter('broker')}
              />
              {ROLE_CHIPS.map(({ field, label }) => (
                <CountTile
                  key={field}
                  label={label}
                  count={counts[field]}
                  active={roleFilter === field}
                  onClick={() => setRoleFilter(field)}
                />
              ))}
            </div>

            {/* Sites and teams are set up on the Organization tab, so these two
                rows only appear once there is something to filter by. The
                "No office" tile is only offered when somebody is actually
                missing one — otherwise it is a tile that can only ever empty
                the list. */}
            {sites.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span data-es className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 w-24 flex-shrink-0">
                  Site
                </span>
                <CountTile
                  label="Everywhere"
                  count={counts.all}
                  active={siteFilter === 'all'}
                  onClick={() => setSiteFilter('all')}
                />
                {sites.map((site) => (
                  <CountTile
                    key={site.id}
                    label={site.name}
                    count={counts.bySite[site.id] ?? 0}
                    active={siteFilter === site.id}
                    onClick={() => setSiteFilter(site.id)}
                  />
                ))}
                {counts.noSite > 0 && (
                  <CountTile
                    label="No office set"
                    count={counts.noSite}
                    tone="amber"
                    active={siteFilter === UNASSIGNED}
                    onClick={() => setSiteFilter(UNASSIGNED)}
                  />
                )}
              </div>
            )}

            {teams.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span data-es className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 w-24 flex-shrink-0">
                  Team
                </span>
                <CountTile
                  label="Every team"
                  count={counts.all}
                  active={teamFilter === 'all'}
                  onClick={() => setTeamFilter('all')}
                />
                {teams.map((team) => (
                  <CountTile
                    key={team.id}
                    label={team.name}
                    count={counts.byTeam[team.id] ?? 0}
                    active={teamFilter === team.id}
                    onClick={() => setTeamFilter(team.id)}
                  />
                ))}
                {counts.noTeam > 0 && (
                  <CountTile
                    label="No team set"
                    count={counts.noTeam}
                    tone="amber"
                    active={teamFilter === UNASSIGNED}
                    onClick={() => setTeamFilter(UNASSIGNED)}
                  />
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-gray-500">
                Showing {visiblePeople.length} of {counts.all}
                {/* Roles are not exclusive, so the permission tiles can total
                    more than the headcount — say so rather than let it read
                    as a miscount. */}
                {counts.multiRole > 0 && (
                  <span className="ml-2 text-gray-400">
                    · {counts.multiRole} hold more than one role
                  </span>
                )}
              </p>

              <div className="flex items-center gap-2">
                {/* Three buttons rather than a dropdown: which one is on has
                    to be readable without opening anything, and the same
                    control on the Directory works this way. */}
                <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
                  {([
                    { id: 'cards',   Icon: LayoutGrid, label: 'Cards',   hint: 'One card each, with the photo' },
                    { id: 'compact', Icon: LayoutList, label: 'Compact', hint: 'Smaller cards, more of them' },
                    { id: 'list',    Icon: List,       label: 'List',    hint: 'One line each — the view for checking roles across everyone' },
                  ] as const).map(({ id, Icon, label, hint }) => (
                    <button
                      key={id}
                      onClick={() => setView(id as PeopleView)}
                      title={hint}
                      aria-pressed={view === id}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition ${
                        view === id
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                      }`}
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  ))}
                </div>

                <CardFieldPicker {...cardFields} />

                <button data-es
                  onClick={handleExport}
                  disabled={visiblePeople.length === 0}
                  title="Download the list as shown, as a CSV that opens in Excel"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={13} />
                  Export CSV
                </button>
                {filtered && (
                  <button data-es
                    onClick={clearFilters}
                    className="text-xs font-medium text-brand-700 hover:text-brand-800 underline"
                  >
                    Clear filters
                  </button>
                )}
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  Sort by
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as SortField)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {SORT_FIELDS.map(({ key, label }) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  title="Reverse the order"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                >
                  {sortDir === 'asc' ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                  {directionLabel(sortField, sortDir)}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadFailed ? (
          <div className="py-16 text-center">
            <p data-es className="text-sm text-gray-500">Could not load the list.</p>
            <button data-es
              onClick={load}
              className="mt-3 text-xs font-medium text-brand-700 hover:text-brand-800 underline"
            >
              Try again
            </button>
          </div>
        ) : people.length === 0 ? (
          <EmptyState art="people" title="Nobody has access yet" body="Invite the first person and they appear here." />
        ) : visiblePeople.length === 0 ? (
          <div className="py-16 text-center">
            <p data-es className="text-sm text-gray-400">No one matches these filters.</p>
            <button data-es
              onClick={clearFilters}
              className="mt-3 text-xs font-medium text-brand-700 hover:text-brand-800 underline"
            >
              Clear filters
            </button>
          </div>
        ) : view === 'list' ? (
          /* Same grey bed the cards sit on, so switching views changes the
             shape of the list and nothing else about the page. */
          <div className="rounded-b-xl bg-gray-50 p-4">
            <PeopleTable
              people={visiblePeople}
              fields={cardFields.fields}
              myEmail={myEmail}
              isProtectedEmail={isBootstrapAdmin}
              siteName={siteName}
              teamName={teamName}
              formatWhen={(person) =>
                `Added ${formatWhen(person.invitedAt)}${person.invitedBy ? ` by ${person.invitedBy}` : ''}`
              }
              anchorId={personAnchorId}
              hrefFor={(person) => personHref(person.email)}
              sortField={sortField}
              sortDir={sortDir}
              onSort={sortBy}
            />
          </div>
        ) : (
          /* Two abreast once there is room, three when they are compact. This
             was one full-width row per person down a narrow column, which made
             two dozen people a long scroll for no reason — half the width of
             every row was empty. */
          <ul
            className={`grid items-start gap-3 rounded-b-xl bg-gray-50 p-4 ${
              compact ? 'sm:grid-cols-2 xl:grid-cols-3' : 'xl:grid-cols-2'
            }`}
          >
            {visiblePeople.map((p) => {
              const isSelf      = normalizeEmail(p.email) === myEmail;
              const isProtected = isBootstrapAdmin(p.email);
              const status      = accessStatus(p);
              const suspended   = status === 'suspended';
              const other       = otherPhone(p);
              const site        = siteName(p.siteId);
              const team        = teamName(p.teamId);
              const name        = fullName(p);

              /* What this card actually has to say, once the reader's picker
                 and the blanks on the record are both accounted for. Worked
                 out up here so the facts grid can be left out altogether when
                 nothing survives both — an empty grid still takes its margin,
                 and the card would sit there with a gap in it. */
              const show = cardFields.fields;
              // A legal name identical to the everyday one is a line of noise
              // on most cards. It earns its place only when it differs, which
              // is the case the field exists for.
              const showLegalName =
                show.legalName
                && !!p.legalName
                && p.legalName.trim().toLowerCase() !== name.trim().toLowerCase();
              const showPersonalEmail = show.personalEmail && !!p.personalEmail;
              const showPhone      = show.phone && !!(p.phone || p.extension);
              const showOther      = show.phoneOther && !!other.value;
              const showSite       = show.site && !!site;
              const showTeam       = show.team && !!team;
              const showStartDate  = show.startDate && !!p.startDate;
              const showBirthday   = show.dateOfBirth && !!p.dateOfBirth;
              const hasFacts =
                showLegalName || showPhone || showOther || showPersonalEmail
                || showSite || showTeam || showStartDate || showBirthday;

              return (
                /* The id is what the search box jumps to when someone looks a
                   person up by name; `target:` rings the card on arrival so it
                   is obvious which one of two dozen was meant.

                   Editing takes the whole width: the form is a three-column
                   grid, and folding it into half a screen would put the long
                   scroll straight back. */
                <li
                  key={p.email}
                  id={personAnchorId(p.email)}
                  className={`scroll-mt-6 rounded-xl border border-gray-200 transition hover:border-brand-300 hover:shadow-sm target:ring-2 target:ring-brand-400 ${
                    compact ? 'p-3' : 'p-4'
                  } ${suspended ? 'bg-red-50/50' : 'bg-white'}`}
                >
                  {/* Photo down the side rather than a circle in front of the
                      name: at that size a circle crops the top of the head and
                      both shoulders off every portrait, and recognising the
                      person is the whole reason the photo is here. It stretches
                      to the height of the facts beside it, so a card with more
                      on it simply gets a taller picture.

                      The compact card goes back to the round thumbnail the
                      Directory uses — three abreast, there is no side to put a
                      portrait down. */}
                  <div className={compact ? 'flex items-start gap-3' : 'flex items-stretch gap-4'}>
                    <UserAvatar
                      photoPath={p.photoPath}
                      fallback={(name || p.email).charAt(0).toUpperCase()}
                      muted={suspended}
                      shape={compact ? 'circle' : 'panel'}
                      size={compact ? 64 : 200}
                      expandable
                      name={name || p.email}
                    />

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={personHref(p.email)}
                            className={`block truncate text-sm font-medium hover:text-brand-700 hover:underline ${
                              suspended ? 'text-gray-500' : 'text-gray-900'
                            }`}
                          >
                            {name || p.email}
                            {isSelf && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                          </Link>

                          {/* Only worth a line of its own once a name is displacing
                              it from the line above. `break-all` because an address
                              is the one thing on the card that cannot wrap at a
                              space, and cutting it would hide the domain.

                              Turning the work email off in the picker cannot take
                              it off a card that has no name: it is standing in as
                              the person's name up there, not repeating itself. */}
                          {name && show.email && (
                            <p className="break-all text-xs text-gray-500">{p.email}</p>
                          )}
                        </div>

                        <StatusChip status={status} />
                      </div>

                      {/* The facts, one per line, none of them truncated. They used
                          to be joined into a single line that was cut off at the
                          edge of the row — which in practice meant the office name,
                          because it sat last. A card one line taller is a much
                          smaller problem than a fact that is not there at all. */}
                      {hasFacts && (
                        <div className="mt-3 grid grid-cols-[14px_1fr] items-start gap-x-2 gap-y-1">
                          {/* Labelled, because a second name under the first is
                              otherwise anybody's guess — a nickname, a previous
                              name, the name of the person who reports to them. */}
                          {showLegalName && (
                            <Fact Icon={IdCard}>
                              <span data-es className="text-gray-400">Legal name</span> {p.legalName}
                            </Fact>
                          )}

                          {showPhone && (
                            <Fact Icon={Phone}>
                              {[
                                // Labelled, because two bare numbers on adjacent
                                // lines give no clue which to dial from where.
                                p.phone ? `US ${p.phone}` : null,
                                p.extension ? `ext. ${p.extension}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Fact>
                          )}

                          {showOther && (
                            <Fact Icon={Smartphone}>
                              {other.region} {other.value}
                            </Fact>
                          )}

                          {/* Marked as the personal one: it is the address to
                              use when the company account is gone, and reaching
                              somebody there by mistake is a different thing
                              from emailing them at work. */}
                          {showPersonalEmail && (
                            <Fact Icon={AtSign}>
                              <span className="break-all">{p.personalEmail}</span>{' '}
                              <span className="text-gray-400">personal</span>
                            </Fact>
                          )}

                          {showSite && <Fact Icon={Building2}>{site}</Fact>}

                          {/* Prefixed so a team called "Staff" cannot be read as
                              another office sitting next to the real one. */}
                          {showTeam && <Fact Icon={UsersRound}>Team {team}</Fact>}

                          {/* Start date answers "how long has this person been
                              here" at a glance. */}
                          {showStartDate && (
                            <Fact Icon={CalendarDays}>
                              Started {formatCalendarDate(p.startDate)}
                              {(() => {
                                const years = yearsSince(p.startDate);
                                return years !== null && years >= 1
                                  ? ` · ${years} year${years === 1 ? '' : 's'}`
                                  : '';
                              })()}
                            </Fact>
                          )}

                          {/* A birthday used to stay in the editor rather than sit
                              on the card. It is on the card now because HR asks for
                              it here — and the Show picker is what takes it back
                              off, for the reader who does not want a screen full of
                              birthdays while somebody is looking over their
                              shoulder. No age: the date is the fact on file, and an
                              age is a thing about a person. */}
                          {showBirthday && (
                            <Fact Icon={Cake}>Born {formatCalendarDate(p.dateOfBirth)}</Fact>
                          )}
                        </div>
                      )}

                      {/* Holds the roles and the buttons to the foot of the card
                          when the photo beside them is the taller of the two —
                          without it they float in the middle of a gap. */}
                      <div className="flex-1" />

                      {/* Every control below writes. HR reads this page, so they get
                          the roles as plain chips instead — what someone is allowed
                          to do is the first thing anyone reads a directory entry
                          for, and a row of greyed-out buttons would only invite a
                          support call asking why none of them work. */}
                      {/* Every control below writes. HR reads this page, so the
                          chips come back as plain words for them — see
                          PersonRoles, which both this card and the list view
                          draw from so a role can never read one way here and
                          another there. */}
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <PersonRoles
                          person={p}
                          canEdit={false}
                          suspended={suspended}
                          isSelf={isSelf}
                          isProtected={isProtected}
                          busy={null}
                          onMakeBroker={() => {}}
                          onToggle={() => {}}
                        />

                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="min-w-0 text-[11px] text-gray-400">
                            Added {formatWhen(p.invitedAt)}
                            {p.invitedBy ? ` by ${p.invitedBy}` : ''}
                            {isProtected && <span data-es className="block">Protected account</span>}
                          </p>

                          <Link href={personHref(p.email)}
                            className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
                            <span data-es>Open</span> <ChevronRight size={13} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
