import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { orderSearchTerms } from '@/types/order';

/**
 * Recomputes the fragments an order can be searched by.
 *
 * This exists because `updateOrder` in the browser sends a patch, not a whole
 * order — a rename arrives as `{ shipperName }` alone, and the fragments have
 * to be derived from every searchable field at once. Rather than make each
 * caller assemble the full record first, the server reads what was just written
 * and works them out from that.
 *
 * The sibling of the client-owners route and called the same way: after the
 * save, and never in a way that can fail it. A load whose fragments are a moment
 * stale is findable under its previous name for that moment; a save that failed
 * because a derived index field could not be rewritten would be a real loss.
 *
 * Guarded like every route here, and through getVisibleOrder rather than a bare
 * read: a caller who cannot see an order has no business rewriting a field on
 * it, even one nobody displays.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await ctx.params;
    const caller = await requireCaller(req);
    const order  = await getVisibleOrder(caller, orderId);

    const searchTerms = orderSearchTerms(order);
    await adminDb.collection('orders').doc(orderId).update({ searchTerms });

    return NextResponse.json({ terms: searchTerms.length });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
