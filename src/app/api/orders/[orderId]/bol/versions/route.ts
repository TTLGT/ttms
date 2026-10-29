import { NextRequest, NextResponse } from 'next/server';
import { adminStorage, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { getVisibleOrder } from '@/lib/orderAccess';
import { bolVersionsRef, listBolVersions } from '@/lib/bolRequests';

type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * The BOLs this load had before the current one — see BolVersion in
 * src/types/bolRequest.ts.
 *
 * `?version=<id>` answers with a two-hour link to that one PDF instead of the
 * list. The same test as the current BOL in /document: anybody who can open
 * the load. The path is read off the version record, never from the request,
 * for the reason that route gives.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { orderId } = await params;
  const versionId = new URL(req.url).searchParams.get('version');
  try {
    const caller = await requireCaller(req);
    await getVisibleOrder(caller, orderId);

    if (!versionId) return NextResponse.json({ versions: await listBolVersions(orderId) });

    const snap = await bolVersionsRef(orderId).doc(versionId).get();
    const path = snap.data()?.storagePath;
    if (typeof path !== 'string' || !path) {
      return NextResponse.json({ error: 'That BOL version is not on file' }, { status: 404 });
    }
    const [url] = await adminStorage.bucket().file(path).getSignedUrl({
      action:  'read',
      expires: Date.now() + 2 * 60 * 60 * 1000,
    });
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
