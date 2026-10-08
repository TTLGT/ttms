import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb, requirePermission } from '@/lib/firebase-admin';
import { readHistory } from '@/lib/recordHistory';

/**
 * Everything that has happened to one carrier, newest first. Gated on
 * `carriers.view`, the permission that opens the carrier itself.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ carrierId: string }> },
) {
  try {
    const { carrierId } = await params;
    await requirePermission(req, 'carriers.view');

    const ref = adminDb.collection('carriers').doc(carrierId);
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: 'Carrier not found' }, { status: 404 });
    }
    // Carriers have no owners, so there is no ownership trail to merge in.
    const entries = await readHistory(ref, false);
    return NextResponse.json({ entries });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
