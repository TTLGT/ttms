import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { buildDashboardSummary, activeClientLoads } from '@/lib/orderSummary';

/**
 * Everything the dashboard's stat cards show, worked out server-side.
 *
 * The dashboard used to fetch every order in the company and count them in the
 * browser — ten thousand documents, twelve megabytes and about seventeen
 * seconds to render a page whose largest number is four digits. Counting is
 * what a database is for, so it does the counting and sends back the numbers.
 *
 * Each card also has a hover list, which is why this returns a handful of
 * orders alongside each count rather than counts alone. Those lists are capped
 * — see orderSummary.ts for why a tooltip listing seven thousand loads was
 * never useful even when it was free.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);

    // Asked for separately by the page, and deliberately so: this one figure
    // has to read every open order where the rest are counted, and it took
    // about eight times as long as all of them together. Kept off the main
    // response so eleven cards are not waiting on the twelfth.
    if (req.nextUrl.searchParams.get('clients')) {
      return NextResponse.json({ activeClientLoads: await activeClientLoads(caller) });
    }

    const summary = await buildDashboardSummary(caller);
    return NextResponse.json(summary);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
