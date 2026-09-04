import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { USERS_COLLECTION, can, normalizeEmail, type RoleFlags } from '@/lib/accessControl';
import { applyProfileField, deleteAvatar, planProfileField } from '@/lib/profileFields';
import { isOtherPhoneRegion } from '@/lib/phone';
import {
  MAX_REASON,
  PROFILE_UPDATE_REQUESTS_COLLECTION as COL,
  isProfileField,
} from '@/types/profileUpdateRequest';

/**
 * Approve, refuse, or take back a request to change one field on a record.
 *
 * Approving is the only place in the system that writes an `allowedUsers`
 * field on somebody's behalf, and everything about the shape of it is there to
 * keep that narrow:
 *
 * - The field comes off the stored request, never off the body, so a decider
 *   cannot approve one thing and have another written.
 * - It is re-checked against the catalog on the way through. A request written
 *   before a field was withdrawn from the catalog must not be applicable now.
 * - The value is re-planned rather than replayed, because the office or team a
 *   request names can be deleted in the days before anybody decides it.
 *
 * `withdraw` belongs to the requester alone. It is a status rather than a
 * delete: a request that vanished would take with it the record of somebody
 * having asked, and the point of the queue is that nothing quietly disappears.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params;
    const { uid, email } = await requireCompanyUser(req);
    const profileSnap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
    const profile = (profileSnap.data() ?? {}) as RoleFlags;
    const displayName = (profileSnap.data()?.displayName as string)
      || normalizeEmail(email) || 'Unknown user';

    const body   = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    if (!['approve', 'deny', 'withdraw'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, deny or withdraw' }, { status: 400 });
    }

    const ref  = adminDb.collection(COL).doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const request = snap.data()!;

    if (request.status !== 'pending') {
      return NextResponse.json(
        { error: `This request is ${request.status} and cannot be changed.` },
        { status: 409 },
      );
    }

    if (action === 'withdraw') {
      if (request.requestedByUid !== uid) {
        return NextResponse.json(
          { error: 'Only the person who raised a request can take it back.' },
          { status: 403 },
        );
      }
    } else if (!can(profile, 'profile.decideUpdates')) {
      return NextResponse.json(
        { error: 'Only an administrator or HR can decide a change to someone’s record.' },
        { status: 403 },
      );
    }

    const field = request.field;
    if (!isProfileField(field)) {
      return NextResponse.json(
        { error: 'That request names a field this system no longer holds.' },
        { status: 409 },
      );
    }

    // A photo request has a file behind it. Whichever way this goes, exactly
    // one of the two images is left pointed at afterwards and the other is
    // removed — approving deletes the old one (inside applyProfileField),
    // refusing or withdrawing deletes the one nobody will ever see.
    const uploaded = field === 'photoPath' && typeof request.requestedValue === 'string'
      ? request.requestedValue
      : '';

    if (action === 'approve') {
      const plan = await planProfileField(
        field,
        String(request.requestedValue ?? ''),
        isOtherPhoneRegion(request.requestedRegion) ? request.requestedRegion : undefined,
      );
      if (plan.error) {
        // Left pending rather than failed shut: the request is still a fair
        // ask, and whoever deleted the office is the one who has to be told.
        return NextResponse.json({ error: plan.error }, { status: 409 });
      }
      await applyProfileField(String(request.subjectEmail ?? ''), plan.patch);
    } else if (uploaded) {
      await deleteAvatar(uploaded);
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      '';

    const status = action === 'approve' ? 'approved'
      : action === 'deny' ? 'denied' : 'withdrawn';

    await ref.update({
      status,
      decidedByUid:  uid,
      decidedByName: displayName,
      decidedByIp:   ip,
      decidedAt:     FieldValue.serverTimestamp(),
      denyReason:    action === 'deny'
        ? String(body.reason ?? '').trim().slice(0, MAX_REASON) || null
        : null,
      updatedAt:     FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: requestId, status });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
