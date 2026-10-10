import { FieldValue, type Timestamp, type WriteBatch } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { APP_URL } from './appUrl';
import { postOrderAlert } from './chatAlerts';
import { diffFields, writeChange, type ChangeActor } from './recordHistory';
import { archiveRound, bringIntoOrderRoom, newRoundId, reviewersWhoSeeEverything, saRequestRef } from './saRequestsServer';
import {
  changedSections, confirmationContent, contentHash, sectionHashes, sectionList,
  type AgreementSection,
} from './loadConfirmationServer';
import { orderDisplayNumber } from '@/types/order';
import { cleanCcList } from '@/types/saRequest';

/**
 * One signing link per order for the client's load confirmation, kept for the
 * life of the load and revised in place.
 *
 * ## The round
 *
 * - **First send** makes the link (`signing_tokens/{token}`, version 1) and
 *   this pointer, `clientAgreements/{orderId}`.
 * - **Sending again with nothing changed** emails the same link and gives it
 *   another seven days. No new version.
 * - **Saving a change** to anything the client agreed to (see
 *   loadConfirmationServer) puts the link **on hold** in the same write as the
 *   change: the client sees "being updated" and cannot sign. A fresh SA
 *   request opens for dispatch, in Approvals and the load's room. If the
 *   client had already signed, the order's signature is cleared — the order
 *   no longer says what they signed — and kept on the link's history.
 * - **Sending after the review** revises the link in place: the old version,
 *   and its signature if it had one, is copied to
 *   `signing_tokens/{token}/versions/{n}`; the link gets the new content as
 *   version n+1; the client signs that. Same URL, same QR code.
 *
 * A change of **client** is the exception: the old client holds that link,
 * and must never be shown the new client's load. Their link is revoked on the
 * save, and the next send makes a new one.
 *
 * ## Why the pointer
 *
 * The token id is the secret in the link, so it cannot be keyed by order. The
 * pointer is: one get per order save tells whether there is a link to worry
 * about, and its id being the order's makes "one live link per load" free.
 * Closed to the client SDK like every other collection here.
 */

export const CLIENT_AGREEMENTS_COLLECTION = 'clientAgreements';

export function clientAgreementRef(orderId: string) {
  return adminDb.collection(CLIENT_AGREEMENTS_COLLECTION).doc(orderId);
}

export interface ClientAgreementPointer {
  token: string;
  /** The version the link shows now. */
  version: number;
  /** Fingerprint of what that version says — see contentHash(). */
  contentHash: string;
  sectionHashes: Record<AgreementSection, string>;
  /** Set while a change waits for review; the link refuses signatures. */
  heldAt: Timestamp | null;
  /** The content the hold was raised for — a save that changes nothing more raises nothing more. */
  pendingHash: string | null;
  /** The client changed: the link is revoked and the next send makes a new one. */
  clientChanged?: boolean;
  /** The version the client signed, if they have signed the current one. */
  signedVersion: number | null;
  sentAt: Timestamp | null;
  sentTo: string;
  /** Who the last send was copied to. Absent on links sent before CCs existed. */
  cc?: string[];
}

/** The order's signature fields, as the sign route writes them. Cleared together. */
const CLIENT_SIGNATURE_FIELDS = [
  'shipperSignedAt', 'shipperSignerName', 'shipperSignerIp', 'shipperSignerUserAgent',
  'shipperSignerDevice', 'shipperSignerTitle', 'shipperSignedVersion',
] as const;

export interface AgreementHold {
  /** The writes, into the order save's own batch. `orderWrite` is that save's update, extended in place. */
  apply(batch: WriteBatch, orderWrite: Record<string, unknown>): void;
  /** The room and the line in it. After the commit, and never undoing it. */
  afterCommit(): Promise<void>;
}

/**
 * What an order save does to the client's link, if anything. Null when there
 * is no link, or the save changed nothing the client agreed to, or the change
 * is one a hold has already been raised for.
 *
 * Planned before the save's batch is committed and written into it, so the
 * change and the hold land together: a hold written afterwards could fail and
 * leave the client signing terms the order no longer carries.
 */
export async function planAgreementHold(
  orderId: string,
  after: Record<string, unknown>,
  actor: ChangeActor,
  now: Timestamp,
  /**
   * Raise it again even if a hold was already raised for this content. The
   * send route uses it when it finds a change with no open request to review
   * it — sent back to the broker, or edited by some path that did not come
   * through here — so the review is reopened rather than skipped.
   */
  force = false,
): Promise<AgreementHold | null> {
  const pointerRef = clientAgreementRef(orderId);
  // The round in progress is read too: it is about to be replaced, and goes
  // into the load's record first.
  const [snap, previousRound] = await Promise.all([pointerRef.get(), saRequestRef(orderId).get()]);
  if (!snap.exists) return null;
  const p = snap.data() as ClientAgreementPointer;
  if (!p.token) return null;

  const sections = sectionHashes(confirmationContent(after));
  const hash = contentHash(sections);
  if (hash === p.contentHash) return null;
  if (hash === p.pendingHash && !force) return null;

  const changed = changedSections(p.sectionHashes, sections);
  const clientChanged = changed.includes('client');
  const wasSigned = p.signedVersion != null && p.signedVersion === p.version;
  const orderRef = adminDb.collection('orders').doc(orderId);
  const tokenRef = adminDb.collection('signing_tokens').doc(p.token);
  const label = orderDisplayNumber(after as { orderNumber?: string; batsId?: string });
  const what = sectionList(changed) || 'details';

  const note = [
    `The order changed after the SA was sent: ${what}.`,
    clientChanged
      ? 'The client changed, so the old link has been cancelled and sending makes a new one for the new client.'
      : 'The client’s link is on hold until this is reviewed and sent again; the same link will show the update.',
    wasSigned ? 'The client had signed the earlier version and will be asked to sign again.' : '',
  ].filter(Boolean).join(' ');

  return {
    apply(batch, orderWrite) {
      batch.update(pointerRef, {
        heldAt: p.heldAt ?? now,
        pendingHash: hash,
        ...(clientChanged ? { clientChanged: true } : {}),
      });
      batch.update(tokenRef, {
        heldAt: now,
        // The old client keeps the URL; it must stop showing anything at all.
        ...(clientChanged ? { revokedAt: now } : {}),
      });

      /*
       * "Ask the client to sign again": the order stops saying it is signed,
       * because what it now carries is not what was signed. The signature
       * itself is not lost — it stays on the link until the revision copies
       * it into the link's history, and this change-log entry records every
       * field's old value. The status is left alone: statuses here only move
       * forward, and a load in transit is still in transit.
       */
      if (wasSigned && after.shipperSignedAt) {
        const cleared: Record<string, unknown> = {};
        for (const f of CLIENT_SIGNATURE_FIELDS) cleared[f] = null;
        Object.assign(orderWrite, cleared);
        writeChange(batch, orderRef, {
          action: 'event',
          summary: `The ${what} changed after the client signed the load confirmation, so that signature no longer matches the order. The client will be asked to sign the updated version.`,
          fields: diffFields(after, cleared),
        }, actor, now);
      }

      // The round being replaced is kept, with its ticks, as it stood.
      if (previousRound.exists) archiveRound(batch, 'client', orderId, previousRound.data()!, { supersededAt: now });
      // A fresh round, as the broker's Request SA makes: set() without merge
      // clears ticks made against the order as it was before this change.
      batch.set(saRequestRef(orderId), {
        party: 'client',
        roundId: newRoundId('client', orderId),
        orderId,
        orderNumber: label,
        clientName: String(after.clientName ?? ''),
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
        // The people copied last time are copied on the update, which is
        // what they would expect — unless the load moved to another client,
        // whose rate those people must never be sent.
        ccEmails: clientChanged ? [] : cleanCcList(p.cc),
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
        `${actor.name} changed the ${what} after the Shipper Agreement was sent${wasSigned ? ' and signed' : ''}. `
        + (clientChanged
          ? 'The old client’s link has been cancelled. '
          : 'The client’s link is on hold and cannot be signed until dispatch reviews the change and sends the update. ')
        + `Review it here: ${APP_URL}/dashboard/orders/${orderId}`,
      ).catch(() => {});
    },
  };
}

/** For the sign route: the pointer learns the current version was signed. */
export function markSigned(orderId: string, version: number, now: Timestamp) {
  return {
    ref: clientAgreementRef(orderId),
    data: { signedVersion: version, signedAt: now, updatedAt: FieldValue.serverTimestamp() },
  };
}
