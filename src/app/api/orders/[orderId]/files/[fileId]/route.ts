import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, AdminAuthError, FieldValue } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { canSeeAllOrders } from '@/lib/accessControl';
import { actorOf, writeChange } from '@/lib/recordHistory';
import { toOrderFile } from '@/lib/orderFilesServer';
import {
  MAX_ORDER_FILE_NOTE,
  ORDER_FILES_COLLECTION,
  isOrderFileKind,
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
    const { ref } = await fileOf(orderId, fileId);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (isOrderFileKind(body.kind)) patch.kind = body.kind;
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

    if (data.uploadedByUid !== caller.uid && !canSeeAllOrders(caller.profile)) {
      return NextResponse.json(
        { error: 'Only the person who added this file, or somebody who sees every load, can remove it' },
        { status: 403 },
      );
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const batch = adminDb.batch();
    batch.delete(ref);
    batch.update(orderRef, { fileCount: FieldValue.increment(-1) });
    writeChange(batch, orderRef, {
      action:  'event',
      summary: `Removed a file: ${String(data.name ?? 'file')}`,
    }, actorOf(caller));
    await batch.commit();
    // After the record: a file with no record is merely wasted, a record with
    // no file is a broken link on screen.
    await adminStorage.bucket().file(orderFilePath(orderId, fileId)).delete({ ignoreNotFound: true }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
