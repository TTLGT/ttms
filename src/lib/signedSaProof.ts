import { adminDb } from './firebase-admin';
import { ORDER_FILES_COLLECTION, SIGNED_AGREEMENT_KIND } from '@/types/orderFile';
import type { AgreementParty } from '@/types/saRequest';
import { LOAD_PHOTOS_COLLECTION } from '@/types/loadPhoto';
import { reviewOf } from '@/types/signatureRecord';

/**
 * Whether a load holds a hand-signed copy of an agreement — for the client,
 * their Shipper Agreement (below); for the carrier, a `signed_ca` file of
 * their Carrier Agreement, the same rule for Carrier Signed.
 *
 * Whether a load holds a copy of the client's signed Shipper Agreement made
 * some other way than the e-signature link — a file of kind `signed_sa` under
 * Documents, or (saved before 2026-10-21) a picture of stage `signed_sa`.
 *
 * It is what moving a load to Client Signed **by hand** requires (enforced in
 * `updateOrderAsCaller()`, mirrored by the button). Without it the status
 * would say the client signed with nothing on the load to show they did. An
 * e-signature needs none of this: it is its own record.
 *
 * Only copies uploaded since the client or carrier last changed count
 * (`clientChangedAt` / `carrierChangedAt`, see planPartySwap() in
 * orderWrites.ts): the old carrier's signed paper is not the new carrier's
 * signature. Pass the order so that cut-off can be read; without it every
 * copy on the load counts, as before.
 *
 * Only **verified** files count (src/types/signatureRecord.ts): anybody can
 * upload one, and it proves nothing until admin or dispatch have opened it
 * and approved it. A file from before reviews has no `review` and reads as
 * approved. `pending` is returned so the button can say what it waits for.
 * Old pictures are not reviewed, but no new ones can be filed as "Signed SA".
 *
 * Two queries, each two equality filters, which Firestore serves from
 * single-field indexes — nothing to deploy. The cut-off and the review are
 * applied in memory, since a load holds a handful of these at most.
 */
export async function signedSaProof(
  orderId: string,
  party: AgreementParty = 'client',
  order?: Record<string, unknown>,
): Promise<{ files: number; photos: number; pending: number }> {
  const since = partyChangedAt(order, party);
  const [files, photos] = await Promise.all([
    adminDb.collection(ORDER_FILES_COLLECTION)
      .where('orderId', '==', orderId).where('kind', '==', SIGNED_AGREEMENT_KIND[party]).get(),
    // Pictures no longer offer "Signed SA" — it is uploaded under Documents —
    // but a picture saved with it before 2026-10-21 still counts. The client's only.
    party === 'client'
      ? adminDb.collection(LOAD_PHOTOS_COLLECTION)
        .where('orderId', '==', orderId).where('stage', '==', 'signed_sa').get()
      : null,
  ]);
  const fresh = (d: FirebaseFirestore.QueryDocumentSnapshot) => millisOf(d.data().createdAt) > since;
  const current = files.docs.filter(fresh);
  return {
    files:   current.filter((d) => reviewOf(d.data().review) === 'approved').length,
    photos:  photos?.docs.filter(fresh).length ?? 0,
    pending: current.filter((d) => reviewOf(d.data().review) === 'pending').length,
  };
}

/** A stored time as milliseconds — a Firestore Timestamp or a plain number. 0 when absent. */
export function millisOf(v: unknown): number {
  if (typeof v === 'number') return v;
  const t = v as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : 0;
}

/**
 * When this party last changed on the load, in milliseconds; 0 when it never
 * has. A signed copy uploaded before then belongs to whoever was on it.
 */
export function partyChangedAt(order: Record<string, unknown> | undefined, party: AgreementParty): number {
  return millisOf(order?.[party === 'carrier' ? 'carrierChangedAt' : 'clientChangedAt']);
}

export const NO_SIGNED_CA_PROOF =
  'The carrier’s signed Dispatch Sheet has to be uploaded and verified by admin or dispatch first, in the Carrier section or under Documents → Signed Dispatch Sheet. '
  + 'Without it the load cannot be marked Carrier Signed by hand.';

export const NO_SIGNED_SA_PROOF =
  'The client’s signed Shipper Agreement (SA) has to be uploaded and verified by admin or dispatch first, in Client Confirmation or under Documents → Signed Shipper Agreement (SA). '
  + 'Without it the load cannot be marked Client Signed by hand.';
