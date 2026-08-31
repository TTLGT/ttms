'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { listOrdersPage, countOrdersByStatus } from '@/lib/orders';
import type { Order, OrderStatus } from '@/types/order';
import { orderDisplayNumber } from '@/types/order';
import StatusBadge from '@/components/orders/StatusBadge';
import ResizableTh from '@/components/table/ResizableTh';
import { useColumnWidths, type ColumnWidths } from '@/lib/useColumnWidths';
import { useDateFormatters } from '@/lib/useDateFormatters';

const FILTER_TABS: { label: string; value: OrderStatus | 'all' }[] = [
  { label: 'All',            value: 'all' },
  { label: 'Quote',          value: 'quote' },
  { label: 'Booked',         value: 'booked' },
  { label: 'Carrier Assigned', value: 'carrier_assigned' },
  { label: 'In Transit',     value: 'in_transit' },
  { label: 'Delivered',      value: 'delivered' },
  { label: 'Completed',      value: 'completed' },
];

/**
 * Column order, labels and starting widths in one place.
 *
 * The keys are persisted in the user's browser, so renaming one silently
 * discards everyone's saved width for that column — change a key only when you
 * mean to reset it.
 */
const COLUMNS: { key: string; label: string; align?: 'left' | 'right'; width: number }[] = [
  { key: 'orderNumber', label: 'Order #',   width: 120 },
  { key: 'client',      label: 'Client',    width: 150 },
  { key: 'shipper',     label: 'Shipper',   width: 165 },
  { key: 'route',       label: 'Route',     width: 230 },
  { key: 'commodity',   label: 'Commodity', width: 300 },
  { key: 'status',      label: 'Status',    width: 145 },
  { key: 'pickup',      label: 'Pickup',    width: 120 },
  { key: 'rate',        label: 'Rate',      width: 105 },
  { key: 'actions',     label: '',          width: 90, align: 'right' },
];

// Module-level so the hook's load effect has a stable dependency.
const DEFAULT_WIDTHS: ColumnWidths = Object.fromEntries(COLUMNS.map((c) => [c.key, c.width]));

const WIDTH_STORAGE_KEY = 'ttms.columnWidths.orders';

/**
 * Rows per request.
 *
 * The list used to fetch the entire collection — ten thousand orders, twelve
 * megabytes and seventeen seconds before a single row appeared, then ninety
 * thousand table cells for the browser to lay out. Fifty comfortably overfills
 * a screen, and the next fifty arrive in about a quarter of a second.
 */
const PAGE_SIZE = 50;

function formatCurrency(n: number): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

/** Guards the tab read out of the URL — anything else falls back to All. */
function isStatus(value: string | null): value is OrderStatus {
  return !!value && FILTER_TABS.some((t) => t.value === value && t.value !== 'all');
}

function OrdersList() {
  // Dates are written the way the company setting says — see Settings →
  // Operations → Date Format.
  const { formatDate } = useDateFormatters();
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor]   = useState<string | null>(null);
  const [error, setError]     = useState('');
  const [counts, setCounts]   = useState<Record<string, number> | null>(null);

  /*
    The search text and the status tab live in the URL, not in component state.

    That is what makes a result openable and returnable-from: a broker searches
    for a customer, opens the third load, decides it is the wrong one and hits
    Back — and lands on the same search, not an empty box and page one. It also
    makes the list linkable, so "the Laredo quotes" can be pasted into chat.

    Written with `replace` rather than `push`, so typing does not leave a
    history entry per letter. Back still returns here from an order, because
    opening the order was itself a push.
  */
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const applied = (searchParams.get('q') ?? '').trim();
  const filter: OrderStatus | 'all' = isStatus(searchParams.get('status'))
    ? (searchParams.get('status') as OrderStatus)
    : 'all';

  const setParam = useCallback((key: string, value: string, fallback: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // The default is left out entirely, so a bare /dashboard/orders keeps
    // meaning exactly what it means today.
    if (value === fallback) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  // The text box is local so it stays responsive between keystrokes; the URL
  // is the source of truth for what has actually been searched.
  const [search, setSearch] = useState(applied);

  // Back, Forward, or a pasted link changed the URL from outside. The guard
  // keeps this from fighting the user mid-word, since the URL trails the box
  // by one debounce.
  useEffect(() => {
    setSearch((current) => (current.trim() === applied ? current : applied));
  }, [applied]);

  useEffect(() => {
    if (search.trim() === applied) return;
    const t = setTimeout(() => setParam('q', search.trim(), ''), 250);
    return () => clearTimeout(t);
  }, [search, applied, setParam]);

  const columnWidths = useColumnWidths(WIDTH_STORAGE_KEY, DEFAULT_WIDTHS);
  const tableWidth = COLUMNS.reduce((sum, c) => sum + (columnWidths.widths[c.key] ?? c.width), 0);

  /**
   * Guards against a stale page landing after the user has changed tabs. Each
   * load stamps the request it belongs to and discards its own result if the
   * filter has moved on — otherwise a slow "All" response arrives after a fast
   * "Quote" one and quietly fills the table with the wrong rows.
   */
  const requestId = useRef(0);

  const loadPage = useCallback(async (after: string | null) => {
    const mine = ++requestId.current;
    if (after) setLoadingMore(true); else setLoading(true);
    try {
      const page = await listOrdersPage({
        limit:  PAGE_SIZE,
        cursor: after,
        fields: 'list',
        status: filter === 'all' ? undefined : filter,
        search: applied || undefined,
        // Suborders belong under their parent, never in the top-level list.
        // Filtered by the server now, so a page of fifty is fifty rows the
        // list will actually show.
        parentOrderId: '',
      });
      if (mine !== requestId.current) return;
      setOrders((prev) => (after ? [...prev, ...page.orders] : page.orders));
      setCursor(page.cursor);
      setError('');
    } catch (e) {
      if (mine === requestId.current) setError((e as Error).message);
    } finally {
      if (mine === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [filter, applied]);

  // Re-runs when the tab changes, which resets to the first page of that status.
  useEffect(() => { setOrders([]); setCursor(null); void loadPage(null); }, [loadPage]);

  // The tab counts come from Firestore aggregations — about eleven document
  // reads for the whole row, rather than the ten thousand it took to count
  // them in the browser. Loaded once; they do not change as pages are added.
  useEffect(() => {
    countOrdersByStatus().then(setCounts).catch(() => setCounts(null));
  }, []);

  const visible = orders;
  const totalLabel = counts
    ? Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()
    : '…';

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{totalLabel} total orders</p>
        </div>
        <Link
          href="/dashboard/orders/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition"
        >
          + New Order
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by order number, customer, city, or commodity…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        {applied && !loading && (
          <span className="ml-3 text-xs text-gray-400">
            {visible.length}{cursor ? '+' : ''} matching
            {filter !== 'all' && ' in this tab'}
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setParam('status', tab.value, 'all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              filter === tab.value
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.value !== 'all' && counts && (
              <span className="ml-1.5 text-xs text-gray-400">
                {counts[tab.value] ?? 0}
              </span>
            )}
          </button>
        ))}

        {/* Only offered once there is something to undo. */}
        {columnWidths.customized && (
          <button
            onClick={columnWidths.reset}
            className="ml-auto mb-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-700 transition"
            title="Put every column back to its standard width"
          >
            Reset column widths
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          {applied ? (
            <>
              <p className="text-gray-400 text-sm">
                No orders match “{applied}”{filter !== 'all' && ' in this tab'}.
              </p>
              {/*
                Worth saying, because the tab is a filter the reader may have
                forgotten is on — and searching a tab that happens to be empty
                looks exactly like a search that found nothing anywhere.
              */}
              {filter !== 'all' && (
                <button
                  onClick={() => setParam('status', 'all', 'all')}
                  className="mt-3 text-sm text-brand-600 hover:underline"
                >
                  Search every status instead →
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-gray-400 text-sm">No orders found.</p>
              <Link href="/dashboard/orders/new" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
                Create your first order →
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          {/*
            `table-fixed` is what makes the widths stick: under the default auto
            layout the browser re-measures every column against its content and
            quietly overrides whatever the user dragged.
          */}
          <table className="min-w-full table-fixed divide-y divide-gray-100" style={{ width: tableWidth }}>
            <colgroup>
              {COLUMNS.map((col, i) => (
                <col
                  key={col.key}
                  // The trailing column is left unsized so it soaks up any slack
                  // when the window is wider than the columns need.
                  style={i === COLUMNS.length - 1 ? undefined : { width: columnWidths.widths[col.key] ?? col.width }}
                />
              ))}
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                {COLUMNS.map((col, i) => (
                  <ResizableTh
                    key={col.key}
                    columnKey={col.key}
                    label={col.label}
                    align={col.align}
                    resizable={i !== COLUMNS.length - 1}
                    controls={columnWidths}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition">
                  {/*
                    Cells clip or wrap rather than pushing their column wider —
                    under a fixed layout an overflowing cell spills across its
                    neighbour instead of resizing it. Free text wraps so a wider
                    column reveals more of it; short fixed values truncate.
                  */}
                  <td className="px-4 py-3 text-sm font-mono font-medium text-brand-700 break-words">
                    {orderDisplayNumber(order)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800 break-words">{order.clientName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 break-words">{order.shipperName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 break-words">
                    {order.origin?.city}, {order.origin?.state}
                    <span className="mx-1 text-gray-300">→</span>
                    {order.destination?.city}, {order.destination?.state}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 break-words">{order.commodity || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 truncate">
                    {formatDate(order.pickupDate as { toDate: () => Date } | null)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800 font-medium truncate">
                    {formatCurrency(order.agreedRate)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="text-xs text-brand-600 hover:underline font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/*
            A button rather than infinite scroll on purpose: this table is the
            screen brokers scan for a load they half-remember, and a list that
            grows under the scrollbar makes "somewhere near the bottom" a moving
            target. The count says how far in they are, so the number they read
            out to a colleague still means something.
          */}
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
                Showing {visible.length.toLocaleString()}
                {counts && (filter === 'all'
                  ? ` of ${totalLabel}`
                  : ` of ${(counts[filter] ?? 0).toLocaleString()}`)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  // Suspense is required because the list reads its search text and status tab
  // out of useSearchParams(), which suspends on the server render. Same reason
  // as the Directory page.
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      }
    >
      <OrdersList />
    </Suspense>
  );
}
