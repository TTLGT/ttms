import { adminDb } from './firebase-admin';
import { can } from './accessControl';
import { inChunks } from './teamScope';
import type { Caller } from './partyAccess';

/**
 * The pending access requests this caller is expected to answer.
 *
 * Shared by the party and order request routes, which ask the same question of
 * two collections. Three ways a request lands in somebody's queue:
 *
 * - they hold `access.decideAny`, so every pending request does;
 * - they own the record it is about;
 * - they are the Sales Manager of somebody who owns it.
 *
 * The third is the point of the queue existing at all for a manager: before
 * it, a request against a rep who was out sat there until an admin noticed.
 *
 * The union is de-duplicated by document id rather than merged by hand — a
 * request owned by two people, one of them the caller and one of them their
 * report, comes back from two of these queries and must appear once.
 */
export async function pendingForDecider(
  collection: string,
  caller: Caller,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const col = adminDb.collection(collection);

  if (can(caller.profile, 'access.decideAny')) {
    return (await col.where('status', '==', 'pending').get()).docs;
  }

  const managed = caller.profile.managedUids ?? [];

  const queries = [
    col.where('ownerUids', 'array-contains', caller.uid).where('status', '==', 'pending').get(),
    // array-contains-any caps at 30, and a team can be larger — see inChunks.
    ...inChunks(managed).map((batch) =>
      col.where('ownerUids', 'array-contains-any', batch).where('status', '==', 'pending').get()),
  ];

  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const snap of await Promise.all(queries)) {
    for (const doc of snap.docs) byId.set(doc.id, doc);
  }
  return [...byId.values()];
}
