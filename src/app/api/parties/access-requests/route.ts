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

/** Ask the owner of a party for permission to use it on one order. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireCaller(req);
    const body   = await req.json().catch(() => ({}));

    // Raised by name, not id: the caller was never given the id of a record
    // they cannot see, so the lookup has to happen here.
    const name   = String(body.name ?? '').trim();
    const role   = String(body.role ?? '') as PartyRole;
    const reason = String(body.reason ?? '').trim().slice(0, 500);

    const key = toNameKey(name);
    if (!key)                        return bad('A name is required.');
    if (!PARTY_ROLES.includes(role)) return bad('A valid role is required.');

    const found = await adminDb.collection('parties')
      .where('nameKey', '==', key)
      .limit(1)
      .get();
    if (found.empty) return bad('That record no longer exists.', 404);

    const snap    = found.docs[0];
    const partyId = snap.id;
    const party   = snap.data();

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
      ownerUids,
      ownerName:        await ownerLabel(
        party.assignedToUids ?? [],
        party.assignedToName ?? '',
        party.assignedToGroupIds ?? [],
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
