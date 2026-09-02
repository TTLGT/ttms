/**
 * Turning "this person" into the fields a record actually carries.
 *
 * Everything that names a colleague on screen names them by email — see
 * `personHref()` in lib/directoryProfile.ts for why: it is the one identifier
 * everybody on the allowlist has, including a new hire Google has never seen.
 * Records name their owners the other way round, by uid, falling back to the
 * address only until that first sign-in.
 *
 * So a link like `/dashboard/orders?owner=maria@…` has to be resolved before it
 * can be queried, and it is resolved **server-side**: the browser is never in a
 * position to tell the server which uid to filter on, and a uid in the address
 * bar would be an identifier nothing else in the app exposes.
 */

import { adminDb, AdminAuthError } from './firebase-admin';
import { ALLOWED_USERS_COLLECTION, normalizeEmail } from './accessControl';

export interface OwnerFilter {
  /** Null for somebody set up who has never signed in. */
  uid: string | null;
  /** Always present — the allowlist is keyed by it. */
  email: string;
}

/**
 * The allowlist entry behind an email, as the pair of identifiers a record can
 * be held under.
 *
 * Returns null for an address nobody was ever set up at, which callers treat as
 * "no such person" rather than as "no filter" — silently dropping an owner
 * filter would answer a narrow question with the whole list.
 *
 * Deliberately no permission check here. Every caller has already established
 * what the reader may see, and this only turns a name into ids; the filtering
 * that matters happens afterwards, against records the reader was entitled to
 * anyway.
 */
export async function resolveOwnerFilter(email: string): Promise<OwnerFilter | null> {
  const key = normalizeEmail(email);
  if (!key) return null;

  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(key).get();
  if (!snap.exists) return null;

  const uid = snap.data()?.uid;
  return { uid: typeof uid === 'string' && uid ? uid : null, email: key };
}

/** The throwing face of the above, for a route that was handed an owner. */
export async function requireOwnerFilter(email: string): Promise<OwnerFilter> {
  const owner = await resolveOwnerFilter(email);
  if (!owner) throw new AdminAuthError('No such person', 404);
  return owner;
}
