import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { readOrder } from '@/lib/orderAccess';

/**
 * One order, or 403 when the caller does not own it and does not own its client.
 *
 * The 403 carries `ownerName`, the load's number and the owner's chat uid and
 * work number, so the page can say which load was refused and put the reader in
 * touch. That is a real disclosure — it confirms the order exists and names a
 * colleague — and it is deliberate: the caller reached this id from a link
 * somebody chose to send them, or from a driver's licence they are entitled to
 * open, and the alternative was the "Order not found" dead end that sent
 * brokers to ask an admin whether the load was deleted.
 *
 * Nothing about the load itself is returned — no shipper, client, rate or
 * dates. The number is an identifier the reader needs in order to ask about it
 * at all; the phone is already on users/{uid} and readable by every account.
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
        {
          error:       'You do not have access to this order',
          ownerName:   access.ownerName,
          // The load's number and the owner's chat uid and desk number. All
          // three exist to give the reader somewhere to go; none of them says
          // anything about the load itself.
          orderNumber: access.orderNumber,
          owner:       access.owner,
        },
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
