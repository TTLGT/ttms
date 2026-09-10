import { Timestamp } from 'firebase-admin/firestore';
import {
  INVOICEABLE, ORDER_VIEW_SORT_FIELDS, PENDING_PICKUP, SIGNABLE, STALE_DAYS,
  type OrderViewId,
} from '@/types/orderView';

export type { OrderViewId };

/**
 * The named slices of the order book a dashboard card stands for.
 *
 * Every card on the dashboard is a question — "what is still unsigned", "what
 * should have a POD by now" — and until this existed, clicking one led
 * nowhere: the card knew the answer as a number and a short hover list, and
 * the only way to see the rest was to work the filter out by hand on the
 * Orders screen. A view is that question written down once, so the card and
 * the list it opens cannot drift apart.
 *
 * Each view says how to ask Firestore (`queries`) and how to judge an order
 * already in hand (`matches`). Both are needed because the two halves of
 * `listVisibleOrdersPage` work differently: an admin's list is a Firestore
 * query, while a broker's is the union of their own records, read and then
 * filtered in memory. A view that only knew how to be a query would silently
 * return nothing to everybody who is not an admin.
 *
 * **`queries` returns a list**, because two of these are "A or B" — missing
 * either signature, missing either document — and an OR is the one shape
 * Firestore will not serve from a single index. They run as separate queries
 * and are merged, which is what the dashboard already does to count those two
 * cards.
 *
 * The simple views are shared with `src/lib/orderSummary.ts` outright: it
 * counts through `viewQuery()`, so the number on a card and the list behind it
 * are one filter rather than two copies of it. Only the two OR-shaped views
 * are written out in both places, because the count there is an
 * inclusion–exclusion sum that cannot be reduced to one query. **Keep those
 * two in step** — a card whose number disagrees with the list it opens is
 * worse than either alone.
 *
 * The ids, the labels and the status sets live in `src/types/orderView.ts`, so
 * the browser can name a view without importing the Admin SDK.
 */

/** The moments every view is measured against, worked out once per request. */
export interface ViewClock {
  dayStart: Timestamp;
  monthStart: Timestamp;
  staleBefore: Timestamp;
}

export function viewClock(now = new Date()): ViewClock {
  return {
    dayStart:    Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate())),
    monthStart:  Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    staleBefore: Timestamp.fromMillis(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000),
  };
}

type Q = FirebaseFirestore.Query;
type Row = Record<string, unknown>;

/** Millis out of whatever a timestamp field holds, tolerating null and absent. */
function at(value: unknown): number {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}

function statusOf(o: Row): string {
  return String(o.status ?? '');
}

interface OrderView {
  queries: (col: Q, clock: ViewClock) => Q[];
  matches: (o: Row, clock: ViewClock) => boolean;
}

const VIEWS: Record<OrderViewId, OrderView> = {
  active: {
    queries: (col) => [col.where('status', 'not-in', ['completed', 'cancelled'])],
    matches: (o) => !['completed', 'cancelled'].includes(statusOf(o)),
  },

  pending_pickup: {
    queries: (col) => [col.where('status', 'in', [...PENDING_PICKUP])],
    matches: (o) => (PENDING_PICKUP as readonly string[]).includes(statusOf(o)),
  },

  in_transit: {
    queries: (col) => [col.where('status', '==', 'in_transit')],
    matches: (o) => statusOf(o) === 'in_transit',
  },

  delivered_today: {
    queries: (col, c) => [col.where('status', '==', 'delivered').where('deliveredAt', '>=', c.dayStart)],
    matches: (o, c) => statusOf(o) === 'delivered' && at(o.deliveredAt) >= c.dayStart.toMillis(),
  },

  booked_today: {
    queries: (col, c) => [col.where('createdAt', '>=', c.dayStart)],
    matches: (o, c) => at(o.createdAt) >= c.dayStart.toMillis(),
  },

  this_month: {
    queries: (col, c) => [col.where('createdAt', '>=', c.monthStart)],
    matches: (o, c) => at(o.createdAt) >= c.monthStart.toMillis(),
  },

  cancelled_month: {
    queries: (col, c) => [col.where('status', '==', 'cancelled').where('createdAt', '>=', c.monthStart)],
    matches: (o, c) => statusOf(o) === 'cancelled' && at(o.createdAt) >= c.monthStart.toMillis(),
  },

  delivered_month: {
    queries: (col, c) => [col.where('deliveredAt', '>=', c.monthStart)],
    matches: (o, c) => at(o.deliveredAt) >= c.monthStart.toMillis(),
  },

  overdue_invoices: {
    queries: (col) => [
      col.where('status', 'in', [...INVOICEABLE]).where('invoiceStoragePath', '==', null),
    ],
    matches: (o) =>
      (INVOICEABLE as readonly string[]).includes(statusOf(o)) && !o.invoiceStoragePath,
  },

  /*
   * Missing either signature — two queries, per the OR note above.
   *
   * A waived client signature is not a missing one: somebody decided that load
   * goes without, and listing it would send staff chasing a decision already
   * made. Tested against the boolean mirror in the query because Firestore
   * cannot ask "null or absent", and against the real field in memory where
   * there is no such limit.
   */
  unsigned: {
    queries: (col) => {
      const scoped = col.where('status', 'in', [...SIGNABLE]);
      return [
        scoped.where('carrierSignedAt', '==', null),
        scoped.where('shipperSignedAt', '==', null).where('signatureWaived', '==', false),
      ];
    },
    matches: (o) =>
      (SIGNABLE as readonly string[]).includes(statusOf(o))
      && (!o.carrierSignedAt || (!o.shipperSignedAt && !o.signatureWaivedAt)),
  },

  stale_quotes: {
    queries: (col, c) => [col.where('status', '==', 'quote').where('updatedAt', '<=', c.staleBefore)],
    matches: (o, c) => statusOf(o) === 'quote' && at(o.updatedAt) <= c.staleBefore.toMillis(),
  },

  /* A BOL once it is moving, a POD once it is delivered: two conditions on two
     different status sets, so two queries — the same shape as `unsigned`. */
  documents_missing: {
    queries: (col) => [
      col.where('status', 'in', ['in_transit', 'delivered', 'completed'])
        .where('bolStoragePath', '==', null),
      col.where('status', 'in', ['delivered', 'completed'])
        .where('podStoragePath', '==', null),
    ],
    matches: (o) => {
      const s = statusOf(o);
      return (['in_transit', 'delivered', 'completed'].includes(s) && !o.bolStoragePath)
        || (['delivered', 'completed'].includes(s) && !o.podStoragePath);
    },
  },
};

/**
 * The field a view's list is sorted by, or null where Firestore cannot sort it.
 *
 * The table lives in `@/types/orderView` with the ids and labels, because the
 * Orders screen has to say whether the two hundred rows it is showing are the
 * newest two hundred or merely two hundred of them.
 */
export function viewOrderField(view: OrderViewId): string | null {
  return ORDER_VIEW_SORT_FIELDS[view];
}

/** The Firestore queries behind one view, to run and merge. */
export function viewQueries(view: OrderViewId, col: Q, clock: ViewClock): Q[] {
  return VIEWS[view].queries(col, clock);
}

/**
 * The single query behind a view that has only one.
 *
 * What the dashboard counts with, so a card's number and the list it opens are
 * one filter rather than two copies. It throws on the two OR-shaped views
 * rather than quietly counting half of one.
 */
export function viewQuery(view: OrderViewId, col: Q, clock: ViewClock): Q {
  const qs = VIEWS[view].queries(col, clock);
  if (qs.length !== 1) {
    throw new Error(`The "${view}" view is more than one query — use viewQueries.`);
  }
  return qs[0];
}

/** Whether one order the caller already holds belongs in a view. */
export function matchesView(view: OrderViewId, o: Row, clock: ViewClock): boolean {
  return VIEWS[view].matches(o, clock);
}
