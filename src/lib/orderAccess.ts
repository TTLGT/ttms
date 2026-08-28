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

/** Loads one order only if the caller is entitled to it; 403s rather than 404s. */
export async function getVisibleOrder(
  caller: Caller,
  orderId: string,
): Promise<Record<string, unknown>> {
  const snap = await adminDb.collection(COL).doc(orderId).get();
  if (!snap.exists) throw new AdminAuthError('Order not found', 404);

  const data = snap.data()!;
  if (!canSeeOrder(data, caller.uid, caller.profile)) {
    // 403 rather than 404 on purpose: the order exists, and telling the caller
    // so is not a leak when they already had to name its id to get here.
    throw new AdminAuthError('You do not have access to this order', 403);
  }
  return { id: snap.id, ...data };
}
