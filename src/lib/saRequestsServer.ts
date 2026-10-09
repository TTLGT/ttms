import type { Timestamp } from 'firebase-admin/firestore';
import { adminDb, FieldValue } from './firebase-admin';
import { openedAlert, postOrderAlert } from './chatAlerts';
import { clientContactOf, readinessFactsFor } from './orderReadinessServer';
import { CONVERSATIONS_COLLECTION, recordConversationId } from '@/types/conversation';
import { orderDisplayNumber, type CommodityItem, type Order } from '@/types/order';
import { orderReadiness } from '@/types/orderReadiness';
import { LOAD_PHOTOS_COLLECTION } from '@/types/loadPhoto';
import { fmcsaConcerns, operatingSince, type FmcsaRegistry } from '@/types/fmcsa';
import {
  SA_REQUESTS_COLLECTION, SA_ROUNDS_SUBCOLLECTION, accessorialHints, cleanCcList, isCcEmail,
  type SaGateFacts, type SaRequest, type SaRequestStatus, type SaReview, type SaRound, type SaSend,
} from '@/types/saRequest';

/**
 * Server side of SA requests. See src/types/saRequest.ts.
 */

const STATUSES: SaRequestStatus[] = ['open', 'sent', 'done', 'returned'];

function millis(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : null;
}

export function toSaRequest(d: FirebaseFirestore.DocumentData): SaRequest {
  const checks: SaRequest['checks'] = {};
  for (const [key, raw] of Object.entries((d.checks ?? {}) as Record<string, Record<string, unknown>>)) {
    if (!raw) continue;
    checks[key] = { byUid: String(raw.byUid ?? ''), byName: String(raw.byName ?? ''), at: millis(raw.at) ?? 0 };
  }
  return {
    orderId:         String(d.orderId ?? ''),
    orderNumber:     String(d.orderNumber ?? ''),
    clientName:      String(d.clientName ?? ''),
    status:          STATUSES.includes(d.status) ? d.status : 'open',
    note:            String(d.note ?? ''),
    requestedByUid:  String(d.requestedByUid ?? ''),
    requestedByName: String(d.requestedByName ?? ''),
    requestedAt:     millis(d.requestedAt) ?? 0,
    checks,
    sentAt:          millis(d.sentAt),
    sentByName:      d.sentByName ?? null,
    sentTo:          d.sentTo ?? null,
    doneAt:          millis(d.doneAt),
    doneByName:      d.doneByName ?? null,
    returnedAt:      millis(d.returnedAt),
    returnedByName:  d.returnedByName ?? null,
    returnReason:    d.returnReason ?? null,
    reason:          d.reason === 'changed' ? 'changed' : 'requested',
    ccEmails:        cleanCcList(d.ccEmails),
    sentCc:          cleanCcList(d.sentCc),
  };
}

export function saRequestRef(orderId: string) {
  return adminDb.collection(SA_REQUESTS_COLLECTION).doc(orderId);
}

// ── Rounds: the review's permanent record ────────────────────────────────────

/** Accepts a Timestamp or epoch ms — a frozen review stores plain numbers. */
function ms(v: unknown): number | null {
  if (typeof v === 'number') return v;
  return millis(v);
}

export function roundRef(orderId: string, roundId: string) {
  return saRequestRef(orderId).collection(SA_ROUNDS_SUBCOLLECTION).doc(roundId);
}

/** A fresh id for a round that is about to open. */
export function newRoundId(orderId: string): string {
  return saRequestRef(orderId).collection(SA_ROUNDS_SUBCOLLECTION).doc().id;
}

/**
 * The round a request document belongs to. A request from before rounds
 * were kept has no id; it is named by when it was asked for, which is stable
 * across every copy of it.
 */
export function roundIdOf(d: FirebaseFirestore.DocumentData): string {
  return typeof d.roundId === 'string' && d.roundId ? d.roundId : `legacy-${millis(d.requestedAt) ?? 0}`;
}

/** Anything with a set() — a WriteBatch or a Transaction. */
interface Writer {
  set(ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData): unknown;
}

/**
 * Copies the request, as it is after this write, into its round.
 *
 * A whole copy, `set()` without merge, on purpose: a merge would keep a tick
 * that has since been taken off, and the record would say somebody checked
 * something they had unticked. Everything the round needs is on the request
 * (see SA_ROUNDS_SUBCOLLECTION), so nothing is lost by overwriting.
 *
 * Called in the same batch or transaction as the change it records, so the
 * record cannot miss a step.
 */
export function archiveRound(
  writer: Writer,
  orderId: string,
  requestAfter: FirebaseFirestore.DocumentData,
  extra: Record<string, unknown> = {},
): void {
  const id = roundIdOf(requestAfter);
  writer.set(roundRef(orderId, id), {
    ...requestAfter,
    roundId: id,
    kind: requestAfter.kind === 'direct' ? 'direct' : 'review',
    ...extra,
    archivedAt: FieldValue.serverTimestamp(),
  });
}

/** A frozen copy of a review, safe to store: plain values, no undefined, no address book. */
export function freezeReview(review: SaReview): SaReview {
  return JSON.parse(JSON.stringify({ ...review, clientContacts: [] })) as SaReview;
}

/** One send, as stored in a round's `sends`. */
export function sendEntry(s: Omit<SaSend, 'at'>, at: Timestamp): Record<string, unknown> {
  return { ...s, at };
}

export function toSaRound(id: string, d: FirebaseFirestore.DocumentData): SaRound {
  const base = toSaRequest(d);
  const direct = d.kind === 'direct';
  const sends: SaSend[] = Array.isArray(d.sends)
    ? (d.sends as Record<string, unknown>[]).map((x) => ({
        at:      ms(x.at) ?? 0,
        byName:  String(x.byName ?? ''),
        sentTo:  String(x.sentTo ?? ''),
        cc:      cleanCcList(x.cc),
        version: Number(x.version) || 1,
        kind:    x.kind === 'resend' || x.kind === 'revision' ? x.kind : 'new',
      }))
    : [];
  return {
    id,
    kind:            direct ? 'direct' : 'review',
    status:          direct ? 'direct' : base.status,
    reason:          direct ? null : base.reason,
    note:            base.note,
    requestedByName: base.requestedByName,
    requestedAt:     base.requestedAt,
    checks:          base.checks,
    sentAt:          base.sentAt,
    sentByName:      base.sentByName,
    sentTo:          base.sentTo,
    sentCc:          base.sentCc,
    saVersion:       typeof d.saVersion === 'number' ? d.saVersion : null,
    dispatched:      d.dispatched && typeof d.dispatched === 'object' ? (d.dispatched as SaReview) : null,
    sends:           sends.sort((a, b) => a.at - b.at),
    doneAt:          base.doneAt,
    doneByName:      base.doneByName,
    returnedAt:      base.returnedAt,
    returnedByName:  base.returnedByName,
    returnReason:    base.returnReason,
    supersededAt:    millis(d.supersededAt),
  };
}

/**
 * Every round on the load, newest first. The request in progress is included
 * as it stands — nothing but ticks may have happened to it, so it may not
 * have been copied yet — and the list is never a step behind the panel.
 */
export async function listRounds(orderId: string): Promise<SaRound[]> {
  const [snap, current] = await Promise.all([
    saRequestRef(orderId).collection(SA_ROUNDS_SUBCOLLECTION).get(),
    saRequestRef(orderId).get(),
  ]);
  const byId = new Map<string, SaRound>();
  for (const d of snap.docs) byId.set(d.id, toSaRound(d.id, d.data()));
  if (current.exists) {
    const id = roundIdOf(current.data()!);
    byId.set(id, toSaRound(id, current.data()!));
  }
  return [...byId.values()].sort((a, b) => (b.sentAt ?? b.requestedAt) - (a.sentAt ?? a.requestedAt));
}

// ── The review ───────────────────────────────────────────────────────────────

/** Every email on the client's record — its contacts and its own — for the CC picker. */
async function clientContactEmails(clientId: unknown): Promise<{ name: string; email: string }[]> {
  if (typeof clientId !== 'string' || !clientId) return [];
  const snap = await adminDb.collection('parties').doc(clientId).get();
  const d = snap.data();
  if (!d) return [];
  const out: { name: string; email: string }[] = [];
  const add = (name: unknown, email: unknown) => {
    const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (e && isCcEmail(e) && !out.some((o) => o.email === e)) out.push({ name: typeof name === 'string' ? name : '', email: e });
  };
  for (const c of (d.contacts ?? []) as { name?: unknown; email?: unknown }[]) add(c?.name, c?.email);
  add(d.contactName || d.companyName, d.email);
  return out;
}

/**
 * Everything a reviewer checks the request against: the paperwork checklist,
 * who the SA will be emailed to, and the carrier's facts from its own record
 * and its last FMCSA check. One definition for the review screen and for the
 * copy frozen onto a round when the SA is sent.
 */
export async function buildSaReview(
  orderId: string,
  order: Record<string, unknown>,
  withContacts: boolean,
): Promise<SaReview> {
  const [facts, contact, carrierSnap] = await Promise.all([
    readinessFactsFor(order),
    clientContactOf(order.clientId),
    typeof order.carrierId === 'string' && order.carrierId
      ? adminDb.collection('carriers').doc(order.carrierId).get()
      : Promise.resolve(null),
  ]);
  const c = carrierSnap && carrierSnap.exists ? carrierSnap.data()! : null;
  const gate = await saGateFactsFor(orderId, order, c);
  return {
    readiness: orderReadiness(order as Partial<Order>, facts),
    sendTo: contact?.email ? { name: contact.name, email: contact.email } : null,
    carrier: c ? {
      name: String(c.companyName ?? ''),
      dot: String(c.dot ?? ''),
      mc: String(c.mc ?? ''),
      phone: String(c.phone ?? ''),
      email: String(c.email ?? ''),
      insuranceExpiration: c.insuranceExpiration?.toMillis?.() ?? null,
      insuranceOnFile: Boolean(c.insuranceStoragePath),
      fmcsaCheckedAt: c.fmcsa?.checkedAt?.toMillis?.() ?? null,
      fmcsaPhone: String(c.fmcsa?.registry?.phone ?? ''),
      fmcsaConcerns: c.fmcsa ? fmcsaConcerns(c.fmcsa, c.mc) : null,
    } : null,
    pickupDate: (order.pickupDate as Timestamp | null)?.toMillis?.() ?? null,
    agreedRate: Number(order.agreedRate) || 0,
    carrierPay: Number(order.carrierPay) || 0,
    brokerFee: Number(order.brokerFee) || 0,
    hasClientPayment: Boolean(order.clientPayment),
    gate,
    accessorialHints: accessorialHints(order.commodities as CommodityItem[] | undefined),
    // The client's other contacts, offered as one-click CCs. Reviewers only:
    // a broker reading where their request stands has no use for the
    // client's address book.
    clientContacts: withContacts ? await clientContactEmails(order.clientId) : [],
  };
}

/**
 * The files behind three of the review items — see checkBlockedBy(). Read
 * fresh on every look rather than stored on the request, so deleting a
 * license or a picture after the tick reopens the item.
 *
 * The license is the load's own copy or, failing that, the driver record's:
 * either is "on file", and the record's is the one that carries an expiry.
 * The truck pictures are a count of this load's photos marked `truck`; two
 * equality filters, which Firestore serves without a composite index.
 * `carrier` is the carrier document when the caller has already read it.
 */
export async function saGateFactsFor(
  orderId: string,
  order: Record<string, unknown>,
  carrier?: FirebaseFirestore.DocumentData | null,
): Promise<SaGateFacts> {
  const driverId = typeof order.driverId === 'string' ? order.driverId : '';
  const carrierId = typeof order.carrierId === 'string' ? order.carrierId : '';
  const [driverSnap, photos, carrierData] = await Promise.all([
    driverId ? adminDb.collection('drivers').doc(driverId).get() : Promise.resolve(null),
    adminDb.collection(LOAD_PHOTOS_COLLECTION)
      .where('orderId', '==', orderId).where('stage', '==', 'truck').count().get(),
    carrier !== undefined ? Promise.resolve(carrier)
      : carrierId ? adminDb.collection('carriers').doc(carrierId).get().then((x) => x.data() ?? null)
      : Promise.resolve(null),
  ]);
  const driver = driverSnap?.exists ? driverSnap.data()! : null;
  return {
    licenseOnFile: Boolean(order.driverLicenseStoragePath || driver?.licenseStoragePath),
    licenseExpiration: driver?.licenseExpiration?.toMillis?.() ?? null,
    truckPhotos: photos.data().count,
    operatingSince: operatingSince(carrierData?.fmcsa?.registry as FmcsaRegistry | undefined),
  };
}

/**
 * Everybody who can send an SA — the people a request is for.
 *
 * Read off the mirrored `permissions` array, which is what the API guard on
 * the send route reads too, so nobody is told about a request they would then
 * be refused at. The two role flags are asked as well for a profile written
 * before permissions existed (see `legacyList()` in the rules); a suspended
 * account is left out.
 */
export async function saReviewerUids(): Promise<string[]> {
  const users = adminDb.collection('users');
  const [byPermission, admins, dispatchers] = await Promise.all([
    users.where('permissions', 'array-contains', 'orders.sendAgreement').get(),
    users.where('isAdmin', '==', true).get(),
    users.where('isDispatcher', '==', true).get(),
  ]);
  const uids = new Set<string>();
  for (const snap of [byPermission, admins, dispatchers]) {
    for (const doc of snap.docs) {
      if (doc.data().suspended === true) continue;
      uids.add(doc.id);
    }
  }
  return [...uids];
}

/**
 * Puts these people into the room about the load, making it if nobody has
 * pressed Discuss yet — which is what makes the request show up in their chat
 * inbox, unread, with the desktop notification chat already gives a new line.
 *
 * Adding reviewers is not widening anything: a record room's rule is that
 * whoever can see the order is in it, and `orders.sendAgreement` holders are
 * admin and dispatch, who see every order. A permission granted by hand to
 * somebody without `orders.viewAll` would break that, so those are filtered
 * out by the caller's check below rather than trusted.
 */
export async function bringIntoOrderRoom(
  orderId: string,
  order: Record<string, unknown>,
  memberUids: string[],
  createdBy: string,
): Promise<void> {
  const id = recordConversationId('order', orderId);
  const ref = adminDb.collection(CONVERSATIONS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({ memberUids: FieldValue.arrayUnion(...memberUids) });
    return;
  }
  const label = orderDisplayNumber(order as { orderNumber?: string; batsId?: string });
  try {
    await ref.create({
      kind:        'record',
      name:        `Order ${label}`,
      recordType:  'order',
      recordId:    orderId,
      recordLabel: label,
      memberUids:  [...new Set(memberUids)],
      createdBy,
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
      lastMessage: null,
    });
    await postOrderAlert(orderId, openedAlert(order as { status?: string; carrierName?: string; clientName?: string })).catch(() => {});
  } catch (e) {
    // Somebody pressed Discuss in the same second; join theirs.
    if ((e as { code?: number }).code !== 6) throw e;
    await ref.update({ memberUids: FieldValue.arrayUnion(...memberUids) });
  }
}

/** Only reviewers who can also see every load — see bringIntoOrderRoom(). */
export async function reviewersWhoSeeEverything(): Promise<string[]> {
  const uids = await saReviewerUids();
  if (uids.length === 0) return [];
  const snaps = await adminDb.getAll(...uids.map((u) => adminDb.collection('users').doc(u)));
  return snaps
    .filter((s) => {
      const d = s.data() ?? {};
      const perms: unknown = d.permissions;
      return d.isAdmin === true || d.isDispatcher === true || d.isFinance === true
        || (Array.isArray(perms) && perms.includes('orders.viewAll'));
    })
    .map((s) => s.id);
}
