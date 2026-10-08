import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { actorForUid, decodePatch } from '@/lib/recordHistory';
import { updateCarrierAs } from '@/lib/carrierWrites';

/** Save part of a carrier, recording what changed. See src/lib/carrierWrites.ts. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ carrierId: string }> },
) {
  try {
    const { carrierId } = await params;
    const { uid, email } = await requirePermission(req, 'carriers.edit');
    const body = await req.json().catch(() => ({}));
    await updateCarrierAs(await actorForUid(uid, email), carrierId, decodePatch(body.patch));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
