'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { listCarriersPage, countCarriers } from '@/lib/carriers';
import type { Carrier } from '@/types/carrier';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import InsuranceBadge from '@/components/carriers/InsuranceBadge';
import { useDateFormatters } from '@/lib/useDateFormatters';

/** See the orders list for why fifty. */
const PAGE_SIZE = 50;

function CarriersList() {
  // Dates are written the way the company setting says — see Settings →
  // Operations → Date Format.
  const { formatDate } = useDateFormatters();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor]     = useState<QueryDocumentSnapshot | null>(null);
  const [error, setError]       = useState('');

  /*
    Search and the inactive toggle live in the URL for the same reason they do
    on the orders list: opening a carrier and coming back should return to the
    search that found it, not to an empty box. `replace`, so typing leaves no
    history to walk back through.
  */
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const applied      = (searchParams.get('q') ?? '').trim();
  const showInactive = searchParams.get('inactive') === '1';

  const setParam = useCallback((key: string, value: string, fallback: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === fallback) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  // Local so the box stays responsive; the URL is what has actually been run.
  const [search, setSearch] = useState(applied);

  useEffect(() => {
    setSearch((current) => (current.trim() === applied ? current : applied));
  }, [applied]);

  useEffect(() => {
    // 250ms is long enough that typing a carrier name is one query rather than
    // fifteen, and short enough that the list feels like it is keeping up.
    if (search.trim() === applied) return;
    const t = setTimeout(() => setParam('q', search.trim(), ''), 250);
    return () => clearTimeout(t);
  }, [search, applied, setParam]);

  // Discards a response whose request has been superseded — a slow search
  // landing after a later one would otherwise show results for the wrong text.
  const requestId = useRef(0);

  const loadPage = useCallback(async (after: QueryDocumentSnapshot | null) => {
    const mine = ++requestId.current;
    if (after) setLoadingMore(true); else setLoading(true);
    try {
      const page = await listCarriersPage({
        limit:      PAGE_SIZE,
        after,
        search:     applied,
        activeOnly: !showInactive,
      });
      if (mine !== requestId.current) return;
      setCarriers((prev) => (after ? [...prev, ...page.carriers] : page.carriers));
      setCursor(page.cursor);
      setError('');
    } catch (e) {
      if (mine === requestId.current) setError((e as Error).message);
    } finally {
      if (mine === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [applied, showInactive]);

  // Re-runs whenever the search text or the inactive toggle changes, which
  // starts that query over from its first page.
  useEffect(() => { setCarriers([]); setCursor(null); void loadPage(null); }, [loadPage]);

  // Counted by the database, once. These do not move as pages are appended.
  const [counts, setCounts] = useState<{ active: number; inactive: number } | null>(null);
  useEffect(() => { countCarriers().then(setCounts).catch(() => setCounts(null)); }, []);

  const filtered = carriers;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Carriers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {counts
              ? `${counts.active.toLocaleString()} active · ${counts.inactive.toLocaleString()} inactive`
              : '…'}
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <input
          type="text"
          placeholder="Search by name start, DOT, or MC…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setParam('inactive', e.target.checked ? '1' : '', '')}
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
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
                Showing {filtered.length.toLocaleString()}
                {!applied && counts &&
                  ` of ${(showInactive
                    ? counts.active + counts.inactive
                    : counts.active).toLocaleString()}`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function CarriersPage() {
  // Suspense is required because the list reads its search text and the
  // inactive toggle out of useSearchParams(), which suspends on the server
  // render. Same reason as the orders list and the Directory page.
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      }
    >
      <CarriersList />
    </Suspense>
  );
}
