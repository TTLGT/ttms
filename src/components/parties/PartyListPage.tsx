'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { listPartiesPage, countParties } from '@/lib/parties';
import { useAuth } from '@/context/AuthContext';
import { viewAllPermission } from '@/lib/accessControl';
import { personHref } from '@/lib/directoryProfile';
import { PARTY_ROLES, partyDisplayName, ROLE_LABEL } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';
import PhoneValue from '@/components/PhoneValue';
import { Bi, Es } from '@/components/spanish/Es';
import { FilterToggle, ListHead, PartialNote, phoneFilterText, useListControls } from '@/components/table/listControls';
import type { ListColumn } from '@/components/table/listControls';

/** The contact shown on the row: the record's own, else its first contact. */
function rowContact(p: Party) {
  const primary = p.contacts?.[0];
  return {
    name:  p.contactName || primary?.name || '',
    phone: p.phone || primary?.phone || '',
    email: p.email || primary?.email || '',
  };
}

function cityState(p: Party): string {
  return p.address?.city && p.address?.state ? `${p.address.city}, ${p.address.state}` : p.address?.city || '';
}

/**
 * The list's columns. Name is sorted by the server (nameKey, either way
 * round); the rest sort and filter what is loaded — see
 * components/table/listControls.tsx. "Also" depends on which list this is,
 * so the columns are built per role.
 */
function partyColumns(role: PartyRole): ListColumn<Party>[] {
  const others = PARTY_ROLES.filter((r) => r !== role);
  return [
    { key: 'name', label: 'Name', sortValue: (p) => p.nameKey || partyDisplayName(p), filterText: (p) => partyDisplayName(p) },
    { key: 'contact', label: 'Contact', sortValue: (p) => rowContact(p).name, filterText: (p) => rowContact(p).name },
    { key: 'phone', label: 'Phone', sortValue: (p) => rowContact(p).phone, filterText: (p) => phoneFilterText(rowContact(p).phone, p.phone2) },
    { key: 'email', label: 'Email', sortValue: (p) => rowContact(p).email, filterText: (p) => `${rowContact(p).email} ${p.email2 ?? ''}` },
    {
      key: 'place', label: 'City / State',
      // By state, then city: a broker looking down this column is looking for
      // everything in Texas, not every Springfield.
      sortValue: (p) => (p.address?.state || p.address?.city ? `${p.address?.state ?? ''} ${p.address?.city ?? ''}` : ''),
      filterText: (p) => `${cityState(p)} ${p.address?.zip ?? ''}`,
    },
    {
      key: 'also', label: 'Also',
      sortValue: (p) => (p.roles ?? []).filter((r) => r !== role).map((r) => ROLE_LABEL[r]).join(', '),
      filterOptions: [
        ...others.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
        { value: 'none', label: `Only a ${ROLE_LABEL[role].toLowerCase()}` },
      ],
      filterValue: (p) => {
        const also = (p.roles ?? []).filter((r) => r !== role);
        return also.length ? also : 'none';
      },
    },
  ];
}

interface Props {
  role: PartyRole;
  /** Plural heading, e.g. "Shippers". */
  title: string;
  blurb: string;
}

/** See the orders list for why fifty. */
const PAGE_SIZE = 50;

/**
 * One list screen shared by Clients, Shippers and Consignees. They are all the
 * same `parties` collection filtered to a role, so a company that pickups on
 * one order and pays on another shows up in both lists as a single record.
 */
function PartyList({ role, title, blurb }: Props) {
  const { user, can }       = useAuth();
  const [all, setAll]       = useState<Party[]>([]);
  const [loading, setLoad]  = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal]   = useState<number | null>(null);
  const [error, setError]   = useState('');

  /*
    The search text and the "only mine" toggle live in the URL, like the orders
    and carriers lists. Opening a client and pressing Back should return to the
    search that found it rather than an empty box — the point of a result list
    is opening more than one of them.

    Unlike those two, this list holds every party it can see in memory and
    filters locally, so there is no query to debounce. The URL is still written
    with `replace`, so typing leaves no history entry per letter.
  */
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const search   = searchParams.get('q') ?? '';
  const mineOnly = searchParams.get('mine') === '1';
  /*
    Set when the screen was opened from somebody's book of business on their
    directory page. An email rather than a uid, because that is what the
    directory links on and the only identifier a colleague who has never signed
    in has — the server resolves it. See lib/ownerFilter.ts.

    It narrows what this reader can already see, so it needs no permission of
    its own: every row it produces is one the unfiltered list would have shown.
  */
  const owner = (searchParams.get('owner') ?? '').trim();

  const columns  = useMemo(() => partyColumns(role), [role]);
  const controls = useListControls(columns, { defaultSort: 'name', serverKey: 'name' });
  const { serverDir } = controls;

  const setParam = useCallback((key: string, value: string, fallback: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // A default is written as an absent parameter, so a bare /dashboard/clients
    // keeps meaning exactly what it means today.
    if (value === fallback) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  /*
    Paged, and searched by the database.

    This list held every party it could see and filtered in memory, which was
    free while `parties` had one record in it. The migration made that seven
    thousand — about 3.7 MB and six and a half seconds — so it pages like the
    orders and carriers lists now, and typing queries a name prefix rather than
    scanning an array.
  */
  const [applied, setApplied] = useState(search.trim());
  useEffect(() => {
    const t = setTimeout(() => setApplied(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Discards a response whose request has been superseded.
  const requestId = useRef(0);

  const loadPage = useCallback(async (after: string | null) => {
    if (!user) return;
    const mine = ++requestId.current;
    if (after) setLoadingMore(true); else setLoad(true);
    try {
      const page = await listPartiesPage({
        limit: PAGE_SIZE, cursor: after, role, search: applied || undefined,
        owner: owner || undefined,
        dir: serverDir,
      });
      if (mine !== requestId.current) return;
      setAll((prev) => (after ? [...prev, ...page.parties] : page.parties));
      setCursor(page.cursor);
      setError('');
    } catch (e) {
      if (mine === requestId.current) setError((e as Error).message);
    } finally {
      if (mine === requestId.current) { setLoad(false); setLoadingMore(false); }
    }
  }, [user, role, applied, owner, serverDir]);

  useEffect(() => { setAll([]); setCursor(null); void loadPage(null); }, [loadPage]);

  useEffect(() => {
    countParties(role, owner || undefined).then(setTotal).catch(() => setTotal(null));
  }, [role, owner]);

  /*
    "Only mine" still filters the loaded page rather than the query. Ownership
    is four fields — uids, groups, emails, and the legacy name — and narrowing
    on them server-side would need an index per combination for a control only
    admins see. It reads as a filter on what is shown, which is what it is.
  */
  const mine = useMemo(
    () => (mineOnly && user
      ? all.filter((p) => (p.assignedToUids ?? []).includes(user.uid))
      : all),
    [all, mineOnly, user],
  );
  const { apply } = controls;
  const visible = useMemo(() => apply(mine), [apply, mine]);

  const clearOwner = () => setParam('owner', '', '');

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900"><Bi>{title}</Bi></h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total === null ? '…' : total.toLocaleString()}{owner ? ' owned' : ' total'} · {blurb}
            <Es>{blurb}</Es>
          </p>
        </div>
        <Link
          href={`/dashboard/parties/new?role=${role}`}
          data-es={`Add ${ROLE_LABEL[role]}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition"
        >
          + Add {ROLE_LABEL[role]}
        </Link>
      </div>

      {/* Says what is being looked at, because the list otherwise looks like
          the whole company's and simply happens to be short. The address is
          shown rather than a name: it is what the link carries, and resolving
          it to a name here would mean loading the directory to label one row. */}
      {owner && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <span>
            Only the {title.toLowerCase()} owned by{' '}
            <Link href={personHref(owner)} className="font-medium underline">
              {owner}
            </Link>
            .
            <Es>{`Only the ${title.toLowerCase()} owned by this person`}</Es>
          </span>
          <button onClick={clearOwner} data-es={`Show all ${title.toLowerCase()}`} className="font-medium underline hover:no-underline">
            Show all {title.toLowerCase()}
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          type="text"
          placeholder={`Search ${title.toLowerCase()} by name…`}
          data-es={`Search ${title.toLowerCase()} by name`}
          value={search}
          onChange={(e) => setParam('q', e.target.value, '')}
          className="w-full sm:w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        {/* Only worth offering to somebody who is seeing everybody's records
            anyway — for a broker the whole list is already only theirs. Hidden
            while an owner filter is on: "mine" and "Maria's" are two answers to
            the same question, and ticking both would silently show neither. */}
        {!owner && can(viewAllPermission(role)) && (
          <label data-es="Only mine" className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setParam('mine', e.target.checked ? '1' : '', '')}
            />
            Only mine
          </label>
        )}
        <FilterToggle controls={controls} />
      </div>

      {!loading && !error && <PartialNote controls={controls} loaded={mine.length} more={!!cursor} />}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
      ) : mine.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">
            {owner
              ? `${owner} owns no ${title.toLowerCase()} you can see.`
              : search
                ? `No ${title.toLowerCase()} match your search.`
                : `No ${title.toLowerCase()} yet. They are created automatically the first time you name one on an order.`}
            <Es>{owner
              ? `This person owns no ${title.toLowerCase()} you can see`
              : search
                ? `No ${title.toLowerCase()} match your search`
                : `No ${title.toLowerCase()} yet. They are created automatically the first time you name one on an order`}</Es>
          </p>
          {!search && !owner && (
            <Link data-es href={`/dashboard/parties/new?role=${role}`} className="mt-3 inline-block text-sm text-brand-600 hover:underline">
              Add one manually →
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <ListHead columns={columns} controls={controls} trailing={1} />
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-sm text-gray-400">
                    <Bi>Nothing on this list matches those filters.</Bi>
                  </td>
                </tr>
              )}
              {visible.map((p) => {
                const primary    = p.contacts?.[0];
                const otherRoles = (p.roles ?? []).filter((r) => r !== role);
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      <Link href={`/dashboard/parties/${p.id}?from=${role}`} className="hover:text-brand-600 hover:underline">
                        {partyDisplayName(p)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{p.contactName || primary?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <PhoneValue
                        value={p.phone || primary?.phone}
                        // A contact's own number has no country beside it, so
                        // it falls back to the record's — the right guess when
                        // a contact sits at the company they belong to.
                        region={p.phoneRegion}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.email || primary?.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {p.address?.city && p.address?.state ? `${p.address.city}, ${p.address.state}` : p.address?.city || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {otherRoles.length === 0 ? (
                        <span className="text-sm text-gray-400">—</span>
                      ) : (
                        <span className="flex gap-1">
                          {otherRoles.map((r) => (
                            <span key={r} data-es className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                              {ROLE_LABEL[r]}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link data-es
                        href={`/dashboard/parties/${p.id}?from=${role}`}
                        className="text-xs text-brand-600 hover:underline font-medium"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {cursor && (
            <div className="flex flex-col items-center gap-1 border-t border-gray-100 py-4">
              <button
                onClick={() => void loadPage(cursor)}
                disabled={loadingMore}
                className="px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 rounded-lg transition disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : `Load ${PAGE_SIZE} more`}
              </button>
              <p className="text-xs text-gray-400">
                Showing {mine.length.toLocaleString()}
                {!applied && total !== null && ` of ${total.toLocaleString()}`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function PartyListPage(props: Props) {
  // Suspense is required because the list reads its search text and the "only
  // mine" toggle out of useSearchParams(), which suspends on the server render.
  // Same reason as the orders, carriers and Directory lists.
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      }
    >
      <PartyList {...props} />
    </Suspense>
  );
}
