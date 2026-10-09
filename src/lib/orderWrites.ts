/**
 * Creating and editing orders, server-side, with their change history.
 *
 * These used to be client-SDK writes from src/lib/orders.ts, checked only by
 * firestore.rules. They moved here so that every save writes its history
 * entry in the same batch (see src/lib/recordHistory.ts) — a log the browser
 * writes is a log the browser can skip. The rules now refuse client writes to
 * `orders` outright, so the checks they used to make are made here instead,
 * and must stay equivalent:
 *
 *   rules                         here
 *   orderVisible()                canSeeOrder() — strictly, with no approval
 *   ownershipUnchanged([...])     OWNERSHIP_FIELDS
 *   sourceUnchanged()             SOURCE_FIELDS + canEditSource()
 *   signatureRecordUnchanged()    SIGNATURE_FIELDS
 *   create: orders.create, and    can('orders.create'), and the creator is
 *   the creator on the order      always written onto assignedToUids
 *
 * "Strictly" matters: an approved access request lends a *read* of a load
 * (readOrder() honours it), and it never lent the right to edit one. The rule
 * for update tested orderVisible() alone, and so does this.
 *
 * As in the rules, a field counts as touched only when its value changes. The
 * edit screens send whole sections back, so a protected field echoed with its
 * stored value is not a refusal.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from './firebase-admin';
import { can, canEditSource, canSeeOrder } from './accessControl';
import { allocateOrderNumber } from './orderNumber';
import { actorOf, diffFields, sameValue, writeChange } from './recordHistory';
import type { Caller } from './partyAccess';
import { cleanStops, orderSearchTerms, stopPartyIdsOf } from '@/types/order';

const COL = 'orders';

/** Who may see the order. Moved only through /api/orders/{id}/owners. */
const OWNERSHIP_FIELDS = [
  'assignedToUids', 'assignedToGroupIds', 'assignedToEmails',
  'clientOwnerUids', 'clientOwnerGroupIds', 'assignedTo',
] as const;

/** Attribution — see canEditSource(). */
const SOURCE_FIELDS = ['sourceId', 'sourceName'] as const;

/** Written only by the signing route and /waive-signature. */
const SIGNATURE_FIELDS = [
  'carrierSignedAt', 'carrierSignerName', 'carrierSignerIp', 'carrierSignerUserAgent', 'carrierSignerDevice',
  'shipperSignedAt', 'shipperSignerName', 'shipperSignerIp', 'shipperSignerUserAgent', 'shipperSignerDevice',
  'signatureWaivedAt', 'signatureWaivedByUid', 'signatureWaivedByName',
  'signatureWaivedReason', 'signatureWaived',
] as const;

/**
 * Kept by their own server routes, never by an edit: the approval proof
 * (/party-approvals), the profile picture and photo count (/cover, /photos).
 * The rules let the browser write these; there was never a reason to, and an
 * approval record a broker could write for themselves proves nothing.
 */
const SERVER_KEPT_FIELDS = ['partyApprovals', 'coverPhotoId', 'photoCount', 'fileCount', 'createdBy', 'orderNumber'] as const;

/** Bookkeeping the server sets itself; dropped from a patch rather than refused. */
const IGNORED_FIELDS = ['id', 'createdAt', 'updatedAt', 'searchTerms', 'coverThumbUrl', 'stopPartyIds'] as const;

/** The extra pickups and deliveries — see OrderStop in src/types/order.ts. */
const STOP_FIELDS = ['extraPickups', 'extraDeliveries'] as const;

/**
 * Trim any stop lists in a save to the stored shape. The screens only ever
 * send that shape; this is here because the route takes whatever JSON it is
 * given. Done before the change is diffed, so the log records what was kept.
 */
function cleanStopFields(record: Record<string, unknown>) {
  for (const f of STOP_FIELDS) if (f in record) record[f] = cleanStops(record[f]);
}

/**
 * The fields orderSearchTerms reads. A patch touching none of them leaves the
 * stored terms right, so they are not recomputed.
 *
 * ⚠️  KEEP IN SYNC with searchableValues() in src/types/order.ts.
 */
const SEARCHABLE_FIELDS = [
  'orderNumber', 'batsId', 'previousOrderNumber',
  'shipperName', 'clientName', 'consigneeName', 'carrierName',
  'commodity', 'origin', 'destination', 'extraPickups', 'extraDeliveries',
] as const;

function touched(before: Record<string, unknown>, patch: Record<string, unknown>, fields: readonly string[]) {
  return fields.filter((f) => f in patch && !sameValue(before[f], patch[f]));
}

/** The client's owners, as the order mirrors them. See syncClientOwners(). */
async function clientOwnerMirror(clientId: unknown) {
  if (typeof clientId !== 'string' || !clientId) {
    return { clientOwnerUids: [] as string[], clientOwnerGroupIds: [] as string[] };
  }
  const party = (await adminDb.collection('parties').doc(clientId).get()).data();
  return {
    clientOwnerUids:     (party?.assignedToUids ?? []) as string[],
    clientOwnerGroupIds: (party?.assignedToGroupIds ?? []) as string[],
  };
}

/**
 * Save part of an order. Returns nothing; the caller already holds the values
 * it sent, and the history is read separately.
 */
export async function updateOrderAsCaller(
  caller: Caller,
  orderId: string,
  rawPatch: Record<string, unknown>,
): Promise<void> {
  const ref  = adminDb.collection(COL).doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new AdminAuthError('Order not found', 404);
  const before = snap.data()!;

  if (!canSeeOrder(before, caller.uid, caller.profile)) {
    throw new AdminAuthError('You do not have access to this order', 403);
  }

  const patch: Record<string, unknown> = { ...rawPatch };
  for (const f of IGNORED_FIELDS) delete patch[f];
  cleanStopFields(patch);

  if (touched(before, patch, OWNERSHIP_FIELDS).length) {
    throw new AdminAuthError('Owners are changed from the Owners panel, by an admin or dispatcher.', 403);
  }
  if (touched(before, patch, SIGNATURE_FIELDS).length) {
    throw new AdminAuthError('Signatures are recorded by the signing link, not by an edit.', 403);
  }
  if (touched(before, patch, SERVER_KEPT_FIELDS).length) {
    throw new AdminAuthError('That part of the order cannot be edited here.', 403);
  }
  if (touched(before, patch, SOURCE_FIELDS).length && !canEditSource(before, caller.uid, caller.profile)) {
    throw new AdminAuthError('Only an owner of this order can change its lead source.', 403);
  }

  const now = Timestamp.now();
  const fields = diffFields(before, patch);

  // The delivery stamp moves with the status, as updateOrderStatus() used to
  // set it from the browser. Only on the move itself: re-saving a delivered
  // load must not change when it was delivered.
  if (patch.status === 'delivered' && before.status !== 'delivered' && !('deliveredAt' in patch)) {
    patch.deliveredAt = now;
  }

  const after = { ...before, ...patch };
  const write: Record<string, unknown> = { ...patch, updatedAt: now };

  // Worked out here, in the same write, from the record as it will be once
  // saved. The browser used to post to /search-terms and /client-owners
  // afterwards, fire-and-forget, which left a window — or for good, if the
  // tab closed — where a renamed load could not be found and a load moved
  // to another client was still visible to the old client's owners.
  if (SEARCHABLE_FIELDS.some((f) => f in patch)) write.searchTerms = orderSearchTerms(after);
  // Same reasoning for the stop parties: a load saved without them would be
  // missing from the page of the company at its second pickup, silently.
  if (STOP_FIELDS.some((f) => f in patch)) write.stopPartyIds = stopPartyIdsOf(after);
  if ('clientId' in patch && !sameValue(before.clientId, patch.clientId)) {
    Object.assign(write, await clientOwnerMirror(patch.clientId));
  }

  const batch = adminDb.batch();
  batch.update(ref, write);
  if (fields.length) writeChange(batch, ref, { action: 'updated', fields }, actorOf(caller), now);
  await batch.commit();
}

/**
 * Create an order. Returns its id and the number it was given.
 *
 * The number is drawn here rather than by the browser first: one round trip
 * instead of two, and no number spent on an order whose save then failed.
 */
export async function createOrderAsCaller(
  caller: Caller,
  data: Record<string, unknown>,
): Promise<{ id: string; orderNumber: string }> {
  if (!can(caller.profile, 'orders.create')) {
    throw new AdminAuthError('You do not have permission to create loads.', 403);
  }

  const { orderNumber } = await allocateOrderNumber();
  const now = Timestamp.now();

  const record: Record<string, unknown> = { ...data };
  for (const f of IGNORED_FIELDS) delete record[f];

  // Orders are closed by default, so a creator missing from their own order
  // could not open it. The rule required it; this guarantees it.
  const uids = Array.isArray(record.assignedToUids) ? (record.assignedToUids as unknown[]).map(String) : [];
  record.assignedToUids = [...new Set([caller.uid, ...uids])];
  record.assignedToGroupIds = Array.isArray(record.assignedToGroupIds) ? record.assignedToGroupIds : [];
  record.assignedToEmails   = Array.isArray(record.assignedToEmails) ? record.assignedToEmails : [];

  // A new load has signed nothing and been waived past nothing, whatever was
  // sent. The create rule never checked these; the edit rule did.
  for (const f of SIGNATURE_FIELDS) record[f] = null;
  record.signatureWaived = false;
  record.partyApprovals  = [];

  Object.assign(record, await clientOwnerMirror(record.clientId));

  cleanStopFields(record);
  record.stopPartyIds = stopPartyIdsOf(record);

  record.orderNumber = orderNumber;
  record.createdBy   = caller.uid;
  record.searchTerms = orderSearchTerms(record);
  record.createdAt   = now;
  record.updatedAt   = now;

  const ref = adminDb.collection(COL).doc();
  const batch = adminDb.batch();
  batch.set(ref, record);
  writeChange(batch, ref, { action: 'created', summary: `Created load ${orderNumber}` }, actorOf(caller), now);
  await batch.commit();

  return { id: ref.id, orderNumber };
}
