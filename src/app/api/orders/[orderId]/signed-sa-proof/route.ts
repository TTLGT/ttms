import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { signedSaProof } from '@/lib/signedSaProof';
import { isAgreementParty } from '@/types/saRequest';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * How many signed-SA copies the load holds, so the "→ Client Signed" button
 * can stay greyed out until there is one. The button is a courtesy; the
 * order save refuses the move without one either way. See
 * src/lib/signedSaProof.ts.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    // `?party=carrier` for the Carrier Agreement and Carrier Signed.
    const asked = req.nextUrl.searchParams.get('party');
    const party = isAgreementParty(asked) ? asked : 'client';
    return NextResponse.json(await signedSaProof(orderId, party), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
