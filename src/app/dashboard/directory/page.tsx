'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, List, Search, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canSeeDirectory } from '@/lib/accessControl';
import { listDirectory, type DirectoryPerson } from '@/lib/directory';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import { otherPhone } from '@/lib/phone';
import { roleLabels } from '@/types/allowedUser';
import {
  sortDirectory, isSortKey, isSortDir, DEFAULT_SORT_KEY, DEFAULT_SORT_DIR,
  type SortKey,
} from '@/lib/directorySort';
import {
  visibleColumns, pickableColumns, parseHiddenColumns, serializeHiddenColumns,
} from '@/lib/directoryColumns';
import ColumnPicker from '@/components/people/ColumnPicker';
import DirectoryCards from '@/components/people/DirectoryCards';
import DirectoryTable from '@/components/people/DirectoryTable';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';

/**
 * The company phone book.
 *
 * Open to everyone who can sign in, which is what separates it from
 * Settings → People: that page is the access list — who is allowed in, what
 * they may do, and the payroll details behind them — and stays admin and HR
 * only. This page answers one question, "how do I reach this colleague", and
 * so it is read-only, with no controls on it beyond searching, filtering,
 * ordering and choosing how to look at it.
 *
 * What each person is shown is decided in lib/directory.ts, not here. Everyone
 * gets the name, the company address, the US work line, the extension, the
 * office and the team; admin and HR also get the second number and the four
 * payroll fields. Read the note at the top of that file before widening
 * either list — the two halves are kept private in different ways, and only
 * one of them is a real boundary.
 *
 * Two views, the same people: cards for looking someone up, a list for
 * scanning a whole office. Both live in components/people and take the same
 * props, so everything below is about *which* people to show and in what
 * order, never how they are drawn.
 */

type View = 'cards' | 'list';

/** No office or no team, as it travels in the URL. An id can never be this. */
const UNASSIGNED = 'none';

/** Everything about a person that typing into the search box should match. */
function haystack(p: DirectoryPerson, site: string | null, team: string | null): string {
  return [
    p.displayName,
    p.email,
    p.phone,
    p.extension,
    otherPhone(p).value,
    site,
    team,
    // So that typing "dispatcher" finds the dispatchers. The chips are on
    // screen; a search box that cannot match what is written on the card is
    // the kind of small dishonesty people stop trusting the box over.
    roleLabels(p).join(' '),
    // Blank for everyone but admin and HR, who are also the only people who
    // would think to search for a payroll name or a private address.
    p.legalName,
    p.personalEmail,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Does this person survive the office (or team) filter that is switched on? */
function matches(id: string | null | undefined, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === UNASSIGNED) return !id;
  return id === filter;
}

function Directory() {
  const { profile } = useAuth();
  // Admin and HR get the fuller view. Same test the data layer applies, asked
  // here only to decide what the page says about itself.
  const full = canSeeDirectory(profile);

  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [sites, setSites]   = useState<Site[]>([]);
  const [teams, setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [query, setQuery]     = useState('');

  /**
   * The view and both filters live in the address bar rather than in component
   * state, so they survive a refresh and so "the Dallas list" is something one
   * person can paste to another. An unrecognised value falls back to the
   * default rather than showing nothing.
   *
   * The search box is deliberately *not* in there. It changes on every
   * keystroke, and a history entry per letter typed is no use to anybody.
   */
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const view: View  = searchParams.get('view') === 'list' ? 'list' : 'cards';
  const siteFilter  = searchParams.get('site') ?? 'all';
  const teamFilter  = searchParams.get('team') ?? 'all';

  // Anything unrecognised in the URL falls back to name order rather than
  // showing the list in no order at all.
  const sortParam = searchParams.get('sort');
  const dirParam  = searchParams.get('dir');
  const sortKey   = isSortKey(sortParam) ? sortParam : DEFAULT_SORT_KEY;
  const sortDir   = isSortDir(dirParam)  ? dirParam  : DEFAULT_SORT_DIR;

  /**
   * Which columns the list draws: the ones this viewer may see, minus the ones
   * they have switched off. Both halves live in lib/directoryColumns.ts — the
   * URL carries the *hidden* ones, so a plain /dashboard/directory is still
   * the whole table.
   */
  const hidden  = parseHiddenColumns(searchParams.get('hide'));
  const columns = visibleColumns(full, hidden);

  /**
   * The order the list is actually in, which is the requested one only while
   * its column is on screen.
   *
   * A sort by a column nobody can see is a list in an order with nothing to
   * explain it — no heading, no arrow, just rows that look shuffled. That can
   * arrive two ways: switching off the column being sorted on, or opening a
   * link someone else built. Falling back to name here covers both, and
   * because it is worked out on the way past rather than written to the URL,
   * switching the column back on restores the order it had.
   */
  const sortShown = columns.some((c) => c.key === sortKey);
  const orderKey  = sortShown ? sortKey : DEFAULT_SORT_KEY;
  const orderDir  = sortShown ? sortDir : DEFAULT_SORT_DIR;

  /** Several parameters at once, because picking a column also sets its
   *  direction and two `replace` calls would race each other. */
  const setParams = useCallback((updates: [string, string, string][]) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value, fallback] of updates) {
      // The default is left out of the URL entirely, so a bare
      // /dashboard/directory keeps meaning exactly what it means today.
      if (value === fallback) params.delete(key);
      else params.set(key, value);
    }

    const qs = params.toString();
    // `replace`, not `push`: changing how one page is filtered is not a step
    // Back should have to walk through, one per click.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  const setParam = useCallback(
    (key: string, value: string, fallback: string) => setParams([[key, value, fallback]]),
    [setParams],
  );

  const setView = (next: View) => setParam('view', next, 'cards');

  /**
   * Clicking a column heading. A column that is already the one in use flips
   * direction; any other column starts ascending — A–Z, or lowest first —
   * because a click on a new heading should give the answer to "who comes
   * first", not to whatever the last column happened to be doing.
   */
  const sortBy = (key: SortKey) =>
    setParams(
      // Against the order on screen rather than the one in the URL, so that
      // clicking the heading with the arrow under it always reverses that
      // arrow — see the fallback above.
      key === orderKey
        ? [['dir', orderDir === 'asc' ? 'desc' : 'asc', DEFAULT_SORT_DIR]]
        : [['sort', key, DEFAULT_SORT_KEY], ['dir', 'asc', DEFAULT_SORT_DIR]],
    );

  /**
   * Clicking an office or a team in the list filters down to it, and clicking
   * the one already filtered on clears it — so the same cell is both the way
   * in and the way back out. The dropdowns show what happened either way,
   * which is what keeps a click from being a filter nobody can find again.
   */
  const filterSite = (id: string) =>
    setParam('site', siteFilter === id ? 'all' : (id || UNASSIGNED), 'all');
  const filterTeam = (id: string) =>
    setParam('team', teamFilter === id ? 'all' : (id || UNASSIGNED), 'all');

  /**
   * Switching one column off or back on, and putting them all back.
   *
   * The whole set travels as one parameter, so it is rewritten from scratch
   * each time rather than toggled in place — and an empty set is the default,
   * which `setParam` leaves out of the address bar entirely.
   */
  const toggleColumn = (key: SortKey) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setParam('hide', serializeHiddenColumns(next), '');
  };

  const showAllColumns = () => setParam('hide', '', '');

  const siteName = (id: string | null | undefined) =>
    sites.find((s) => s.id === id)?.name ?? null;
  const teamName = (id: string | null | undefined) =>
    teams.find((t) => t.id === id)?.name ?? null;

  useEffect(() => {
    // `profile` is null for the moment before AuthContext has established the
    // session; loading then would fetch the narrow list and never widen it.
    if (!profile) return;

    let live = true;
    setLoading(true);
    listDirectory(profile)
      .then((list) => { if (live) { setPeople(list); setError(''); } })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load the directory.');
      })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
  }, [profile]);

  // Both views carry an office and a team, so both need the names to label
  // them with. Both endpoints are open to any signed-in user — they are
  // reference data that grants nothing, which is exactly why a phone book may
  // show them.
  useEffect(() => {
    void listSites().then(setSites).catch(() => {});
    void listTeams().then(setTeams).catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (!matches(p.siteId, siteFilter)) return false;
      if (!matches(p.teamId, teamFilter)) return false;
      if (!q) return true;
      return haystack(p, siteName(p.siteId), teamName(p.teamId)).includes(q);
    });
    // `sites` and `teams` are in the deps because siteName/teamName read them —
    // the two lists arrive after the people do, and the office a row is
    // filtered on has to be searchable the moment its name is known.
  }, [people, query, siteFilter, teamFilter, sites, teams]);

  /**
   * The order is the list view's, so it is applied only there. A card has no
   * columns, and re-ordering the cards by an extension nobody can see on them
   * would look like the page had shuffled itself.
   */
  const rows = useMemo(
    () => (view === 'list' ? sortDirectory(visible, orderKey, orderDir, { siteName, teamName }) : visible),
    // Same reason as above for `sites` and `teams`: sorting by office cannot
    // happen until the office names have arrived.
    [visible, view, orderKey, orderDir, sites, teams],
  );

  return (
    <div className="p-8 max-w-[1600px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Directory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {full
              ? 'Everyone at Total Transport Logistics, including anyone set up but not yet signed in.'
              : 'Everyone at Total Transport Logistics — where they sit and how to reach them.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Two buttons rather than a dropdown: there are only ever two, and
              which one is on has to be readable without opening anything. */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
            {([
              { id: 'cards', Icon: LayoutGrid, label: 'Cards' },
              { id: 'list',  Icon: List,       label: 'List'  },
            ] as const).map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                title={`${label} view`}
                aria-pressed={view === id}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                  view === id
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Only over the list: the cards have no columns to choose
              between, and a control that did nothing where it stood would be
              worse than not having one. */}
          {view === 'list' && (
            <ColumnPicker
              columns={pickableColumns(full)}
              hidden={hidden}
              onToggle={toggleColumn}
              onShowAll={showAllColumns}
            />
          )}

          {sites.length > 0 && (
            <select
              value={siteFilter}
              onChange={(e) => setParam('site', e.target.value, 'all')}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="all">Every office</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              {/* Somebody has to be findable before they are assigned to one. */}
              <option value={UNASSIGNED}>No office set</option>
            </select>
          )}

          {/* The team filter exists because the list view can set it by
              clicking, and a filter you can switch on has to be one you can
              see and switch off. */}
          {teams.length > 0 && (
            <select
              value={teamFilter}
              onChange={(e) => setParam('team', e.target.value, 'all')}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="all">Every team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value={UNASSIGNED}>No team set</option>
            </select>
          )}

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, role, email, phone or extension"
              className="w-72 rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                title="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : people.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
          Nobody to show yet.
        </div>
      ) : (
        <>
          <p className="mt-6 text-xs text-gray-500">
            {visible.length === people.length
              ? `${people.length} ${people.length === 1 ? 'person' : 'people'}`
              : `Showing ${visible.length} of ${people.length}`}
          </p>

          {visible.length === 0 ? (
            <div className="mt-3 rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
              Nobody matches that.
            </div>
          ) : view === 'list' ? (
            <DirectoryTable
              people={rows}
              siteName={siteName}
              teamName={teamName}
              full={full}
              columns={columns}
              siteFilter={siteFilter}
              teamFilter={teamFilter}
              onFilterSite={filterSite}
              onFilterTeam={filterTeam}
              sortKey={orderKey}
              sortDir={orderDir}
              onSort={sortBy}
            />
          ) : (
            <DirectoryCards
              people={visible} siteName={siteName} teamName={teamName} full={full}
            />
          )}
        </>
      )}

      <p className="mt-6 text-xs text-gray-400">
        {full ? (
          <>
            Names, numbers and offices are edited in{' '}
            <Link href="/dashboard/settings/people" className="text-brand-700 underline">
              Settings → People
            </Link>
            . Legal names, personal addresses and dates are shown to admins and HR
            only — everyone else also sees no second phone number.
          </>
        ) : (
          <>Something here wrong or missing? Ask an admin to update it in Settings.</>
        )}
      </p>
    </div>
  );
}

export default function DirectoryPage() {
  // Suspense is required because Directory reads the view and the filters out
  // of useSearchParams(), which suspends on the server render.
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      }
    >
      <Directory />
    </Suspense>
  );
}
