import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { listChangeOrders } from '@/lib/changeOrderDecisions';

/**
 * Change orders for the Approvals screen and its badge. `?box=incoming` is
 * what the caller can decide (nothing, for a broker); `?box=outgoing` is the
 * caller's own, by the uid off their token. See listChangeOrders().
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const box = req.nextUrl.searchParams.get('box') === 'outgoing' ? 'outgoing' : 'incoming';
    return NextResponse.json({ changeOrders: await listChangeOrders(caller, box) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
