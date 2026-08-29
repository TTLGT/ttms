import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { readOrder } from '@/lib/orderAccess';

/**
 * One order, or 403 when the caller does not own it and does not own its client.
 *
 * The 403 carries `ownerName` so the page can say who to ask. That is a real
 * disclosure — it confirms the order exists and names a colleague — and it is
 * deliberate: the caller reached this id from a link somebody who could already
 * see the order chose to send them, and the alternative was the "Order not
 * found" dead end that sent brokers to ask an admin whether the load was
 * deleted. Nothing about the load itself is returned.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const caller = await requireCaller(req);
    const access = await readOrder(caller, orderId);

    if (access.status === 'missing') {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (access.status === 'denied') {
      return NextResponse.json(
        { error: 'You do not have access to this order', ownerName: access.ownerName },
        { status: 403 },
      );
    }
    return NextResponse.json({ order: access.order });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
