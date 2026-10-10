import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { listAgreementVersions } from '@/lib/signedAgreements';
import { isAgreementParty } from '@/types/saRequest';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * Every version of the client's Shipper Agreement on this load — sent,
 * signed, replaced — for the list in Client Confirmation. See
 * src/lib/signedAgreements.ts.
 *
 * Same boundary as the signing link itself (GET .../sign-link): anybody who
 * can open the load.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    // `?party=carrier` for the Carrier Agreement's versions; the SA's otherwise.
    const asked = req.nextUrl.searchParams.get('party');
    const party = isAgreementParty(asked) ? asked : 'client';
    return NextResponse.json({ versions: await listAgreementVersions(orderId, party) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
