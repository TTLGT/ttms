/**
 * The dashboard's numbers, worked out in the database rather than the browser.
 *
 * The home page shows about a dozen counts and totals over the whole order
 * book, each with a hover list of the orders behind it. It used to get all of
 * that by downloading every order — ten thousand documents and twelve megabytes
 * — and running `filter` over the array. That is the single slowest thing in
 * the app, and it is slow in the way that gets worse every week: the wait grows
 * with the number of loads the company has ever booked.
 *
 * Two ideas replace it.
 *
 * The first is that a count is not a list. Firestore's count() reads one
 * document per thousand it counts, so every card's number together costs a few
 * dozen reads instead of ten thousand.
 *
 * The second is that a hover list does not need to be complete. "Active
 * Orders" is currently around nine thousand, and a tooltip listing nine
 * thousand loads was never something anybody read — it was just something the
 * page happened to have in memory. Each list is capped at TOOLTIP_LIMIT and the
 * card says how many more there are.
 */

import { adminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { canSeeAllParties } from './accessControl';
import { listVisibleOrdersPage } from './orderAccess';
import { listVisibleParties } from './partyAccess';
import type { Caller } from './partyAccess';

const COL = 'orders';

/** How many orders a card's hover list shows before it says "and N more". */
const TOOLTIP_LIMIT = 25;

/** Statuses that count as work still in progress. */
const PENDING_PICKUP = ['booked', 'carrier_assigned', 'carrier_signed', 'shipper_signed'] as const;
/** Statuses at or past the point where both signatures should exist. */
const SIGNABLE = [
  'carrier_assigned', 'carrier_signed', 'shipper_signed',
  'in_transit', 'delivered', 'completed',
] as const;
/** Statuses where an invoice is owed. */
const INVOICEABLE = ['delivered', 'completed'] as const;

/** One card's worth of answer: the true total, and a sample to show on hover. */
export interface SummaryStat {
  count: number;
  /** At most TOOLTIP_LIMIT orders. `count` is the real total. */
  items: Record<string, unknown>[];
}

export interface DashboardSummary {
  byStatus: Record<string, number>;
  activeOrders: SummaryStat;
  pendingPickup: SummaryStat;
  inTransit: SummaryStat;
  deliveredToday: SummaryStat;
  bookedToday: SummaryStat;
  thisMonth: {
    revenue: number;
    totalTariff: number;
    orders: number;
    cancelled: number;
    /** Percentage, already rounded. */
    cancelRate: number;
    items: Record<string, unknown>[];
    cancelledItems: Record<string, unknown>[];
  };
  deliveredThisMonth: SummaryStat;
  /** Parties first seen this month, counted rather than listed. */
  newClients: SummaryStat;
  /** Carriers whose insurance has lapsed or is about to. */
  expiringCarriers: SummaryStat;
  overdueInvoices: SummaryStat;
  unsignedOrders: SummaryStat;
  staleQuotes: SummaryStat;
  documentsMissing: SummaryStat;
}

const CARD_FIELDS = [
  'orderNumber', 'batsId', 'status', 'origin', 'destination', 'shipperName',
  'clientId', 'agreedRate', 'brokerFee', 'pickupDate', 'updatedAt', 'deliveredAt',
] as const;

export async function buildDashboardSummary(caller: Caller): Promise<DashboardSummary> {
  const now        = new Date();
  const dayStart   = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const monthStart = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), 1));
  // A quote nobody has touched in a week is the one worth chasing.
  const staleBefore = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);

  if (!canSeeAllParties(caller.profile)) {
    return summariseInMemory(caller, { dayStart, monthStart, staleBefore });
  }

  const col = adminDb.collection(COL).where('parentOrderId', '==', null);

  /**
   * A count and a sample, from one filtered query.
   *
   * `sortField` is null wherever the filter is an `in` or `not-in` on status.
   * Firestore would insist that such a query sort on status first, and asking
   * for it explicitly builds an index carrying status twice — once for the
   * filter, once for the sort. The sample is twenty-five rows behind a hover;
   * the order it arrives in is not worth an index of its own.
   *
   * `rangeSorted` says `sortField` is the field the filter's range is on, and
   * makes the count carry that same sort. A count is normally asked unsorted,
   * but a query with an inequality is never unordered to Firestore: it sorts
   * implicitly *ascending* on the inequality field, while the index serving the
   * sample is descending on it. An index can be read backwards, but that
   * reverses every field in it — `parentOrderId` included — so the descending
   * index cannot answer the ascending form, and Firestore asks for a second
   * index differing from the first only in direction. Sorting the count the way
   * the sample is already sorted answers both from the one index.
   *
   * Only correct where the range is on the sort field: `orderBy` drops
   * documents missing that field, and there the inequality has dropped them
   * already, so the count is the same number. This is why four cards read zero
   * on a dashboard whose every other figure was right — the counts failed, the
   * whole summary rejected with them, and the page showed its empty state.
   */
  const stat = async (
    build: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query,
    sortField: string | null = 'createdAt',
    rangeSorted = false,
  ): Promise<SummaryStat> => {
    const q = build(col);
    const sampleQuery = sortField ? q.orderBy(sortField, 'desc') : q;
    const [total, sample] = await Promise.all([
      (rangeSorted ? sampleQuery : q).count().get(),
      sampleQuery.limit(TOOLTIP_LIMIT).select(...CARD_FIELDS).get(),
    ]);
    return {
      count: total.data().count,
      items: sample.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  };

  const statuses = [
    'quote', 'booked', 'carrier_assigned', 'carrier_signed', 'shipper_signed',
    'in_transit', 'delivered', 'completed', 'cancelled',
  ];

  const [
    statusCounts, active, pendingPickup, inTransit, deliveredToday, bookedToday,
    monthOrders, deliveredThisMonth, overdue, unsigned, stale, docsMissing,
    newClients, expiringCarriers,
  ] = await Promise.all([
    Promise.all(statuses.map((s) =>
      col.where('status', '==', s).count().get().then((r) => [s, r.data().count] as const),
    )).then(Object.fromEntries),

    // "Not finished" — `not-in` rather than six separate counts, and it is the
    // one place a negative filter is genuinely the cheapest way to ask.
    stat((q) => q.where('status', 'not-in', ['completed', 'cancelled']), null),
    stat((q) => q.where('status', 'in', [...PENDING_PICKUP]), null),
    stat((q) => q.where('status', '==', 'in_transit')),
    stat((q) => q.where('status', '==', 'delivered').where('deliveredAt', '>=', dayStart), 'deliveredAt', true),
    stat((q) => q.where('createdAt', '>=', dayStart), 'createdAt', true),

    // This month's book is small enough to total exactly. Firestore's sum()
    // would need its own index per field, and this set is one month of orders
    // — a few hundred at most — so it is added up here instead.
    col.where('createdAt', '>=', monthStart)
      .orderBy('createdAt', 'desc')
      .select(...CARD_FIELDS)
      .get(),

    stat((q) => q.where('deliveredAt', '>=', monthStart), 'deliveredAt', true),
    stat((q) => q.where('status', 'in', [...INVOICEABLE]).where('invoiceStoragePath', '==', null), null),

    unsignedStat(col),

    stat((q) => q.where('status', '==', 'quote').where('updatedAt', '<=', staleBefore), 'updatedAt', true),
    missingDocumentsStat(col),
    newClientsStat(monthStart),
    expiringCarriersStat(),
  ]);

  const monthDocs: Record<string, unknown>[] =
    monthOrders.docs.map((d) => ({ id: d.id, ...d.data() }));
  const live      = monthDocs.filter((o) => o.status !== 'cancelled');
  const cancelled = monthDocs.filter((o) => o.status === 'cancelled');

  return {
    byStatus: statusCounts,
    activeOrders: active,
    pendingPickup,
    inTransit,
    deliveredToday,
    bookedToday,
    thisMonth: {
      revenue:     live.reduce((s, o) => s + (Number(o.agreedRate) || 0), 0),
      totalTariff: live.reduce((s, o) => s + (Number(o.brokerFee)  || 0), 0),
      orders:      monthDocs.length,
      cancelled:   cancelled.length,
      cancelRate:  monthDocs.length ? Math.round((cancelled.length / monthDocs.length) * 100) : 0,
      items:          live.slice(0, TOOLTIP_LIMIT),
      cancelledItems: cancelled.slice(0, TOOLTIP_LIMIT),
    },
    deliveredThisMonth,
    newClients,
    expiringCarriers,
    overdueInvoices: overdue,
    unsignedOrders:  unsigned,
    staleQuotes:     stale,
    documentsMissing: docsMissing,
  };
}

/**
 * Clients first seen this month.
 *
 * The dashboard used to work this out by downloading every party and filtering
 * on createdAt. That was tolerable while `parties` held one record; the party
 * migration made it seven thousand, about 3.7 MB and six and a half seconds on
 * the page people land on. A count and twenty-five rows is the same answer.
 */
async function newClientsStat(monthStart: Timestamp): Promise<SummaryStat> {
  const q = adminDb.collection('parties').where('createdAt', '>=', monthStart);
  const [total, sample] = await Promise.all([
    q.count().get(),
    q.orderBy('createdAt', 'desc').limit(TOOLTIP_LIMIT)
      .select('companyName', 'contactName', 'createdAt').get(),
  ]);
  return {
    count: total.data().count,
    items: sample.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/**
 * Carriers whose insurance has expired or is about to.
 *
 * Asked of the database rather than filtered from all eleven thousand carriers,
 * which cost about ten seconds and six megabytes on every dashboard load.
 * Thirty days matches getInsuranceStatus, which is what the card's badge reads;
 * a carrier with no expiry recorded is "unknown" there and is not counted here.
 */
async function expiringCarriersStat(): Promise<SummaryStat> {
  const cutoff = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const q = adminDb.collection('carriers')
    .where('isActive', '==', true)
    .where('insuranceExpiration', '<=', cutoff);
  const [total, sample] = await Promise.all([
    q.count().get(),
    // Soonest first, which for an expired one means longest overdue first.
    q.orderBy('insuranceExpiration', 'asc').limit(TOOLTIP_LIMIT)
      .select('companyName', 'contactName', 'insuranceExpiration').get(),
  ]);
  return {
    count: total.data().count,
    items: sample.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/**
 * How many open loads each client has — fetched on its own, after the rest.
 *
 * This is the one dashboard figure that cannot be counted. "How many distinct
 * clients" is not an aggregation Firestore offers, so it has to read each open
 * order and tally them here. Measured against the live data it takes about 2.5
 * seconds and ten thousand document reads, while every other card on the page
 * together takes about 0.3 — so leaving it in the main summary meant one card
 * deciding how long the other eleven took to appear.
 *
 * `select('clientId')` keeps the payload to one field per order. The cost is
 * driven by the number of *open* loads, which in a healthy order book is small;
 * the current figure is inflated by imported loads parked in `carrier_assigned`
 * that were never advanced, which is a data question rather than a query one.
 */
export interface ActiveClient {
  id: string;
  name: string;
  contactName: string;
  loads: number;
}

/**
 * The busiest clients by open load, with their names resolved.
 *
 * Names are looked up for the handful the card actually lists rather than by
 * loading every party — the dashboard used to pull all seven thousand purely to
 * turn twenty-five ids into labels.
 */
export async function activeClients(caller: Caller): Promise<{
  loads: Record<string, number>;
  top: ActiveClient[];
}> {
  const loads = await activeClientLoads(caller);
  const busiest = Object.entries(loads)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOOLTIP_LIMIT);

  if (busiest.length === 0) return { loads, top: [] };

  const docs = await adminDb.getAll(
    ...busiest.map(([id]) => adminDb.collection('parties').doc(id)),
    { fieldMask: ['companyName', 'contactName'] },
  );
  const byId = new Map(docs.map((d) => [d.id, d.data() ?? {}]));

  return {
    loads,
    top: busiest.map(([id, count]) => ({
      id,
      // A client whose party was deleted still has orders pointing at it; the
      // id is a poor label but a truthful one, and better than dropping the row.
      name:        String(byId.get(id)?.companyName || id),
      contactName: String(byId.get(id)?.contactName || ''),
      loads:       count,
    })),
  };
}

async function activeClientLoads(caller: Caller): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const rows = canSeeAllParties(caller.profile)
    ? (await adminDb.collection(COL)
        .where('parentOrderId', '==', null)
        .where('status', 'not-in', ['completed', 'cancelled'])
        .select('clientId')
        .get()).docs.map((d) => d.data())
    : (await listVisibleOrdersPage(caller, { parentOrderId: '' })).orders
        .filter((o) => !['completed', 'cancelled'].includes(String(o.status ?? '')));

  for (const row of rows) {
    const id = row.clientId ? String(row.clientId) : '';
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Orders past the point of assignment that are missing either signature.
 *
 * "Missing A **or** B" is the one shape Firestore will not answer directly, so
 * the total comes from inclusion–exclusion: the two counts added, less the
 * orders missing both, which would otherwise be counted twice. Three
 * aggregations, exact, and no redefinition of what the card means — an
 * approximation here would quietly change a number staff work from.
 */
async function unsignedStat(col: FirebaseFirestore.Query): Promise<SummaryStat> {
  const scoped = col.where('status', 'in', [...SIGNABLE]);
  const noCarrier = scoped.where('carrierSignedAt', '==', null);
  const noShipper = scoped.where('shipperSignedAt', '==', null);

  const [a, b, both, sample] = await Promise.all([
    noCarrier.count().get(),
    noShipper.count().get(),
    scoped.where('carrierSignedAt', '==', null).where('shipperSignedAt', '==', null).count().get(),
    noCarrier.limit(TOOLTIP_LIMIT).select(...CARD_FIELDS).get(),
  ]);

  return {
    count: a.data().count + b.data().count - both.data().count,
    items: sample.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/**
 * Loads that should have paperwork by now and do not — a BOL once moving, a POD
 * once delivered. Two different conditions on two different status sets, so
 * they are counted separately and combined; an order can be missing both, which
 * is why the sample is de-duplicated by id.
 */
async function missingDocumentsStat(col: FirebaseFirestore.Query): Promise<SummaryStat> {
  const noBol = col
    .where('status', 'in', ['in_transit', 'delivered', 'completed'])
    .where('bolStoragePath', '==', null);
  const noPod = col
    .where('status', 'in', ['delivered', 'completed'])
    .where('podStoragePath', '==', null);

  const [bolCount, podCount, bolSample, podSample] = await Promise.all([
    noBol.count().get(),
    noPod.count().get(),
    noBol.limit(TOOLTIP_LIMIT).select(...CARD_FIELDS).get(),
    noPod.limit(TOOLTIP_LIMIT).select(...CARD_FIELDS).get(),
  ]);

  const byId = new Map<string, Record<string, unknown>>();
  for (const d of [...bolSample.docs, ...podSample.docs]) byId.set(d.id, { id: d.id, ...d.data() });

  return {
    // Deliberately the sum, not a union: a delivered load with neither document
    // owes two pieces of paperwork, and the card counts things left to do.
    count: bolCount.data().count + podCount.data().count,
    items: [...byId.values()].slice(0, TOOLTIP_LIMIT),
  };
}

/**
 * The same summary for a broker.
 *
 * Their visible orders are the union of four queries, which cannot carry these
 * filters without an index per branch per card. It does not need to: a broker
 * sees the loads they are working, so that set is read once and reduced here —
 * the same reason listVisibleOrdersPage pages that path in memory.
 */
async function summariseInMemory(
  caller: Caller,
  at: { dayStart: Timestamp; monthStart: Timestamp; staleBefore: Timestamp },
): Promise<DashboardSummary> {
  const { orders } = await listVisibleOrdersPage(caller, { parentOrderId: '' });

  /*
    Parties stay visibility-scoped here rather than counted with an aggregation.
    "New clients this month" has always meant the ones this person can see, and
    a count() over the whole collection would quietly start including records
    they are not entitled to. Carriers are not owned records — every allowed
    user may read them — so that card uses the same query for everyone.
  */
  const [visibleParties, expiringCarriers] = await Promise.all([
    listVisibleParties(caller),
    expiringCarriersStat(),
  ]);
  const ms = (v: unknown) => {
    const ts = v as { toMillis?: () => number } | null | undefined;
    return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
  };
  const pick = (rows: Record<string, unknown>[]): SummaryStat =>
    ({ count: rows.length, items: rows.slice(0, TOOLTIP_LIMIT) });

  const status = (o: Record<string, unknown>) => String(o.status ?? '');
  const monthOrders = orders.filter((o) => ms(o.createdAt) >= at.monthStart.toMillis());
  const live        = monthOrders.filter((o) => status(o) !== 'cancelled');
  const cancelled   = monthOrders.filter((o) => status(o) === 'cancelled');

  const byStatus: Record<string, number> = {};
  for (const o of orders) byStatus[status(o)] = (byStatus[status(o)] ?? 0) + 1;

  return {
    byStatus,
    activeOrders:   pick(orders.filter((o) => !['completed', 'cancelled'].includes(status(o)))),
    pendingPickup:  pick(orders.filter((o) => (PENDING_PICKUP as readonly string[]).includes(status(o)))),
    inTransit:      pick(orders.filter((o) => status(o) === 'in_transit')),
    deliveredToday: pick(orders.filter((o) => status(o) === 'delivered' && ms(o.deliveredAt) >= at.dayStart.toMillis())),
    bookedToday:    pick(orders.filter((o) => ms(o.createdAt) >= at.dayStart.toMillis())),
    thisMonth: {
      revenue:     live.reduce((s, o) => s + (Number(o.agreedRate) || 0), 0),
      totalTariff: live.reduce((s, o) => s + (Number(o.brokerFee)  || 0), 0),
      orders:      monthOrders.length,
      cancelled:   cancelled.length,
      cancelRate:  monthOrders.length ? Math.round((cancelled.length / monthOrders.length) * 100) : 0,
      items:          live.slice(0, TOOLTIP_LIMIT),
      cancelledItems: cancelled.slice(0, TOOLTIP_LIMIT),
    },
    deliveredThisMonth: pick(orders.filter((o) => ms(o.deliveredAt) >= at.monthStart.toMillis())),
    newClients: pick(
      visibleParties.filter((p) => ms((p as unknown as { createdAt?: unknown }).createdAt)
        >= at.monthStart.toMillis()) as unknown as Record<string, unknown>[],
    ),
    expiringCarriers,
    overdueInvoices:    pick(orders.filter((o) =>
      (INVOICEABLE as readonly string[]).includes(status(o)) && !o.invoiceStoragePath)),
    unsignedOrders:     pick(orders.filter((o) =>
      (SIGNABLE as readonly string[]).includes(status(o)) && (!o.carrierSignedAt || !o.shipperSignedAt))),
    staleQuotes:        pick(orders.filter((o) =>
      status(o) === 'quote' && ms(o.updatedAt) > 0 && ms(o.updatedAt) <= at.staleBefore.toMillis())),
    documentsMissing:   pick(orders.filter((o) => {
      const needsBol = ['in_transit', 'delivered', 'completed'].includes(status(o)) && !o.bolStoragePath;
      const needsPod = ['delivered', 'completed'].includes(status(o)) && !o.podStoragePath;
      return needsBol || needsPod;
    })),
  };
}
