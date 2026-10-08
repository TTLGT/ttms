import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, requirePermission } from '@/lib/firebase-admin';
import { actorForUid, decodePatch } from '@/lib/recordHistory';
import { createCarrierAs } from '@/lib/carrierWrites';

/**
 * Add a carrier, with the opening entry of its change history. The browser
 * used to write it straight to Firestore under `carriers.edit`; it comes
 * through here so the entry cannot be left out. See src/lib/carrierWrites.ts.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid, email } = await requirePermission(req, 'carriers.edit');
    const body = await req.json().catch(() => ({}));
    const id = await createCarrierAs(await actorForUid(uid, email), decodePatch(body.carrier));
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
