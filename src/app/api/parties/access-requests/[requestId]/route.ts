import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { requireCaller } from '@/lib/partyAccess';
import { canDecideRequest } from '@/lib/accessControl';

const COL = 'partyAccessRequests';

/**
 * Approve or deny a request to use someone else's party.
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

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      '';

    const isOwner = (request.ownerUids ?? []).includes(caller.uid);

    await ref.update({
      status:         action === 'approve' ? 'approved' : 'denied',
      decidedByUid:   caller.uid,
      decidedByName:  caller.displayName,
      decidedByIp:    ip,
      decidedAt:      FieldValue.serverTimestamp(),
      // Recorded so the order shows whether the owner or an admin authorized it.
      decidedByAdmin: !isOwner,
      denyReason:     action === 'deny' ? String(body.reason ?? '').trim().slice(0, 500) || null : null,
      updatedAt:      FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: requestId, status: action === 'approve' ? 'approved' : 'denied' });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
