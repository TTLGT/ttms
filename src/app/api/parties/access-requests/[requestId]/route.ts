import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { canDecideRequest } from '@/lib/accessControl';
import { callerIp, changeOwners, syncClientOwners } from '@/lib/ownership';

const COL = 'partyAccessRequests';

/**
 * Approve or deny a request to use someone else's party.
 *
 * An approval grants one of two very different things, named by `grant`:
 *
 *   `once`      — the default. Lends the record until it is spent on one
 *                 order, then expires. What this route has always done.
 *   `ownership` — hands the record over. The requester joins its owners and
 *                 gets every order it is the *client* on, now and in future.
 *
 * The second is a permanent transfer rather than a larger loan, so it is
 * restricted to admins and dispatchers — the same people who may reassign a
 * record through /api/parties/{id}/owners, and for the same reason. A party's
 * own owner can still approve a `once`, because lending something for one load
 * is not giving it away. It goes through changeOwners() so the ownerEvents
 * trail records it exactly like any other change of hands.
 *
 * The IP is read from the request headers here rather than sent by the client,
 * because a browser cannot know its own public address and anything it claimed
 * could be forged. This is the same source the e-sign flow uses.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params;
    const caller = await requireCaller(req);
    const body   = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');

    if (action !== 'approve' && action !== 'deny') {
      return NextResponse.json({ error: 'action must be approve or deny' }, { status: 400 });
    }

    const grant = body.grant === 'ownership' ? 'ownership' : 'once';

    const ref  = adminDb.collection(COL).doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const request = snap.data()!;

    if (!canDecideRequest(request, caller.uid, caller.profile)) {
      return NextResponse.json(
        { error: 'Only the owner of this record or an admin can decide this request.' },
        { status: 403 },
      );
    }
    if (request.status !== 'pending') {
      return NextResponse.json(
        { error: `This request was already ${request.status}.` },
        { status: 409 },
      );
    }

    // Handing a record over is a different decision from lending it, and not
    // one an ordinary owner gets to make on their own — see the note above.
    const canGrantOwnership =
      caller.profile.isAdmin === true || caller.profile.isDispatcher === true;
    if (action === 'approve' && grant === 'ownership' && !canGrantOwnership) {
      return NextResponse.json(
        { error: 'Only an admin or dispatcher can hand ownership of a record over.' },
        { status: 403 },
      );
    }

    // Shared by the ownership change and the decision record below, so both
    // name the same address.
    const ip = callerIp(req);

    const isOwner = (request.ownerUids ?? []).includes(caller.uid);

    if (action === 'approve' && grant === 'ownership') {
      // Added to the owners rather than replacing them: the point is to bring
      // somebody in, and dropping the existing owner is a separate decision
      // nobody made here.
      await changeOwners(
        'parties',
        request.partyId,
        'added',
        { uids: [request.requestedByUid], groupIds: [], emails: [] },
        { uid: caller.uid, name: caller.displayName, ip },
      );
      // Owning a client carries its orders, and the rules read that from a
      // mirror on each order rather than by querying. Refreshing it is part of
      // the change, not a follow-up: without it the new owner would not be able
      // to see the very orders they were just given.
      await syncClientOwners(request.partyId);
    }

    await ref.update({
      status:         action === 'approve' ? 'approved' : 'denied',
      decidedByUid:   caller.uid,
      decidedByName:  caller.displayName,
      decidedByIp:    ip,
      decidedAt:      FieldValue.serverTimestamp(),
      // Recorded so the order shows whether the owner or an admin authorized it.
      decidedByAdmin: !isOwner,
      denyReason:     action === 'deny' ? String(body.reason ?? '').trim().slice(0, 500) || null : null,
      // Recorded so the inbox can say which of the two was granted, and so a
      // reader a year later can tell a loan from a transfer.
      grantKind:      action === 'approve' ? grant : null,
      updatedAt:      FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      id:     requestId,
      status: action === 'approve' ? 'approved' : 'denied',
      grant:  action === 'approve' ? grant : null,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
