import { NextRequest, NextResponse } from 'next/server';
import { adminStorage, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { bolVersionsRef, listBolVersions } from '@/lib/bolRequests';
import { bolVoidNote, stampBolVoid } from '@/lib/bolVoidStamp';
import { orderDisplayNumber } from '@/types/order';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * The BOLs this load had before the current one — see BolVersion in
 * src/types/bolRequest.ts.
 *
 * `?version=<id>` answers with that one PDF, stamped VOID (src/lib/bolVoidStamp.ts).
 * The same test as the current BOL in /document: anybody who can open the
 * load. The path is read off the version record, never from the request, for
 * the reason that route gives.
 *
 * The file itself, not a signed link to it as this used to answer: a link
 * would hand out the stored copy unstamped, and the stamp is the point.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  const versionId = new URL(req.url).searchParams.get('version');
  try {
    const caller = await requireCaller(req);
    const order = await getVisibleOrder(caller, orderId);

    if (!versionId) return NextResponse.json({ versions: await listBolVersions(orderId) });

    const snap = await bolVersionsRef(orderId).doc(versionId).get();
    const v = snap.data();
    const path = v?.storagePath;
    if (typeof path !== 'string' || !path) {
      return NextResponse.json({ error: 'That BOL version is not on file' }, { status: 404 });
    }
    const [original] = await adminStorage.bucket().file(path).download();
    const replacedAt = typeof v?.replacedAt?.toDate === 'function' ? v.replacedAt.toDate() as Date : new Date();
    const stamped = await stampBolVoid(new Uint8Array(original), bolVoidNote(replacedAt, String(v?.replacedByName ?? '')));
    const name = `BOL ${orderDisplayNumber(order)} VOID.pdf`.replace(/["\\/]/g, '');
    return new NextResponse(new Uint8Array(stamped), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
