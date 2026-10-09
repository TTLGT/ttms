import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { readinessFactsFor } from '@/lib/orderReadinessServer';
import { orderReadiness } from '@/types/orderReadiness';
import type { Order } from '@/types/order';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * What the order still needs for its Shipper Agreement and its BOL.
 *
 * Worked out here rather than in the browser only because two lines depend on
 * other records — the client's email and the carrier's numbers — and those
 * reads belong on the server with the order's own access check in front of
 * them. The rules themselves are src/types/orderReadiness.ts.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order = await getVisibleOrder(caller, orderId);
    const items = orderReadiness(order as Partial<Order>, await readinessFactsFor(order));
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
