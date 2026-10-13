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
import { planAgreementHold } from './clientAgreements';
import { NO_SIGNED_CA_PROOF, NO_SIGNED_SA_PROOF, signedSaProof } from './signedSaProof';
import { LEGACY_STATUSES, cleanStops, orderSearchTerms, stopPartyIdsOf, type OrderStatus } from '@/types/order';

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
  'carrierSignerTitle',
  'shipperSignedAt', 'shipperSignerName', 'shipperSignerIp', 'shipperSignerUserAgent', 'shipperSignerDevice',
  'shipperSignerTitle', 'shipperSignedVersion',
  'signatureWaivedAt', 'signatureWaivedByUid', 'signatureWaivedByName',
  'signatureWaivedReason', 'signatureWaived',
] as const;

/**
 * Kept by their own server routes, never by an edit: the approval proof
 * (/party-approvals), the profile picture and photo count (/cover, /photos).
 * The rules let the browser write these; there was never a reason to, and an
 * approval record a broker could write for themselves proves nothing.
 */
const SERVER_KEPT_FIELDS = [
  'partyApprovals', 'coverPhotoId', 'photoCount', 'fileCount', 'createdBy', 'orderNumber',
  // The acceptance emails for a signed agreement uploaded by hand — /signed-sa-confirmation.
  'paperSaConfirmedAt', 'paperSaConfirmedTo', 'paperSaConfirmedByName',
  'paperCaConfirmedAt', 'paperCaConfirmedTo', 'paperCaConfirmedByName',
  // When the client or carrier last changed — see planPartySwap().
  'clientChangedAt', 'carrierChangedAt',
] as const;

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
  // A retired status is read but never written again — see LEGACY_STATUSES.
  if (touched(before, patch, ['status']).length && LEGACY_STATUSES.includes(patch.status as OrderStatus)) {
    throw new AdminAuthError(`"${String(patch.status)}" is no longer a status an order can be moved to.`, 400);
  }
  /*
   * Client Signed by hand needs the signed SA on the load. The e-signature
   * sets the status through the signing route, not here, and is its own
   * record; a person pressing the button is only believed with a copy of
   * what the client signed attached. Checked here, not only on the button.
   */
  let handSignedNote = '';
  if (touched(before, patch, ['status']).length && patch.status === 'shipper_signed' && !before.shipperSignedAt) {
    const proof = await signedSaProof(orderId, 'client', before);
    if (proof.files + proof.photos === 0) throw new AdminAuthError(NO_SIGNED_SA_PROOF, 409);
    handSignedNote = `Marked Client Signed by hand, on the signed SA uploaded to the load (${
      [proof.files && `${proof.files} file${proof.files === 1 ? '' : 's'}`, proof.photos && `${proof.photos} picture${proof.photos === 1 ? '' : 's'}`]
        .filter(Boolean).join(' and ')}). There is no e-signature.`;
  }
  // The carrier's the same way: Carrier Signed by hand needs their signed
  // Carrier Agreement on the load.
  if (touched(before, patch, ['status']).length && patch.status === 'carrier_signed' && !before.carrierSignedAt) {
    const proof = await signedSaProof(orderId, 'carrier', before);
    if (proof.files === 0) throw new AdminAuthError(NO_SIGNED_CA_PROOF, 409);
    handSignedNote = `Marked Carrier Signed by hand, on the signed Carrier Agreement uploaded to the load (${proof.files} file${proof.files === 1 ? '' : 's'}). There is no e-signature.`;
  }

  const now = Timestamp.now();
  const fields = diffFields(before, patch);

  // The delivery stamp moves with the status, as updateOrderStatus() used to
  // set it from the browser. Only on the move itself: re-saving a delivered
  // load must not change when it was delivered.
  if (patch.status === 'delivered' && before.status !== 'delivered' && !('deliveredAt' in patch)) {
    patch.deliveredAt = now;
  }

  // A different client or carrier: their signatures and status step back.
  // Worked out before `after`, so the client's hold below still sees the
  // signature it is about to clear and records it in its own words.
  const swap = await planPartySwap(orderId, before, patch, now);

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

  /*
   * The client's signing link, if this save changed anything printed on it.
   * Planned now and written in this same batch, so a change and the hold on
   * the link land together — see src/lib/clientAgreements.ts. One read on
   * every save; nothing at all for a load whose SA has never been sent.
   */
  const hold = fields.length ? await planAgreementHold(orderId, after, actorOf(caller), now) : null;

  /*
   * A new carrier switches off the old carrier's signing links. Otherwise the
   * carrier taken off the load could still sign a rate confirmation for it,
   * and the signing route would mark the load Carrier Signed for whoever is
   * on it now. Only unsigned links: a signed one is the legal record of what
   * that carrier agreed to and stays readable in the versions list. Same
   * batch as the change, like the client's hold above. One equality filter,
   * the type in memory — no composite index — and only when the carrier moved.
   */
  const carrierLinks = 'carrierId' in patch && !sameValue(before.carrierId, patch.carrierId)
    ? (await adminDb.collection('signing_tokens').where('orderId', '==', orderId).get()).docs.filter((d) => {
      const x = d.data();
      return x.type === 'carrier_agreement' && !x.usedAt && !x.revokedAt;
    })
    : [];

  const batch = adminDb.batch();
  for (const d of carrierLinks) batch.update(d.ref, { revokedAt: now, revokedReason: 'carrier_changed' });
  if (carrierLinks.length) {
    writeChange(batch, ref, {
      action: 'event',
      summary: `The carrier changed, so the Carrier Agreement (CA/RateCon) link${carrierLinks.length === 1 ? '' : 's'} sent to the previous carrier no longer work${carrierLinks.length === 1 ? 's' : ''}. Send it again for the new carrier.`,
    }, actorOf(caller), now);
  }
  if (fields.length) {
    writeChange(batch, ref, handSignedNote
      ? { action: 'event', summary: handSignedNote, fields }
      : { action: 'updated', fields }, actorOf(caller), now);
  }
  hold?.apply(batch, write);
  if (swap) {
    Object.assign(write, swap.write);
    writeChange(batch, ref, { action: 'event', summary: swap.summary, fields: diffFields(before, swap.write) }, actorOf(caller), now);
  }
  batch.update(ref, write);
  await batch.commit();
  if (hold) await hold.afterCommit();
}

/** The carrier's e-signature on the order — written by the signing route only. */
const CARRIER_SIGNATURE_FIELDS = [
  'carrierSignedAt', 'carrierSignerName', 'carrierSignerIp', 'carrierSignerUserAgent',
  'carrierSignerDevice', 'carrierSignerTitle',
] as const;
const CLIENT_SIGNATURE_FIELDS = [
  'shipperSignedAt', 'shipperSignerName', 'shipperSignerIp', 'shipperSignerUserAgent',
  'shipperSignerDevice', 'shipperSignerTitle', 'shipperSignedVersion',
] as const;

/**
 * A different client or carrier on a load: what they signed was signed by
 * somebody who is no longer on it.
 *
 * - The previous party's e-signature comes off the order. It is not lost: the
 *   signed link keeps the whole legal record (and its PDF now says VOID —
 *   see voidNoteFor()), and this save's change-log entry keeps every value.
 * - Their "acceptance registered" email record comes off too, so the new
 *   party can be sent theirs.
 * - `clientChangedAt` / `carrierChangedAt` is stamped, so the previous
 *   party's uploaded signed paper stops counting as proof for signing by hand
 *   (signedSaProof()).
 * - The status steps back **only from that party's own signed step**: Client
 *   Signed goes back to Booked; Carrier Signed goes back to Client Signed, or
 *   to Booked when the client's side was only a waiver (or the client changed
 *   in the same save). This is the one place a status moves backwards, and
 *   only because the step it names is no longer true. A load further along —
 *   in transit, delivered — keeps its status: the freight is where it is, and
 *   the cleared signature shows the agreement as unsigned instead.
 *
 * Only a change from one party to another counts. Assigning the first
 * carrier, or clearing it, has nobody's signature to undo.
 *
 * The client's link is handled separately by planAgreementHold() (held or
 * cancelled, and its signature cleared with its own change-log line); the
 * carrier's old links are revoked in updateOrderAsCaller() above.
 */
async function planPartySwap(
  orderId: string,
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  now: Timestamp,
): Promise<{ write: Record<string, unknown>; summary: string } | null> {
  const swapped = (f: 'clientId' | 'carrierId') =>
    f in patch && Boolean(before[f]) && Boolean(patch[f]) && !sameValue(before[f], patch[f]);
  const clientSwap  = swapped('clientId');
  const carrierSwap = swapped('carrierId');
  if (!clientSwap && !carrierSwap) return null;

  // An explicit status in the same save is somebody's decision; leave it.
  const statusAsked = 'status' in patch && !sameValue(before.status, patch.status);
  const write: Record<string, unknown> = {};
  const said: string[] = [];
  const clear = (fields: readonly string[]) => {
    for (const f of fields) if (before[f] != null) write[f] = null;
  };

  if (clientSwap) {
    write.clientChangedAt = now;
    clear(CLIENT_SIGNATURE_FIELDS);
    clear(['paperSaConfirmedAt', 'paperSaConfirmedTo', 'paperSaConfirmedByName']);
    if (!statusAsked && before.status === 'shipper_signed') {
      write.status = 'booked';
      said.push('The client changed, so the load is back at Booked until the new client signs the Shipper Agreement (SA).');
    } else if (before.shipperSignedAt || before.status === 'shipper_signed') {
      said.push('The client changed, so the previous client’s signature no longer counts.');
    }
  }

  if (carrierSwap) {
    write.carrierChangedAt = now;
    clear(CARRIER_SIGNATURE_FIELDS);
    clear(['paperCaConfirmedAt', 'paperCaConfirmedTo', 'paperCaConfirmedByName']);
    if (!statusAsked && before.status === 'carrier_signed') {
      // Whether the client's side stands on a signature — by link, or by hand
      // with the signed SA uploaded since the client last changed — rather
      // than only a waiver. A waived load never was Client Signed.
      const clientSigned = !clientSwap && (Boolean(before.shipperSignedAt)
        || await signedSaProof(orderId, 'client', before).then((p) => p.files + p.photos > 0));
      write.status = clientSigned ? 'shipper_signed' : 'booked';
      said.push(`The carrier changed, so the load is back at ${clientSigned ? 'Client Signed' : 'Booked'} until the new carrier signs the Carrier Agreement (CA/RateCon).`);
    } else if (before.carrierSignedAt || before.status === 'carrier_signed') {
      said.push('The carrier changed, so the previous carrier’s signature no longer counts. The new carrier needs to sign the Carrier Agreement (CA/RateCon).');
    }
  }

  return { write, summary: said.join(' ') || (carrierSwap ? 'The carrier changed.' : 'The client changed.') };
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
