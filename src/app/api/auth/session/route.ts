import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminAuth, adminDb } from '@/lib/firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  USERS_COLLECTION,
  isBootstrapAdmin,
  normalizeEmail,
} from '@/lib/accessControl';
import { claimPendingAssignments } from '@/lib/pendingClaims';

/**
 * Called by AuthContext immediately after Firebase sign-in.
 *
 * This is the gate: a Google account that authenticates successfully still has
 * no access until it appears in `allowedUsers`. On success it provisions the
 * `users/{uid}` profile from the allowlist entry and mirrors the roles into
 * custom claims (Storage rules read those — they cannot query Firestore).
 * On failure it revokes the session so the rejected account cannot linger.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  const { uid } = decoded;
  const email = normalizeEmail(decoded.email);
  if (!email) {
    await denyAccess(uid);
    return NextResponse.json({ error: 'This account has no email address.' }, { status: 403 });
  }

  const allowRef = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const allowSnap = await allowRef.get();
  const bootstrap = isBootstrapAdmin(email);

  if (!allowSnap.exists && !bootstrap) {
    await denyAccess(uid);
    return NextResponse.json(
      { error: 'not_invited', message: 'This account has not been granted access to TTMS.' },
      { status: 403 },
    );
  }

  const entry = allowSnap.data() ?? {};

  // Suspension blocks sign-in while keeping the entry and its roles intact.
  // Bootstrap accounts are exempt by design — they exist to prevent lockout.
  if (entry.suspended === true && !bootstrap) {
    await denyAccess(uid);
    return NextResponse.json(
      { error: 'suspended', message: 'Your access to TTMS is suspended. Contact an administrator.' },
      { status: 403 },
    );
  }

  const roles = {
    // Bootstrap accounts are admin by definition — they exist to prevent lockout.
    isAdmin:      bootstrap || entry.isAdmin === true,
    isDispatcher: entry.isDispatcher === true,
    isFinance:    entry.isFinance === true,
    isHr:         entry.isHr === true,
  };

  // An admin-entered name wins over the one Google reports: it is the name the
  // office actually uses, and it would be pointless to type it in Settings only
  // for the next sign-in to overwrite it.
  const enteredName = [entry.firstName, entry.lastName].filter(Boolean).join(' ').trim();

  const profile = {
    uid,
    email,
    firstName:   entry.firstName ?? '',
    lastName:    entry.lastName ?? '',
    displayName: enteredName || entry.displayName || decoded.name || '',
    phone:       entry.phone ?? '',
    phoneGt:     entry.phoneGt ?? '',
    extension:   entry.extension ?? '',
    siteId:      entry.siteId ?? null,
    // Mirrored so the app can show who someone reports to without reading the
    // allowlist. The payroll fields on that entry — legal name, date of birth,
    // personal email, start date — deliberately stay behind, because every
    // signed-in user can read this document.
    teamId:      entry.teamId ?? null,
    photoPath:   entry.photoPath ?? null,
    ...roles,
    // Written on every sign-in so a restored account cannot keep a stale
    // `suspended: true` on its profile, which the rules would still honour.
    suspended: false,
  };

  // An admin can assign clients, orders and work groups to someone before they
  // have ever signed in, which has to be recorded against their email because
  // no uid exists yet. This is where those become real. It runs before the
  // profile is written so the group membership rules test is already correct
  // on the first page load, and only on a first sign-in — `uid` on the
  // allowlist entry is what marks an invite as still pending.
  const firstSignIn = allowSnap.exists && !entry.uid;
  if (firstSignIn) {
    await claimPendingAssignments(email, uid).catch((e) => {
      // A failed claim must not block sign-in: the person still belongs here,
      // and the assignments can be recovered by re-running the resolver. Losing
      // access entirely over it would be the worse failure.
      console.error('[session] claiming pending assignments failed', email, e);
    });
  }

  const profileRef = adminDb.collection(USERS_COLLECTION).doc(uid);
  const profileExists = (await profileRef.get()).exists;
  await profileRef.set(
    {
      ...profile,
      lastLoginAt: FieldValue.serverTimestamp(),
      ...(profileExists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  // Bind the invite to a uid so the admin UI can show "pending" vs "active",
  // and self-heal a bootstrap admin who was never explicitly invited.
  await allowRef.set(
    {
      email,
      ...roles,
      uid,
      lastLoginAt: FieldValue.serverTimestamp(),
      ...(allowSnap.exists ? {} : { invitedBy: 'system:bootstrap', invitedAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  await syncClaims(uid, decoded, roles);

  return NextResponse.json({ profile });
}

/**
 * Storage rules can only see custom claims, so roles are mirrored there.
 *
 * `isHr` is deliberately absent: nothing in storage.rules or firestore.rules
 * reads it — HR is enforced against the `users/{uid}` profile, which rules can
 * look up — and a claim nobody reads is only one more thing to drift out of
 * sync. Add it here the day a Storage path actually needs it.
 */
async function syncClaims(
  uid: string,
  decoded: Record<string, unknown>,
  roles: { isAdmin: boolean; isDispatcher: boolean; isFinance: boolean; isHr: boolean },
) {
  const desired = {
    ttlAccess:  true,
    admin:      roles.isAdmin,
    dispatcher: roles.isDispatcher,
    finance:    roles.isFinance,
  };
  const unchanged = Object.entries(desired).every(([key, value]) => decoded[key] === value);

  if (!unchanged) await adminAuth.setCustomUserClaims(uid, desired);
}

/** Strip access from an account that authenticated but is not on the allowlist. */
async function denyAccess(uid: string) {
  await adminAuth.setCustomUserClaims(uid, { ttlAccess: false }).catch(() => {});
  await adminAuth.revokeRefreshTokens(uid).catch(() => {});
}
