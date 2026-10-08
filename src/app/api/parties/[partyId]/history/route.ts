import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb } from '@/lib/firebase-admin';
import { requireCaller, readParty } from '@/lib/partyAccess';
import { readHistory } from '@/lib/recordHistory';

/**
 * Everything that has happened to one client, shipper or consignee, newest
 * first — field changes and owners. See src/lib/recordHistory.ts.
 *
 * Open to whoever can open the record, an approved request included, for the
 * reason given on the order history route.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> },
) {
  try {
    const { partyId } = await params;
    const caller = await requireCaller(req);
    const access = await readParty(caller, partyId);
    if (access.status === 'missing') {
      return NextResponse.json({ error: 'Party not found' }, { status: 404 });
    }
    if (access.status === 'denied') {
      return NextResponse.json({ error: 'You do not have access to this record' }, { status: 403 });
    }

    const entries = await readHistory(adminDb.collection('parties').doc(partyId), true);
    return NextResponse.json({ entries });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
