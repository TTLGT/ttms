import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { readOrder } from '@/lib/orderAccess';
import { carrierAlert, documentAlert, postOrderAlert, statusAlert } from '@/lib/chatAlerts';
import type { OrderStatus } from '@/types/order';

/**
 * Tells the room about this load that something happened to it.
 *
 * The three events here are the ones a browser carries out directly against
 * Firestore — advancing the status, assigning a carrier, uploading a POD — so
 * unlike the BOL, the invoice and the two agreements, there is no server route
 * already standing at the moment they happen. This is that route.
 *
 * **The caller names an event, never a message.** It says "the status changed";
 * the server re-reads the order and writes what it actually finds there. That
 * distinction is the whole security of this endpoint: an alert appears in the
 * room over the TTMS name, so a route that posted text supplied by the caller
 * would be a way for any member of staff to make the system say anything at
 * all — "carrier signed" on a load nobody has signed for, in a room people
 * trust precisely because they know a person did not write it.
 *
 * Guarded like every other route: `readOrder` is the same visibility check the
 * order itself goes through, so nobody can announce into a room about a load
 * they cannot see. Nothing is posted at all unless somebody has already opened
 * the discussion — see postOrderAlert.
 */

type Event = 'status' | 'carrier' | 'pod';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const caller = await requireCaller(req);

    const body  = await req.json().catch(() => ({}));
    const event = String(body.event ?? '') as Event;
    if (!['status', 'carrier', 'pod'].includes(event)) {
      return NextResponse.json({ error: 'Unknown event.' }, { status: 400 });
    }

    const access = await readOrder(caller, orderId);
    if (access.status === 'missing') {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (access.status === 'denied') {
      return NextResponse.json({ error: 'You do not have access to this order' }, { status: 403 });
    }

    const order = access.order as {
      status?: string;
      carrierName?: string;
      podStoragePath?: string | null;
    };

    const text =
      event === 'status'  ? statusAlert(order.status as OrderStatus)
      : event === 'carrier' ? carrierAlert(order.carrierName ?? '')
      : documentAlert('POD', Boolean(order.podStoragePath));

    // Best-effort, like every other caller: the thing that happened has
    // already happened, and a room that could not be told must not turn a
    // successful save into an error on somebody's screen.
    await postOrderAlert(orderId, text).catch(() => {});

    return NextResponse.json({ posted: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
