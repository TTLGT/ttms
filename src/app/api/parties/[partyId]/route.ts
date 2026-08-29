import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller, readParty } from '@/lib/partyAccess';

/**
 * One party by id.
 *
 * The detail page used to read this document straight from Firestore with the
 * client SDK, which left it unable to say anything useful when the rules said
 * no: a denied read and a deleted record both arrived as nothing. Routing it
 * through here matches how the list already loads (see listParties) and lets a
 * denial name the owner.
 *
 * On a denial this returns the owner's name and nothing else — no company name,
 * no contact, no notes. That is the same disclosure /api/parties/resolve
 * already makes for a name somebody typed, and it is logged the same way.
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
      // Logged next to the name-typed near-misses, but marked `link` so an
      // admin reading the log can tell the two apart. Someone fishing for names
      // they should not know and someone opening a URL a colleague sent them
      // look identical in the data and mean completely different things.
      await adminDb.collection('partyAccessProbes').add({
        partyId,
        nameKey:   '',
        typedName: '',
        via:       'link',
        byUid:     caller.uid,
        byName:    caller.displayName,
        at:        FieldValue.serverTimestamp(),
      });

      return NextResponse.json(
        { error: 'You do not have access to this record', ownerName: access.ownerName },
        { status: 403 },
      );
    }

    return NextResponse.json({ party: access.party });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
