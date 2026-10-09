import { adminDb, FieldValue } from './firebase-admin';
import { openedAlert, postOrderAlert } from './chatAlerts';
import { CONVERSATIONS_COLLECTION, recordConversationId } from '@/types/conversation';
import { orderDisplayNumber } from '@/types/order';
import { LOAD_PHOTOS_COLLECTION } from '@/types/loadPhoto';
import { operatingSince, type FmcsaRegistry } from '@/types/fmcsa';
import {
  SA_REQUESTS_COLLECTION, cleanCcList, type SaGateFacts, type SaRequest, type SaRequestStatus,
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
