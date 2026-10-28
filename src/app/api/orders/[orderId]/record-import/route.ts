import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { can } from '@/lib/accessControl';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorOf, updateWithHistory } from '@/lib/recordHistory';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * Switches the "Record import" label on a load off — or back on, for a label
 * removed by mistake. `{ on: boolean }`.
 *
 * The label says the load came from BATS and its paperwork never went
 * through TTMS. Removing it is somebody vouching that they have looked the
 * load over, so it is `orders.verifyRecords` (admin and dispatch) and nobody
 * else, whoever owns the load; the change log says who and when.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    if (!can(caller.profile, 'orders.verifyRecords')) {
      return NextResponse.json({ error: 'Only admin and dispatch can change the Record import label.' }, { status: 403 });
    }
    const order = await getVisibleOrder(caller, orderId);
    const body = (await req.json().catch(() => ({}))) as { on?: unknown };
    if (typeof body.on !== 'boolean') return NextResponse.json({ error: 'Say whether the label is on or off' }, { status: 400 });
    // Only a load that came from an import can carry it at all.
    if (body.on && !order.batsId) {
      return NextResponse.json({ error: 'This load was created in TTMS, not imported.' }, { status: 400 });
    }

    const now = Timestamp.now();
    await updateWithHistory(adminDb.collection('orders').doc(orderId), {
      recordImport: body.on,
      recordImportChangedAt: now,
      recordImportChangedByName: caller.displayName,
      updatedAt: now,
    }, actorOf(caller), body.on
      ? 'Put the Record import label back on this load'
      : 'Removed the Record import label: this load has been looked over in TTMS');

    return NextResponse.json({ recordImport: body.on, changedAt: now.toMillis(), changedByName: caller.displayName });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
