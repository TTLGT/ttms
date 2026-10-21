import { createHash } from 'crypto';
import type { QueryDocumentSnapshot, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { APP_URL } from './appUrl';
import { postOrderAlert } from './chatAlerts';
import { diffFields, writeChange, type ChangeActor } from './recordHistory';
import { archiveRound, bringIntoOrderRoom, newRoundId, requestRef, reviewersWhoSeeEverything } from './saRequestsServer';
import { confirmationStops } from './loadConfirmationServer';
import type { AgreementHold } from './clientAgreements';
import { dimensionsSummary, dockWorkLines, orderAccessorials, orderCommodityItems, orderDisplayNumber, type Order } from '@/types/order';
import { orderTermsOf } from '@/types/agreementTerms';
import { cleanCcList } from '@/types/saRequest';

/**
 * The carrier's side of "the order changed after the agreement went out" —
 * the twin of planAgreementHold() in clientAgreements.ts, for the Dispatch
 * Sheet (rate confirmation).
 *
 * ## Why it is not the same mechanism
 *
 * The client has one link per load, revised in place. The carrier gets a new
 * link on every send (send-agreement), and a send already switches off every
 * earlier unsigned one (`replacedAt`). So there is nothing to revise: holding
 * the newest link and reopening the review is the whole job, and the next send
 * is what replaces it.
 *
 * ## What a change does
 *
 * - The carrier's newest live link is **held** (`heldAt`), in the same batch
 *   as the change: the carrier sees "being updated" and cannot sign. Before
 *   this, a carrier could sign a pay or a pickup the load no longer carried.
 * - If the carrier had signed it, the order's carrier signature is cleared —
 *   what the load now says is not what they signed. The signature stays on
 *   the link, which is still the legal record, and their signed copy can still
 *   be downloaded from it. The status is left alone, as the client's is.
 * - A fresh carrier review (`caRequests/{orderId}`, reason `changed`) opens for
 *   dispatch, in Approvals and in the load's room.
 *
 * A change of **carrier** is handled by the revoke in updateOrderAsCaller();
 * this only opens the review and says so in the room, because the new carrier
 * has never been sent anything.
 */

type AnyOrder = Partial<Order> & Record<string, unknown>;

/**
 * The parts of the Dispatch Sheet, each fingerprinted on its own so a change
 * can be named. Built from what send-agreement copies onto the link.
 *
 * Deliberately not here: the driver. The carrier tells us who is driving; it
 * is not a term they agree to, and holding a signed sheet because dispatch
 * fixed a driver's phone number would teach everybody to ignore the hold.
 */
export type CarrierSection = 'carrier' | 'pay' | 'stops' | 'freight' | 'notes' | 'terms';

const SECTIONS: CarrierSection[] = ['carrier', 'pay', 'stops', 'freight', 'notes', 'terms'];

const SECTION_LABEL: Record<CarrierSection, string> = {
  carrier: 'carrier',
  pay:     'carrier pay',
  stops:   'pickup and delivery',
  freight: 'freight',
  notes:   'carrier instructions',
  terms:   'terms and conditions',
};

const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

/**
 * One fingerprint per section. Stops are the full stops the client's SA
 * fingerprints — street and window as well as the city — because a moved dock
 * matters more to the truck than to anybody.
 */
export function carrierSectionHashes(order: AnyOrder): Record<CarrierSection, string> {
  const items = orderCommodityItems(order);
  return {
    carrier: sha(String(order.carrierId ?? '')),
    pay:     sha(Number(order.carrierPay) || 0),
    stops:   sha(confirmationStops(order)),
    // The transport type is appended only when there is one, the same trick
    // the client's freight section uses for accessorials: a sheet sent before
    // it was printed fingerprints exactly as it did and is not held for it.
    freight: sha([
      String(order.commodity ?? ''), Number(order.weight) || 0, Number(order.pieces) || 0,
      dimensionsSummary(items), orderAccessorials(order), dockWorkLines(order),
      ...(String(order.transportType ?? '').trim() ? [String(order.transportType).trim()] : []),
    ]),
    notes:   sha(String(order.carrierInstructions ?? '').trim()),
    terms:   sha(orderTermsOf(order, 'carrier') ?? ''),
  };
}

export function carrierContentHash(sections: Record<CarrierSection, string>): string {
  return sha(SECTIONS.map((s) => sections[s]));
}

/** For send-agreement: the fingerprint written onto each new link. */
export function carrierFingerprint(order: AnyOrder) {
  const sectionHashes = carrierSectionHashes(order);
  return { sectionHashes, contentHash: carrierContentHash(sectionHashes) };
}

function changedSections(
  before: Partial<Record<CarrierSection, string>>,
  after: Record<CarrierSection, string>,
): CarrierSection[] {
  return SECTIONS.filter((s) => (before[s] ?? '') !== after[s]);
}

/** Whether a save changes anything the Dispatch Sheet prints. No reads. */
export function carrierContentChanged(before: AnyOrder, after: AnyOrder): boolean {
  return carrierContentHash(carrierSectionHashes(before)) !== carrierContentHash(carrierSectionHashes(after));
}

/** Every Dispatch Sheet link the load has had. One equality filter, the type in memory — no composite index. */
export async function carrierLinksFor(orderId: string): Promise<QueryDocumentSnapshot[]> {
  return (await adminDb.collection('signing_tokens').where('orderId', '==', orderId).get())
    .docs.filter((d) => d.data().type === 'carrier_agreement');
}

/** The one a carrier could act on: the newest that was neither revoked nor replaced. */
function liveLink(links: QueryDocumentSnapshot[]): QueryDocumentSnapshot | null {
  const live = links.filter((d) => !d.data().revokedAt && !d.data().replacedAt);
  live.sort((a, b) => (Number(b.data().version) || 0) - (Number(a.data().version) || 0));
  return live[0] ?? null;
}

const CARRIER_SIGNATURE_FIELDS = [
  'carrierSignedAt', 'carrierSignerName', 'carrierSignerIp', 'carrierSignerUserAgent',
  'carrierSignerDevice', 'carrierSignerTitle',
] as const;

/**
 * What an order save does to the carrier's Dispatch Sheet, if anything. Null
 * when no sheet was ever sent, or the save changed nothing it prints, or the
 * change is one a hold has already been raised for.
 *
 * `links` is passed in when the caller already read them (the carrier swap
 * does); otherwise they are read here, and only once the save is known to
 * change something printed — a save that touches nothing costs no read.
 */
export async function planCarrierHold(
  orderId: string,
  before: AnyOrder,
  after: AnyOrder,
  actor: ChangeActor,
  now: Timestamp,
  links?: QueryDocumentSnapshot[],
): Promise<AgreementHold | null> {
  const afterSections = carrierSectionHashes(after);
  const afterHash = carrierContentHash(afterSections);
  if (carrierContentHash(carrierSectionHashes(before)) === afterHash) return null;

  const all = links ?? await carrierLinksFor(orderId);
  if (all.length === 0) return null;

  const swapped = Boolean(before.carrierId) && Boolean(after.carrierId) && before.carrierId !== after.carrierId;
  const removed = Boolean(before.carrierId) && !after.carrierId;
  const live = swapped || removed ? null : liveLink(all);
  // Nothing the carrier on the load could act on (every link replaced or
  // revoked), and the carrier did not change: nothing to hold or review.
  if (!live && !swapped) return null;

  const x = live?.data() ?? {};
  if (live) {
    // Back to what the link says, or a hold already raised for this content.
    if (typeof x.contentHash === 'string' && x.contentHash === afterHash) return null;
    if (x.pendingHash === afterHash) return null;
  }

  // Against what the link says when it carries a fingerprint (every send from
  // 2026-10-19), else against the order as it was before this save — which is
  // what a link sent before then is most likely to say.
  const baseline = live && x.sectionHashes && typeof x.sectionHashes === 'object'
    ? x.sectionHashes as Partial<Record<CarrierSection, string>>
    : carrierSectionHashes(before);
  const changed = swapped ? ['carrier' as CarrierSection] : changedSections(baseline, afterSections);
  if (changed.length === 0) return null;
  const what = changed.map((s) => SECTION_LABEL[s]).join(', ');

  const wasSigned = Boolean(live && x.usedAt) && Boolean(before.carrierSignedAt);
  const orderRef = adminDb.collection('orders').doc(orderId);
  const label = orderDisplayNumber(after as { orderNumber?: string; batsId?: string });
  const previousRound = await requestRef('carrier', orderId).get();

  const note = swapped
    ? `The carrier changed from ${String(before.carrierName || 'the previous carrier')} to ${String(after.carrierName || 'a new carrier')}. The Dispatch Sheet sent to the previous carrier no longer works; review and send it to the new carrier.`
    : [
      `The order changed after the Dispatch Sheet was sent: ${what}.`,
      'The carrier’s link is on hold until this is reviewed and sent again; sending makes a new link and the old one stops working.',
      wasSigned ? 'The carrier had signed the earlier version and will be asked to sign again.' : '',
    ].filter(Boolean).join(' ');

  return {
    apply(batch: WriteBatch, orderWrite: Record<string, unknown>) {
      if (live) {
        batch.update(live.ref, { heldAt: x.heldAt ?? now, pendingHash: afterHash });
      }

      // Same reasoning as the client's: the order stops saying it is signed,
      // because it no longer carries what was signed. The link keeps the
      // signature; this entry keeps every value it had.
      if (wasSigned) {
        const cleared: Record<string, unknown> = {};
        for (const f of CARRIER_SIGNATURE_FIELDS) cleared[f] = null;
        Object.assign(orderWrite, cleared);
        writeChange(batch, orderRef, {
          action: 'event',
          summary: `The ${what} changed after the carrier signed the Dispatch Sheet, so that signature no longer matches the order. The carrier will be asked to sign the updated version.`,
          fields: diffFields(before, cleared),
        }, actor, now);
      }

      if (previousRound.exists) archiveRound(batch, 'carrier', orderId, previousRound.data()!, { supersededAt: now });
      batch.set(requestRef('carrier', orderId), {
        party: 'carrier',
        roundId: newRoundId('carrier', orderId),
        orderId,
        orderNumber: label,
        clientName: String(after.clientName ?? ''),
        carrierName: String(after.carrierName ?? ''),
        status: 'open',
        note,
        requestedByUid: actor.uid,
        requestedByName: actor.name,
        requestedAt: now,
        checks: {},
        sentAt: null, sentByName: null, sentTo: null,
        doneAt: null, doneByName: null,
        returnedAt: null, returnedByName: null, returnReason: null,
        reason: 'changed',
        // The people copied last time belong to the carrier they were copied
        // for; a new carrier starts with nobody.
        ccEmails: swapped ? [] : cleanCcList(previousRound.data()?.ccEmails),
        sentCc: [],
        saVersion: null,
        dispatched: null,
        sends: [],
      });
    },
    async afterCommit() {
      const reviewers = await reviewersWhoSeeEverything().catch(() => [] as string[]);
      await bringIntoOrderRoom(orderId, after, [...reviewers, actor.uid].filter(Boolean), actor.uid).catch(() => {});
      await postOrderAlert(orderId,
        (swapped
          ? `${actor.name} changed the carrier to ${String(after.carrierName || 'a new carrier')}. The Dispatch Sheet sent to ${String(before.carrierName || 'the previous carrier')} no longer works. `
          : `${actor.name} changed the ${what} after the Dispatch Sheet was sent${wasSigned ? ' and signed' : ''}. The carrier’s link is on hold and cannot be signed until dispatch reviews the change and sends the update. `)
        + `Review it here: ${APP_URL}/dashboard/orders/${orderId}`,
      ).catch(() => {});
    },
  };
}
