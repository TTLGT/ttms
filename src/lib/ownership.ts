/**
 * Ownership of orders and parties: who holds a record, and the trail of how it
 * got there.
 *
 * Two things live here because they must always happen together. Changing an
 * owner without writing the history entry would leave a record whose access
 * changed with nothing saying who changed it, and the whole point of the
 * timeline is that it cannot be quietly skipped.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { WORK_GROUPS_COLLECTION, USERS_COLLECTION } from './accessControl';
import { OWNER_EVENTS_SUBCOLLECTION } from '@/types/ownerEvent';
import type { OwnerEventAction, OwnerTargetType } from '@/types/ownerEvent';

/** The three ways a record can name an owner. */
export interface OwnerSet {
  uids: string[];
  groupIds: string[];
  /** Owners who exist but have never signed in — see Party.assignedToEmails. */
  emails: string[];
}

export const EMPTY_OWNERS: OwnerSet = { uids: [], groupIds: [], emails: [] };

export interface OwnerActor {
  uid: string;
  name: string;
  /** Null when there is no request behind the change, as for the importer. */
  ip: string | null;
}

export interface PendingOwnerEvent {
  action: OwnerEventAction;
  targetType: OwnerTargetType;
  targetId: string;
  targetLabel: string;
}

/**
 * Human-readable names for a batch of owner targets, resolved once.
 *
 * Labels are stored on the event rather than looked up when the timeline is
 * rendered, so a work group that is later deleted or a user who leaves the
 * company still reads as a name instead of a dangling id.
 */
export async function labelOwners(owners: OwnerSet): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  for (const email of owners.emails) labels.set(`email:${email}`, email);

  const refs = [
    ...owners.uids.map((uid) => adminDb.collection(USERS_COLLECTION).doc(uid)),
    ...owners.groupIds.map((id) => adminDb.collection(WORK_GROUPS_COLLECTION).doc(id)),
  ];
  if (refs.length === 0) return labels;

  const docs = await adminDb.getAll(...refs);
  for (const doc of docs) {
    const d = doc.data();
    if (!d) continue;
    if (owners.uids.includes(doc.id)) {
      labels.set(`user:${doc.id}`, d.displayName || d.email || doc.id);
    } else {
      labels.set(`group:${doc.id}`, d.name || doc.id);
    }
  }
  return labels;
}

/** Flattens an OwnerSet into the target tuples the history records. */
export function ownerTargets(
  owners: OwnerSet,
  labels: Map<string, string>,
): { targetType: OwnerTargetType; targetId: string; targetLabel: string }[] {
  return [
    ...owners.uids.map((id) => ({
      targetType: 'user' as const, targetId: id, targetLabel: labels.get(`user:${id}`) ?? id,
    })),
    ...owners.groupIds.map((id) => ({
      targetType: 'group' as const, targetId: id, targetLabel: labels.get(`group:${id}`) ?? id,
    })),
    ...owners.emails.map((id) => ({
      targetType: 'email' as const, targetId: id, targetLabel: labels.get(`email:${id}`) ?? id,
    })),
  ];
}

/**
 * Appends history entries to a record.
 *
 * `idPrefix` pins the document ids, which the importer uses so that re-running
 * it cannot append a second copy of the same opening entry. Entries are
 * numbered off the prefix because one BATS name can resolve to several owners
 * ("Gabe/Axel"), and a single fixed id would collapse them onto one document.
 * Leave it undefined for a normal auto-id append.
 */
export function writeOwnerEvents(
  batch: FirebaseFirestore.WriteBatch,
  parent: FirebaseFirestore.DocumentReference,
  events: PendingOwnerEvent[],
  actor: OwnerActor,
  now: Timestamp,
  idPrefix?: string,
): void {
  const col = parent.collection(OWNER_EVENTS_SUBCOLLECTION);
  events.forEach((event, i) => {
    const ref = idPrefix ? col.doc(`${idPrefix}-${i}`) : col.doc();
    batch.set(ref, {
      ...event,
      actorUid:  actor.uid,
      actorName: actor.name,
      actorIp:   actor.ip,
      at:        now,
    });
  });
}

/** The request IP, for the history entry. Mirrors the e-sign audit trail. */
export function callerIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
}

/**
 * Add or remove owners on an order or a party, recording what happened.
 *
 * The document write and the history entry go in one batch on purpose. An
 * ownership change that landed without its history entry would be exactly the
 * silent reassignment this trail exists to make impossible.
 *
 * `assignedToName` is cleared the moment a real owner is added: the BATS text
 * and a real assignment are alternatives, not companions, and leaving both
 * would give two answers to "who owns this". The name survives in the history,
 * which is where it belongs once it is no longer the operative answer.
 */
export async function changeOwners(
  collectionName: 'orders' | 'parties',
  docId: string,
  action: 'added' | 'removed',
  owners: OwnerSet,
  actor: OwnerActor,
): Promise<{ uids: string[]; groupIds: string[]; emails: string[] }> {
  const ref  = adminDb.collection(collectionName).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Record not found');

  const current = snap.data()!;
  const now     = Timestamp.now();
  const adding  = action === 'added';

  const merge = (existing: string[], change: string[]) =>
    adding
      ? [...new Set([...existing, ...change])]
      : existing.filter((v) => !change.includes(v));

  const next = {
    uids:     merge((current.assignedToUids ?? []) as string[], owners.uids),
    groupIds: merge((current.assignedToGroupIds ?? []) as string[], owners.groupIds),
    emails:   merge((current.assignedToEmails ?? []) as string[], owners.emails),
  };

  const labels = await labelOwners(owners);
  const events = ownerTargets(owners, labels).map((t) => ({ action, ...t }));

  const batch = adminDb.batch();
  batch.update(ref, {
    assignedToUids:     next.uids,
    assignedToGroupIds: next.groupIds,
    assignedToEmails:   next.emails,
    ...(adding && next.uids.length + next.groupIds.length + next.emails.length > 0
      ? { assignedToName: '' }
      : {}),
    updatedAt: now,
  });
  writeOwnerEvents(batch, ref, events, actor, now);
  await batch.commit();

  return next;
}

/**
 * Push a party's owners onto every order that names it as the client.
 *
 * Owning a client grants access to all of its orders, and security rules
 * cannot express that on their own: rules cannot run a query, and a get() on
 * the client party per order would exceed Firestore's document-access limit on
 * any list. So the answer is denormalized onto each order and refreshed here
 * whenever the party's ownership changes.
 *
 * Only uids and group ids are mirrored. An email owner grants nothing until
 * first sign-in, and the claim step in /api/auth/session calls this again once
 * there is a uid to mirror.
 *
 * A client with thousands of orders makes this a large write burst. That is
 * the price of rules being able to enforce the cascade at all; the alternative
 * is that they cannot enforce it.
 */
export async function syncClientOwners(partyId: string): Promise<number> {
  if (!partyId) return 0;

  const party = await adminDb.collection('parties').doc(partyId).get();
  if (!party.exists) return 0;

  const d = party.data()!;
  const clientOwnerUids     = (d.assignedToUids ?? []) as string[];
  const clientOwnerGroupIds = (d.assignedToGroupIds ?? []) as string[];

  const orders = await adminDb.collection('orders').where('clientId', '==', partyId).get();
  if (orders.empty) return 0;

  const CHUNK = 400;
  for (let i = 0; i < orders.docs.length; i += CHUNK) {
    const batch = adminDb.batch();
    for (const doc of orders.docs.slice(i, i + CHUNK)) {
      batch.update(doc.ref, { clientOwnerUids, clientOwnerGroupIds, updatedAt: Timestamp.now() });
    }
    await batch.commit();
  }
  return orders.size;
}
