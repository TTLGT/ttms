import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { ALLOWED_USERS_COLLECTION, USERS_COLLECTION, can, normalizeEmail, type RoleFlags } from '@/lib/accessControl';
import { planProfileField } from '@/lib/profileFields';
import { isOtherPhoneRegion } from '@/lib/phone';
import {
  MAX_REASON,
  PROFILE_UPDATE_REQUESTS_COLLECTION as COL,
  isProfileField,
  profileFieldMeta,
} from '@/types/profileUpdateRequest';

/**
 * The queue of people asking for their own record to be corrected.
 *
 * `box=incoming` — waiting on the caller to decide, which means every pending
 * request in the company for whoever holds `profile.decideUpdates` (admin and
 * HR) and nothing at all for anybody else. There is no per-owner narrowing
 * here as there is for parties and loads, because a personnel record has no
 * owner: it belongs to the person it is about, and they are the one asking.
 *
 * `box=outgoing` — the caller's own requests and where each of them got to.
 * Open to everybody, including an intern: raising one needs no permission.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await resolveCaller(req);
    const box    = new URL(req.url).searchParams.get('box') ?? 'incoming';

    if (box === 'outgoing') {
      const docs = (await adminDb.collection(COL)
        .where('requestedByUid', '==', caller.uid).get()).docs;
      return NextResponse.json({ requests: sorted(docs) });
    }

    if (!can(caller.profile, 'profile.decideUpdates')) {
      // An empty queue rather than a 403: the approvals screen asks all three
      // collections for everybody, and a broker having nothing to decide here
      // is the normal case, not an error worth surfacing to them.
      return NextResponse.json({ requests: [] });
    }

    const docs = (await adminDb.collection(COL).where('status', '==', 'pending').get()).docs;
    return NextResponse.json({ requests: sorted(docs) });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Ask for one field on your own record to be changed.
 *
 * The subject is always the caller. There is no parameter for whose record
 * this is about, and there must not be one — an admin who wants to change
 * somebody else's details edits the row in Settings → People, which is the
 * path that has always existed and is guarded accordingly.
 *
 * The value is normalised here as well as on approval, so an unreadable phone
 * number is refused while the person is still looking at the box they typed it
 * into rather than three days later in somebody else's inbox.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await resolveCaller(req);
    const body   = await req.json().catch(() => ({}));

    const field = body.field;
    if (!isProfileField(field)) {
      return bad('That is not something you can ask to have changed.');
    }
    const meta = profileFieldMeta(field)!;

    const requestedValue = typeof body.value === 'string' ? body.value.trim() : '';
    const region = isOtherPhoneRegion(body.region) ? body.region : undefined;

    const plan = await planProfileField(field, requestedValue, region);
    if (plan.error) return bad(plan.error);

    const entrySnap = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(caller.email).get();
    if (!entrySnap.exists) {
      return bad('Your record is not on the access list, so there is nothing to change.', 404);
    }
    const entry = entrySnap.data() ?? {};

    // The stored form of what they asked for, so the inbox compares like with
    // like — "+(469) 935-4100 → +(469) 935-4100" is a request for nothing, and
    // it only reads that way once both sides have been through the formatter.
    const normalized = String(plan.patch[field] ?? '');
    const current    = String(entry[field] ?? '');
    if (normalized === current) {
      return bad(`Your ${meta.label.toLowerCase()} is already that.`, 409);
    }

    // One live request per field, so an inbox cannot be filled with the same
    // ask. A decided one does not count — changing your mind after a refusal
    // is exactly what somebody should be able to do.
    const existing = await adminDb.collection(COL)
      .where('requestedByUid', '==', caller.uid)
      .where('field', '==', field)
      .where('status', '==', 'pending')
      .get();
    if (!existing.empty) {
      return NextResponse.json(
        {
          error: `You already have a change to your ${meta.label.toLowerCase()} waiting to be decided.`,
          requestId: existing.docs[0].id,
        },
        { status: 409 },
      );
    }

    const ref = await adminDb.collection(COL).add({
      subjectEmail: caller.email,
      subjectUid:   typeof entry.uid === 'string' ? entry.uid : null,
      subjectName:  caller.displayName,

      field,
      fieldLabel:   meta.label,
      currentValue: current,
      requestedValue: normalized,
      ...(region ? { requestedRegion: region } : {}),
      // Names for the two ids and the photo path, worked out by the browser,
      // which has the office and team lists loaded already. Text-only for the
      // inbox — nothing reads these back as a value.
      ...(typeof body.currentLabel   === 'string' ? { currentLabel:   body.currentLabel.slice(0, 120) }   : {}),
      ...(typeof body.requestedLabel === 'string' ? { requestedLabel: body.requestedLabel.slice(0, 120) } : {}),

      requestedByUid:   caller.uid,
      requestedByName:  caller.displayName,
      requestedByEmail: caller.email,
      reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON) : '',

      status:         'pending',
      decidedByUid:   null,
      decidedByName:  null,
      decidedByIp:    null,
      decidedAt:      null,
      denyReason:     null,
      createdAt:      FieldValue.serverTimestamp(),
      updatedAt:      FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id, status: 'pending' }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * The caller, their profile and the name to record against a request.
 *
 * Not `requireCaller` from lib/partyAccess: that one builds a party-shaped set
 * of role flags for record visibility, and none of that applies to a request
 * about a person.
 */
async function resolveCaller(req: NextRequest) {
  const { uid, email } = await requireCompanyUser(req);
  const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
  const data = snap.data() ?? {};
  return {
    uid,
    email: normalizeEmail(email),
    profile: data as RoleFlags,
    displayName: data.displayName || normalizeEmail(email) || 'Unknown user',
  };
}

function sorted(docs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  return docs
    .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
}

function millis(value: unknown): number {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
