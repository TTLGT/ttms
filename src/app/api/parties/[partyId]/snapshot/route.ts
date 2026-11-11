import { NextRequest, NextResponse } from 'next/server';
import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller, readParty } from '@/lib/partyAccess';
import { officeToday } from '@/types/celebration';
import { clientSnapshot, type SnapshotLoad } from '@/types/clientSnapshot';

/**
 * A client's type and history with us — see src/types/clientSnapshot.ts.
 *
 * Open to whoever may open the client (readParty: an owner, a viewAll role,
 * or an approved request). The numbers cover every load of the client's,
 * including ones this caller cannot open — a count and an average, never a
 * load — because "is this a regular client" is a question about the client,
 * and owning the client already opens its loads (clientOwnerUids).
 *
 * Cost: one read per order of this client, at most MAX_LOADS. Only three
 * fields are fetched, but Firestore bills a read per document either way. An
 * equality query on `clientId` needs no composite index, which is why the
 * counting is done here rather than with aggregations that would.
 */
const MAX_LOADS = 2000;

/** Office day of a stored date, whatever shape it arrived in. */
function dayOf(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? officeToday(t.toDate()) : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> },
) {
  try {
    const { partyId } = await params;
    const caller = await requireCaller(req);
    const access = await readParty(caller, partyId);
    if (access.status === 'missing') return NextResponse.json({ error: 'Party not found' }, { status: 404 });
    if (access.status === 'denied') return NextResponse.json({ error: 'You do not have access to this record' }, { status: 403 });

    const snap = await adminDb.collection('orders')
      .where('clientId', '==', partyId)
      .select('pickupDate', 'quoteDate', 'createdAt', 'status', 'agreedRate')
      .limit(MAX_LOADS + 1)
      .get();

    const docs = snap.docs.slice(0, MAX_LOADS);
    const loads: SnapshotLoad[] = [];
    for (const d of docs) {
      const o = d.data();
      // The day the load is counted on: its pickup, which is when it actually
      // happened, then the quote, then the record's own creation. Not
      // createdAt first — an imported load's is the day of the import.
      const day = dayOf(o.pickupDate) ?? dayOf(o.quoteDate) ?? dayOf(o.createdAt);
      if (!day) continue;
      loads.push({ day, status: String(o.status ?? ''), agreedRate: Number(o.agreedRate) || 0 });
    }

    return NextResponse.json({
      snapshot: clientSnapshot(loads, officeToday(), access.party.creditClient === true, snap.size > MAX_LOADS),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
