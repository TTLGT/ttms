/**
 * Server-side order visibility.
 *
 * The direct sibling of partyAccess.ts, and it exists for the same reason: the
 * filtering has to happen with the Admin SDK so the browser is never sent
 * orders it is not entitled to. Firestore rules are the floor underneath this,
 * not a substitute for it.
 *
 * Orders are closed by default. Where an unowned party is shared reference
 * data, an unowned order is visible only to admin, dispatch and finance — see
 * canSeeOrder() for why the two differ.
 */

import { adminDb, AdminAuthError } from './firebase-admin';
import { canSeeAllParties, canSeeOrder } from './accessControl';
import { ownerLabel } from './partyAccess';
import type { Caller } from './partyAccess';

const COL = 'orders';

/**
 * Every order the caller may see.
 *
 * Privileged roles get the collection. Everyone else gets the union of four
 * targeted queries rather than a full scan: two for orders assigned to them
 * directly or to a work group they are in, and two for orders whose *client*
 * they own. Fetching everything and filtering in memory would work but would
 * read the entire collection on every dashboard load.
 */
export async function listVisibleOrders(caller: Caller): Promise<Record<string, unknown>[]> {
  const col = adminDb.collection(COL);

  if (canSeeAllParties(caller.profile)) {
    const snap = await col.orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const groupIds = caller.profile.groupIds ?? [];
  // array-contains-any caps at 30 values, far more work groups than one person
  // would ever belong to.
  const someGroups = groupIds.slice(0, 30);
  const byGroup = (field: string) =>
    someGroups.length
      ? col.where(field, 'array-contains-any', someGroups).get()
      : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] });

  const [mine, viaGroup, viaClient, viaClientGroup] = await Promise.all([
    col.where('assignedToUids', 'array-contains', caller.uid).get(),
    byGroup('assignedToGroupIds'),
    col.where('clientOwnerUids', 'array-contains', caller.uid).get(),
    byGroup('clientOwnerGroupIds'),
  ]);

  const byId = new Map<string, Record<string, unknown>>();
  for (const d of [...mine.docs, ...viaGroup.docs, ...viaClient.docs, ...viaClientGroup.docs]) {
    byId.set(d.id, { id: d.id, ...d.data() });
  }

  // Sorted here rather than in the queries: each query would need its own
  // composite index to carry an orderBy, and the union has to be re-sorted
  // afterwards regardless.
  return [...byId.values()].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

/** Firestore Timestamps sort by their epoch millis; anything missing sorts last. */
function toMillis(value: unknown): number {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}

/**
 * The three answers an order id can produce, kept apart — the sibling of
 * `PartyAccess`, and there for the same reason. A broker sent an order link by
 * a colleague used to land on "Order not found", which is untrue and tells them
 * nothing to do next; "this is Maria's load" tells them who to ask.
 */
export type OrderAccess =
  | { status: 'ok'; order: Record<string, unknown> }
  | { status: 'missing' }
  | { status: 'denied'; ownerName: string };

export async function readOrder(caller: Caller, orderId: string): Promise<OrderAccess> {
  const snap = await adminDb.collection(COL).doc(orderId).get();
  if (!snap.exists) return { status: 'missing' };

  const data = snap.data()!;
  if (canSeeOrder(data, caller.uid, caller.profile)) {
    return { status: 'ok', order: { id: snap.id, ...data } };
  }
  return { status: 'denied', ownerName: await orderOwnerLabel(data) };
}

/**
 * Who to go and ask about an order.
 *
 * The order's own owner is named first and its client's owner only as a
 * fallback, because those are two different conversations: the broker running
 * the load can answer about the load, while the client's owner is merely the
 * reason the order is visible to them at all.
 *
 * An order with neither is not unowned-and-shared the way a party would be —
 * canSeeOrder() keeps it to admin, dispatch and finance — so the empty string
 * here means "ask an administrator", not "nobody owns this".
 */
export async function orderOwnerLabel(order: FirebaseFirestore.DocumentData): Promise<string> {
  const own = await ownerLabel(
    order.assignedToUids ?? [],
    '',
    order.assignedToGroupIds ?? [],
    order.assignedToEmails ?? [],
  );
  if (own !== 'another user') return own;

  const viaClient = await ownerLabel(
    order.clientOwnerUids ?? [],
    '',
    order.clientOwnerGroupIds ?? [],
  );
  return viaClient === 'another user' ? '' : viaClient;
}

/**
 * The order a *number* refers to, if the caller may see it.
 *
 * Numbers rather than ids, because this exists for the number somebody types
 * into chat — nobody pastes a Firestore document id into a message about a
 * load. A load can be known by two numbers at once (see orderDisplayNumber),
 * so both are tried: the sequence number first, then the BATS id, which is
 * what the older half of the company still says out loud.
 *
 * `limit(1)` on each. An order number is unique by construction — it comes out
 * of a counter transaction — and a BATS id was unique in the system it came
 * from; a duplicate would be a data fault, and answering with the first is
 * better than refusing to answer at all.
 */
export async function readOrderByNumber(caller: Caller, number: string): Promise<OrderAccess> {
  const wanted = number.trim();
  if (!wanted) return { status: 'missing' };

  const col = adminDb.collection(COL);
  for (const field of ['orderNumber', 'batsId'] as const) {
    const snap = await col.where(field, '==', wanted).limit(1).get();
    if (snap.empty) continue;

    const doc  = snap.docs[0];
    const data = doc.data();
    if (canSeeOrder(data, caller.uid, caller.profile)) {
      return { status: 'ok', order: { id: doc.id, ...data } };
    }
    // Deliberately no owner name here, unlike readOrder. Somebody who follows
    // an order link chose to open it and is owed an explanation; a number that
    // happened to appear in a message they were reading is not something they
    // asked about, and naming its owner would turn every room into a way to
    // ask who works which load.
    return { status: 'denied', ownerName: '' };
  }
  return { status: 'missing' };
}

/**
 * Loads one order only if the caller is entitled to it; 403s rather than 404s.
 * The throwing face of `readOrder`.
 */
export async function getVisibleOrder(
  caller: Caller,
  orderId: string,
): Promise<Record<string, unknown>> {
  const access = await readOrder(caller, orderId);
  if (access.status === 'missing') throw new AdminAuthError('Order not found', 404);
  if (access.status === 'denied') {
    // 403 rather than 404 on purpose: the order exists, and telling the caller
    // so is not a leak when they already had to name its id to get here.
    throw new AdminAuthError('You do not have access to this order', 403);
  }
  return access.order;
}
