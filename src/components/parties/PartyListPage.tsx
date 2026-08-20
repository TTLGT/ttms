'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
export default function PartyListPage({ role, title, blurb }: Props) {
  const { user, isAdmin }   = useAuth();
  const [all, setAll]       = useState<Party[]>([]);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState('');
  const [search, setSearch] = useState('');
  const [mineOnly, setMine] = useState(false);

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
          onChange={(e) => setSearch(e.target.value)}
          className="w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMine(e.target.checked)} />
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
