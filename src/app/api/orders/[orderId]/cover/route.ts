import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { LOAD_PHOTOS_COLLECTION } from '@/types/loadPhoto';
import { actorOf, updateWithHistory } from '@/lib/recordHistory';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * Chooses the load's profile picture — the one drawn beside its number in the
 * header and the orders list, so a broker can tell loads apart at a glance.
 *
 * Anybody who can see the load may choose it, as with any other edit to the
 * order. The picture must be one of this load's own; `null` clears it.
 *
 * Written with the Admin SDK rather than through updateOrder() from the
 * browser. The rules would allow the browser write, and it would even be safe
 * — the file a cover id resolves to is always inside this order's own folder,
 * see loadPhotoPath() — but only here can the id be checked against a real
 * picture, so a load never points at one that does not exist.
 */
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);

    const body    = await req.json().catch(() => ({})) as { photoId?: unknown };
    const photoId = body.photoId === null ? null : typeof body.photoId === 'string' ? body.photoId : undefined;
    if (photoId === undefined) {
      return NextResponse.json({ error: 'Name a picture, or null to clear it' }, { status: 400 });
    }

    if (photoId !== null) {
      const snap = await adminDb.collection(LOAD_PHOTOS_COLLECTION).doc(photoId).get();
      if (!snap.exists || snap.data()!.orderId !== orderId) {
        return NextResponse.json({ error: 'Picture not found on this load' }, { status: 404 });
      }
    }

    await updateWithHistory(
      adminDb.collection('orders').doc(orderId),
      { coverPhotoId: photoId },
      actorOf(caller),
      photoId ? 'Changed the profile picture' : 'Removed the profile picture',
    );
    return NextResponse.json({ coverPhotoId: photoId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
