/**
 * Turning assignments held by email into assignments held by uid.
 *
 * An admin has to be able to set someone up before their first day: assign
 * them clients, put them on a work group, hand them orders, put them in charge
 * of a team. None of that can name a uid, because a Firebase uid does not exist
 * until the person first authenticates with Google. So those assignments are recorded against the
 * person's email and drained here, at the moment they sign in for the first
 * time.
 *
 * This runs inside /api/auth/session, before the response returns, so the very
 * first page the new user loads already shows their book of business. Doing it
 * lazily afterwards would give them an empty dashboard on day one, which reads
 * as "the system is broken" rather than "wait a moment".
 */

import { Timestamp } from 'firebase-admin/firestore';
import { FieldValue, adminDb } from './firebase-admin';
import { TEAMS_COLLECTION, WORK_GROUPS_COLLECTION, USERS_COLLECTION } from './accessControl';
import { syncClientOwners } from './ownership';

export interface ClaimResult {
  /** Work groups this person was waiting to join. */
  groupIds: string[];
  /** Teams that were already reporting to this person by email. */
  teamIds: string[];
  parties: number;
  orders: number;
}

/**
 * Claim everything held for `email` on behalf of `uid`.
 *
 * Safe to run more than once: every step is driven by a query on the email
 * itself, and the email is cleared as it is claimed, so a second pass simply
 * finds nothing.
 */
export async function claimPendingAssignments(email: string, uid: string): Promise<ClaimResult> {
  const now = Timestamp.now();
  const result: ClaimResult = { groupIds: [], teamIds: [], parties: 0, orders: 0 };
  if (!email || !uid) return result;

  const [groups, teams, parties, orders] = await Promise.all([
    adminDb.collection(WORK_GROUPS_COLLECTION).where('memberEmails', 'array-contains', email).get(),
    // Equality rather than array-contains: a team has exactly one lead.
    adminDb.collection(TEAMS_COLLECTION).where('leadEmail', '==', email).get(),
    adminDb.collection('parties').where('assignedToEmails', 'array-contains', email).get(),
    adminDb.collection('orders').where('assignedToEmails', 'array-contains', email).get(),
  ]);

  result.groupIds = groups.docs.map((d) => d.id);
  result.teamIds  = teams.docs.map((d) => d.id);
  result.parties  = parties.size;
  result.orders   = orders.size;
  if (groups.size + teams.size + parties.size + orders.size === 0) return result;

  /** One pending update, collected first so the whole lot can be chunked. */
  const updates: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[] = [];

  for (const doc of groups.docs) {
    updates.push({
      ref: doc.ref,
      data: {
        memberUids:   FieldValue.arrayUnion(uid),
        memberEmails: ((doc.data().memberEmails ?? []) as string[]).filter((e) => e !== email),
        updatedAt:    now,
      },
    });
  }

  // A team named this person as its lead before they had a uid. Moving the
  // address into `leadUid` now means nothing that renders a lead has to know
  // the pending shape existed — and it cannot go stale if they later change
  // their email.
  for (const doc of teams.docs) {
    updates.push({
      ref:  doc.ref,
      data: { leadUid: uid, leadEmail: null, updatedAt: now },
    });
  }

  for (const doc of [...parties.docs, ...orders.docs]) {
    updates.push({
      ref: doc.ref,
      data: {
        assignedToUids:   FieldValue.arrayUnion(uid),
        assignedToEmails: ((doc.data().assignedToEmails ?? []) as string[]).filter((e) => e !== email),
        updatedAt:        now,
      },
    });
  }

  // Group membership is mirrored onto the profile because that mirror is what
  // security rules test — they cannot query the group to ask. arrayUnion, not
  // a plain merge write: merging replaces an array wholesale, which would drop
  // any group the person is already in.
  if (result.groupIds.length) {
    updates.push({
      ref:  adminDb.collection(USERS_COLLECTION).doc(uid),
      data: { groupIds: FieldValue.arrayUnion(...result.groupIds) },
    });
  }

  // A batch caps at 500 operations, and a rep can easily be handed more than
  // 500 clients before their first day.
  const CHUNK = 400;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = adminDb.batch();
    for (const { ref, data } of updates.slice(i, i + CHUNK)) {
      // set-with-merge rather than update: the profile document may not exist
      // yet on a first sign-in, and update() would throw on a missing doc.
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
  }

  // Owning a client carries its orders, and rules read that from a mirror on
  // each order. The mirror could not name this person until a moment ago.
  for (const doc of parties.docs) await syncClientOwners(doc.id);

  return result;
}
