import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminAuth, adminDb, requireAdmin, AdminAuthError } from '@/lib/firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  USERS_COLLECTION,
  isBootstrapAdmin,
  normalizeEmail,
} from '@/lib/accessControl';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Guard = { uid: string; email: string | undefined };

async function guard(req: NextRequest): Promise<Guard | NextResponse> {
  try {
    return await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** Invite someone: creates the allowlist entry that lets them sign in. */
export async function POST(req: NextRequest) {
  const caller = await guard(req);
  if (caller instanceof NextResponse) return caller;

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  if ((await ref.get()).exists) {
    return NextResponse.json({ error: 'That person already has access.' }, { status: 409 });
  }

  const roles = {
    isAdmin:      body.isAdmin === true,
    isDispatcher: body.isDispatcher === true,
    isFinance:    body.isFinance === true,
  };

  await ref.set({
    email,
    ...roles,
    uid:         null,
    invitedBy:   caller.email ?? caller.uid,
    invitedAt:   FieldValue.serverTimestamp(),
    lastLoginAt: null,
  });

  // If they were previously revoked, lift the disable so they can sign in again.
  const existing = await adminAuth.getUserByEmail(email).catch(() => null);
  if (existing?.disabled) {
    await adminAuth.updateUser(existing.uid, { disabled: false });
  }

  return NextResponse.json({ ok: true, email });
}

/** Change a role on an existing allowlist entry (and the live profile). */
export async function PATCH(req: NextRequest) {
  const caller = await guard(req);
  if (caller instanceof NextResponse) return caller;

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const field = body.field;
  const value = body.value === true;

  if (!['isAdmin', 'isDispatcher', 'isFinance'].includes(field)) {
    return NextResponse.json({ error: 'Unknown role.' }, { status: 400 });
  }
  if (field === 'isAdmin' && !value && normalizeEmail(caller.email) === email) {
    return NextResponse.json({ error: 'You cannot remove your own admin access.' }, { status: 400 });
  }
  if (field === 'isAdmin' && !value && isBootstrapAdmin(email)) {
    return NextResponse.json(
      { error: 'This is a protected bootstrap admin account and must stay an admin.' },
      { status: 400 },
    );
  }

  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'That person is not on the access list.' }, { status: 404 });
  }

  await ref.update({ [field]: value });

  // Mirror onto the live profile so the change applies without a re-invite.
  const uid = snap.data()?.uid;
  if (uid) {
    await adminDb.collection(USERS_COLLECTION).doc(uid).set({ [field]: value }, { merge: true });
    // Force a fresh ID token so Storage rules see the new role.
    await adminAuth.revokeRefreshTokens(uid).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

/** Revoke access entirely: removes the invite, the profile, and the live session. */
export async function DELETE(req: NextRequest) {
  const caller = await guard(req);
  if (caller instanceof NextResponse) return caller;

  const email = normalizeEmail(new URL(req.url).searchParams.get('email'));

  if (!email) {
    return NextResponse.json({ error: 'Missing email.' }, { status: 400 });
  }
  if (normalizeEmail(caller.email) === email) {
    return NextResponse.json({ error: 'You cannot remove your own access.' }, { status: 400 });
  }
  if (isBootstrapAdmin(email)) {
    return NextResponse.json(
      { error: 'This is a protected bootstrap admin account and cannot be removed here.' },
      { status: 400 },
    );
  }

  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  const uid = snap.data()?.uid ?? (await adminAuth.getUserByEmail(email).catch(() => null))?.uid;

  await ref.delete();

  if (uid) {
    await adminDb.collection(USERS_COLLECTION).doc(uid).delete().catch(() => {});
    // Kill the session now rather than waiting for the ID token to expire.
    await adminAuth.setCustomUserClaims(uid, { ttlAccess: false }).catch(() => {});
    await adminAuth.revokeRefreshTokens(uid).catch(() => {});
    await adminAuth.updateUser(uid, { disabled: true }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
