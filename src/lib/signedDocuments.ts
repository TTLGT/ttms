import { adminDb } from './firebase-admin';
import { postOrderAlert } from './chatAlerts';
import { bringIntoOrderRoom } from './saRequestsServer';
import { APP_URL } from './appUrl';
import { SIGNED_AGREEMENT_KIND } from '@/types/orderFile';
import type { AgreementParty } from '@/types/saRequest';
import {
  SIGNATURE_METHOD_LABEL, time12,
  type SignatureDetails, type SignatureRecord,
} from '@/types/signatureRecord';

/**
 * Server side of verifying a signed agreement uploaded to a load. See
 * src/types/signatureRecord.ts for the flow; the routes are
 * /api/orders/{id}/files (upload), /api/orders/{id}/files/{fileId}/signature
 * (details and the decision) and /api/signed-documents (the queue).
 */

/** Whose agreement a signed-file kind is. */
export function partyOfKind(kind: unknown): AgreementParty | null {
  if (kind === SIGNED_AGREEMENT_KIND.client) return 'client';
  if (kind === SIGNED_AGREEMENT_KIND.carrier) return 'carrier';
  return null;
}

export const AGREEMENT_LABEL: Record<AgreementParty, string> = {
  client:  'signed SA',
  carrier: 'signed Dispatch Sheet',
};

/**
 * Everybody who can verify, and can open every load — the people worth
 * bringing into a load's room to be told one is waiting. Somebody granted
 * `orders.verifyRecords` on its own, without every load, still sees the
 * queue on the Approvals screen for the loads they can open; adding them to
 * a room of a load they cannot open would only be noise.
 *
 * Admin and dispatch are found by their flags as well as the mirrored list,
 * so a profile from before the permission existed is not missed.
 */
export async function verifierUids(): Promise<string[]> {
  const users = adminDb.collection('users');
  const [byPermission, admins, dispatchers] = await Promise.all([
    users.where('permissions', 'array-contains', 'orders.verifyRecords').get(),
    users.where('isAdmin', '==', true).get(),
    users.where('isDispatcher', '==', true).get(),
  ]);
  const uids = new Set<string>();
  for (const snap of [byPermission, admins, dispatchers]) {
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.suspended === true) continue;
      const perms: unknown = d.permissions;
      const seesAll = d.isAdmin === true || d.isDispatcher === true || d.isFinance === true
        || (Array.isArray(perms) && perms.includes('orders.viewAll'));
      if (seesAll) uids.add(doc.id);
    }
  }
  return [...uids];
}

/**
 * Tells admin and dispatch a signed copy is waiting: brings them into the
 * load's room and posts one line with the link. After the upload is saved,
 * never instead of it — the Approvals screen lists it either way, and a room
 * that failed to open must not lose an upload.
 */
export async function notifyVerifiers(
  orderId: string,
  order: Record<string, unknown>,
  uploaderUid: string,
  text: string,
): Promise<void> {
  const verifiers = await verifierUids().catch(() => [] as string[]);
  await bringIntoOrderRoom(orderId, order, [...verifiers, uploaderUid], uploaderUid).catch(() => {});
  await postOrderAlert(orderId, `${text} Verify it on the load or in Approvals: ${APP_URL}/dashboard/orders/${orderId}`).catch(() => {});
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Sako Krikorian, Oct 27, 2026 7:49 PM PST, from 108.147.173.79 — BATS
 * e-signature", for the change log and the room. Stored text, so it cannot
 * follow the company's date setting; the month is spelled so no reader can
 * take it for the other day.
 */
export function describeSignature(s: SignatureDetails | SignatureRecord): string {
  const [y, m, d] = s.date.split('-');
  const when = `${MONTH[Number(m) - 1] ?? m} ${Number(d)}, ${y} ${time12(s.time)} ${s.zone}`;
  return `${s.signerName}${s.signerTitle ? ` (${s.signerTitle})` : ''}, ${when}`
    + `${s.signerIp ? `, from ${s.signerIp}` : ''} — ${SIGNATURE_METHOD_LABEL[s.method]}`;
}
