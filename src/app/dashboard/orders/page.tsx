'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listOrders } from '@/lib/orders';
import type { Order, OrderStatus } from '@/types/order';
import StatusBadge from '@/components/orders/StatusBadge';
import ResizableTh from '@/components/table/ResizableTh';
import { useColumnWidths, type ColumnWidths } from '@/lib/useColumnWidths';

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

function formatDate(ts: { toDate?: () => Date } | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n: number): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function OrdersPage() {
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [filter, setFilter]   = useState<OrderStatus | 'all'>('all');

  const columnWidths = useColumnWidths(WIDTH_STORAGE_KEY, DEFAULT_WIDTHS);
  const tableWidth = COLUMNS.reduce((sum, c) => sum + (columnWidths.widths[c.key] ?? c.width), 0);

  useEffect(() => {
    listOrders()
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const primaryOrders = orders.filter((o) => o.parentOrderId === null || o.parentOrderId === undefined);

  const visible = filter === 'all'
    ? primaryOrders
    : primaryOrders.filter((o) => o.status === filter);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{primaryOrders.length} total orders</p>
        </div>
        <Link
          href="/dashboard/orders/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition"
        >
          + New Order
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              filter === tab.value
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.value !== 'all' && (
              <span className="ml-1.5 text-xs text-gray-400">
                {primaryOrders.filter((o) => o.status === tab.value).length}
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
          <p className="text-gray-400 text-sm">No orders found.</p>
          <Link href="/dashboard/orders/new" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
            Create your first order →
          </Link>
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
                    {order.orderNumber}
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
        </div>
      )}
    </div>
  );
}
