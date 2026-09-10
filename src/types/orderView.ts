/**
 * The names of the slices of the order book a dashboard card stands for.
 *
 * Split from `src/lib/orderViews.ts` — which holds the queries behind these —
 * because that module imports the Admin SDK, and the ids and labels are needed
 * in the browser: a stat card links to `?view=unsigned`, and the Orders screen
 * has to say which filter it is showing. Importing the query side there would
 * pull firebase-admin into the client bundle.
 *
 * Renaming a key is a URL change, not a rename: these ids are in links people
 * bookmark and paste to each other.
 */

export const ORDER_VIEW_IDS = [
  'active', 'pending_pickup', 'in_transit', 'delivered_today', 'booked_today',
  'this_month', 'cancelled_month', 'delivered_month', 'overdue_invoices',
  'unsigned', 'stale_quotes', 'documents_missing',
] as const;

export type OrderViewId = typeof ORDER_VIEW_IDS[number];

export function isOrderView(value: unknown): value is OrderViewId {
  return ORDER_VIEW_IDS.includes(value as OrderViewId);
}

/** What the Orders screen calls each filter while it is on. */
export const ORDER_VIEW_LABELS: Record<OrderViewId, string> = {
  active:            'Active orders',
  pending_pickup:    'Pending pick-ups',
  in_transit:        'In transit',
  delivered_today:   'Delivered today',
  booked_today:      'Booked today',
  this_month:        'Booked this month',
  cancelled_month:   'Cancelled this month',
  delivered_month:   'Delivered this month',
  overdue_invoices:  'Overdue invoices',
  unsigned:          'Unsigned agreements',
  stale_quotes:      'Stale quotes',
  documents_missing: 'Documents missing',
};

export function orderViewLabel(view: OrderViewId): string {
  return ORDER_VIEW_LABELS[view];
}

/**
 * The field each view's list is sorted by, newest first — null where Firestore
 * cannot sort it without an index that does not exist.
 *
 * Every field named here is already the tail of a composite index the
 * dashboard's counts use, so **no view needed a new index**. The four nulls are
 * the ones that could not have one for free: a `not-in` must sort on the field
 * it excludes, and the three "missing X" views filter on two fields at once,
 * which Firestore serves by merging single-field indexes — a sort on top would
 * want a composite per view.
 *
 * Their rows come back in document-id order and are capped, so for those four
 * the cap is "two hundred of them", not "the two hundred newest". The Orders
 * screen says which it got rather than implying a recency it did not.
 */
export const ORDER_VIEW_SORT_FIELDS: Record<OrderViewId, string | null> = {
  active:            null,
  pending_pickup:    'createdAt',
  in_transit:        'createdAt',
  delivered_today:   'deliveredAt',
  booked_today:      'createdAt',
  this_month:        'createdAt',
  cancelled_month:   'createdAt',
  delivered_month:   'deliveredAt',
  overdue_invoices:  null,
  unsigned:          null,
  stale_quotes:      'updatedAt',
  documents_missing: null,
};

/** Whether a view's rows come back newest-first rather than in document order. */
export function viewIsSorted(view: OrderViewId): boolean {
  return ORDER_VIEW_SORT_FIELDS[view] !== null;
}

/* The status sets the views are built from. Plain data, kept here so both the
   query side and the screens can read them without crossing the server line. */

/** Statuses that count as work still in progress. */
export const PENDING_PICKUP = ['booked', 'carrier_assigned', 'carrier_signed', 'shipper_signed'] as const;
/** Statuses at or past the point where both signatures should exist. */
export const SIGNABLE = [
  'carrier_assigned', 'carrier_signed', 'shipper_signed',
  'in_transit', 'delivered', 'completed',
] as const;
/** Statuses where an invoice is owed. */
export const INVOICEABLE = ['delivered', 'completed'] as const;

/** How long a quote sits untouched before it is worth chasing. */
export const STALE_DAYS = 7;
