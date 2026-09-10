'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PackageOpen, Clock, Truck, PackageCheck,
  DollarSign, TrendingUp, FilePlus, XCircle,
  ReceiptText, PenLine, Hourglass, Building2,
  FlagTriangleRight, UserPlus, ShieldAlert, Paperclip,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listOrdersPage, fetchDashboardSummary, fetchActiveClientLoads } from '@/lib/orders';
import type { ActiveClient, DashboardSummary } from '@/lib/orderSummary';
import { getAlerts } from '@/lib/alerts';
import type { Order } from '@/types/order';
import type { OrderAlert } from '@/lib/alerts';
import type { LucideIcon } from 'lucide-react';
import { STATUS_LABEL, orderDisplayNumber } from '@/types/order';
import type { OrderViewId } from '@/types/orderView';
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
  items?: TooltipItem[];
  emptyMsg?: string;
  /**
   * Where the card leads. Every order card points at the Orders screen filtered
   * to the same slice it counted — see src/lib/orderViews.ts — so the number and
   * the list behind it cannot disagree.
   */
  href?: string;
  /**
   * A card that means somebody has something to do. It is the only thing on this
   * page allowed to move, and only while its number is above zero.
   *
   * Every card used to animate: a bouncing box, a spinning clock, a truck
   * driving past. On a screen people leave open all day that is not decoration,
   * it is competition — the four figures that actually need chasing had no way
   * to stand out from the eleven that were merely present.
   */
  alert?: boolean;
}

/**
 * Where a card sends you: the Orders screen, filtered to what the card counted.
 *
 * The id is the view's, not a status — several of these cards are a set of
 * statuses, or a condition no status describes at all. See lib/orderViews.ts.
 */
/**
 * Whether the insights block is open, remembered per browser.
 *
 * Twelve secondary figures are worth having and are not worth the top half of
 * the screen every morning, so the block starts folded down to one dense row
 * and stays however it was left. Local to the browser on purpose: this is a
 * preference about a screen, not a company setting, and it is not worth a
 * document read to answer.
 */
const INSIGHTS_KEY = 'ttms.dashboard.insightsOpen';

function ordersView(view: OrderViewId): string {
  return `/dashboard/orders?view=${view}`;
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

function StatCardGrid({
  cards, loading, compact = false,
}: {
  cards: StatCard[];
  loading: boolean;
  /** The dense form: the same cards, six to a row, for a section folded away. */
  compact?: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className={compact
      ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2'
      : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'}
    >
      {cards.map((card) => {
        const isHovered = hovered === card.label;
        const items = card.items ?? [];
        // Only a number can be above zero. A card reading "$1,000" or "0 (0%)" is
        // a figure to read, not a queue to work through.
        const needsAction = !!card.alert && typeof card.value === 'number' && card.value > 0;

        const face = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className={`font-semibold uppercase tracking-wide opacity-70 ${
                compact ? 'text-[10px] leading-tight' : 'text-xs'
              }`}>
                {card.label}
              </p>
              <card.icon
                size={compact ? 15 : 32}
                className={`shrink-0 opacity-60 ${needsAction ? 'animate-pulse' : ''}`}
              />
            </div>

            {loading ? (
              <div className={`mt-2 rounded bg-current opacity-20 animate-pulse ${
                compact ? 'h-5 w-10' : 'h-8 w-16'
              }`} />
            ) : (
              <p className={`font-bold ${
                compact
                  ? 'mt-0.5 text-xl'
                  : typeof card.value === 'string' ? 'mt-1 text-2xl' : 'mt-1 text-3xl'
              }`}>
                {card.value}
              </p>
            )}
          </>
        );

        return (
          <div
            key={card.label}
            style={{ zIndex: isHovered ? 30 : 0 }}
            className={`relative rounded-xl border ${card.color} transition-shadow ${
              compact ? 'px-3 py-2.5' : 'px-5 py-5'
            } ${isHovered ? 'shadow-lg' : ''}`}
            onMouseEnter={() => setHovered(card.label)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* The link wraps the card's face, never the whole tile: the hover
                list below is full of links of its own, and an anchor inside an
                anchor is invalid HTML that browsers resolve by dropping one. */}
            {card.href ? (
              <Link href={card.href} className="block" title={`See all: ${card.label}`}>
                {face}
              </Link>
            ) : (
              <div className="cursor-default">{face}</div>
            )}

            {isHovered && !loading && card.items !== undefined && (
              <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
                style={{ zIndex: 50 }}>
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
                  {/* What the card counted, not what this list holds. The list is
                      the newest five; saying "5 items" beneath a card reading 112
                      would look like one of the two numbers was wrong. */}
                  <span className="text-xs text-gray-400">
                    {typeof card.value === 'number' && card.value > items.length
                      ? `newest ${items.length} of ${card.value}`
                      : `${items.length} item${items.length !== 1 ? 's' : ''}`}
                  </span>
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

                {/* The way to the rest. The hover list is five rows now, so it
                    stopped being the place you go to see everything. */}
                {card.href && (
                  <Link
                    href={card.href}
                    className="block border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-brand-600 hover:bg-gray-100 transition"
                  >
                    See all {card.label.toLowerCase()} &rarr;
                  </Link>
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

  /* Shut until told otherwise, and read after mount rather than during it:
     localStorage does not exist on the server, and seeding state from it
     directly would render one thing on the server and another in the browser. */
  const [insightsOpen, setInsightsOpen] = useState(false);
  useEffect(() => {
    try { setInsightsOpen(localStorage.getItem(INSIGHTS_KEY) === 'open'); } catch { /* private window */ }
  }, []);

  const [summary,  setSummary]  = useState<DashboardSummary | null>(null);
  /**
   * Loaded on its own, after the rest — it is the one figure that reads every
   * open order instead of counting them. null means "still coming".
   *
   * That read is what makes this card worth watching. "Open loads per client"
   * is not an aggregation Firestore offers, so the cost is one document per
   * open order, on every mount, for everyone. It stopped being loaded at all
   * for a day in September 2026: nine thousand imported BATS loads were parked
   * in `carrier_assigned` and still counted as open, so this call read about
   * ten thousand documents and five views of this page spent the whole daily
   * quota — after which nobody could sign in, because /api/auth/session needs
   * a read of its own and got RESOURCE_EXHAUSTED instead.
   *
   * The imported book was cleared on 2026-09-10 and the card went back to
   * loading on its own. What made it safe was the data, not this code, so the
   * thing to watch is the number of open orders rather than this line: if it
   * climbs back into the thousands, this becomes the most expensive thing on
   * the page again and should go back to being asked for.
   */
  const [clientLoads, setClientLoads] = useState<{
    loads: Record<string, number>;
    top: ActiveClient[];
  } | null>(null);
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [alerts,   setAlerts]   = useState<OrderAlert[]>([]);
  const [loading,  setLoading]  = useState(true);
  // A failed summary used to be indistinguishable from an empty company: every
  // card fell back to zero and Recent Orders said "No orders yet — create your
  // first order" over ten thousand of them. Say what happened instead.
  const [error,    setError]    = useState<string | null>(null);

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
    ]).then(([sum, recent]) => {
      setSummary(sum);
      setOrders(recent.orders);
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
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
    }).finally(() => setLoading(false));

    // Deliberately not awaited with the rest: it takes roughly eight times as
    // long as every other card combined, and one slow card should not hold up
    // eleven fast ones.
    fetchActiveClientLoads()
      .then(setClientLoads)
      .catch(() => setClientLoads({ loads: {}, top: [] }));
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

  const newClientsThisMonth = s?.newClients   ?? empty;
  const expiringCarriers    = s?.expiringCarriers ?? empty;

  // ── Clients ────────────────────────────────────────────────────────────
  // Counted and named by the server. The page used to download every party in
  // the company to turn twenty-five ids into labels.
  const activeClientCount = clientLoads ? Object.keys(clientLoads.loads).length : null;
  const topClients        = clientLoads?.top ?? [];

  // ── Card definitions ──────────────────────────────────────────────────────
  const PRIMARY_CARDS: StatCard[] = [
    {
      label: 'Active Orders',
      value: activeOrders.count,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      icon: PackageOpen,
      href: ordersView('active'),
      items: as(activeOrders.items).map((o) => orderToItem(o, STATUS_LABEL[o.status])),
      emptyMsg: 'No active orders',
    },
    {
      label: 'Pending Pick-ups',
      value: pendingPickupOrders.count,
      color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
      icon: Clock,
      href: ordersView('pending_pickup'),
      items: as(pendingPickupOrders.items).map((o) => orderToItem(o, formatDate(o.pickupDate as TS))),
      emptyMsg: 'No pending pick-ups',
    },
    {
      label: 'In Transit',
      value: inTransitOrders.count,
      color: 'bg-purple-50 border-purple-200 text-purple-700',
      icon: Truck,
      href: ordersView('in_transit'),
      items: as(inTransitOrders.items).map((o) => orderToItem(o, formatDate(o.pickupDate as TS))),
      emptyMsg: 'No loads in transit',
    },
    {
      label: 'Delivered Today',
      value: deliveredToday.count,
      color: 'bg-green-50 border-green-200 text-green-700',
      icon: PackageCheck,
      href: ordersView('delivered_today'),
      items: as(deliveredToday.items).map((o) => orderToItem(o, formatCurrency(o.agreedRate))),
      emptyMsg: 'No deliveries today yet',
    },
  ];

  const SECONDARY_CARDS: StatCard[] = [
    {
      label: 'Revenue This Month',
      value: formatCurrency(revenueThisMonth),
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      icon: DollarSign,
      href: ordersView('this_month'),
      items: as(thisMonthActive.items).map((o) => orderToItem(o, formatCurrency(o.agreedRate))),
      emptyMsg: 'No revenue this month',
    },
    {
      label: 'Total Tariff',
      value: formatCurrency(totalTariff),
      color: 'bg-teal-50 border-teal-200 text-teal-700',
      icon: TrendingUp,
      href: ordersView('this_month'),
      items: as(thisMonthActive.items).map((o) => orderToItem(o, formatCurrency(o.brokerFee))),
      emptyMsg: 'No tariff this month',
    },
    {
      label: 'Loads Booked Today',
      value: bookedToday.count,
      color: 'bg-sky-50 border-sky-200 text-sky-700',
      icon: FilePlus,
      href: ordersView('booked_today'),
      items: as(bookedToday.items).map((o) => orderToItem(o, STATUS_LABEL[o.status])),
      emptyMsg: 'No loads booked today',
    },
    {
      label: 'Cancelled This Month',
      value: `${cancelledThisMonth.count} (${cancelRate}%)`,
      color: 'bg-red-50 border-red-200 text-red-700',
      icon: XCircle,
      href: ordersView('cancelled_month'),
      items: as(cancelledThisMonth.items).map((o) => orderToItem(o, formatDate(o.updatedAt as TS))),
      emptyMsg: 'No cancellations this month',
    },
    {
      label: 'Overdue Invoices',
      value: overdueInvoices.count,
      color: 'bg-orange-50 border-orange-200 text-orange-700',
      icon: ReceiptText,
      href: ordersView('overdue_invoices'), alert: true,
      items: as(overdueInvoices.items).map((o) => orderToItem(o, STATUS_LABEL[o.status])),
      emptyMsg: 'All invoices uploaded',
    },
    {
      label: 'Unsigned Agreements',
      value: unsignedOrders.count,
      color: 'bg-amber-50 border-amber-200 text-amber-700',
      icon: PenLine,
      href: ordersView('unsigned'), alert: true,
      items: as(unsignedOrders.items).map((o) => {
        const missing: string[] = [];
        if (!o.carrierSignedAt) missing.push('Carrier');
        // Waived is not missing: somebody decided this load goes without the
        // client's signature, so listing it as outstanding would send staff
        // chasing a decision that has already been made.
        if (!o.shipperSignedAt && !o.signatureWaivedAt) missing.push('Client');
        return orderToItem(o, `Missing: ${missing.join(', ')}`);
      }),
      emptyMsg: 'All agreements signed',
    },
    {
      label: 'Stale Quotes',
      value: staleQuotes.count,
      color: 'bg-lime-50 border-lime-200 text-lime-700',
      icon: Hourglass,
      href: ordersView('stale_quotes'), alert: true,
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
      value: activeClientCount === null ? '…' : activeClientCount,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
      icon: Building2,
      href: '/dashboard/clients',
      // The busiest twenty-five, named by the server.
      items: topClients.map((c) => ({
        id:    c.id,
        label: c.name,
        sub:   c.contactName,
        badge: `${c.loads} load${c.loads !== 1 ? 's' : ''}`,
        href:  `/dashboard/parties/${c.id}`,
      })),
      emptyMsg: 'No active clients',
    },
    {
      label: 'Delivered This Month',
      value: deliveredThisMonth.count,
      color: 'bg-violet-50 border-violet-200 text-violet-700',
      icon: FlagTriangleRight,
      href: ordersView('delivered_month'),
      items: as(deliveredThisMonth.items).map((o) => orderToItem(o, formatDate(o.deliveredAt as TS))),
      emptyMsg: 'No deliveries this month yet',
    },
    {
      label: 'New Clients This Month',
      value: newClientsThisMonth.count,
      color: 'bg-cyan-50 border-cyan-200 text-cyan-700',
      icon: UserPlus,
      href: '/dashboard/clients',
      items: newClientsThisMonth.items.map((c) => ({
        id:    String(c.id),
        label: String(c.companyName || c.contactName || c.id),
        sub:   String(c.contactName ?? ''),
        badge: formatDate(c.createdAt as TS),
        href:  `/dashboard/parties/${c.id}`,
      })),
      emptyMsg: 'No new clients this month',
    },
    {
      label: 'Expiring Insurance',
      value: expiringCarriers.count,
      color: 'bg-rose-50 border-rose-200 text-rose-700',
      icon: ShieldAlert,
      href: '/dashboard/carriers', alert: true,
      items: expiringCarriers.items.map((c) => {
        const expiry  = c.insuranceExpiration as TS;
        const expDate = formatDate(expiry);
        const expired = !!expiry?.toDate && expiry.toDate().getTime() < Date.now();
        return {
          id:    String(c.id),
          label: String(c.companyName ?? ''),
          sub:   String(c.contactName ?? ''),
          badge: expired ? `Expired ${expDate}` : `Exp. ${expDate}`,
          href:  `/dashboard/carriers/${c.id}`,
        };
      }),
      emptyMsg: 'All carrier insurance is current',
    },
    {
      label: 'Documents Missing',
      value: documentsMissing.count,
      color: 'bg-pink-50 border-pink-200 text-pink-700',
      icon: Paperclip,
      href: ordersView('documents_missing'), alert: true,
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Good to see you, {firstName} 👋</h1>
        <p className="text-gray-500 mt-1 text-sm">Your loads and clients, at a glance.</p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-800">These figures could not be loaded</p>
          <p className="text-sm text-red-700 mt-1">
            The numbers below are not zero — they are missing. {error}
          </p>
        </div>
      )}

      {!loading && <AlertPanel alerts={alerts} />}

      <div className="mb-4">
        <StatCardGrid cards={PRIMARY_CARDS} loading={loading} />
      </div>

      <div className="mb-10">
        <button
          type="button"
          onClick={() => setInsightsOpen((was) => {
            const next = !was;
            try { localStorage.setItem(INSIGHTS_KEY, next ? 'open' : 'closed'); } catch { /* private window */ }
            return next;
          })}
          aria-expanded={insightsOpen}
          className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 transition hover:text-gray-600"
        >
          Performance &amp; Insights
          {insightsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="font-medium normal-case tracking-normal">
            {insightsOpen ? 'Show less' : 'Show more'}
          </span>
        </button>
        <StatCardGrid cards={SECONDARY_CARDS} loading={loading} compact={!insightsOpen} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-gray-800">Recent Orders</h2>
          <Link href="/dashboard/orders" className="text-sm text-brand-500 hover:underline">View all →</Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          // Not the same thing as having no orders, and inviting someone to
          // create their first one when the load failed is a lie.
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            Recent orders could not be loaded.
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            No orders yet —{' '}
            <Link href="/dashboard/orders/new" className="text-brand-600 hover:underline">create your first order</Link>.
          </div>
        ) : (
          <div className="overflow-auto max-h-[320px]">
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
