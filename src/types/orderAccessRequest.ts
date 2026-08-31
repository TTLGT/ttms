import type { Timestamp } from 'firebase/firestore';

/**
 * A request to open a load that belongs to somebody else.
 *
 * The order-side sibling of AccessRequest in ./accessRequest.ts, and kept as a
 * separate collection rather than a `kind` field on that one, because what
 * approval *grants* is different and the two must not be confused when
 * deciding one.
 *
 * A party approval lends visibility until it is spent on an order, and then
 * expires — the audit trail stays one-to-one with the orders it authorized. An
 * order approval has nothing to be spent on: the thing being asked for *is*
 * the record. So it runs on a clock instead, set by the approver: `expiresAt`
 * is when the grant stops, or null for one that stands until revoked.
 *
 * Expiry is applied when the grant is *read*, not by a job that flips the
 * status — there is no scheduler in this app, and a grant that outlived its
 * clock because a cron did not run would be the worst kind of failure here.
 * `status` therefore stays 'approved' on a lapsed request; isGrantLive() below
 * is what decides, and everything that honours a grant goes through it.
 *
 * What it is not is ownership. An approved requester can read the load; they
 * cannot reassign it, and they do not appear as an owner on it. Ownership still
 * moves only through /api/{orders,parties}/{id}/owners, which is admin and
 * dispatcher only and writes an ownerEvents entry.
 */
export type OrderAccessRequestStatus = 'pending' | 'approved' | 'denied' | 'revoked';

export interface OrderAccessRequest {
  id: string;
  orderId: string;
  /**
   * Snapshot of the load's number, so the inbox reads correctly a year later
   * and does not have to fetch an order the reader may not be able to see.
   */
  orderNumber: string;

  requestedByUid: string;
  requestedByName: string;
  requestedByEmail: string;
  /** Why they need it — shown to the owner in the inbox. */
  reason: string;

  /** Owners at the time of the request; any one of them may decide it. */
  ownerUids: string[];
  /** Printable owner, including the BATS name where no account exists yet. */
  ownerName: string;

  status: OrderAccessRequestStatus;

  decidedByUid: string | null;
  decidedByName: string | null;
  decidedByIp: string | null;
  decidedAt: Timestamp | null;
  /** True when an admin decided on the owner's behalf. */
  decidedByAdmin: boolean;
  denyReason: string | null;

  /**
   * When the grant stops. Null means it stands until somebody revokes it.
   * Only meaningful while `status` is 'approved'.
   */
  expiresAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const ORDER_ACCESS_REQUESTS_COLLECTION = 'orderAccessRequests';

/**
 * How long an approver can lend a load for.
 *
 * Hours rather than a free-text date so the inbox cannot produce a grant that
 * expires in the past, or in 2074 through a typo. The list is deliberately
 * short: these are the answers to "how long do you need it", and a picker with
 * twelve options is one nobody reads.
 */
export const GRANT_DURATIONS: { label: string; hours: number | null }[] = [
  { label: '24 hours',        hours: 24 },
  { label: '3 days',          hours: 24 * 3 },
  { label: '7 days',          hours: 24 * 7 },
  { label: '30 days',         hours: 24 * 30 },
  // Last, and never the default. The safe direction for a permission is the
  // one that lapses on its own; somebody who genuinely wants a permanent grant
  // should have to say so.
  { label: 'No expiry',       hours: null },
];

/** The default the picker opens on — long enough to cover a week away. */
export const DEFAULT_GRANT_HOURS = 24 * 7;

export function isValidGrantHours(hours: unknown): boolean {
  return hours === null || GRANT_DURATIONS.some((d) => d.hours === hours);
}

/**
 * A moment, in any of the shapes one arrives in.
 *
 * A live Timestamp answers toMillis(); one that has been through JSON on the
 * way out of an API route is a bare `{_seconds}` object with no methods. Both
 * have to work here, because this decides whether a grant is still live — and
 * reading the JSON form as "no expiry" would show a lapsed grant as active.
 */
type Instant =
  | { toMillis?: () => number }
  | { _seconds: number }
  | { seconds: number }
  | null
  | undefined;

function millisOf(ts: Instant): number | null {
  if (!ts) return null;
  if ('toMillis' in ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if ('_seconds' in ts && typeof ts._seconds === 'number') return ts._seconds * 1000;
  if ('seconds'  in ts && typeof ts.seconds  === 'number') return ts.seconds  * 1000;
  return null;
}

/**
 * Whether this request currently entitles its requester to the load.
 *
 * The single test for that. Anything that honours a grant — the API when it
 * loads an order, the screens when they decide what to draw — must ask this
 * rather than reading `status`, because a lapsed grant still says 'approved'.
 */
export function isGrantLive(
  request: { status: string; expiresAt?: Instant },
  now: number = Date.now(),
): boolean {
  if (request.status !== 'approved') return false;
  const expires = millisOf(request.expiresAt);
  return expires === null || expires > now;
}

/**
 * What to show on the row. A grant past its clock reads as 'expired' even
 * though the stored status is still 'approved' — the reader wants to know
 * whether it works, not what field is in the database.
 */
export function grantDisplayStatus(
  request: { status: string; expiresAt?: Instant },
  now: number = Date.now(),
): string {
  if (request.status === 'approved' && !isGrantLive(request, now)) return 'expired';
  return request.status;
}
