'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listOrders } from '@/lib/orders';
import type { Order, OrderStatus } from '@/types/order';
import { STATUS_LABEL } from '@/types/order';
import StatusBadge from '@/components/orders/StatusBadge';

const FILTER_TABS: { label: string; value: OrderStatus | 'all' }[] = [
  { label: 'All',            value: 'all' },
  { label: 'Quote',          value: 'quote' },
  { label: 'Booked',         value: 'booked' },
  { label: 'Carrier Assigned', value: 'carrier_assigned' },
  { label: 'In Transit',     value: 'in_transit' },
  { label: 'Delivered',      value: 'delivered' },
  { label: 'Completed',      value: 'completed' },
];

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
      <div className="flex gap-1 mb-6 border-b border-gray-200">
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Order #', 'Client', 'Shipper', 'Route', 'Commodity', 'Status', 'Pickup', 'Rate', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-sm font-mono font-medium text-brand-700">
                    {order.orderNumber}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800">{order.clientName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{order.shipperName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {order.origin?.city}, {order.origin?.state}
                    <span className="mx-1 text-gray-300">→</span>
                    {order.destination?.city}, {order.destination?.state}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{order.commodity || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(order.pickupDate as { toDate: () => Date } | null)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800 font-medium">
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
