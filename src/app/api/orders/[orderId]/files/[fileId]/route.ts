import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, AdminAuthError, FieldValue } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { can, canSeeAllOrders } from '@/lib/accessControl';
import { describeSignature, partyOfKind } from '@/lib/signedDocuments';
import { RECORD_FIELD, asSignatureRecord, reviewOf } from '@/types/signatureRecord';
import { actorOf, writeChange } from '@/lib/recordHistory';
import { toOrderFile } from '@/lib/orderFilesServer';
import {
  MAX_ORDER_FILE_NOTE,
  ORDER_FILES_COLLECTION,
  isOrderFileKind,
  isSignedAgreementKind,
  orderFilePath,
} from '@/types/orderFile';

type RouteContext = { params: Promise<{ orderId: string; fileId: string }> };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

/**
 * The file, but only as one of this order's. The order in the URL is what
 * getVisibleOrder() checked, so a file filed under a different load must not
 * be reachable by naming it beside a load the caller can see.
 */
async function fileOf(orderId: string, fileId: string) {
  const ref  = adminDb.collection(ORDER_FILES_COLLECTION).doc(fileId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.orderId !== orderId) {
    throw new AdminAuthError('File not found', 404);
  }
  return { ref, data: snap.data()! };
}

/** Changes what the file is called a kind of, or its note. Anybody who can see the load. */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { orderId, fileId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    const { ref, data } = await fileOf(orderId, fileId);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (isOrderFileKind(body.kind) && body.kind !== data.kind) {
      // Into a signed slot would skip the review a signed upload starts in;
      // out of one would take a verified copy out from under the signature
      // recorded on it. Either is a fresh upload or a removal instead.
      if (isSignedAgreementKind(body.kind) || isSignedAgreementKind(data.kind)) {
        return NextResponse.json({ error: 'A signed agreement is uploaded in its own slot, and stays there. Upload it there instead.' }, { status: 409 });
      }
      patch.kind = body.kind;
    }
    if (typeof body.note === 'string') patch.note = body.note.trim().slice(0, MAX_ORDER_FILE_NOTE);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    }
    await ref.update(patch);
    const saved = await ref.get();
    return NextResponse.json({ file: await toOrderFile(fileId, saved.data()!) });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Removes a file for good. The uploader, or somebody who sees every load —
 * the same rule as a load picture, for the same reason: a receipt on a load is
 * evidence in a dispute, and should not be removable by anyone who can open it.
 */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { orderId, fileId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    const { ref, data } = await fileOf(orderId, fileId);

    /*
     * A verified signed agreement is what a recorded signature rests on, so
     * only somebody who could verify it may take it away — the uploader
     * included, once it has been checked. Until then the usual rule.
     */
    const party = partyOfKind(data.kind);
    const verified = party !== null && reviewOf(data.review) === 'approved';
    if (verified) {
      if (!can(caller.profile, 'orders.verifyRecords')) {
        return NextResponse.json({ error: 'This signed copy has been verified. Only admin or dispatch can remove it now.' }, { status: 403 });
      }
    } else if (data.uploadedByUid !== caller.uid && !canSeeAllOrders(caller.profile) && !(party && can(caller.profile, 'orders.verifyRecords'))) {
      return NextResponse.json(
        { error: 'Only the person who added this file, or somebody who sees every load, can remove it' },
        { status: 403 },
      );
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const batch = adminDb.batch();
    batch.delete(ref);
    const orderPatch: Record<string, unknown> = { fileCount: FieldValue.increment(-1) };
    // The signature recorded off this very file goes with it: a record
    // pointing at a copy nobody can open any more is not a record.
    let summary = `Removed a file: ${String(data.name ?? 'file')}`;
    if (party) {
      const order = (await orderRef.get()).data() ?? {};
      const f = RECORD_FIELD[party];
      const rec = asSignatureRecord(order[f.record]);
      if (rec?.fileId === fileId) {
        orderPatch[f.record] = null;
        orderPatch[f.flag] = false;
        orderPatch.updatedAt = FieldValue.serverTimestamp();
        summary += `, and with it the ${party === 'client' ? 'client' : 'carrier'} signature recorded from it (${describeSignature(rec)})`;
      }
    }
    batch.update(orderRef, orderPatch);
    writeChange(batch, orderRef, { action: 'event', summary }, actorOf(caller));
    await batch.commit();
    // After the record: a file with no record is merely wasted, a record with
    // no file is a broken link on screen.
    await adminStorage.bucket().file(orderFilePath(orderId, fileId)).delete({ ignoreNotFound: true }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
