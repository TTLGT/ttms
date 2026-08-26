import { createHash } from 'crypto';
import { FieldValue, adminDb } from '@/lib/firebase-admin';
import { addressToQuery } from '@/types/order';
import type { Address } from '@/types/order';

/**
 * A permanent record of every lane Google Routes has been asked about.
 *
 * Routes bills per lookup, so without this the same warehouse pair costs again
 * on every order that uses it — and every existing order backfills a charge the
 * first time somebody opens it. Here a lane is looked up once, written down,
 * and read from this collection forever after. Nothing re-asks Google on its
 * own; only an admin refresh does (see `/api/route-distance/refresh`).
 *
 * Deliberately holds Google answers only. The offline estimate in
 * `routeDistance.ts` is free to recompute, so caching it would trade a
 * Firestore read for arithmetic that costs nothing — and would freeze the
 * output of a formula that is expected to be retuned, leaving old and new
 * calibrations live at once with no way to tell them apart. Per-order
 * stability already lives on the order itself (`laneMiles`).
 *
 * Admin SDK only. Nothing client-side reads or writes this.
 */

const COLLECTION = 'laneDistances';

/**
 * Nothing is counted or timestamped on read. A hit counter would mean a
 * Firestore *write* on every lookup — and the order form fires a lookup on
 * every debounced address change — which is the cost this cache exists to
 * avoid. `createdAt` is enough to tell when a number was obtained.
 */
export interface CachedLane {
  miles: number;
  originQuery: string;
  destinationQuery: string;
}

interface LaneKey {
  id: string;
  from: string;
  to: string;
}

/**
 * Doc id is a hash of the normalized address pair: Firestore ids cannot
 * contain `/` and cap at 1500 bytes, both of which a pair of full street
 * addresses will hit.
 *
 * Direction is NOT normalized. A→B and B→A are separate entries because road
 * miles genuinely differ between them — one-way segments, divided highways —
 * and collapsing the two would serve a number Google never returned.
 */
function laneKey(origin: Address, destination: Address): LaneKey | null {
  const from = addressToQuery(origin).toLowerCase().replace(/\s+/g, ' ').trim();
  const to = addressToQuery(destination).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!from || !to) return null;

  const id = createHash('sha256').update(`${from}>${to}`).digest('hex');
  return { id, from, to };
}

/** The stored mileage for this exact lane, or null if it has never been asked. */
export async function readCachedLane(
  origin: Address,
  destination: Address,
): Promise<number | null> {
  const key = laneKey(origin, destination);
  if (!key) return null;

  try {
    const snap = await adminDb.collection(COLLECTION).doc(key.id).get();
    if (!snap.exists) return null;
    const miles = snap.data()?.miles;
    return typeof miles === 'number' ? miles : null;
  } catch {
    // A cache read failure must not take the lookup down with it — the caller
    // falls through to Google, which costs money but still answers.
    return null;
  }
}

/**
 * Write a confirmed Google answer down.
 *
 * Only ever called with a `status: 'ok'` result from the Routes API. Caching a
 * degraded fallback would be the worst possible bug here: a ten-minute Google
 * outage would permanently pin every lane looked up during it to an estimate,
 * and fixing the billing would never bring them back.
 */
export async function writeCachedLane(
  origin: Address,
  destination: Address,
  miles: number,
): Promise<void> {
  const key = laneKey(origin, destination);
  if (!key) return;

  try {
    await adminDb.collection(COLLECTION).doc(key.id).set(
      {
        miles,
        // Stored alongside the hash so the collection is legible to a human
        // inspecting it — the id alone says nothing about which lane it is.
        originQuery: key.from,
        destinationQuery: key.to,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    // Best-effort: showing the broker a distance matters more than recording
    // it. A failed write just means the next lookup pays Google again.
  }
}

export interface LaneRefresh {
  miles: number;
  previousMiles: number | null;
}

/**
 * Overwrite a lane with a fresh Google answer and record who did it.
 *
 * The refresh log is kept forever in a subcollection rather than as fields on
 * the lane, so a lane refreshed three times keeps all three entries. Mileage
 * may already sit on a quote or an invoice, so "who changed 525 to 540, and
 * when" needs to survive the next change.
 */
export async function recordLaneRefresh(
  origin: Address,
  destination: Address,
  miles: number,
  by: { uid: string; email: string | undefined },
  orderId: string | null,
): Promise<LaneRefresh> {
  const key = laneKey(origin, destination);
  if (!key) return { miles, previousMiles: null };

  const doc = adminDb.collection(COLLECTION).doc(key.id);
  let previousMiles: number | null = null;

  try {
    const snap = await doc.get();
    const stored = snap.exists ? snap.data()?.miles : null;
    previousMiles = typeof stored === 'number' ? stored : null;

    await doc.set(
      {
        miles,
        originQuery: key.from,
        destinationQuery: key.to,
        lastRefreshedAt: FieldValue.serverTimestamp(),
        lastRefreshedByEmail: by.email ?? by.uid,
        refreshCount: FieldValue.increment(1),
        // Only stamped when the lane is new. A refresh must not rewrite when
        // the lane was first obtained, so it is spread in rather than always
        // set — `merge: true` would otherwise overwrite it every time.
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );

    await doc.collection('refreshes').add({
      previousMiles,
      miles,
      refreshedByUid: by.uid,
      refreshedByEmail: by.email ?? by.uid,
      refreshedAt: FieldValue.serverTimestamp(),
      // Which order the admin was looking at when they asked. Not the only
      // order on this lane — just where the request came from.
      orderId,
    });
  } catch {
    // The lookup already succeeded and the admin is owed the number. A failed
    // log write must not turn that into an error they cannot act on.
  }

  return { miles, previousMiles };
}
