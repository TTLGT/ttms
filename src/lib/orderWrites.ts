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
import { clientAgreementRef, planAgreementHold } from './clientAgreements';
import { carrierContentChanged, carrierLinksFor, planCarrierHold } from './carrierAgreements';
import { confirmationContent, contentHash, sectionHashes } from './loadConfirmationServer';
import { ChangeOrderNeeded, canApplyOrderChanges, changeOrderRef, changeOrderSummary } from './changeOrders';
import { bringIntoOrderRoom, reviewersWhoSeeEverything } from './saRequestsServer';
import { postOrderAlert } from './chatAlerts';
import { APP_URL } from './appUrl';
import type { QueryDocumentSnapshot, WriteBatch } from 'firebase-admin/firestore';
import type { ChangeOrderAffects } from '@/types/changeOrder';
import { NO_SIGNED_CA_PROOF, NO_SIGNED_SA_PROOF, signedSaProof } from './signedSaProof';
import { openBolRequestIfSigned } from './bolRequests';
import { LEGACY_STATUSES, cleanStops, orderAccessorials, orderDisplayNumber, orderSearchTerms, stopPartyIdsOf, type OrderStatus } from '@/types/order';

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
  // What the client typed when signing. Staff write `clientInstructions`
  // beside it; these are the client's and are only ever appended to.
  'clientAddedInstructions',
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
  // This load's own agreement terms — /terms, which asks an admin first when
  // a dispatcher made the change. An edit here would skip that approval.
  'clientTerms', 'carrierTerms',
] as const;

/** Bookkeeping the server sets itself; dropped from a patch rather than refused. */
const IGNORED_FIELDS = [
  'id', 'createdAt', 'updatedAt', 'searchTerms', 'coverThumbUrl', 'stopPartyIds', 'owners',
  // Set below from the profile whenever brokerUid moves; never taken from a request.
  'brokerName',
] as const;

/** The extra pickups and deliveries — see OrderStop in src/types/order.ts. */
const STOP_FIELDS = ['extraPickups', 'extraDeliveries'] as const;

/**
 * Trim any stop lists (and the accessorials) in a save to the stored shape. The screens only ever
 * send that shape; this is here because the route takes whatever JSON it is
 * given. Done before the change is diffed, so the log records what was kept.
 */
function cleanStopFields(record: Record<string, unknown>) {
  for (const f of STOP_FIELDS) if (f in record) record[f] = cleanStops(record[f]);
  // Known keys only, in catalog order: an unknown one would print nowhere,
  // and ticking order must not read as a change to the client's SA.
  if ('accessorials' in record) record.accessorials = orderAccessorials(record);
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
export interface UpdateOrderOptions {
  /** Submit the patch as a change order rather than saving it, when it needs one. */
  propose?: { reason: string };
  /** Written into the save's own batch — approving a change order marks it with this. */
  inBatch?: (batch: WriteBatch) => void;
  /** Leads the change-log entry, which then reads as an event rather than a plain save. */
  summary?: string;
}

export async function updateOrderAsCaller(
  caller: Caller,
  orderId: string,
  rawPatch: Record<string, unknown>,
  options: UpdateOrderOptions = {},
): Promise<{ changeOrder: boolean }> {
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
  /*
   * The broker on the SA and Dispatch Sheet must own the load: anyone else's
   * name and number on a client's paperwork would send the client to a
   * colleague who cannot open it. Null goes back to the default (the
   * creator). The name beside it is read here, not taken from the request.
   */
  if (touched(before, patch, ['brokerUid']).length) {
    const uid = patch.brokerUid;
    if (uid === null || uid === '') {
      patch.brokerUid = null;
      patch.brokerName = '';
    } else if (typeof uid === 'string' && ((before.assignedToUids ?? []) as string[]).includes(uid)) {
      const d = (await adminDb.collection('users').doc(uid).get()).data();
      patch.brokerName = (d?.displayName as string) || (d?.email as string) || '';
    } else {
      throw new AdminAuthError('The broker on the paperwork must be one of the people who own this order.', 400);
    }
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
    handSignedNote = `Marked Carrier Signed by hand, on the signed Dispatch Sheet uploaded to the load (${proof.files} file${proof.files === 1 ? '' : 's'}). There is no e-signature.`;
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
   * The carrier's links, read once and only when they could matter: the
   * carrier moved, or something the Dispatch Sheet prints did. Shared by the
   * change-order gate, the revoke and the carrier's hold below.
   */
  const carrierMoved = 'carrierId' in patch && !sameValue(before.carrierId, patch.carrierId);
  const allCarrierLinks = carrierMoved || (fields.length && carrierContentChanged(before, after))
    ? await carrierLinksFor(orderId)
    : undefined;

  /*
   * A change order instead of a save — see src/types/changeOrder.ts. Only for
   * somebody without `orders.applyChanges`, and only when this save changes
   * something printed on an agreement that has already gone out. Checked
   * after every refusal above, so a change order can only ever hold a patch
   * that would have been accepted.
   */
  const affects = fields.length ? await sentAgreementsTouched(orderId, before, after, allCarrierLinks) : [];
  if (options.propose) {
    if (!fields.length) throw new AdminAuthError('Nothing in this change differs from the load as it is.', 400);
    if (affects.length) {
      await proposeChange(caller, orderId, before, patch, fields, affects, options.propose.reason, now);
      return { changeOrder: true };
    }
    // Nothing sent is touched (the agreement was withdrawn in the meantime,
    // say): there is nothing to approve, so it is simply saved.
  } else if (affects.length && !canApplyOrderChanges(caller)) {
    throw new ChangeOrderNeeded(affects);
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
  const carrierLinks = carrierMoved
    ? (allCarrierLinks ?? []).filter((d) => !d.data().usedAt && !d.data().revokedAt)
    : [];

  /*
   * The carrier's Dispatch Sheet, the same way as the client's link above:
   * held, its signature cleared, and its review reopened when this save
   * changed anything it prints — see src/lib/carrierAgreements.ts. Costs a
   * read only when something printed on it changed.
   */
  const carrierHold = fields.length
    ? await planCarrierHold(orderId, before, after, actorOf(caller), now, allCarrierLinks)
    : null;

  const batch = adminDb.batch();
  for (const d of carrierLinks) batch.update(d.ref, { revokedAt: now, revokedReason: 'carrier_changed' });
  if (carrierLinks.length) {
    writeChange(batch, ref, {
      action: 'event',
      summary: `The carrier changed, so the Dispatch Sheet link${carrierLinks.length === 1 ? '' : 's'} sent to the previous carrier no longer work${carrierLinks.length === 1 ? 's' : ''}. Send it again for the new carrier.`,
    }, actorOf(caller), now);
  }
  if (fields.length) {
    const summary = [options.summary, handSignedNote].filter(Boolean).join(' ');
    writeChange(batch, ref, summary
      ? { action: 'event', summary, fields }
      : { action: 'updated', fields }, actorOf(caller), now);
  }
  hold?.apply(batch, write);
  carrierHold?.apply(batch, write);
  if (swap) {
    Object.assign(write, swap.write);
    writeChange(batch, ref, { action: 'event', summary: swap.summary, fields: diffFields(before, swap.write) }, actorOf(caller), now);
  }
  options.inBatch?.(batch);
  batch.update(ref, write);
  await batch.commit();
  if (hold) await hold.afterCommit();
  if (carrierHold) await carrierHold.afterCommit();
  // A signature pressed by hand is the second signature as often as an
  // e-signature is; same BOL request. After the commit and swallowed — the
  // save happened.
  if (handSignedNote) {
    await openBolRequestIfSigned(orderId,
      patch.status === 'carrier_signed' ? 'The carrier was marked signed by hand' : 'The client was marked signed by hand',
    ).catch((e) => console.error('BOL request failed:', e));
  }
  return { changeOrder: false };
}

/**
 * Which agreements already sent this save would change: the client's SA when
 * its link is out (and still the client's — a link cancelled by a change of
 * client has nobody holding it), the carrier's Dispatch Sheet when one is
 * live or signed. Before against after, so a save that changes only things
 * neither prints asks nobody.
 */
async function sentAgreementsTouched(
  orderId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  carrierLinks: QueryDocumentSnapshot[] | undefined,
): Promise<ChangeOrderAffects[]> {
  const affects: ChangeOrderAffects[] = [];
  const clientHash = (o: Record<string, unknown>) => contentHash(sectionHashes(confirmationContent(o)));
  if (clientHash(before) !== clientHash(after)) {
    const p = (await clientAgreementRef(orderId).get()).data();
    if (p?.token && !p.clientChanged) affects.push('client');
  }
  // carrierLinks is read only when the sheet's content or the carrier moved.
  const carrierSent = (carrierLinks ?? []).some((d) => !d.data().revokedAt && !d.data().replacedAt);
  if (carrierSent && (carrierContentChanged(before, after) || !sameValue(before.carrierId, after.carrierId))) {
    affects.push('carrier');
  }
  return affects;
}

/**
 * File the change order, with its change-log entry, in one batch, and tell
 * the room. The patch is stored as it would have been saved — already
 * cleaned and checked above — with the values it replaces, so approving can
 * refuse if somebody changed the same fields in the meantime.
 */
async function proposeChange(
  caller: Caller,
  orderId: string,
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  fields: ReturnType<typeof diffFields>,
  affects: ChangeOrderAffects[],
  reason: string,
  now: Timestamp,
): Promise<void> {
  if (!reason.trim()) throw new AdminAuthError('Say why the load is changing — dispatch reads it before resending.', 400);
  const coRef = changeOrderRef(orderId);
  const orderRef = adminDb.collection(COL).doc(orderId);
  const base: Record<string, unknown> = {};
  for (const f of Object.keys(patch)) base[f] = before[f] ?? null;
  const label = orderDisplayNumber(before as { orderNumber?: string; batsId?: string });

  await adminDb.runTransaction(async (tx) => {
    const current = await tx.get(coRef);
    if (current.exists && current.data()?.status === 'pending') {
      throw new AdminAuthError('A change order is already waiting for this load. Withdraw it first, or wait for dispatch to decide it.', 409);
    }
    tx.set(coRef, {
      orderId,
      orderNumber: label,
      clientName: String(before.clientName ?? ''),
      status: 'pending',
      reason: reason.trim(),
      affects,
      patch,
      base,
      changes: fields,
      requestedByUid: caller.uid,
      requestedByName: caller.displayName,
      requestedByEmail: caller.email ?? '',
      requestedAt: now,
      decidedByUid: null, decidedByName: null, decidedAt: null, decisionNote: '',
    });
    // The values are on the entry, so the log shows what was asked even if
    // it is turned down; nothing on the order itself moves.
    writeChange(tx, orderRef, {
      action: 'event',
      summary: `${changeOrderSummary(caller.displayName, reason.trim(), affects)}. Nothing changes on the load until it is approved.`,
      fields,
    }, actorOf(caller), now);
  });

  const reviewers = await reviewersWhoSeeEverything().catch(() => [] as string[]);
  await bringIntoOrderRoom(orderId, before, [...reviewers, caller.uid], caller.uid).catch(() => {});
  await postOrderAlert(orderId,
    `${changeOrderSummary(caller.displayName, reason.trim(), affects)}. `
    + `Nothing changes until admin or dispatch approves it. Approve or turn it down here: ${APP_URL}/dashboard/orders/${orderId}#change-order`,
  ).catch(() => {});
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
      said.push(`The carrier changed, so the load is back at ${clientSigned ? 'Client Signed' : 'Booked'} until the new carrier signs the Dispatch Sheet.`);
    } else if (before.carrierSignedAt || before.status === 'carrier_signed') {
      said.push('The carrier changed, so the previous carrier’s signature no longer counts. The new carrier needs to sign the Dispatch Sheet.');
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

  // Every document the load produces prints it, so a new load needs one. A
  // suborder is let through: it copies its parent's, and refusing to split an
  // older load that predates the field would help nobody.
  record.transportType = typeof record.transportType === 'string' ? record.transportType.trim() : '';
  if (!record.transportType && !record.parentOrderId) {
    throw new AdminAuthError('Choose the transport type — the truck or trailer this load moves on.', 400);
  }

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
  record.clientAddedInstructions = [];
  record.partyApprovals  = [];
  // A new load follows the general terms, even one copied from a load that had
  // its own: those were approved for that load, not for this one.
  delete record.clientTerms;
  delete record.carrierTerms;

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
