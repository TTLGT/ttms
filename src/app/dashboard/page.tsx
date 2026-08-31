'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PackageOpen, Clock, Truck, PackageCheck,
  DollarSign, TrendingUp, FilePlus, XCircle,
  ReceiptText, PenLine, Hourglass, Building2,
  FlagTriangleRight, UserPlus, ShieldAlert, Paperclip,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listOrdersPage, fetchDashboardSummary, fetchActiveClientLoads } from '@/lib/orders';
import type { DashboardSummary } from '@/lib/orderSummary';
import { listParties } from '@/lib/parties';
import { listCarriers } from '@/lib/carriers';
import { getAlerts } from '@/lib/alerts';
import type { Order } from '@/types/order';
import { partyDisplayName } from '@/types/party';
import type { Party } from '@/types/party';
import type { Carrier } from '@/types/carrier';
import type { OrderAlert } from '@/lib/alerts';
import type { LucideIcon } from 'lucide-react';
import { getInsuranceStatus } from '@/types/carrier';
import { STATUS_LABEL, orderDisplayNumber } from '@/types/order';
import StatusBadge from '@/components/orders/StatusBadge';
import AlertPanel from '@/components/orders/AlertPanel';
import { useDateFormatters } from '@/lib/useDateFormatters';

const PENDING_PICKUP_STATUSES = new Set(['booked', 'carrier_assigned', 'carrier_signed', 'shipper_signed']);

type TS = { toDate?: () => Date } | null | undefined;

function isToday(ts: TS): boolean {
  if (!ts || typeof (ts as any).toDate !== 'function') return false;
  const d = (ts as any).toDate() as Date;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isThisMonth(ts: TS): boolean {
  if (!ts || typeof (ts as any).toDate !== 'function') return false;
  const d = (ts as any).toDate() as Date;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

interface TooltipItem {
  id: string;
  label: string;
  sub?: string;
  badge?: string;
  href?: string;
}

interface StatCard {
  label: string;
  value: string | number;
  color: string;
  icon: LucideIcon;
  anim: string;
  hoverAnim?: string;
  truckPass?: boolean;
  items?: TooltipItem[];
  emptyMsg?: string;
}

function orderToItem(o: Order, badge?: string): TooltipItem {
  const from = o.origin?.city && o.origin?.state ? `${o.origin.city}, ${o.origin.state}` : null;
  const to   = o.destination?.city && o.destination?.state ? `${o.destination.city}, ${o.destination.state}` : null;
  const route = [from, to].filter(Boolean).join(' → ');
  return {
    id: o.id,
    label: orderDisplayNumber(o),
    sub: [route, o.shipperName].filter(Boolean).join(' • '),
    badge,
    href: `/dashboard/orders/${o.id}`,
  };
}

function StatCardGrid({ cards, loading }: { cards: StatCard[]; loading: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const isHovered = hovered === card.label;
        const items = card.items ?? [];

        return (
          <div
            key={card.label}
            style={{ zIndex: isHovered ? 30 : 0 }}
            className={`relative rounded-xl border px-5 py-5 ${card.color} cursor-default transition-shadow ${isHovered ? 'shadow-lg' : ''}`}
            onMouseEnter={() => setHovered(card.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{card.label}</p>
              {card.truckPass ? (
                <div className="w-10 overflow-hidden">
                  <card.icon size={32} className={`opacity-60 ${card.anim}`} />
                </div>
              ) : (
                <card.icon
                  size={32}
                  className={`opacity-60 transition-transform ${isHovered ? (card.hoverAnim ?? card.anim) : card.anim}`}
                />
              )}
            </div>

            {loading ? (
              <div className="mt-2 h-8 w-16 rounded bg-current opacity-20 animate-pulse" />
            ) : (
              <p className={`font-bold mt-1 ${typeof card.value === 'string' ? 'text-2xl' : 'text-3xl'}`}>
                {card.value}
              </p>
            )}

            {isHovered && !loading && card.items !== undefined && (
              <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
                style={{ zIndex: 50 }}>
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
                  <span className="text-xs text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                </div>

                {items.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400 italic">{card.emptyMsg ?? 'Nothing here'}</p>
                ) : (
                  <div className="overflow-y-auto max-h-64">
                    {items.map((item) => {
                      const inner = (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.label}</p>
                            {item.sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.sub}</p>}
                          </div>
                          {item.badge && (
                            <span className="text-xs font-medium text-gray-500 ml-3 shrink-0 mt-0.5">{item.badge}</span>
                          )}
                        </>
                      );
                      return item.href ? (
                        <Link
                          key={item.id}
                          href={item.href}
                          className="flex items-start justify-between px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div
                          key={item.id}
                          className="flex items-start justify-between px-3 py-2 border-b border-gray-50 last:border-0"
                        >
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  // Dates are written the way the company setting says — see Settings →
  // Operations → Date Format.
  const { formatDate } = useDateFormatters();
  const { user, isAdmin } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  const [summary,  setSummary]  = useState<DashboardSummary | null>(null);
  // Loaded on its own, after the rest — it is the one figure that reads every
  // open order instead of counting them. null means "still coming".
  const [clientLoads, setClientLoads] = useState<Record<string, number> | null>(null);
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [clients,  setClients]  = useState<Party[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [alerts,   setAlerts]   = useState<OrderAlert[]>([]);
  const [loading,  setLoading]  = useState(true);

  /*
    The stat cards are counted by the database and arrive as numbers; `orders`
    here is now only the Recent Orders table at the bottom, which shows thirty.

    This page used to download every order in the company — ten thousand
    documents, twelve megabytes, about seventeen seconds — purely so the browser
    could run `filter` over the array twelve times. See lib/orderSummary.ts.
  */
  useEffect(() => {
    Promise.all([
      fetchDashboardSummary(),
      listOrdersPage({ limit: 30, fields: 'list', parentOrderId: '' }),
      // Visibility is applied server-side, so no uid filter is passed here.
      listParties({ role: 'client' }),
      listCarriers(),
    ]).then(([sum, recent, allClients, allCarriers]) => {
      setSummary(sum);
      setOrders(recent.orders);
      setClients(allClients);
      setCarriers(allCarriers);
      // Alerts are raised from the loads that still need attention, which is
      // what the summary's samples already are — the full book is not needed
      // and never was, since an alert about a load closed last year is noise.
      const attention = [
        ...sum.overdueInvoices.items, ...sum.unsignedOrders.items,
        ...sum.staleQuotes.items, ...sum.documentsMissing.items,
        ...sum.pendingPickup.items, ...sum.inTransit.items,
      ] as unknown as Order[];
      const byId = new Map(attention.map((o) => [o.id, o]));
      const alertOrders = isAdmin
        ? [...byId.values()]
        : [...byId.values()].filter((o) => o.createdBy === user?.uid);
      setAlerts(getAlerts(alertOrders));
    }).finally(() => setLoading(false));

    // Deliberately not awaited with the rest: it takes roughly eight times as
    // long as every other card combined, and one slow card should not hold up
    // eleven fast ones.
    fetchActiveClientLoads().then(setClientLoads).catch(() => setClientLoads({}));
  }, []);

  /*
    Every figure below is a number the server counted, not a length the browser
    worked out. `.items` on each is a sample for the hover list — at most
    twenty-five — so a card's tooltip shows the most recent few and the card
    itself shows the true total.
  */
  const s = summary;
  const empty = { count: 0, items: [] as Record<string, unknown>[] };
  const as = (rows: Record<string, unknown>[]) => rows as unknown as Order[];

  const activeOrders        = s?.activeOrders   ?? empty;
  const pendingPickupOrders = s?.pendingPickup  ?? empty;
  const inTransitOrders     = s?.inTransit      ?? empty;
  const deliveredToday      = s?.deliveredToday ?? empty;
  const bookedToday         = s?.bookedToday    ?? empty;

  const revenueThisMonth   = s?.thisMonth.revenue     ?? 0;
  const totalTariff        = s?.thisMonth.totalTariff ?? 0;
  const cancelRate         = s?.thisMonth.cancelRate  ?? 0;
  const cancelledThisMonth = {
    count: s?.thisMonth.cancelled ?? 0,
    items: s?.thisMonth.cancelledItems ?? [],
  };
  const thisMonthActive = { count: s?.thisMonth.orders ?? 0, items: s?.thisMonth.items ?? [] };

  const deliveredThisMonth = s?.deliveredThisMonth ?? empty;
  const overdueInvoices    = s?.overdueInvoices    ?? empty;
  const unsignedOrders     = s?.unsignedOrders     ?? empty;
  const staleQuotes        = s?.staleQuotes        ?? empty;
  const documentsMissing   = s?.documentsMissing   ?? empty;

  const newClientsThisMonth = clients.filter((c) => isThisMonth(c.createdAt as TS));

  const expiringCarriers = carriers.filter((c) => {
    const st = getInsuranceStatus(c.insuranceExpiration);
    return st === 'expiring_soon' || st === 'expired';
  });

  // ── Clients ────────────────────────────────────────────────────────────
  const activeClientLoads = clientLoads ?? {};
  const activeClientIds   = new Set(Object.keys(activeClientLoads));
  const clientMap         = new Map(clients.map((c) => [c.id, c]));

  // ── Card definitions ──────────────────────────────────────────────────────
  const PRIMARY_CARDS: StatCard[] = [
    {
      label: 'Active Orders',
      value: activeOrders.count,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      icon: PackageOpen, anim: 'animate-bounce', hoverAnim: 'animate-pop',
      items: as(activeOrders.items).map((o) => orderToItem(o, STATUS_LABEL[o.status])),
      emptyMsg: 'No active orders',
    },
    {
      label: 'Pending Pick-ups',
      value: pendingPickupOrders.count,
      color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
      icon: Clock, anim: 'animate-spin [animation-duration:3s]', hoverAnim: 'animate-spin [animation-duration:0.8s]',
      items: as(pendingPickupOrders.items).map((o) => orderToItem(o, formatDate(o.pickupDate as TS))),
      emptyMsg: 'No pending pick-ups',
    },
    {
      label: 'In Transit',
      value: inTransitOrders.count,
      color: 'bg-purple-50 border-purple-200 text-purple-700',
      icon: Truck, anim: 'animate-truck-pass', truckPass: true,
      items: as(inTransitOrders.items).map((o) => orderToItem(o, formatDate(o.pickupDate as TS))),
      emptyMsg: 'No loads in transit',
    },
    {
      label: 'Delivered Today',
      value: deliveredToday.count,
      color: 'bg-green-50 border-green-200 text-green-700',
      icon: PackageCheck, anim: '', hoverAnim: 'animate-bounce',
      items: as(deliveredToday.items).map((o) => orderToItem(o, formatCurrency(o.agreedRate))),
      emptyMsg: 'No deliveries today yet',
    },
  ];

  const SECONDARY_CARDS: StatCard[] = [
    {
      label: 'Revenue This Month',
      value: formatCurrency(revenueThisMonth),
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      icon: DollarSign, anim: '', hoverAnim: 'animate-bounce',
      items: as(thisMonthActive.items).map((o) => orderToItem(o, formatCurrency(o.agreedRate))),
      emptyMsg: 'No revenue this month',
    },
    {
      label: 'Total Tariff',
      value: formatCurrency(totalTariff),
      color: 'bg-teal-50 border-teal-200 text-teal-700',
      icon: TrendingUp, anim: '', hoverAnim: 'animate-pulse',
      items: as(thisMonthActive.items).map((o) => orderToItem(o, formatCurrency(o.brokerFee))),
      emptyMsg: 'No tariff this month',
    },
    {
      label: 'Loads Booked Today',
      value: bookedToday.count,
      color: 'bg-sky-50 border-sky-200 text-sky-700',
      icon: FilePlus, anim: '', hoverAnim: 'animate-bounce',
      items: as(bookedToday.items).map((o) => orderToItem(o, STATUS_LABEL[o.status])),
      emptyMsg: 'No loads booked today',
    },
    {
      label: 'Cancelled This Month',
      value: `${cancelledThisMonth.count} (${cancelRate}%)`,
      color: 'bg-red-50 border-red-200 text-red-700',
      icon: XCircle, anim: '', hoverAnim: 'animate-spin [animation-duration:1.5s]',
      items: as(cancelledThisMonth.items).map((o) => orderToItem(o, formatDate(o.updatedAt as TS))),
      emptyMsg: 'No cancellations this month',
    },
    {
      label: 'Overdue Invoices',
      value: overdueInvoices.count,
      color: 'bg-orange-50 border-orange-200 text-orange-700',
      icon: ReceiptText, anim: overdueInvoices.count > 0 ? 'animate-pulse' : '', hoverAnim: 'animate-bounce',
      items: as(overdueInvoices.items).map((o) => orderToItem(o, STATUS_LABEL[o.status])),
      emptyMsg: 'All invoices uploaded',
    },
    {
      label: 'Unsigned Agreements',
      value: unsignedOrders.count,
      color: 'bg-amber-50 border-amber-200 text-amber-700',
      icon: PenLine, anim: unsignedOrders.count > 0 ? 'animate-pulse' : '', hoverAnim: 'animate-wiggle',
      items: as(unsignedOrders.items).map((o) => {
        const missing: string[] = [];
        if (!o.carrierSignedAt) missing.push('Carrier');
        if (!o.shipperSignedAt) missing.push('Shipper');
        return orderToItem(o, `Missing: ${missing.join(', ')}`);
      }),
      emptyMsg: 'All agreements signed',
    },
    {
      label: 'Stale Quotes',
      value: staleQuotes.count,
      color: 'bg-lime-50 border-lime-200 text-lime-700',
      icon: Hourglass, anim: '', hoverAnim: 'animate-spin [animation-duration:2s]',
      items: as(staleQuotes.items).map((o) => {
        const updated = (o.updatedAt as any)?.toDate?.() as Date | undefined;
        const days = updated ? Math.floor((Date.now() - updated.getTime()) / 86_400_000) : null;
        return orderToItem(o, days !== null ? `${days}d old` : undefined);
      }),
      emptyMsg: 'No stale quotes',
    },
    {
      label: 'Active Clients',
      // Its own request is still in flight — say so rather than flash a
      // confident zero that corrects itself a moment later.
      value: clientLoads === null ? '…' : activeClientIds.size,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
      icon: Building2, anim: '', hoverAnim: 'animate-pulse',
      items: Array.from(activeClientIds).map((id) => {
        const client    = clientMap.get(id);
        const loadCount = activeClientLoads[id] ?? 0;
        return {
          id,
          label: client ? partyDisplayName(client) : id,
          sub:   client?.contactName ?? '',
          badge: `${loadCount} load${loadCount !== 1 ? 's' : ''}`,
          href:  `/dashboard/parties/${id}`,
        };
      }),
      emptyMsg: 'No active clients',
    },
    {
      label: 'Delivered This Month',
      value: deliveredThisMonth.count,
      color: 'bg-violet-50 border-violet-200 text-violet-700',
      icon: FlagTriangleRight, anim: '', hoverAnim: 'animate-bounce',
      items: as(deliveredThisMonth.items).map((o) => orderToItem(o, formatDate(o.deliveredAt as TS))),
      emptyMsg: 'No deliveries this month yet',
    },
    {
      label: 'New Clients This Month',
      value: newClientsThisMonth.length,
      color: 'bg-cyan-50 border-cyan-200 text-cyan-700',
      icon: UserPlus, anim: '', hoverAnim: 'animate-bounce',
      items: newClientsThisMonth.map((c) => ({
        id:    c.id,
        label: partyDisplayName(c),
        sub:   c.contactName,
        badge: formatDate(c.createdAt as TS),
        href:  `/dashboard/parties/${c.id}`,
      })),
      emptyMsg: 'No new clients this month',
    },
    {
      label: 'Expiring Insurance',
      value: expiringCarriers.length,
      color: 'bg-rose-50 border-rose-200 text-rose-700',
      icon: ShieldAlert, anim: expiringCarriers.length > 0 ? 'animate-pulse' : '', hoverAnim: 'animate-pop',
      items: expiringCarriers.map((c) => {
        const status  = getInsuranceStatus(c.insuranceExpiration);
        const expDate = formatDate(c.insuranceExpiration as TS);
        return {
          id:    c.id,
          label: c.companyName,
          sub:   c.contactName,
          badge: status === 'expired' ? `Expired ${expDate}` : `Exp. ${expDate}`,
          href:  `/dashboard/carriers/${c.id}`,
        };
      }),
      emptyMsg: 'All carrier insurance is current',
    },
    {
      label: 'Documents Missing',
      value: documentsMissing.count,
      color: 'bg-pink-50 border-pink-200 text-pink-700',
      icon: Paperclip, anim: documentsMissing.count > 0 ? 'animate-pulse' : '', hoverAnim: 'animate-wiggle',
      items: as(documentsMissing.items).map((o) => {
        const missing: string[] = [];
        if (['in_transit', 'delivered', 'completed'].includes(o.status) && !o.bolStoragePath) missing.push('BOL');
        if (['delivered', 'completed'].includes(o.status) && !o.podStoragePath) missing.push('POD');
        return orderToItem(o, `Missing: ${missing.join(', ')}`);
      }),
      emptyMsg: 'All documents uploaded',
    },
  ];

  const recentOrders = orders;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Good to see you, {firstName} 👋</h1>
        <p className="text-gray-500 mt-1 text-sm">Your loads and clients, at a glance.</p>
      </div>

      {!loading && <AlertPanel alerts={alerts} />}

      <div className="mb-4">
        <StatCardGrid cards={PRIMARY_CARDS} loading={loading} />
      </div>

      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Performance &amp; Insights</p>
        <StatCardGrid cards={SECONDARY_CARDS} loading={loading} />
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
          <div className="overflow-y-auto max-h-[320px]">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {['Order #', 'Shipper', 'Route', 'Status', 'Pickup', 'Rate', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-brand-700">{orderDisplayNumber(order)}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{order.shipperName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {order.origin?.city}, {order.origin?.state}
                      <span className="mx-1 text-gray-300">→</span>
                      {order.destination?.city}, {order.destination?.state}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(order.pickupDate as TS)}</td>
                    <td className="px-4 py-3 text-sm text-gray-800 font-medium">{formatCurrency(order.agreedRate)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/orders/${order.id}`} className="text-xs text-brand-600 hover:underline font-medium">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
