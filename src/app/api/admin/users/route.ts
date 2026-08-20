import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminAuth, adminDb, requireAdmin, AdminAuthError } from '@/lib/firebase-admin';
import {
  ALLOWED_EMAIL_DOMAIN,
  ALLOWED_USERS_COLLECTION,
  USERS_COLLECTION,
  isAllowedEmailDomain,
  isBootstrapAdmin,
  normalizeEmail,
  parseEmailList,
  SITES_COLLECTION,
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

/** Upper bound on one paste, so a runaway list cannot hammer Firestore. */
const MAX_BATCH = 100;

type InviteStatus = 'added' | 'exists' | 'suspended' | 'invalid' | 'wrong-domain' | 'error';
type InviteResult = { email: string; status: InviteStatus; message: string };

type Roles = { isAdmin: boolean; isDispatcher: boolean; isFinance: boolean };

/** Add one address. Never throws — every outcome comes back as a result row. */
async function invite(
  email: string,
  roles: Roles,
  invitedBy: string,
  siteId: string | null,
): Promise<InviteResult> {
  if (!EMAIL_RE.test(email)) {
    return { email, status: 'invalid', message: 'Not a valid email address.' };
  }
  if (!isAllowedEmailDomain(email)) {
    return {
      email,
      status: 'wrong-domain',
      message: `Only @${ALLOWED_EMAIL_DOMAIN} addresses can be added.`,
    };
  }

  try {
    const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
    const existingEntry = await ref.get();
    if (existingEntry.exists) {
      // Re-pasting a suspended address is a common way to try to fix access.
      // Saying "already has access" would be wrong — they have none until an
      // admin restores them, which is a different button.
      return existingEntry.data()?.suspended === true
        ? { email, status: 'suspended', message: 'Suspended — restore them below instead.' }
        : { email, status: 'exists', message: 'Already has access — skipped.' };
    }

    await ref.set({
      email,
      displayName: '',
      phone:       '',
      extension:   '',
      siteId,
      ...roles,
      uid:         null,
      invitedBy,
      invitedAt:   FieldValue.serverTimestamp(),
      lastLoginAt: null,
      suspended:   false,
      suspendedAt: null,
      suspendedBy: null,
    });

    // If they were previously revoked, lift the disable so they can sign in again.
    const existing = await adminAuth.getUserByEmail(email).catch(() => null);
    if (existing?.disabled) {
      await adminAuth.updateUser(existing.uid, { disabled: false });
    }

    return { email, status: 'added', message: 'Access granted.' };
  } catch {
    return { email, status: 'error', message: 'Could not be added — try again.' };
  }
}

/**
 * Invite one or many people: creates the allowlist entries that let them sign in.
 *
 * Accepts `email` (a single address or a pasted block) or `emails` (an array).
 * A bad address never fails the batch — the response carries one result row per
 * address so the caller can show exactly which ones landed.
 */
export async function POST(req: NextRequest) {
  const caller = await guard(req);
  if (caller instanceof NextResponse) return caller;

  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body.emails) ? body.emails.join(' ') : String(body.email ?? '');
  const emails = parseEmailList(raw);

  if (emails.length === 0) {
    return NextResponse.json({ error: 'Enter at least one email address.' }, { status: 400 });
  }
  if (emails.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many addresses at once — ${MAX_BATCH} is the limit.` },
      { status: 400 },
    );
  }

  const roles: Roles = {
    isAdmin:      body.isAdmin === true,
    isDispatcher: body.isDispatcher === true,
    isFinance:    body.isFinance === true,
  };
  const invitedBy = caller.email ?? caller.uid;

  // One site for the whole batch — a paste is normally one office's worth of
  // people. Rejected up front rather than silently dropped, so a stale picker
  // cannot quietly leave everyone unassigned.
  const siteId = typeof body.siteId === 'string' && body.siteId ? body.siteId : null;
  if (siteId && !(await adminDb.collection(SITES_COLLECTION).doc(siteId).get()).exists) {
    return NextResponse.json({ error: 'That site no longer exists.' }, { status: 400 });
  }

  // Sequential on purpose: keeps result order stable and stays well inside
  // Firestore/Auth rate limits even at the batch cap.
  const results: InviteResult[] = [];
  for (const email of emails) {
    results.push(await invite(email, roles, invitedBy, siteId));
  }

  const added = results.filter((r) => r.status === 'added').length;
  return NextResponse.json({ ok: true, added, results });
}

/** Free text an admin types, trimmed and length-capped before it is stored. */
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Writes the contact block to the allowlist entry and mirrors it onto the live
 * profile, so the rest of the app sees the change without a re-login.
 */
async function updateDetails(email: string, details: Record<string, unknown>) {
  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'That person is not on the access list.' }, { status: 404 });
  }

  const siteId = typeof details.siteId === 'string' && details.siteId ? details.siteId : null;
  if (siteId && !(await adminDb.collection(SITES_COLLECTION).doc(siteId).get()).exists) {
    return NextResponse.json({ error: 'That site no longer exists.' }, { status: 400 });
  }

  const patch = {
    displayName: text(details.displayName, 120),
    phone:       text(details.phone, 40),
    extension:   text(details.extension, 12),
    siteId,
  };

  await ref.update(patch);

  const uid = snap.data()?.uid;
  if (uid) {
    await adminDb.collection(USERS_COLLECTION).doc(uid).set(patch, { merge: true });
  }

  return NextResponse.json({ ok: true });
}

/** Change a role on an existing allowlist entry (and the live profile). */
export async function PATCH(req: NextRequest) {
  const caller = await guard(req);
  if (caller instanceof NextResponse) return caller;

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const field = body.field;
  const value = body.value === true;

  // Contact details arrive as one object; roles and suspension as field/value.
  if (body.details && typeof body.details === 'object') {
    return updateDetails(email, body.details as Record<string, unknown>);
  }

  if (!['isAdmin', 'isDispatcher', 'isFinance', 'suspended'].includes(field)) {
    return NextResponse.json({ error: 'Unknown field.' }, { status: 400 });
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
  // Same two guards as revoking: suspension also locks someone out, so it must
  // not be usable to lock out yourself or the last recoverable admin.
  if (field === 'suspended' && value && normalizeEmail(caller.email) === email) {
    return NextResponse.json({ error: 'You cannot suspend your own access.' }, { status: 400 });
  }
  if (field === 'suspended' && value && isBootstrapAdmin(email)) {
    return NextResponse.json(
      { error: 'This is a protected bootstrap admin account and cannot be suspended.' },
      { status: 400 },
    );
  }

  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'That person is not on the access list.' }, { status: 404 });
  }

  const entry = snap.data() ?? {};
  // A pending invite has no uid yet; fall back to Auth so an account that
  // signed in before the uid was bound still gets disabled.
  const uid: string | undefined =
    entry.uid ?? (await adminAuth.getUserByEmail(email).catch(() => null))?.uid;

  if (field === 'suspended') {
    await ref.update({
      suspended:   value,
      suspendedAt: value ? FieldValue.serverTimestamp() : null,
      suspendedBy: value ? caller.email ?? caller.uid : null,
    });

    // Mirrored onto the profile because requireAdmin and the Firestore rules
    // read `users/{uid}`, not the allowlist, on every request.
    if (entry.uid) {
      await adminDb
        .collection(USERS_COLLECTION)
        .doc(entry.uid)
        .set({ suspended: value }, { merge: true })
        .catch(() => {});
    }

    if (uid) {
      if (value) {
        // Same teardown as revoking, minus the deletion: end the session now
        // instead of letting the current ID token run out its hour.
        await adminAuth.setCustomUserClaims(uid, { ttlAccess: false }).catch(() => {});
        await adminAuth.revokeRefreshTokens(uid).catch(() => {});
        await adminAuth.updateUser(uid, { disabled: true }).catch(() => {});
      } else {
        // Re-enable and hand back the roles the entry still carries. The next
        // sign-in re-syncs these anyway; setting them here keeps Storage rules
        // correct from the moment access is restored.
        await adminAuth.updateUser(uid, { disabled: false }).catch(() => {});
        await adminAuth
          .setCustomUserClaims(uid, {
            ttlAccess:  true,
            admin:      entry.isAdmin === true,
            dispatcher: entry.isDispatcher === true,
            finance:    entry.isFinance === true,
          })
          .catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  }

  await ref.update({ [field]: value });

  // Mirror onto the live profile so the change applies without a re-invite.
  if (entry.uid) {
    await adminDb.collection(USERS_COLLECTION).doc(entry.uid).set({ [field]: value }, { merge: true });
    // Force a fresh ID token so Storage rules see the new role.
    await adminAuth.revokeRefreshTokens(entry.uid).catch(() => {});
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
