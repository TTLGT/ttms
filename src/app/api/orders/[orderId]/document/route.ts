import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import {
  DOCUMENT_PATH_FIELD,
  isOrderDocumentKind,
  needsOrderAccess,
} from '@/types/orderDocument';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * The one way into an order's paperwork.
 *
 * Storage rules gate the bucket on the `ttlAccess` claim and nothing finer,
 * because they cannot read Firestore to learn who owns an order. So the BOL,
 * invoice and POD prefixes are closed to the client SDK entirely and reached
 * only here, where the Admin SDK can apply canSeeOrder() before minting a
 * short-lived signed URL. Driver's licences stay open to every staff account —
 * see needsOrderAccess() for why that difference is deliberate.
 *
 * The path is read off the order document and never taken from the request. A
 * caller who could name their own path would be back to the flat bucket this
 * route exists to close: one order they can see would hand them a signed URL
 * for any object in it.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  const kind = new URL(req.url).searchParams.get('type');

  if (!isOrderDocumentKind(kind)) {
    return NextResponse.json({ error: 'Unknown document type' }, { status: 400 });
  }

  try {
    const caller = await requireCaller(req);

    let order: Record<string, unknown>;
    if (needsOrderAccess(kind)) {
      // Throws 403 for an order this caller may not see, 404 for one that is
      // not there — the same answers the order page itself gives.
      order = await getVisibleOrder(caller, orderId);
    } else {
      const snap = await adminDb.collection('orders').doc(orderId).get();
      if (!snap.exists) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      order = snap.data()!;
    }

    const path = order[DOCUMENT_PATH_FIELD[kind]];
    if (typeof path !== 'string' || !path) {
      return NextResponse.json({ error: 'No document on this order' }, { status: 404 });
    }

    // Two hours: long enough to open the file, print it and come back to it,
    // short enough that a link pasted into an email stops working well before
    // the load closes out.
    const [url] = await adminStorage.bucket().file(path).getSignedUrl({
      action:  'read',
      expires: Date.now() + 2 * 60 * 60 * 1000,
    });

    return NextResponse.json({ url, path });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
