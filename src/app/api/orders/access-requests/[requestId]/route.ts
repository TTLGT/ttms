import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { canDecideRequest } from '@/lib/accessControl';
import { ORDER_ACCESS_REQUESTS_COLLECTION as COL, isGrantLive, isValidGrantHours } from '@/types/orderAccessRequest';

/**
 * Approve, deny or revoke a request to open someone else's load.
 *
 * The IP is read from the request headers rather than sent by the client,
 * because a browser cannot know its own public address and anything it claimed
 * could be forged. Same source the e-sign flow uses.
 *
 * Approving takes a duration: `expiresInHours`, one of GRANT_DURATIONS, or
 * null for a grant that stands until revoked. It is validated against that
 * list rather than taken as a number, so the inbox cannot mint a grant that
 * expires in the past or in eighty years through a mistyped field.
 *
 * `revoke` has no equivalent on the party side, and it is here because the
 * grant has no equivalent either: a party approval spends itself on an order,
 * while an order approval runs on a clock the approver set — or on none at
 * all. Without this the only way to end one early would be deleting the
 * request, which would take the record of it with it.
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

    if (!['approve', 'deny', 'revoke'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, deny or revoke' }, { status: 400 });
    }

    const ref  = adminDb.collection(COL).doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const request = snap.data()!;

    if (!canDecideRequest(request, caller.uid, caller.profile)) {
      return NextResponse.json(
        { error: 'Only an owner of this load or an admin can decide this request.' },
        { status: 403 },
      );
    }

    // Approve and deny act on a pending request; revoke acts on a live one.
    if (action === 'revoke') {
      // A grant whose clock has already run out is not revocable — there is
      // nothing left to take away, and saying so is more honest than recording
      // a revocation that changed nothing.
      if (!isGrantLive(request as { status: string; expiresAt?: { toMillis?: () => number } })) {
        return NextResponse.json(
          { error: 'That grant is not active, so there is nothing to revoke.' },
          { status: 409 },
        );
      }
    } else if (request.status !== 'pending') {
      return NextResponse.json(
        { error: `This request is ${request.status} and cannot be ${action}d.` },
        { status: 409 },
      );
    }

    // Absent means null means no expiry, which has to be asked for explicitly
    // by the screen — see GRANT_DURATIONS.
    const hours = body.expiresInHours === undefined ? null : body.expiresInHours;
    if (action === 'approve' && !isValidGrantHours(hours)) {
      return NextResponse.json(
        { error: 'That is not one of the offered durations.' },
        { status: 400 },
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      '';

    const isOwner = (request.ownerUids ?? []).includes(caller.uid);
    const status  = action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : 'revoked';

    await ref.update({
      status,
      decidedByUid:   caller.uid,
      decidedByName:  caller.displayName,
      decidedByIp:    ip,
      decidedAt:      FieldValue.serverTimestamp(),
      // Recorded so the trail shows whether the owner or an admin decided it.
      decidedByAdmin: !isOwner,
      denyReason:     action === 'deny' ? String(body.reason ?? '').trim().slice(0, 500) || null : null,
      // Computed from the server's clock, not sent as a date by the browser:
      // a client that named its own expiry could name one in 2074.
      expiresAt:      action === 'approve' && typeof hours === 'number'
        ? new Date(Date.now() + hours * 60 * 60 * 1000)
        : null,
      updatedAt:      FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: requestId, status });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
