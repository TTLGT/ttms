import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError, FieldValue } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { canSeeAllOrders } from '@/lib/accessControl';
import { deletePhotoFiles, toLoadPhoto } from '@/lib/loadPhotosServer';
import {
  LOAD_PHOTOS_COLLECTION,
  MAX_CAPTION,
  MAX_PHOTO_COMMODITY,
  commodityKey,
  isPhotoStage,
} from '@/types/loadPhoto';

type RouteContext = { params: Promise<{ orderId: string; photoId: string }> };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

/**
 * The picture, but only as one of this order's. The order id in the URL is
 * what getVisibleOrder() checked, so a picture filed under a different load
 * must not be reachable by naming it here beside a load the caller can see.
 */
async function photoOf(orderId: string, photoId: string) {
  const ref  = adminDb.collection(LOAD_PHOTOS_COLLECTION).doc(photoId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.orderId !== orderId) {
    throw new AdminAuthError('Picture not found', 404);
  }
  return { ref, data: snap.data()! };
}

/**
 * Changes a picture's caption, stage or commodity label.
 *
 * Open to anybody who can see the load, the same as editing the order: the
 * label is a note about the load, and the person who notices it is wrong is
 * usually not the one who uploaded it. Only the three keys are read.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { orderId, photoId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    const { ref } = await photoOf(orderId, photoId);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof body.caption === 'string') patch.caption = body.caption.trim().slice(0, MAX_CAPTION);
    if (isPhotoStage(body.stage)) patch.stage = body.stage;
    if (typeof body.commodity === 'string') {
      const commodity = body.commodity.trim().slice(0, MAX_PHOTO_COMMODITY);
      patch.commodity    = commodity;
      patch.commodityKey = commodityKey(commodity);
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    }

    await ref.update(patch);
    const saved = await ref.get();
    return NextResponse.json({ photo: await toLoadPhoto(photoId, saved.data()!) });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Removes a picture for good — the record and both files.
 *
 * Narrower than editing: the person who uploaded it, or somebody holding
 * `orders.viewAll` (admin, dispatch and finance by default). A picture of a load is often the
 * evidence in a damage claim, and "anybody who can open the load" would let a
 * colleague quietly take out the one photo that showed the pallet was already
 * broken at pickup.
 *
 * When it was the load's profile picture, the oldest remaining one takes its
 * place, so a load that still has pictures keeps a face.
 */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { orderId, photoId } = await params;
  try {
    const caller = await requireCaller(req);
    const order  = await getVisibleOrder(caller, orderId);
    const { ref, data } = await photoOf(orderId, photoId);

    if (data.uploadedByUid !== caller.uid && !canSeeAllOrders(caller.profile)) {
      return NextResponse.json(
        { error: 'Only the person who added this picture, or somebody who sees every load, can remove it' },
        { status: 403 },
      );
    }

    let nextCover: string | null | undefined;
    if (order.coverPhotoId === photoId) {
      const rest = await adminDb.collection(LOAD_PHOTOS_COLLECTION)
        .where('orderId', '==', orderId)
        .get();
      const oldest = rest.docs
        .filter((d) => d.id !== photoId)
        .sort((a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0))[0];
      nextCover = oldest?.id ?? null;
    }

    const batch = adminDb.batch();
    batch.delete(ref);
    batch.update(adminDb.collection('orders').doc(orderId), {
      photoCount: FieldValue.increment(-1),
      ...(nextCover !== undefined ? { coverPhotoId: nextCover } : {}),
    });
    await batch.commit();
    // After the records, not before: a file with no record is invisible and
    // merely wasted, while a record with no file is a broken picture on screen.
    await deletePhotoFiles(orderId, photoId).catch(() => {});

    return NextResponse.json({
      ok: true,
      coverPhotoId: nextCover !== undefined ? nextCover : (order.coverPhotoId ?? null),
    });
  } catch (e) {
    return fail(e);
  }
}
