import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller, ownerLabel, ownersFor } from '@/lib/partyAccess';
import { canSeeParty } from '@/lib/accessControl';
import { PARTY_ROLES, toNameKey } from '@/types/party';
import type { PartyRole } from '@/types/party';

const COL = 'partyAccessRequests';

/**
 * The approvals inbox.
 *
 * `box=incoming` — waiting on the caller to decide. Admins see every pending
 * request in the company, so a request against a rep with no TMS account is
 * never stuck. `box=outgoing` — the caller's own requests and their status.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const box    = new URL(req.url).searchParams.get('box') ?? 'incoming';

    let docs;
    if (box === 'outgoing') {
      const snap = await adminDb.collection(COL)
        .where('requestedByUid', '==', caller.uid)
        .get();
      docs = snap.docs;
    } else if (caller.profile.isAdmin) {
      const snap = await adminDb.collection(COL).where('status', '==', 'pending').get();
      docs = snap.docs;
    } else {
      const snap = await adminDb.collection(COL)
        .where('ownerUids', 'array-contains', caller.uid)
        .where('status', '==', 'pending')
        .get();
      docs = snap.docs;
    }

    const requests = docs
      .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

    return NextResponse.json({ requests });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Ask the owner of a party for permission to use it.
 *
 * Two ways in, and the difference is where the caller got the record from.
 *
 * By `name` — the original path, raised from the order form when somebody types
 * a client that turns out to belong to another rep. The name is all the caller
 * has, because /api/parties/resolve deliberately withholds the id.
 *
 * By `partyId` — raised from the party page when a colleague sends a link to a
 * record the reader cannot open. Accepting an id here does not widen anything:
 * the request still has to be approved by the owner, and an id on its own has
 * never been the thing that grants access.
 *
 * Approval is the same grant either way. Worth knowing when reading the inbox:
 * it lends visibility until it is spent on an order, so approving a request
 * raised from a link also authorizes one use of that party on an order.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body   = await req.json().catch(() => ({}));

    const name        = String(body.name ?? '').trim();
    const requestedId = String(body.partyId ?? '').trim();
    const reason      = String(body.reason ?? '').trim().slice(0, 500);

    let snap;
    if (requestedId) {
      const doc = await adminDb.collection('parties').doc(requestedId).get();
      if (!doc.exists) return bad('That record no longer exists.', 404);
      snap = doc;
    } else {
      const key = toNameKey(name);
      if (!key) return bad('A name is required.');
      const found = await adminDb.collection('parties')
        .where('nameKey', '==', key)
        .limit(1)
        .get();
      if (found.empty) return bad('That record no longer exists.', 404);
      snap = found.docs[0];
    }

    const partyId = snap.id;
    const party   = snap.data()!;

    // The name path always states the role, because the caller is filling a
    // named slot on an order. A link carries no such context, so the role falls
    // back to what the record already is — it is stored for the audit trail and
    // for the inbox to read, and never consulted when deciding the request.
    const asked = String(body.role ?? '') as PartyRole;
    const role: PartyRole = PARTY_ROLES.includes(asked)
      ? asked
      : requestedId
        ? (((party.roles ?? []) as PartyRole[]).find((r) => r === 'client')
            ?? ((party.roles ?? []) as PartyRole[])[0]
            ?? 'client')
        : asked;
    if (!PARTY_ROLES.includes(role)) return bad('A valid role is required.');

    // Nothing to approve if the caller can already use it.
    if (canSeeParty(party, caller.uid, caller.profile)) {
      return NextResponse.json({ error: 'You already have access to this record.' }, { status: 409 });
    }

    // One live request per party per person, so the inbox cannot be flooded.
    const existing = await adminDb.collection(COL)
      .where('partyId', '==', partyId)
      .where('requestedByUid', '==', caller.uid)
      .where('status', 'in', ['pending', 'approved'])
      .limit(1)
      .get();
    if (!existing.empty) {
      const d = existing.docs[0];
      return NextResponse.json(
        { error: `You already have a ${d.data().status} request for this record.`, requestId: d.id },
        { status: 409 },
      );
    }

    // Any member of an owning group can approve, so groups are expanded here.
    const ownerUids = await ownersFor(party);
    const ref = await adminDb.collection(COL).add({
      partyId,
      partyName:        party.companyName || party.contactName || '',
      role,
      requestedByUid:   caller.uid,
      requestedByName:  caller.displayName,
      requestedByEmail: caller.email ?? '',
      reason,
      // Where the request came from, so the inbox can say "wants to open" for a
      // link rather than "wants to use", which is only true of the order form.
      via:              requestedId ? 'link' : 'name',
      ownerUids,
      ownerName:        await ownerLabel(
        party.assignedToUids ?? [],
        party.assignedToName ?? '',
        party.assignedToGroupIds ?? [],
        party.assignedToEmails ?? [],
      ),
      status:           'pending',
      decidedByUid:     null,
      decidedByName:    null,
      decidedByIp:      null,
      decidedAt:        null,
      decidedByAdmin:   false,
      denyReason:       null,
      consumedByOrderId: null,
      consumedAt:       null,
      createdAt:        FieldValue.serverTimestamp(),
      updatedAt:        FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id, status: 'pending' }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function millis(ts: unknown): number {
  const t = ts as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}
