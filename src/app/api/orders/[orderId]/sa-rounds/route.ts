import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { listRounds } from '@/lib/saRequestsServer';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * The load's verification record: every SA review round it has had, with
 * who ticked each item and when, who sent which version of the SA, who
 * approved it, and the facts as they stood when it went out. See SaRound in
 * src/types/saRequest.ts.
 *
 * Same boundary as the request itself (GET /api/orders/{id}/sa-request):
 * anybody who can open the load. The rounds carry nothing that route does not
 * already show, minus the client's address book.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    return NextResponse.json({ rounds: await listRounds(orderId) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
