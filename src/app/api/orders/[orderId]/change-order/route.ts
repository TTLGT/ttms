import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { decodePatch } from '@/lib/recordHistory';
import { updateOrderAsCaller } from '@/lib/orderWrites';
import { canApplyOrderChanges } from '@/lib/changeOrders';
import { changeOrderForOrder, cleanNote, decideChangeOrder } from '@/lib/changeOrderDecisions';

/**
 * One load's change order — see src/types/changeOrder.ts.
 *
 *   GET    the current one (or null), and whether the caller may decide it
 *   POST   `{ patch, reason }` — submit an edit as a change order
 *   PATCH  `{ action: 'approve' | 'reject' | 'withdraw', note? }`
 *
 * Every check that a save makes is made on POST too, because it goes through
 * updateOrderAsCaller() — a change order can only hold a patch that would have
 * been accepted.
 */

type RouteContext = { params: Promise<{ orderId: string }> };

function fail(e: unknown) {
  if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const order = await getVisibleOrder(caller, orderId);
    return NextResponse.json({
      changeOrder: await changeOrderForOrder(orderId, order),
      canDecide: canApplyOrderChanges(caller),
      uid: caller.uid,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const body = await req.json().catch(() => ({}));
    const result = await updateOrderAsCaller(caller, orderId, decodePatch(body.patch), {
      propose: { reason: cleanNote(body.reason) },
    });
    return NextResponse.json({ ok: true, changeOrder: result.changeOrder });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    if (action !== 'approve' && action !== 'reject' && action !== 'withdraw') {
      return NextResponse.json({ error: 'Approve, reject or withdraw.' }, { status: 400 });
    }
    const changeOrder = await decideChangeOrder(caller, orderId, action, cleanNote(body.note));
    return NextResponse.json({ changeOrder });
  } catch (e) {
    return fail(e);
  }
}
