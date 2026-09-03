import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller, toVisibleParty, ownerLabel } from '@/lib/partyAccess';
import { canSeeParty } from '@/lib/accessControl';
import { toPhoneKey } from '@/types/party';

/** Enough to show a chooser; a number matching more than this is a shared line. */
const MAX_MATCHES = 8;

/**
 * Who is on file under a phone number.
 *
 * The BATS habit this replaces: a broker takes a call, types the number that
 * rang in, and either gets the customer back or gets an empty form with the
 * number already in it. Matching on a number is how a repeat caller is
 * recognised when they give a company name three different ways.
 *
 * Server-side for the same reason /api/parties/resolve is: the record the
 * number belongs to may be one this caller is not entitled to see, and letting
 * the browser decide would quietly mint a duplicate of a colleague's client.
 *
 * Exact key only — the whole number, never a prefix. A prefix search would turn
 * this into a way to walk the customer list an area code at a time, which is
 * precisely what the name endpoint refuses to be. Seven digits is the floor,
 * enforced by toPhoneKey().
 *
 * Returns both halves of the answer rather than one:
 *   matches — records the caller may use, ready to select
 *   owned   — how many belong to someone else, and who to ask
 * A number that is only on a colleague's record must not read as "not on file",
 * or the broker creates the duplicate this endpoint exists to prevent.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body   = await req.json().catch(() => ({}));
    const typed  = String(body.phone ?? '').trim();
    const key    = toPhoneKey(typed);

    if (!key) {
      return NextResponse.json({ matches: [], owned: [], searched: false });
    }

    const snap = await adminDb
      .collection('parties')
      .where('phoneKeys', 'array-contains', key)
      .limit(MAX_MATCHES)
      .get();

    const matches = [];
    const owned: { ownerName: string }[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      if (canSeeParty(data, caller.uid, caller.profile)) {
        matches.push(toVisibleParty(doc.id, data));
        continue;
      }
      // No id and no details for a record they cannot open — handing back an id
      // would let them attach it to an order anyway, the same hole the name
      // endpoint closes. The owner's name is all they get, and only for a
      // number they already had.
      owned.push({
        ownerName: await ownerLabel(
          data.assignedToUids ?? [],
          data.assignedToName ?? '',
          data.assignedToGroupIds ?? [],
        ),
      });

      // Logged beside the name probes. Someone dialling through numbers to see
      // whose book they land in leaves a trail here rather than being absorbed.
      await adminDb.collection('partyAccessProbes').add({
        partyId:   doc.id,
        nameKey:   data.nameKey ?? '',
        typedName: typed.slice(0, 40),
        via:       'phone',
        byUid:     caller.uid,
        byName:    caller.displayName,
        at:        FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ matches, owned, searched: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
