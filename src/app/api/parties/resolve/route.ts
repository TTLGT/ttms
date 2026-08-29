import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller, toVisibleParty, ownerLabel } from '@/lib/partyAccess';
import { canSeeParty } from '@/lib/accessControl';
import { toNameKey } from '@/types/party';

/**
 * Decides what happens when someone types a party name.
 *
 * Deliberately matches on the exact normalized name only — never a prefix or
 * fuzzy match. The picker's type-ahead is fuzzy but runs over records the user
 * can already see; this endpoint reaches records they cannot, so it must not be
 * usable to browse. The most it ever reveals about a stranger's record is the
 * owner's name, and only for a name the caller already knew to type.
 *
 * Verdicts:
 *   available — no such party; the caller may create it
 *   visible   — exists and the caller may use it directly
 *   owned     — exists but belongs to someone else; approval required
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body   = await req.json().catch(() => ({}));
    const name   = String(body.name ?? '').trim();
    const key    = toNameKey(name);

    if (!key) return NextResponse.json({ verdict: 'available' });

    const snap = await adminDb
      .collection('parties')
      .where('nameKey', '==', key)
      .limit(1)
      .get();

    if (snap.empty) return NextResponse.json({ verdict: 'available' });

    const doc  = snap.docs[0];
    const data = doc.data();

    if (canSeeParty(data, caller.uid, caller.profile)) {
      return NextResponse.json({ verdict: 'visible', party: toVisibleParty(doc.id, data) });
    }

    const owner = await ownerLabel(
      data.assignedToUids ?? [],
      data.assignedToName ?? '',
      data.assignedToGroupIds ?? [],
    );

    // Log the near-miss. A user probing for names they should not know about
    // leaves a trail here rather than being silently absorbed.
    await adminDb.collection('partyAccessProbes').add({
      partyId:     doc.id,
      nameKey:     key,
      typedName:   name.slice(0, 120),
      // Distinguishes fishing for a name from opening a link a colleague sent;
      // /api/parties/{partyId} writes the same log with via: 'link'.
      via:         'name',
      byUid:       caller.uid,
      byName:      caller.displayName,
      at:          FieldValue.serverTimestamp(),
    });

    const existingRequest = await adminDb
      .collection('partyAccessRequests')
      .where('partyId', '==', doc.id)
      .where('requestedByUid', '==', caller.uid)
      .where('status', 'in', ['pending', 'approved'])
      .limit(1)
      .get();

    // No party data and, critically, no party id: handing back an id the caller
    // cannot read would let them attach it to an order anyway. Requests are
    // raised by name and re-resolved server-side instead.
    return NextResponse.json({
      verdict:   'owned',
      ownerName: owner,
      existingRequest: existingRequest.empty
        ? null
        : { id: existingRequest.docs[0].id, status: existingRequest.docs[0].data().status },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
