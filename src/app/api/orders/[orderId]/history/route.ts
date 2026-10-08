import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { readOrder } from '@/lib/orderAccess';
import { readHistory } from '@/lib/recordHistory';

/**
 * Everything that has happened to one order, newest first — field changes,
 * documents, agreements, signatures and owners. See src/lib/recordHistory.ts.
 *
 * Open to anybody who can open the order, an approved access request
 * included: the history says nothing the order itself does not, except who
 * did it, and the people working a load are the ones who need to know that.
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
      return NextResponse.json({ error: 'You do not have access to this order' }, { status: 403 });
    }

    const entries = await readHistory(adminDb.collection('orders').doc(orderId), true);
    return NextResponse.json({ entries });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
