import { NextRequest, NextResponse } from 'next/server';
import { adminStorage, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { getCarrierVetting } from '@/lib/carrierVetting';

type RouteContext = { params: Promise<{ orderId: string; vettingId: string }> };

/**
 * A signed link to one of the files kept with a vetting record — the
 * SaferWeb copy or the certificate of insurance.
 *
 * `carrier-vetting/` has no storage rule, so the browser can neither read nor
 * write it; this is the only way in, behind the load's own visibility. The
 * path comes off the record, never the request, the same as the document
 * route. Two hours, like every other signed link here.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId, vettingId } = await params;
  const which = new URL(req.url).searchParams.get('which');
  if (which !== 'saferWeb' && which !== 'insurance') {
    return NextResponse.json({ error: 'Unknown file' }, { status: 400 });
  }
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    const v = await getCarrierVetting(orderId, vettingId);
    const file = v?.files[which];
    if (!file) return NextResponse.json({ error: 'That file was not kept with this record' }, { status: 404 });

    const [url] = await adminStorage.bucket().file(file.path).getSignedUrl({
      action: 'read',
      expires: Date.now() + 2 * 60 * 60 * 1000,
    });
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
