import { NextRequest, NextResponse } from 'next/server';
import { adminStorage, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { getCarrierVetting, getVettingPrint } from '@/lib/carrierVetting';

type RouteContext = { params: Promise<{ orderId: string; vettingId: string }> };

/**
 * A signed link to one of the files kept with a vetting record — the
 * SaferWeb copy, the certificate of insurance, or a Carrier Selection File
 * exactly as it was handed out (`which=print&printId=`).
 *
 * `carrier-vetting/` has no storage rule, so the browser can neither read nor
 * write it; this is the only way in, behind the load's own visibility. The
 * path comes off the record, never the request, the same as the document
 * route. Two hours, like every other signed link here.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId, vettingId } = await params;
  const search = new URL(req.url).searchParams;
  const which = search.get('which');
  const printId = search.get('printId') ?? '';
  if (which !== 'saferWeb' && which !== 'insurance' && which !== 'print') {
    return NextResponse.json({ error: 'Unknown file' }, { status: 400 });
  }
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    const v = await getCarrierVetting(orderId, vettingId);
    if (!v) return NextResponse.json({ error: 'Vetting record not found' }, { status: 404 });
    // A kept Carrier Selection File is read under its record, which has just
    // been checked to belong to this load — a print id alone opens nothing.
    const path = which === 'print'
      ? (printId ? (await getVettingPrint(vettingId, printId))?.path : undefined)
      : v.files[which]?.path;
    if (!path) return NextResponse.json({ error: 'That file was not kept with this record' }, { status: 404 });

    const [url] = await adminStorage.bucket().file(path).getSignedUrl({
      action: 'read',
      expires: Date.now() + 2 * 60 * 60 * 1000,
    });
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
