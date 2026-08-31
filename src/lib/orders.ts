import {
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Order, OrderStatus } from '@/types/order';
import type { OwnerEvent } from '@/types/ownerEvent';

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
  | { status: 'denied'; ownerName: string };

export async function getOrder(orderId: string): Promise<OrderAccess> {
  const res = await fetch(`/api/orders/${orderId}`, { headers: await authHeaders() });

  if (res.status === 404) return { status: 'missing' };
  if (res.status === 403) {
    // The route names the owner precisely so the page can point somewhere.
    const body = await res.json().catch(() => ({}));
    return { status: 'denied', ownerName: String(body.ownerName ?? '') };
  }

  const { order } = await unwrap<{ order: Order }>(res);
  return { status: 'ok', order };
}

export async function listOrders(): Promise<Order[]> {
  const res = await fetch('/api/orders', { headers: await authHeaders() });
  const { orders } = await unwrap<{ orders: Order[] }>(res);
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
  await fetch(`/api/orders/${orderId}/announce`, {
    method:  'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ event }),
  }).catch(() => {});
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

export async function updateOrder(
  orderId: string,
  data: Partial<Omit<Order, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, orderId), {
    ...data,
    updatedAt: serverTimestamp(),
  });

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
