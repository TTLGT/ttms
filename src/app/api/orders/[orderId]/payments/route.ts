import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { can } from '@/lib/accessControl';
import { actorOf } from '@/lib/recordHistory';
import { clearPayment, markPayment } from '@/lib/orderPaymentsServer';
import { isPaymentMarkKey } from '@/types/orderPayment';

type RouteContext = { params: Promise<{ orderId: string }> };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

/**
 * Records that money moved on a load: `{ mark, fileIds, note }`. Gated on
 * `orders.payments` (admin and finance) and on seeing the load. What each
 * mark needs, and what it does to the status, is src/types/orderPayment.ts
 * and src/lib/orderPaymentsServer.ts.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    if (!can(caller.profile, 'orders.payments')) {
      return NextResponse.json({ error: 'Recording payments needs the Record payments permission.' }, { status: 403 });
    }
    const order = await getVisibleOrder(caller, orderId);
    const body  = (await req.json().catch(() => ({}))) as { mark?: unknown; fileIds?: unknown; note?: unknown };
    if (!isPaymentMarkKey(body.mark)) return NextResponse.json({ error: 'Which payment?' }, { status: 400 });
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((x): x is string => typeof x === 'string') : [];
    const note    = typeof body.note === 'string' ? body.note : '';
    const result  = await markPayment(orderId, order, body.mark, fileIds, note, actorOf(caller));
    return NextResponse.json(result);
  } catch (e) {
    return fail(e);
  }
}

/** Undoes one payment: `?mark=driverPaid`. Same permission. */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    if (!can(caller.profile, 'orders.payments')) {
      return NextResponse.json({ error: 'Recording payments needs the Record payments permission.' }, { status: 403 });
    }
    const order = await getVisibleOrder(caller, orderId);
    const mark  = req.nextUrl.searchParams.get('mark');
    if (!isPaymentMarkKey(mark)) return NextResponse.json({ error: 'Which payment?' }, { status: 400 });
    return NextResponse.json(await clearPayment(orderId, order, mark, actorOf(caller)));
  } catch (e) {
    return fail(e);
  }
}
