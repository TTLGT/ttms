'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { listOrders } from '@/lib/orders';
import { getAlerts } from '@/lib/alerts';
import type { Order } from '@/types/order';
import type { OrderAlert } from '@/lib/alerts';
import StatusBadge from '@/components/orders/StatusBadge';
import AlertPanel from '@/components/orders/AlertPanel';

const PENDING_PICKUP_STATUSES = new Set(['booked', 'carrier_assigned', 'carrier_signed', 'shipper_signed']);

function isToday(ts: { toDate?: () => Date } | null): boolean {
  if (!ts || typeof ts.toDate !== 'function') return false;
  const d = ts.toDate();
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function formatDate(ts: { toDate?: () => Date } | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n: number): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  const [orders, setOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<OrderAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listOrders().then((all) => {
      setOrders(all);
      const alertOrders = isAdmin ? all : all.filter((o) => o.createdBy === user?.uid);
      setAlerts(getAlerts(alertOrders));
    }).finally(() => setLoading(false));
  }, []);

  const primary = orders.filter((o) => o.parentOrderId === null || o.parentOrderId === undefined);

  const activeCount        = primary.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length;
  const pendingPickupCount = primary.filter((o) => PENDING_PICKUP_STATUSES.has(o.status)).length;
  const inTransitCount     = primary.filter((o) => o.status === 'in_transit').length;
  const deliveredTodayCount = primary.filter((o) => o.status === 'delivered' && isToday(o.deliveredAt as { toDate: () => Date } | null)).length;

  const STAT_CARDS = [
    { label: 'Active Orders',    value: activeCount,         color: 'bg-blue-50  border-blue-200  text-blue-700'   },
    { label: 'Pending Pick-ups', value: pendingPickupCount,  color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
    { label: 'In Transit',       value: inTransitCount,      color: 'bg-purple-50 border-purple-200 text-purple-700' },
    { label: 'Delivered Today',  value: deliveredTodayCount, color: 'bg-green-50  border-green-200  text-green-700'  },
  ];

  const recentOrders = primary.slice(0, 5);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Good to see you, {firstName} 👋</h1>
        <p className="text-gray-500 mt-1 text-sm">Here&apos;s what&apos;s happening across your fleet today.</p>
      </div>

      {!loading && <AlertPanel alerts={alerts} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {STAT_CARDS.map((card) => (
          <div key={card.label} className={`rounded-xl border px-5 py-5 ${card.color}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{card.label}</p>
            {loading ? (
              <div className="mt-2 h-8 w-10 rounded bg-current opacity-20 animate-pulse" />
            ) : (
              <p className="text-3xl font-bold mt-1">{card.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Recent Orders</h2>
          <Link href="/dashboard/orders" className="text-sm text-brand-500 hover:underline">View all →</Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            No orders yet —{' '}
            <Link href="/dashboard/orders/new" className="text-brand-600 hover:underline">create your first order</Link>.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Order #', 'Shipper', 'Route', 'Status', 'Pickup', 'Rate', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-sm font-mono font-medium text-brand-700">{order.orderNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{order.shipperName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {order.origin?.city}, {order.origin?.state}
                    <span className="mx-1 text-gray-300">→</span>
                    {order.destination?.city}, {order.destination?.state}
                  </td>
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
                    <Link href={`/dashboard/orders/${order.id}`} className="text-xs text-brand-600 hover:underline font-medium">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
