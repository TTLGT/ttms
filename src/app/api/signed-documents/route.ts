import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { can, canSeeOrder } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { toOrderFile } from '@/lib/orderFilesServer';
import { partyOfKind } from '@/lib/signedDocuments';
import { orderDisplayNumber } from '@/types/order';
import { ORDER_FILES_COLLECTION, isSignedAgreementKind } from '@/types/orderFile';
import { asSignatureRecord, reviewOf, RECORD_FIELD } from '@/types/signatureRecord';
import type { SignedDocumentRow } from '@/types/signedDocument';

/** How far back decided copies are listed, so one verifier sees what another did. */
const RECENT_DAYS = 14;

/**
 * Signed copies uploaded to loads, for the Approvals screen. See
 * src/types/signatureRecord.ts.
 *
 * For `orders.verifyRecords` (admin and dispatch): every copy still waiting,
 * and the ones decided in the last fortnight. For anybody else: the copies
 * they uploaded themselves, so they can see where each stands.
 *
 * Each query is one field — `review ==`, a range on `reviewedAt`, `uploadedByUid
 * ==` — so none needs a hand-deployed composite index. Every row is checked
 * against the load it belongs to with canSeeOrder(); a verifier who has the
 * permission without every load sees only the loads they can open.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const verifier = can(caller.profile, 'orders.verifyRecords');
    const col = adminDb.collection(ORDER_FILES_COLLECTION);
    const since = Timestamp.fromMillis(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);

    const snaps = verifier
      ? await Promise.all([col.where('review', '==', 'pending').get(), col.where('reviewedAt', '>=', since).get()])
      : [await col.where('uploadedByUid', '==', caller.uid).get()];
    const docs = new Map<string, FirebaseFirestore.DocumentData>();
    for (const snap of snaps) for (const d of snap.docs) {
      const data = d.data();
      if (!isSignedAgreementKind(data.kind)) continue;
      // An uploader's own list: what is waiting, and what was decided lately.
      if (!verifier && reviewOf(data.review) !== 'pending'
        && !((data.reviewedAt?.toMillis?.() ?? 0) >= since.toMillis())) continue;
      docs.set(d.id, data);
    }

    const orderIds = [...new Set([...docs.values()].map((d) => String(d.orderId ?? '')).filter(Boolean))];
    const orderSnaps = orderIds.length
      ? await adminDb.getAll(...orderIds.map((id) => adminDb.collection('orders').doc(id)))
      : [];
    const orders = new Map(orderSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));

    const rows: SignedDocumentRow[] = [];
    for (const [id, d] of docs) {
      const order = orders.get(String(d.orderId));
      if (!order || !canSeeOrder(order, caller.uid, caller.profile)) continue;
      const party = partyOfKind(d.kind)!;
      const rec = asSignatureRecord(order[RECORD_FIELD[party].record]);
      rows.push({
        file: await toOrderFile(id, d),
        orderId: String(d.orderId),
        orderNumber: orderDisplayNumber(order as { orderNumber?: string; batsId?: string }),
        batsId: typeof order.batsId === 'string' ? order.batsId : null,
        party,
        partyName: String((party === 'carrier' ? order.carrierName : order.clientName) ?? ''),
        orderStatus: String(order.status ?? ''),
        recordImport: order.recordImport === true,
        eSigned: Boolean(party === 'client' ? order.shipperSignedAt : order.carrierSignedAt),
        hasRecord: Boolean(rec),
        carrierId: typeof order.carrierId === 'string' && order.carrierId ? order.carrierId : null,
        carrierName: String(order.carrierName ?? ''),
        driverName: String(order.driverName ?? ''),
      });
    }
    // Waiting first, oldest first — the one that has waited longest is next.
    // Then the decided ones, newest first.
    rows.sort((a, b) => {
      const wa = a.file.review === 'pending' ? 0 : 1;
      const wb = b.file.review === 'pending' ? 0 : 1;
      if (wa !== wb) return wa - wb;
      return wa === 0 ? a.file.createdAt - b.file.createdAt : b.file.reviewedAt - a.file.reviewedAt;
    });
    return NextResponse.json({ rows, isVerifier: verifier }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
