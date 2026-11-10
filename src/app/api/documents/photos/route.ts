import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { canSeeOrder } from '@/lib/accessControl';
import { approvedOrderIds } from '@/lib/orderAccess';
import { toLoadPhoto } from '@/lib/loadPhotosServer';
import {
  orderAltNumber, orderCommodityItems, orderDisplayNumber, vehicleSummary, type Order,
} from '@/types/order';
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
  'clientName', 'shipperName', 'consigneeName', 'commodity', 'transportType',
  'origin', 'destination', 'coverPhotoId',
  // So a picture linked to a freight line shows that line's stops — see
  // toLoadPhoto(). The stops' party names and addresses come with them.
  'commodities', 'extraPickups', 'extraDeliveries',
  'assignedToUids', 'assignedToGroupIds', 'assignedToEmails',
  'clientOwnerUids', 'clientOwnerGroupIds',
];

/**
 * What a picture's vehicle is called, for searching by year, make, model or
 * VIN. A picture linked to a freight line is that vehicle and no other — a
 * Corolla's picture must not come up for the Civic on the same truck. One not
 * linked to a line is the load's, so it answers to every vehicle on it.
 */
function vehicleText(order: FirebaseFirestore.DocumentData, commodityItemId: string): string {
  const items = orderCommodityItems(order as Order);
  const own = commodityItemId ? items.filter((it) => it.id === commodityItemId) : [];
  return (own.length ? own : items)
    .map((it) => [vehicleSummary(it), it.vin?.trim()].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' · ');
}

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
          const order = visible.get(String(d.data().orderId))!;
          const photo = await toLoadPhoto(d.id, d.data(), order);
          return {
            ...photo,
            orderNumber:      orderDisplayNumber(order),
            altNumber:        orderAltNumber(order),
            clientName:       String(order.clientName ?? ''),
            shipperName:      String(order.shipperName ?? ''),
            consigneeName:    String(order.consigneeName ?? ''),
            orderCommodity:   String(order.commodity ?? ''),
            transportType:    String(order.transportType ?? '').trim(),
            originLabel:      place(order.origin),
            destinationLabel: place(order.destination),
            isCover:          order.coverPhotoId === d.id,
            vehicles:         vehicleText(order, photo.commodityItemId),
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
