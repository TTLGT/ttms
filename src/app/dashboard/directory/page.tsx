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
 * so it is read-only, with no controls on it beyond searching, filtering and
 * choosing how to look at it.
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
 * props, so everything below is about *which* people to show, never how.
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

  const setParam = useCallback((key: string, value: string, fallback: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // The default is left out of the URL entirely, so a bare
    // /dashboard/directory keeps meaning exactly what it means today.
    if (value === fallback) params.delete(key);
    else params.set(key, value);

    const qs = params.toString();
    // `replace`, not `push`: changing how one page is filtered is not a step
    // Back should have to walk through, one per click.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  const setView = (next: View) => setParam('view', next, 'cards');

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
              placeholder="Search name, email, phone or extension"
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
              people={visible}
              siteName={siteName}
              teamName={teamName}
              full={full}
              siteFilter={siteFilter}
              teamFilter={teamFilter}
              onFilterSite={filterSite}
              onFilterTeam={filterTeam}
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
