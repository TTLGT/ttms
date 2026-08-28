import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { listVisibleOrders } from '@/lib/orderAccess';

/**
 * Every order the caller may see.
 *
 * Orders used to be read straight from Firestore by the browser, which worked
 * only because the rules let every signed-in user read the whole collection.
 * Now that they are owned records the filtering has to happen server-side —
 * a client-SDK query over `orders` cannot express "mine, my groups', or my
 * clients'" in a form the rules can approve.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const orders = await listVisibleOrders(caller);
    return NextResponse.json({ orders });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
