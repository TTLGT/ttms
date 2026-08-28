import { adminDb } from './firebase-admin';
import { ALLOWED_USERS_COLLECTION, normalizeEmail } from './accessControl';

/**
 * Works out how to store the lead the caller picked, who is named by email.
 *
 * Email is what the picker sends because it is the one identifier everybody on
 * the allowlist has: a uid only appears at first sign-in, and the lead of a
 * brand new team is regularly someone who has not logged in yet. The server
 * decides which field to write — a uid when there is one, because it survives
 * an address change, and the email otherwise, to be drained into `leadUid` by
 * claimPendingAssignments() the moment that person signs in.
 *
 * The allowlist is checked here rather than trusted from the picker, which can
 * be stale by the time it is submitted — otherwise a team could display a name
 * it cannot resolve.
 */
export type LeadFields = { leadUid: string | null; leadEmail: string | null };

export async function resolveLead(value: unknown): Promise<LeadFields | 'missing'> {
  const email = normalizeEmail(typeof value === 'string' ? value : '');
  if (!email) return { leadUid: null, leadEmail: null };

  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();
  if (!snap.exists) return 'missing';

  const uid = snap.data()?.uid;
  return typeof uid === 'string' && uid
    ? { leadUid: uid, leadEmail: null }
    : { leadUid: null, leadEmail: email };
}

