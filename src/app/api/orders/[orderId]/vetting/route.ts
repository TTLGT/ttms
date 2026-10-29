import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { actorForUid } from '@/lib/recordHistory';
import { listCarrierVettings, takeCarrierVetting } from '@/lib/carrierVetting';

type RouteContext = { params: Promise<{ orderId: string }> };

// FMCSA, its open data, the SaferWeb page and the certificate copy, in
// parallel; FMCSA alone can take ten seconds on a bad day.
export const maxDuration = 60;

/**
 * A load's carrier vetting records — see src/types/carrierVetting.ts.
 *
 * Same boundary as the load: anybody who can open it can read its records and
 * save a new one. Saving is harmless by design — it only ever adds evidence,
 * and the record names who saved it — so it needs no permission of its own.
 * There is deliberately no PATCH or DELETE.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    return NextResponse.json({ records: await listCarrierVettings(orderId) });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order = await getVisibleOrder(caller, orderId);
    if (!order.carrierId) {
      return NextResponse.json({ error: 'This load has no carrier to record.' }, { status: 400 });
    }
    const record = await takeCarrierVetting({
      orderId,
      order,
      actor: await actorForUid(caller.uid, caller.email),
      trigger: 'manual',
    });
    return NextResponse.json({ record });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not save the vetting record.' },
      { status: 500 },
    );
  }
}
