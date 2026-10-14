/**
 * Who created, owns and is the broker on a load — names resolved server-side.
 *
 * The order screens used to show none of this: an order carries uids, and
 * turning them into names in the browser meant reading every profile in the
 * company on every visit. Here the distinct people and groups across a whole
 * page of orders are fetched once each, so a list of fifty loads costs a
 * handful of reads rather than one per row.
 *
 * Nothing in the result grants anything. Names and emails are already on
 * `users/{uid}`, which every signed-in account can read; this only saves the
 * browser the work.
 */

import { adminDb } from './firebase-admin';
import { USERS_COLLECTION } from './accessControl';
import { paperworkBrokerUid, type OrderOwnerSummary } from '@/types/order';

type Doc = Record<string, unknown>;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];

function personName(d: Doc | undefined, fallback: string): string {
  return (d?.displayName as string) || (d?.email as string) || fallback;
}

/** One summary per order id. */
export async function orderOwnerSummaries(orders: Doc[]): Promise<Map<string, OrderOwnerSummary>> {
  const uids = new Set<string>();
  const groupIds = new Set<string>();
  for (const o of orders) {
    for (const u of [...strings(o.assignedToUids), ...strings(o.clientOwnerUids)]) uids.add(u);
    if (typeof o.createdBy === 'string' && o.createdBy) uids.add(o.createdBy);
    for (const g of [...strings(o.assignedToGroupIds), ...strings(o.clientOwnerGroupIds)]) groupIds.add(g);
  }

  // getAll refuses an empty list, so neither read is made when nothing of
  // that kind is needed.
  const [userDocs, groupDocs] = await Promise.all([
    uids.size     ? adminDb.getAll(...[...uids].map((u) => adminDb.collection(USERS_COLLECTION).doc(u))) : Promise.resolve([]),
    groupIds.size ? adminDb.getAll(...[...groupIds].map((g) => adminDb.collection('workGroups').doc(g))) : Promise.resolve([]),
  ]);
  const users  = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as Doc]));
  const groups = new Map(groupDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as Doc]));
  const groupName = (id: string) => (groups.get(id)?.name as string) || 'A work group';

  const out = new Map<string, OrderOwnerSummary>();
  for (const o of orders) {
    const id = String(o.id ?? '');
    const owned = strings(o.assignedToUids);
    const creator = typeof o.createdBy === 'string' && o.createdBy ? o.createdBy : null;
    out.set(id, {
      // An imported load's createdBy is whoever ran the import, or nothing;
      // a uid with no profile behind it is named as nobody rather than as a
      // raw id.
      createdBy: creator && users.has(creator) ? { uid: creator, name: personName(users.get(creator), '') } : null,
      people: owned.map((uid) => ({
        uid,
        name:  personName(users.get(uid), 'A former user'),
        email: (users.get(uid)?.email as string) || '',
      })),
      groups:  strings(o.assignedToGroupIds).map((g) => ({ id: g, name: groupName(g) })),
      pending: strings(o.assignedToEmails),
      batsName: typeof o.assignedTo === 'string' ? o.assignedTo.trim() : '',
      viaClient: [
        ...strings(o.clientOwnerUids).filter((u) => !owned.includes(u)).map((u) => personName(users.get(u), 'A former user')),
        ...strings(o.clientOwnerGroupIds).filter((g) => !strings(o.assignedToGroupIds).includes(g)).map(groupName),
      ],
      brokerUid: paperworkBrokerUid({
        brokerUid: o.brokerUid as string | null | undefined,
        createdBy: creator,
        assignedToUids: owned,
      }),
    });
  }
  return out;
}

/** The orders with `owners` added — see the field on Order. */
export async function withOwnerSummaries<T extends Doc>(orders: T[]): Promise<T[]> {
  const summaries = await orderOwnerSummaries(orders);
  return orders.map((o) => ({ ...o, owners: summaries.get(String(o.id ?? '')) }));
}

/** The broker's details as the SA and the Dispatch Sheet print them. */
export interface BrokerContact {
  uid: string;
  name: string;
  email: string;
  /** The US work number with its extension, ready to print. '' when none is on file. */
  phone: string;
}

/**
 * The broker for this load's paperwork — `paperworkBrokerUid()` with the
 * person's profile read. Null when no person owns the load or their profile
 * is gone; the agreement routes then name whoever sent it, as they always did.
 */
export async function paperworkBroker(order: Doc): Promise<BrokerContact | null> {
  const uid = paperworkBrokerUid({
    brokerUid: order.brokerUid as string | null | undefined,
    createdBy: order.createdBy as string | null | undefined,
    assignedToUids: strings(order.assignedToUids),
  });
  if (!uid) return null;
  const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data() as Doc;
  // Only the US work number, as resolveOwnerContacts() does: `phoneOther` is
  // somebody's Guatemala or Mexico line, not one a client should ring.
  const phone = String(d.phone ?? '').trim();
  const ext   = String(d.extension ?? '').trim();
  return {
    uid,
    name:  personName(d, ''),
    email: String(d.email ?? ''),
    phone: phone ? (ext ? `${phone} ext. ${ext}` : phone) : '',
  };
}

/**
 * The fields a signing link stores about the broker. Written on every send
 * and resend — never part of the agreement's fingerprint, because who to ring
 * about a load is not something the signer agreed to, and changing the broker
 * must not hold a link for review.
 */
export function brokerSnapshot(broker: BrokerContact | null) {
  return {
    brokerName:  broker?.name  ?? '',
    brokerEmail: broker?.email ?? '',
    brokerPhone: broker?.phone ?? '',
  };
}
