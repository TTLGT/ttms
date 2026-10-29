import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { getCarrierVetting, listVettingPrints } from '@/lib/carrierVetting';

type RouteContext = { params: Promise<{ orderId: string; vettingId: string }> };

/**
 * Every Carrier Selection File ever handed out for one vetting record — who
 * printed it, when, and what its integrity checks said. Behind the load's own
 * visibility, and only for a record on that load.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId, vettingId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    if (!(await getCarrierVetting(orderId, vettingId))) {
      return NextResponse.json({ error: 'Vetting record not found' }, { status: 404 });
    }
    return NextResponse.json({ prints: await listVettingPrints(vettingId) });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
