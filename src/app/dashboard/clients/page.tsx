'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listClients } from '@/lib/clients';
import { useAuth } from '@/context/AuthContext';
import type { Client } from '@/types/client';

export default function ClientsPage() {
  const { user, isAdmin }      = useAuth();
  const [clients, setClients]  = useState<Client[]>([]);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState('');
  const [search, setSearch]    = useState('');

  useEffect(() => {
    if (!user) return;
    listClients(isAdmin ? undefined : user.uid)
      .then(setClients)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, isAdmin]);

  const filtered = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} total</p>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, company, email, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">{search ? 'No clients match your search.' : 'No clients yet. Run the BATS import to populate.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Company', 'Phone', 'Email', 'Assigned To', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{c.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.company || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.assignedTo || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      c.status === 'Active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {c.status || 'New'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/clients/${c.id}`} className="text-xs text-brand-600 hover:underline font-medium">
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
