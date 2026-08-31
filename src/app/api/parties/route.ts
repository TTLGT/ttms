import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/firebase-admin';
import { FieldValue, adminDb } from '@/lib/firebase-admin';
import {
  requireCaller, listVisibleParties, listVisiblePartiesPage, countVisibleParties,
  toVisibleParty, ownerLabel,
} from '@/lib/partyAccess';
import { canSeeParty } from '@/lib/accessControl';
import { toNameKey } from '@/types/party';

/**
 * The parties the caller may see. Filtering happens here, never in the browser.
 *
 *   ?limit=50&cursor=…   one page, by name
 *   ?role=client         narrowed to one role
 *   ?search=acme         name prefix
 *   ?count=1             how many, without fetching any
 *
 * With no `limit` it still returns everything, for the pickers that need a full
 * list. On the current collection that is about seven thousand records — a list
 * screen should page instead.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const p = req.nextUrl.searchParams;
    const role = p.get('role') ?? undefined;

    if (p.get('count')) {
      return NextResponse.json({ count: await countVisibleParties(caller, role) });
    }

    const rawLimit = Number(p.get('limit'));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 500)
      : undefined;

    if (!limit) {
      const parties = await listVisibleParties(caller);
      const scoped = role ? parties.filter((x) => (x.roles ?? []).includes(role)) : parties;
      return NextResponse.json({ parties: scoped, cursor: null });
    }

    const page = await listVisiblePartiesPage(caller, {
      limit,
      cursor: p.get('cursor'),
      role,
      search: p.get('search') ?? undefined,
    });
    return NextResponse.json(page);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Creates a party, or refuses when the name is already taken.
 *
 * Creation has to happen here because the collision might be with a record the
 * caller cannot see: letting the browser decide would quietly mint a duplicate
 * of someone else's client. The caller who creates a party owns it.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body   = await req.json().catch(() => ({}));

    const companyName = String(body.companyName ?? '').trim();
    const contactName = String(body.contactName ?? '').trim();
    const display     = companyName || contactName;
    const key         = toNameKey(display);
    if (!key) {
      return NextResponse.json({ error: 'A company or contact name is required.' }, { status: 400 });
    }

    const existing = await adminDb.collection('parties')
      .where('nameKey', '==', key)
      .limit(1)
      .get();

    if (!existing.empty) {
      const doc  = existing.docs[0];
      const data = doc.data();
      if (canSeeParty(data, caller.uid, caller.profile)) {
        return NextResponse.json({ created: false, party: toVisibleParty(doc.id, data) });
      }
      return NextResponse.json({
        error:     'owned',
        ownerName: await ownerLabel(
          data.assignedToUids ?? [],
          data.assignedToName ?? '',
          data.assignedToGroupIds ?? [],
        ),
      }, { status: 409 });
    }

    const roles = Array.isArray(body.roles) ? body.roles : [];
    const ref = await adminDb.collection('parties').add({
      batsId:         null,
      companyName,
      contactName,
      nameKey:        key,
      contacts:       [],
      phone:          String(body.phone ?? '').trim(),
      email:          String(body.email ?? '').trim(),
      address:        body.address ?? { street: '', city: '', state: '', zip: '', country: 'US' },
      roles,
      defaultOrigin:  null,
      defaultDest:    null,
      // Whoever creates a party owns it, so it is private from the first save
      // rather than sitting open until somebody remembers to assign it.
      assignedToUids: [caller.uid],
      assignedToName: '',
      assignedToGroupIds: [],
      // Written even though it is empty: listVisibleParties finds unowned
      // records with `where('assignedToEmails', '==', [])`, and that never
      // matches a document where the field is absent.
      assignedToEmails: [],
      // The creator owns the new party, so they are entitled to set its source
      // straight away — canEditSource() would say yes on the very next edit.
      sourceId:       body.sourceId ? String(body.sourceId) : null,
      // BATS's raw text. Only the import writes it; a party created here either
      // picks a managed source or has none.
      sourceName:     '',
      notes:          String(body.notes ?? '').trim(),
      createdAt:      FieldValue.serverTimestamp(),
      updatedAt:      FieldValue.serverTimestamp(),
    });

    const snap = await ref.get();
    return NextResponse.json({ created: true, party: toVisibleParty(ref.id, snap.data()!) }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
