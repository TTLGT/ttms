import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { AdminAuthError } from '@/lib/firebase-admin';
import { FieldValue, adminDb } from '@/lib/firebase-admin';
import {
  requireCaller, listVisibleParties, listVisiblePartiesPage, countVisibleParties,
  toVisibleParty, ownerLabel,
} from '@/lib/partyAccess';
import { canSeeParty, can, USERS_COLLECTION } from '@/lib/accessControl';
import type { RoleFlags } from '@/lib/accessControl';
import { resolveOwnerFilter } from '@/lib/ownerFilter';
import { callerIp, labelOwners, ownerTargets, writeOwnerEvents } from '@/lib/ownership';
import { toNameKey, partyPhoneKeys } from '@/types/party';

/**
 * The parties the caller may see. Filtering happens here, never in the browser.
 *
 *   ?limit=50&cursor=…   one page, by name
 *   ?role=client         narrowed to one role
 *   ?search=acme         name prefix
 *   ?owner=maria@…       only the records one colleague owns
 *   ?count=1             how many, without fetching any
 *
 * `owner` is an email, for the same reason it is on /api/orders: that is how
 * the directory names a person, and it is the only identifier somebody who has
 * never signed in has. Resolved to a uid here, never accepted as one.
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

    const ownerEmail = (p.get('owner') ?? '').trim();
    const owner = ownerEmail ? await resolveOwnerFilter(ownerEmail) : null;
    if (ownerEmail && !owner) {
      return NextResponse.json({ error: 'No such person' }, { status: 404 });
    }

    if (p.get('count')) {
      return NextResponse.json({ count: await countVisibleParties(caller, role, owner) });
    }

    const rawLimit = Number(p.get('limit'));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 500)
      : undefined;

    if (!limit) {
      // An owner filter is honoured even unpaged, rather than quietly dropped:
      // answering "Maria's clients" with every party in the company would be
      // the wrong answer given confidently.
      if (owner) {
        const page = await listVisiblePartiesPage(caller, { role, owner });
        return NextResponse.json(page);
      }
      const parties = await listVisibleParties(caller);
      const scoped = role ? parties.filter((x) => (x.roles ?? []).includes(role)) : parties;
      return NextResponse.json({ parties: scoped, cursor: null });
    }

    const page = await listVisiblePartiesPage(caller, {
      limit,
      cursor: p.get('cursor'),
      role,
      search: p.get('search') ?? undefined,
      owner,
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

    const roles  = Array.isArray(body.roles) ? body.roles : [];
    const phone  = String(body.phone  ?? '').trim();
    const phone2 = String(body.phone2 ?? '').trim();

    // Co-owners named on the creation form. Validated rather than trusted; see
    // coOwnersFrom() for what a caller is and is not allowed to name.
    let coOwners: { uids: string[]; groupIds: string[] };
    try {
      coOwners = await coOwnersFrom(caller, body.owners);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }

    const now = Timestamp.now();
    const ref = adminDb.collection('parties').doc();
    const owners = {
      // Whoever creates a party owns it, so it is private from the first save
      // rather than sitting open until somebody remembers to assign it. Anyone
      // they named on the form joins them.
      uids:     [...new Set([caller.uid, ...coOwners.uids])],
      groupIds: coOwners.groupIds,
      emails:   [] as string[],
    };

    const batch = adminDb.batch();
    batch.set(ref, {
      batsId:         null,
      companyName,
      contactName,
      nameKey:        key,
      contacts:       [],
      phone,
      email:          String(body.email ?? '').trim(),
      // A second number and address for the same contact — a mobile beside a
      // switchboard, an AP inbox beside a personal one.
      phone2,
      email2:         String(body.email2 ?? '').trim(),
      // Written at creation rather than backfilled, so a party is findable by
      // phone from its first save. See partyPhoneKeys() for the contract.
      phoneKeys:      partyPhoneKeys({ phone, phone2 }),
      address:        body.address ?? { street: '', city: '', state: '', zip: '', country: 'US' },
      roles,
      defaultOrigin:  null,
      defaultDest:    null,
      assignedToUids: owners.uids,
      assignedToName: '',
      assignedToGroupIds: owners.groupIds,
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

    // The opening entry in the ownership trail, in the same batch as the record
    // for the reason changeOwners() gives: an owner that arrived with nothing
    // saying how is exactly what this history exists to prevent.
    const labels = await labelOwners(owners);
    writeOwnerEvents(
      batch,
      ref,
      ownerTargets(owners, labels).map((t) => ({ action: 'added' as const, ...t })),
      { uid: caller.uid, name: caller.displayName, ip: callerIp(req) },
      now,
    );
    await batch.commit();

    const snap = await ref.get();
    return NextResponse.json({ created: true, party: toVisibleParty(ref.id, snap.data()!) }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}


/**
 * The extra owners a caller may put on a party they are creating, checked
 * against what they are actually entitled to name.
 *
 * Sharing a brand-new record is not the same act as reassigning an existing
 * one, which is why this is open to every broker while
 * /api/parties/{id}/owners stays admin-and-dispatch only: the creator is giving
 * away access to their own record, seconds old, rather than taking someone
 * else's. Two limits keep it that way.
 *
 *  - A named person must already have a profile, so a bad uid cannot park a
 *    record against an account nobody holds, where it would read as owned by a
 *    ghost and be unreachable without an admin.
 *  - A work group must be one the caller belongs to, so a record cannot be
 *    handed to a team the caller is not on and could not see afterwards.
 *    `ownership.change` lifts that: an admin or dispatcher assigns across the
 *    whole company by definition.
 *
 * Refuses rather than silently dropping a name. A broker who believed they had
 * shared a client and had not would find out weeks later, from the wrong end.
 */
async function coOwnersFrom(
  caller: { uid: string; profile: RoleFlags },
  raw: unknown,
): Promise<{ uids: string[]; groupIds: string[] }> {
  const body = (raw ?? {}) as { uids?: unknown; groupIds?: unknown };
  const list = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.map((x) => String(x)).filter(Boolean))] : [];

  // The creator is added by the caller of this function, so naming themselves
  // here as well is dropped rather than treated as a second owner.
  const uids     = list(body.uids).filter((u) => u !== caller.uid);
  const groupIds = list(body.groupIds);

  if (uids.length) {
    const docs = await adminDb.getAll(
      ...uids.map((u) => adminDb.collection(USERS_COLLECTION).doc(u)),
    );
    if (docs.some((d) => !d.exists)) {
      throw new Error('One of the people you picked has never signed in, so they cannot own a record yet.');
    }
  }

  if (groupIds.length && !can(caller.profile, 'ownership.change')) {
    const mine = new Set(caller.profile?.groupIds ?? []);
    if (groupIds.some((g) => !mine.has(g))) {
      throw new Error('You can only share a new record with a work group you are in.');
    }
  }

  return { uids, groupIds };
}
