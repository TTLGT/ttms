import {
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Order, OrderStatus } from '@/types/order';
import { orderSearchTerms } from '@/types/order';
import type { LicenseDocumentRow, OrderDocumentKind } from '@/types/orderDocument';
import type { OrderAccessRequest } from '@/types/orderAccessRequest';
import type { OwnerContact } from '@/types/order';
import type { OwnerEvent } from '@/types/ownerEvent';
import type { ActiveClient, DashboardSummary } from './orderSummary';

const COL = 'orders';

/**
 * Draws the next number in the sequence. See src/lib/orderNumber.ts for the
 * format and why the counter lives server-side.
 *
 * The number used to be four random digits generated here. With 9,000 of them
 * and no check for one already in use, two loads sharing a number was a matter
 * of a few hundred orders, and nothing about the number said which came first.
 */
async function nextOrderNumber(): Promise<string> {
  const res = await fetch('/api/orders/number', {
    method: 'POST',
    headers: await authHeaders(),
  });
  const { orderNumber } = await unwrap<{ orderNumber: string }>(res);
  return orderNumber;
}

export async function createOrder(
  data: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  // Drawn first, and the save is abandoned if it fails. An order written
  // without a number, or with a guessed one, would be worse than no order:
  // the number is the load's identity on every document that leaves here.
  const orderNumber = await nextOrderNumber();

  const ref = await addDoc(collection(db, COL), {
    ...data,
    orderNumber,
    // Computed here because this is the one place holding the whole order.
    // An order saved without these exists but cannot be found by the search
    // box — see orderSearchTerms in src/types/order.ts.
    searchTerms: orderSearchTerms({ ...data, orderNumber }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Reads go through /api/orders rather than straight to Firestore.
 *
 * Orders are owned records: a broker sees the ones assigned to them, the ones
 * their work groups own, and the ones belonging to clients they own. That
 * union cannot be expressed as a single client-SDK query the rules would
 * approve, so the filtering is done server-side with the Admin SDK and the
 * browser is simply never sent the rest.
 *
 * Every order-reading page in the app goes through these two functions, so
 * they are the one place that had to change.
 */
async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return { 'Authorization': `Bearer ${await user.getIdToken()}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/**
 * What an order id meant for this user. See `OrderAccess` in orderAccess.ts for
 * why the three cases are kept apart rather than collapsed into `Order | null`.
 */
export type OrderAccess =
  | { status: 'ok'; order: Order }
  | { status: 'missing' }
  | {
      status: 'denied';
      ownerName: string;
      /** Which load was refused, so the reader can name it to a colleague. */
      orderNumber: string;
      /** Who to message about it, and on what number. */
      owner: OwnerContact | null;
    };

/**
 * Ask the owner of a load for permission to open it.
 *
 * The order-side twin of requestPartyAccessById. Approval grants a standing
 * read of this one load — not ownership, and not the right to reassign it.
 */
export async function requestOrderAccess(
  orderId: string,
  reason: string,
): Promise<{ id: string; status: string }> {
  const res = await fetch('/api/orders/access-requests', {
    method:  'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ orderId, reason }),
  });
  return unwrap<{ id: string; status: string }>(res);
}

export async function listOrderAccessRequests(
  box: 'incoming' | 'outgoing',
): Promise<OrderAccessRequest[]> {
  const res = await fetch(`/api/orders/access-requests?box=${box}`, { headers: await authHeaders() });
  const { requests } = await unwrap<{ requests: OrderAccessRequest[] }>(res);
  return requests;
}

/**
 * Approve, deny or revoke one request.
 *
 * `expiresInHours` applies to an approval only: one of GRANT_DURATIONS, or
 * null to grant it until somebody revokes it. The server validates it against
 * that list and works the date out from its own clock.
 */
export async function decideOrderAccessRequest(
  requestId: string,
  action: 'approve' | 'deny' | 'revoke',
  options: { reason?: string; expiresInHours?: number | null } = {},
) {
  const res = await fetch(`/api/orders/access-requests/${requestId}`, {
    method:  'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      action,
      reason:         options.reason,
      expiresInHours: options.expiresInHours ?? null,
    }),
  });
  return unwrap<{ id: string; status: string }>(res);
}

/**
 * A short-lived link to one of an order's documents.
 *
 * The BOL, invoice and POD prefixes in the bucket are closed to the client
 * SDK, because Storage rules cannot read Firestore and so cannot ask who owns
 * an order — see src/types/orderDocument.ts. getDownloadURL() on those paths
 * fails by design; this is the way in.
 *
 * Returns null when there is no such document, or when the caller may not see
 * the order. Every caller is a "View" button that has nothing else to show, so
 * distinguishing the two would only put an error where a missing link says the
 * same thing.
 */
export async function orderDocumentUrl(
  orderId: string,
  kind: OrderDocumentKind,
): Promise<string | null> {
  const res = await fetch(
    `/api/orders/${orderId}/document?type=${kind}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) return null;
  const { url } = await res.json().catch(() => ({ url: null }));
  return typeof url === 'string' ? url : null;
}

/**
 * Every driver's licence in the company, for the Documents screen.
 *
 * Separate from listOrdersPage because it is deliberately not filtered to the
 * loads this user owns — licences are open to all staff, and one you cannot
 * find is one you cannot use. The rows come back already redacted: a load you
 * have no access to arrives with its shipper stripped and its owner named
 * instead. See /api/documents/licenses.
 */
export async function listLicenseDocuments(): Promise<LicenseDocumentRow[]> {
  const res = await fetch('/api/documents/licenses', { headers: await authHeaders() });
  const { rows } = await unwrap<{ rows: LicenseDocumentRow[] }>(res);
  return rows;
}

export async function getOrder(orderId: string): Promise<OrderAccess> {
  const res = await fetch(`/api/orders/${orderId}`, { headers: await authHeaders() });

  if (res.status === 404) return { status: 'missing' };
  if (res.status === 403) {
    // The route names the owner precisely so the page can point somewhere.
    const body = await res.json().catch(() => ({}));
    return {
      status:      'denied',
      ownerName:   String(body.ownerName ?? ''),
      orderNumber: String(body.orderNumber ?? ''),
      owner:       (body.owner as OwnerContact | null) ?? null,
    };
  }

  const { order } = await unwrap<{ order: Order }>(res);
  return { status: 'ok', order };
}

/** What a screen can ask for. See the route for the full parameter list. */
export interface OrderQuery {
  limit?: number;
  cursor?: string | null;
  status?: OrderStatus;
  /** Free text from the search box. */
  search?: string;
  carrierId?: string;
  /** One filter per role — the role lives on the order, not on the party. */
  clientId?: string;
  shipperId?: string;
  consigneeId?: string;
  /** '' asks for top-level orders only; an id asks for that order's suborders. */
  parentOrderId?: string;
  /** Only orders carrying this attachment. */
  hasDocument?: 'bolStoragePath' | 'invoiceStoragePath' | 'podStoragePath' | 'driverLicenseStoragePath';
  /** Earliest pickup date to include, as epoch milliseconds. */
  pickupFrom?: number;
  /** Trims each order to the fields that shape of screen reads. */
  fields?: 'list' | 'analytics';
  /**
   * One colleague's loads, named by their email — the identifier the directory
   * links on. Resolved to a uid server-side; see lib/ownerFilter.ts.
   */
  owner?: string;
}

export interface OrderPage {
  orders: Order[];
  /** Feed back as `cursor` to get the next page. null means there is no next. */
  cursor: string | null;
}

function orderQueryString(q: OrderQuery): string {
  const p = new URLSearchParams();
  if (q.limit)      p.set('limit', String(q.limit));
  if (q.cursor)     p.set('cursor', q.cursor);
  if (q.status)     p.set('status', q.status);
  if (q.search)     p.set('search', q.search);
  if (q.carrierId)  p.set('carrierId', q.carrierId);
  if (q.clientId)     p.set('clientId', q.clientId);
  if (q.shipperId)    p.set('shipperId', q.shipperId);
  if (q.consigneeId)  p.set('consigneeId', q.consigneeId);
  if (q.fields)       p.set('fields', q.fields);
  if (q.hasDocument)  p.set('hasDocument', q.hasDocument);
  if (q.pickupFrom)   p.set('pickupFrom', String(q.pickupFrom));
  if (q.owner)        p.set('owner', q.owner);
  // Set even when empty — an empty value is a meaningful request.
  if (q.parentOrderId !== undefined) p.set('parentOrderId', q.parentOrderId);
  return p.toString();
}

/**
 * One page of orders, newest first.
 *
 * This is what a list screen should use. `listOrders` below fetches the whole
 * collection, which on ten thousand orders is a seventeen-second query and
 * twelve megabytes before the browser draws a row.
 */
export async function listOrdersPage(query: OrderQuery = {}): Promise<OrderPage> {
  const res = await fetch(`/api/orders?${orderQueryString(query)}`, { headers: await authHeaders() });
  const page = await unwrap<{ orders: Order[]; cursor: string | null }>(res);
  return { orders: page.orders ?? [], cursor: page.cursor ?? null };
}

/**
 * Every number the dashboard's stat cards show, counted server-side.
 *
 * See lib/orderSummary.ts. The page used to work these out by downloading the
 * whole order book and filtering it in the browser.
 */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await fetch('/api/orders/summary', { headers: await authHeaders() });
  return unwrap<DashboardSummary>(res);
}

/**
 * How many open loads each client has. Fetched apart from the summary because
 * it is roughly eight times slower than everything else on the page combined —
 * see lib/orderSummary.ts.
 */
export async function fetchActiveClientLoads(): Promise<{
  loads: Record<string, number>;
  top: ActiveClient[];
}> {
  const res = await fetch('/api/orders/summary?clients=1', { headers: await authHeaders() });
  const body = await unwrap<{
    activeClientLoads: Record<string, number>;
    activeClients: ActiveClient[];
  }>(res);
  return { loads: body.activeClientLoads ?? {}, top: body.activeClients ?? [] };
}

/**
 * How many orders sit in each status, without fetching any of them.
 *
 * `owner` narrows it to one colleague's loads, so the tabs agree with the list
 * they sit above when the screen was opened from somebody's book of business.
 */
export async function countOrdersByStatus(owner?: string): Promise<Record<OrderStatus, number>> {
  const qs = owner ? `&owner=${encodeURIComponent(owner)}` : '';
  const res = await fetch(`/api/orders?counts=1${qs}`, { headers: await authHeaders() });
  const { counts } = await unwrap<{ counts: Record<OrderStatus, number> }>(res);
  return counts;
}

/**
 * Every order the user may see.
 *
 * Reserved for screens that genuinely aggregate over the whole set — analytics
 * charts margin by month and cannot do it from one page. If you only need to
 * show a list, or the orders belonging to one carrier or client, use
 * `listOrdersPage` with the matching filter instead.
 */
export async function listOrders(query: OrderQuery = {}): Promise<Order[]> {
  const { orders } = await listOrdersPage({ ...query, limit: undefined });
  return orders;
}

// ── Ownership ────────────────────────────────────────────────────────────────

/** See the same type in src/lib/parties.ts — owners to add or remove. */
export interface OwnerChange {
  uids?: string[];
  groupIds?: string[];
  emails?: string[];
}

async function ownersRequest<T>(method: string, url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return unwrap<T>(res);
}

/** Admins and dispatchers only; the server is the authority on that. */
export async function addOrderOwners(orderId: string, owners: OwnerChange) {
  return ownersRequest<{ owners: unknown }>('POST', `/api/orders/${orderId}/owners`, owners);
}

export async function removeOrderOwners(orderId: string, owners: OwnerChange) {
  return ownersRequest<{ owners: unknown }>('DELETE', `/api/orders/${orderId}/owners`, owners);
}

/** Every owner this order has ever had, newest first. */
export async function listOrderOwnerEvents(orderId: string): Promise<OwnerEvent[]> {
  const res = await fetch(`/api/orders/${orderId}/owners`, { headers: await authHeaders() });
  const { events } = await unwrap<{ events: OwnerEvent[] }>(res);
  return events ?? [];
}

/**
 * Tells the room about this load that something changed on it.
 *
 * Fire-and-forget on purpose, and never awaited in a way that can fail a save:
 * the change has already been written by the time this is called, and an alert
 * that did not post must not turn a successful update into an error message.
 *
 * Only three events go through here — the ones the browser carries out against
 * Firestore itself. Everything else that is worth announcing (the BOL, the
 * invoice, both agreements, both signatures) already happens inside a server
 * route, and each of those posts its own alert where the event actually
 * occurs. The server decides the wording in every case; see the route.
 */
export async function announceOrderEvent(
  orderId: string,
  event: 'status' | 'carrier' | 'pod',
): Promise<void> {
  try {
    await fetch(`/api/orders/${orderId}/announce`, {
      method:  'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ event }),
    });
  } catch {
    // Swallowed whole, including the token lookup: callers use `void` on this,
    // so anything thrown here would surface as an unhandled rejection over a
    // save that actually succeeded.
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<void> {
  await updateDoc(doc(db, COL, orderId), {
    status,
    updatedAt: serverTimestamp(),
    ...(status === 'delivered' && { deliveredAt: serverTimestamp() }),
  });
}

/**
 * The fields orderSearchTerms reads. Listed here so a patch that cannot affect
 * search does not cost a round trip — most saves are a status change.
 *
 * ⚠️  KEEP IN SYNC with searchableValues() in src/types/order.ts. Miss a field
 * and renaming through it leaves the order findable only under its old value.
 */
const SEARCHABLE_FIELDS = [
  'orderNumber', 'batsId', 'previousOrderNumber',
  'shipperName', 'clientName', 'consigneeName', 'carrierName',
  'commodity', 'origin', 'destination',
] as const;

export async function updateOrder(
  orderId: string,
  data: Partial<Omit<Order, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, orderId), {
    ...data,
    updatedAt: serverTimestamp(),
  });

  // A change to any field the search box looks at makes the stored fragments
  // wrong, and this patch is only part of an order — the fragments come from
  // all of those fields together, so the server rereads the saved record and
  // recomputes them. Fire-and-forget, like the client-owner refresh below: the
  // save has already succeeded and must not be undone by a derived field.
  if (SEARCHABLE_FIELDS.some((f) => f in data)) {
    fetch(`/api/orders/${orderId}/search-terms`, {
      method:  'POST',
      headers: await authHeaders(),
    }).catch(() => {});
  }

  // Moving an order to a different client invalidates its copy of that client's
  // owners, which is what the rules read to decide who may see the order. The
  // browser is deliberately not allowed to write those fields, so the server
  // recomputes them. Without this, changing the client would leave the previous
  // client's owners able to see the order and the new one's unable to.
  if (data.clientId !== undefined) {
    await fetch(`/api/orders/${orderId}/client-owners`, {
      method:  'POST',
      headers: await authHeaders(),
    }).catch(() => {});
  }
}
