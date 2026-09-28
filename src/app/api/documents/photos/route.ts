import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { canSeeOrder } from '@/lib/accessControl';
import { approvedOrderIds } from '@/lib/orderAccess';
import { toLoadPhoto } from '@/lib/loadPhotosServer';
import { orderAltNumber, orderDisplayNumber } from '@/types/order';
import { LOAD_PHOTOS_COLLECTION, type LoadPhotoRow } from '@/types/loadPhoto';

export const maxDuration = 30;

/**
 * Load pictures across every load the caller can see, for the Documents
 * screen's picture browser.
 *
 * Unlike the licence listing beside it, this does not reach past order
 * visibility: a picture of a load is the load, and a row for a load the reader
 * cannot open is simply left out. That is decided on the parent order, read
 * fresh here — the picture records carry no ownership of their own, so there
 * is no copy of it to fall out of date when a load or its client changes hands.
 *
 * Newest first and capped. A picture is one read and its order is one more
 * (shared between that order's pictures), so the cap is also the ceiling on
 * what one visit to the screen can cost.
 */
const MAX_PHOTOS = 600;

/** Only what a row shows or visibility needs. */
const ORDER_FIELDS = [
  'orderNumber', 'batsId', 'previousOrderNumber',
  'clientName', 'shipperName', 'consigneeName', 'commodity',
  'origin', 'destination', 'coverPhotoId',
  'assignedToUids', 'assignedToGroupIds', 'assignedToEmails',
  'clientOwnerUids', 'clientOwnerGroupIds',
];

function place(a: unknown): string {
  const addr = (a ?? {}) as { city?: string; state?: string };
  return [addr.city, addr.state].filter(Boolean).join(', ');
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);

    const snap = await adminDb.collection(LOAD_PHOTOS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(MAX_PHOTOS)
      .get();

    const orderIds = [...new Set(snap.docs.map((d) => String(d.data().orderId ?? '')).filter(Boolean))];
    if (orderIds.length === 0) return NextResponse.json({ rows: [], capped: false });

    const [orderDocs, granted] = await Promise.all([
      adminDb.getAll(
        ...orderIds.map((id) => adminDb.collection('orders').doc(id)),
        { fieldMask: ORDER_FIELDS },
      ),
      approvedOrderIds(caller.uid),
    ]);
    const grantedSet = new Set(granted);

    // A picture whose load has since been deleted has nothing to be shown
    // under, and drops out here along with the ones the caller cannot see.
    const visible = new Map<string, FirebaseFirestore.DocumentData>();
    for (const doc of orderDocs) {
      if (!doc.exists) continue;
      const data = doc.data()!;
      if (canSeeOrder(data, caller.uid, caller.profile) || grantedSet.has(doc.id)) {
        visible.set(doc.id, data);
      }
    }

    const rows: LoadPhotoRow[] = await Promise.all(
      snap.docs
        .filter((d) => visible.has(String(d.data().orderId)))
        .map(async (d) => {
          const photo = await toLoadPhoto(d.id, d.data());
          const order = visible.get(photo.orderId)!;
          return {
            ...photo,
            orderNumber:      orderDisplayNumber(order),
            altNumber:        orderAltNumber(order),
            clientName:       String(order.clientName ?? ''),
            shipperName:      String(order.shipperName ?? ''),
            consigneeName:    String(order.consigneeName ?? ''),
            orderCommodity:   String(order.commodity ?? ''),
            originLabel:      place(order.origin),
            destinationLabel: place(order.destination),
            isCover:          order.coverPhotoId === d.id,
          };
        }),
    );

    return NextResponse.json({ rows, capped: snap.size >= MAX_PHOTOS });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
