'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listCarriers } from '@/lib/carriers';
import type { Carrier } from '@/types/carrier';
import InsuranceBadge from '@/components/carriers/InsuranceBadge';
import { useDateFormatters } from '@/lib/useDateFormatters';

export default function CarriersPage() {
  // Dates are written the way the company setting says — see Settings →
  // Operations → Date Format.
  const { formatDate } = useDateFormatters();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    listCarriers()
      .then(setCarriers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = carriers
    .filter((c) => showInactive || c.isActive)
    .filter((c) =>
      !search.trim() ||
      c.companyName.toLowerCase().includes(search.toLowerCase()) ||
      c.dot.includes(search) ||
      c.mc.includes(search)
    );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Carriers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {carriers.filter((c) => c.isActive).length} active · {carriers.filter((c) => !c.isActive).length} inactive
          </p>
        </div>
        <Link
          href="/dashboard/carriers/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition"
        >
          + Add Carrier
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <input
          type="text"
          placeholder="Search by name, DOT, or MC…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">{search ? 'No carriers match your search.' : 'No carriers yet.'}</p>
          {!search && (
            <Link href="/dashboard/carriers/new" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
              Add your first carrier →
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Company', 'DOT / MC', 'Contact', 'Phone', 'Insurance', 'Exp. Date', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{c.companyName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    {c.dot && <div>DOT {c.dot}</div>}
                    {c.mc  && <div>MC {c.mc}</div>}
                    {!c.dot && !c.mc && '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{c.contactName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <InsuranceBadge expiration={c.insuranceExpiration} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(c.insuranceExpiration as { toDate: () => Date } | null)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      c.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/carriers/${c.id}`} className="text-xs text-brand-600 hover:underline font-medium">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
