import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import {
  agreementFileName, agreementPdf, listAgreementVersions, readAgreementVersion,
} from '@/lib/signedAgreements';

type RouteContext = { params: Promise<{ orderId: string }> };

// One PDF render. The headroom is a cold start.
export const maxDuration = 30;

/**
 * One version of the Shipper Agreement as a PDF: `?ref=` from the versions
 * list, or no ref for the newest signed one (the "Download signed SA"
 * button). Drawn from the copy the client was shown — never from the order.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);

    let ref = req.nextUrl.searchParams.get('ref') ?? '';
    if (!ref) {
      const signed = (await listAgreementVersions(orderId)).find((v) => v.signed);
      if (!signed) return NextResponse.json({ error: 'The client has not signed an SA on this load yet.' }, { status: 404 });
      ref = signed.ref;
    }
    const found = await readAgreementVersion(orderId, ref);
    if (!found) return NextResponse.json({ error: 'That version of the SA was not found on this load.' }, { status: 404 });

    const buffer = await agreementPdf(found.data, found.current);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${agreementFileName(found.data).replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
