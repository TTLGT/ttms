import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyUser, AdminAuthError } from '@/lib/firebase-admin';
import { allocateOrderNumber } from '@/lib/orderNumber';

/**
 * Reserves the next order number.
 *
 * Numbering runs through a route rather than in the browser because the
 * counter it advances must not be client-writable: a client that could set the
 * counter could hand a second order a number already printed on somebody's
 * rate confirmation. The Admin SDK transaction here is the only writer.
 *
 * Guarded like every other route — any signed-in, allowlisted user may create
 * an order, so that is the bar to draw a number.
 */
export async function POST(req: NextRequest) {
  try {
    await requireCompanyUser(req);
    const { orderNumber, year, seq } = await allocateOrderNumber();
    return NextResponse.json({ orderNumber, year, seq });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
