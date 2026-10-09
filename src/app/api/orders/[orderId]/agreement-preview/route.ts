import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { currentClientTerms } from '@/lib/agreementTermsServer';
import { clientAgreementRef, type ClientAgreementPointer } from '@/lib/clientAgreements';
import {
  changedSections, confirmationContent, contentHash, sectionHashes, sectionList, tokenSnapshotFields,
} from '@/lib/loadConfirmationServer';
import { signFormData } from '@/lib/signFormProps';
import { orderDisplayNumber, type Order } from '@/types/order';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * The client's load confirmation as staff can preview it — read-only, with no
 * way to sign (see the `preview` mode of SignForm).
 *
 * - `current` is what the client's link shows right now, read from the link
 *   itself, exactly as the public page reads it.
 * - `pending` is what the next send would put on it, worked out from the
 *   order as it stands: present before the first send, and whenever the order
 *   has changed since the last one — which is what dispatch is reviewing
 *   while a link is on hold.
 *
 * Same boundary as the order. Nothing is written.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  let caller;
  let order;
  try {
    caller = await requireCaller(req);
    order = (await getVisibleOrder(caller, orderId)) as Partial<Order> & Record<string, unknown>;
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const pointerSnap = await clientAgreementRef(orderId).get();
  const pointer = pointerSnap.exists ? (pointerSnap.data() as ClientAgreementPointer) : null;
  const tokenSnap = pointer?.token ? await adminDb.collection('signing_tokens').doc(pointer.token).get() : null;
  const link = tokenSnap?.exists && !tokenSnap.data()!.revokedAt ? tokenSnap.data()! : null;

  const content = confirmationContent(order);
  const sections = sectionHashes(content);
  const changed = !link || !pointer || contentHash(sections) !== pointer.contentHash;

  let pending = null;
  if (changed) {
    const [terms, clientSnap] = await Promise.all([
      currentClientTerms(),
      order.clientId ? adminDb.collection('parties').doc(String(order.clientId)).get() : Promise.resolve(null),
    ]);
    const client = clientSnap?.exists ? clientSnap.data()! : {};
    const what = link && pointer ? sectionList(changedSections(pointer.sectionHashes, sections)) : '';
    pending = signFormData({
      ...tokenSnapshotFields(order, content),
      type: 'shipper_agreement',
      orderNumber: orderDisplayNumber(order as { orderNumber?: string; batsId?: string }),
      clientName: client.companyName || client.contactName || order.clientName || '',
      termsText: terms.text,
      sentByName: caller.displayName,
      sentByEmail: caller.email ?? '',
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      // Numbered as it would be sent, so the preview carries the same
      // "updated agreement" banner the client will see.
      ...(link ? {
        version: Number(link.version ?? 1) + 1,
        changedSections: what,
        previousSentAt: link.lastSentAt ?? link.createdAt ?? null,
      } : {}),
    });
  }

  return NextResponse.json({
    current: link ? signFormData(link) : null,
    pending,
    held: Boolean(link?.heldAt),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
