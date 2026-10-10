import { adminDb } from './firebase-admin';
import { ORDER_FILES_COLLECTION, SIGNED_AGREEMENT_KIND } from '@/types/orderFile';
import type { AgreementParty } from '@/types/saRequest';
import { LOAD_PHOTOS_COLLECTION } from '@/types/loadPhoto';

/**
 * Whether a load holds a hand-signed copy of an agreement — for the client,
 * their Shipper Agreement (below); for the carrier, a `signed_ca` file of
 * their Carrier Agreement, the same rule for Carrier Signed.
 *
 * Whether a load holds a copy of the client's signed Shipper Agreement made
 * some other way than the e-signature link — a file of kind `signed_sa` under
 * Documents, or a picture of stage `signed_sa` under Pictures.
 *
 * It is what moving a load to Client Signed **by hand** requires (enforced in
 * `updateOrderAsCaller()`, mirrored by the button). Without it the status
 * would say the client signed with nothing on the load to show they did. An
 * e-signature needs none of this: it is its own record.
 *
 * Two counts, each two equality filters, which Firestore serves from
 * single-field indexes — nothing to deploy. The same shape as the truck
 * pictures count in saGateFactsFor().
 */
export async function signedSaProof(orderId: string, party: AgreementParty = 'client'): Promise<{ files: number; photos: number }> {
  const [files, photos] = await Promise.all([
    adminDb.collection(ORDER_FILES_COLLECTION)
      .where('orderId', '==', orderId).where('kind', '==', SIGNED_AGREEMENT_KIND[party]).count().get(),
    // The Pictures "Signed SA" stage is the client's only.
    party === 'client'
      ? adminDb.collection(LOAD_PHOTOS_COLLECTION)
        .where('orderId', '==', orderId).where('stage', '==', 'signed_sa').count().get()
      : null,
  ]);
  return { files: files.data().count, photos: photos?.data().count ?? 0 };
}

export const NO_SIGNED_CA_PROOF =
  'Upload the carrier’s signed Carrier Agreement first, in the Carrier section or under Documents → Signed Carrier Agreement. '
  + 'Without it the load cannot be marked Carrier Signed by hand.';

export const NO_SIGNED_SA_PROOF =
  'Upload the client’s signed SA first, in Client Confirmation or under Documents → Signed SA. '
  + 'Without it the load cannot be marked Client Signed by hand.';
