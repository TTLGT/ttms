'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listShippers } from '@/lib/shippers';
import { useAuth } from '@/context/AuthContext';
import type { Shipper } from '@/types/shipper';

export default function ShippersPage() {
  const { user, isAdmin }        = useAuth();
  const [shippers, setShippers]  = useState<Shipper[]>([]);
  const [loading, setLoading]    = useState(true);
  const [error, setError]        = useState('');
  const [search, setSearch]      = useState('');

  useEffect(() => {
    if (!user) return;
    listShippers(isAdmin ? undefined : user.uid)
      .then(setShippers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, isAdmin]);

  const visible = search.trim()
    ? shippers.filter((s) =>
        s.companyName.toLowerCase().includes(search.toLowerCase())
      )
    : shippers;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shippers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{shippers.length} total shippers</p>
        </div>
        <Link
          href="/dashboard/shippers/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition"
        >
          + Add Shipper
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search shippers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">{search ? 'No shippers match your search.' : 'No shippers yet.'}</p>
          {!search && (
            <Link href="/dashboard/shippers/new" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
              Add your first shipper →
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Company', 'Primary Contact', 'Phone', 'Email', 'City / State', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((s) => {
                const primary = s.contacts?.[0];
                const city    = s.defaultOrigin?.city;
                const state   = s.defaultOrigin?.state;
                return (
                  <tr key={s.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{s.companyName}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{primary?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{primary?.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{primary?.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {city && state ? `${city}, ${state}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/shippers/${s.id}`}
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
