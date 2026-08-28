'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AtSign, Building2, Hash, Phone, Search, Smartphone, UsersRound, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canSeeDirectory } from '@/lib/accessControl';
import { listDirectory, type DirectoryPerson } from '@/lib/directory';
import { listSites } from '@/lib/sites';
import { listTeams } from '@/lib/teams';
import {
  PHONE_COUNTRY_CODE, otherPhone, type PhoneRegion,
} from '@/lib/phone';
import { UserAvatar } from '@/components/settings/UserAvatar';
import Fact from '@/components/people/Fact';
import type { Site } from '@/types/site';
import type { Team } from '@/types/team';

/**
 * The company phone book.
 *
 * Open to everyone who can sign in, which is what separates it from
 * Settings → People: that page is the access list — who is allowed in, what
 * they may do, and the payroll details behind them — and stays admin and HR
 * only. This page answers one question, "how do I reach this colleague", and
 * so it is a read-only list with no controls on it at all.
 *
 * What each person is shown is decided in lib/directory.ts, not here. Everyone
 * gets the name, the company address, the US work line, the extension, the
 * office and the team; the second number is filled in only for admin and HR.
 * Read the note at the top of that file before widening it — the narrowing is
 * an editorial decision, not an enforced boundary.
 */

/**
 * A number the browser can actually dial.
 *
 * What is stored is the readable form — `+(469) 935-4100` — so the digits are
 * pulled back out and the country code put on the front, which is the only
 * shape a phone app takes reliably. The prefix test is safe in both
 * directions: a ten-digit US number never starts with 1, and a national
 * Guatemalan or Mexican number that happens to start with its own country
 * code still comes out the right length.
 */
function telHref(value: string, region: PhoneRegion): string {
  const digits = value.replace(/\D/g, '');
  const code   = PHONE_COUNTRY_CODE[region];
  return `tel:+${digits.startsWith(code) ? digits : code + digits}`;
}

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
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function DirectoryPage() {
  const { profile } = useAuth();
  // Admin and HR get the fuller card. Same test the data layer applies, asked
  // here only to decide what the page says about itself.
  const full = canSeeDirectory(profile);

  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [sites, setSites]   = useState<Site[]>([]);
  const [teams, setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [query, setQuery]     = useState('');
  const [siteFilter, setSiteFilter] = useState('all');

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

  // Every card carries an office and a team, so everyone needs the names to
  // label them with. Both endpoints are open to any signed-in user — they are
  // reference data that grants nothing, which is exactly why a phone book may
  // show them.
  useEffect(() => {
    void listSites().then(setSites).catch(() => {});
    void listTeams().then(setTeams).catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (siteFilter !== 'all' && (p.siteId ?? '') !== siteFilter) return false;
      if (!q) return true;
      return haystack(p, siteName(p.siteId), teamName(p.teamId)).includes(q);
    });
    // `sites` and `teams` are in the deps because siteName/teamName read them —
    // the two lists arrive after the people do, and the office a card is
    // filtered on has to be searchable the moment its name is known.
  }, [people, query, siteFilter, sites, teams]);

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

        <div className="flex items-center gap-2">
          {sites.length > 0 && (
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="all">Every office</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              {/* Somebody has to be findable before they are assigned to one. */}
              <option value="">No office set</option>
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
          ) : (
            /* Three abreast on a wide screen. A phone book is read by scanning
               it, so the cards are small and fixed in shape rather than one
               long column of rows. */
            <ul className="mt-3 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((p) => {
                const other = otherPhone(p);
                const site  = siteName(p.siteId);
                const team  = teamName(p.teamId);

                return (
                  <li
                    key={p.email}
                    className={`rounded-xl border p-4 ${
                      p.suspended ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <UserAvatar
                        photoPath={p.photoPath}
                        fallback={p.displayName.charAt(0).toUpperCase()}
                        muted={p.suspended}
                        size={40}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {p.displayName}
                        </p>
                        {/* The status of an account is not directory
                            information — it only appears for the two roles
                            whose job it is to do something about it. */}
                        {full && (p.pending || p.suspended) && (
                          <p
                            className={`text-[11px] font-medium ${
                              p.suspended ? 'text-red-600' : 'text-amber-600'
                            }`}
                          >
                            {p.suspended ? 'Suspended' : 'Not signed in yet'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-[14px_1fr] items-start gap-x-2 gap-y-1">
                      <Fact Icon={AtSign} href={`mailto:${p.email}`}>{p.email}</Fact>

                      {/* Dialable, because half the reason to open a directory
                          is to call the person in it. */}
                      {p.phone && (
                        <Fact Icon={Phone} href={telHref(p.phone, 'US')}>{p.phone}</Fact>
                      )}

                      {p.extension && <Fact Icon={Hash}>ext. {p.extension}</Fact>}

                      {other.value && (
                        <Fact Icon={Smartphone} href={telHref(other.value, other.region)}>
                          {other.region} {other.value}
                        </Fact>
                      )}

                      {site && <Fact Icon={Building2}>{site}</Fact>}

                      {/* Prefixed so a team called "Staff" cannot be read as
                          another office sitting next to the real one. */}
                      {team && <Fact Icon={UsersRound}>Team {team}</Fact>}
                    </div>
                  </li>
                );
              })}
            </ul>
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
            . Everyone else sees the same cards without the second phone number.
          </>
        ) : (
          <>Something here wrong or missing? Ask an admin to update it in Settings.</>
        )}
      </p>
    </div>
  );
}
