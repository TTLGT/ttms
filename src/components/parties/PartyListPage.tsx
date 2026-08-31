'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { listParties, searchParties } from '@/lib/parties';
import { useAuth } from '@/context/AuthContext';
import { partyDisplayName, ROLE_LABEL } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';

interface Props {
  role: PartyRole;
  /** Plural heading, e.g. "Shippers". */
  title: string;
  blurb: string;
}

/**
 * One list screen shared by Clients, Shippers and Consignees. They are all the
 * same `parties` collection filtered to a role, so a company that pickups on
 * one order and pays on another shows up in both lists as a single record.
 */
function PartyList({ role, title, blurb }: Props) {
  const { user, isAdmin }   = useAuth();
  const [all, setAll]       = useState<Party[]>([]);
  const [loading, setLoad]  = useState(true);
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

  const setParam = useCallback((key: string, value: string, fallback: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // A default is written as an absent parameter, so a bare /dashboard/clients
    // keeps meaning exactly what it means today.
    if (value === fallback) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  useEffect(() => {
    if (!user) return;
    listParties({ role })
      .then(setAll)
      .catch((e) => setError(e.message))
      .finally(() => setLoad(false));
  }, [user, role]);

  const visible = useMemo(() => {
    const scoped = mineOnly && user
      ? all.filter((p) => (p.assignedToUids ?? []).includes(user.uid))
      : all;
    return searchParties(scoped, search);
  }, [all, search, mineOnly, user]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {all.length} total · {blurb}
          </p>
        </div>
        <Link
          href={`/dashboard/parties/new?role=${role}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition"
        >
          + Add {ROLE_LABEL[role]}
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <input
          type="text"
          placeholder={`Search ${title.toLowerCase()} by name, contact, email, city…`}
          value={search}
          onChange={(e) => setParam('q', e.target.value, '')}
          className="w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setParam('mine', e.target.checked ? '1' : '', '')}
            />
            Only mine
          </label>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">
            {search
              ? `No ${title.toLowerCase()} match your search.`
              : `No ${title.toLowerCase()} yet. They are created automatically the first time you name one on an order.`}
          </p>
          {!search && (
            <Link href={`/dashboard/parties/new?role=${role}`} className="mt-3 inline-block text-sm text-brand-600 hover:underline">
              Add one manually →
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Contact', 'Phone', 'Email', 'City / State', 'Also', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((p) => {
                const primary    = p.contacts?.[0];
                const otherRoles = (p.roles ?? []).filter((r) => r !== role);
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{partyDisplayName(p)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{p.contactName || primary?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.phone || primary?.phone || '—'}</td>
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
                            <span key={r} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                              {ROLE_LABEL[r]}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/parties/${p.id}`}
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
