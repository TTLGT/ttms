import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import {
  getCarrierVetting, keepVettingPrint, newVettingPrintId, vettingFileIntact, vettingIntact,
} from '@/lib/carrierVetting';
import { generateVettingPdf } from '@/lib/carrier-vetting-pdf';

type RouteContext = { params: Promise<{ orderId: string; vettingId: string }> };

// One PDF render, two small downloads to re-check the fingerprints, and one
// upload to keep the copy.
export const maxDuration = 30;

/**
 * The Carrier Selection File for one vetting record, built on the spot.
 *
 * Every print re-checks the record and its two files against the
 * fingerprints stored when it was taken, and says plainly on the page if one
 * no longer matches — the page is only worth handing over if it can say that.
 *
 * And every print is kept, byte for byte, before it is handed over (see
 * VettingPrint): if the copy cannot be saved, the download is refused, so no
 * copy ever leaves TTMS without one kept of it.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId, vettingId } = await params;
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);
    const v = await getCarrierVetting(orderId, vettingId);
    if (!v) return NextResponse.json({ error: 'Vetting record not found' }, { status: 404 });

    const [saferWeb, insurance] = await Promise.all([
      v.files.saferWeb ? vettingFileIntact(v.files.saferWeb) : Promise.resolve(null),
      v.files.insurance ? vettingFileIntact(v.files.insurance) : Promise.resolve(null),
    ]);
    const intact = { record: vettingIntact(v), saferWeb, insurance };
    const printId = newVettingPrintId(vettingId);
    const printedAt = Date.now();
    const printedByName = caller.displayName || caller.email || 'TTMS';
    const buffer = await generateVettingPdf({ v, intact, printedAt, printedBy: printedByName, printId });

    try {
      await keepVettingPrint({
        orderId, vettingId, printId, pdf: buffer, printedAt, printedByName,
        printedByEmail: caller.email ?? '', intact,
      });
    } catch {
      return NextResponse.json(
        { error: 'TTMS could not keep a copy of this PDF, so it was not handed out. Try again in a minute.' },
        { status: 503 },
      );
    }

    const day = new Date(v.takenAt).toISOString().slice(0, 10);
    const name = `Carrier Selection File ${v.orderNumber} ${day}.pdf`.replace(/["\\/]/g, '');
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
