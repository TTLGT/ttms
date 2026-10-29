import { NextRequest, NextResponse } from 'next/server';
import { adminStorage, AdminAuthError } from '@/lib/firebase-admin';
import { can } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf } from '@/lib/recordHistory';
import { generateBol } from '@/lib/bolRequests';
import { bolFingerprint } from '@/types/bolRequest';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * Generates (or regenerates) the BOL and hands back a link to it, so the PDF
 * opens without a second round trip.
 *
 * Two checks, and both are needed. `orders.bol` is held by everybody but
 * interns since 2026-10-14, so on its own it would let a broker generate —
 * and read — the BOL for any load in the company by naming its id.
 * `getVisibleOrder()` is the same test as opening the load: owners, their
 * clients' owners, an approved loan, or `orders.viewAll`.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    if (!can(caller.profile, 'orders.bol')) {
      return NextResponse.json({ error: 'You cannot generate BOLs.' }, { status: 403 });
    }
    const order = await getVisibleOrder(caller, orderId);
    const filePath = await generateBol(orderId, order, actorOf(caller));
    const [url] = await adminStorage.bucket().file(filePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 2 * 60 * 60 * 1000,
    });
    // The fingerprint goes back too, so the page clears its "out of date"
    // banner without reading the order again.
    return NextResponse.json({ url, path: filePath, fingerprint: bolFingerprint(order) });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
