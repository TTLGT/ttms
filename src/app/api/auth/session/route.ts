import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, adminAuth, adminDb } from '@/lib/firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  USERS_COLLECTION,
  isBootstrapAdmin,
  normalizeEmail,
} from '@/lib/accessControl';
import { claimPendingAssignments } from '@/lib/pendingClaims';
import { managedScopeFor, syncManagedScopes } from '@/lib/teamScope';
import { otherPhone } from '@/lib/phone';
import { effectivePermissions } from '@/types/permission';

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
    isAdmin:        bootstrap || entry.isAdmin === true,
    isDispatcher:   entry.isDispatcher === true,
    isFinance:      entry.isFinance === true,
    isHr:           entry.isHr === true,
    isSalesManager: entry.isSalesManager === true,
    isIntern:       entry.isIntern === true,
  };

  /**
   * What this person may actually do, worked out once and written down.
   *
   * The security rules read this array off the profile rather than deriving
   * anything from the role flags — see src/types/permission.ts. Recomputing it
   * on every sign-in is what makes a permission granted this morning take
   * effect without anybody having to run a migration, and what repairs a
   * profile whose mirror was written before a permission existed.
   */
  const permissions = effectivePermissions(roles, entry.grantedPermissions);

  /**
   * A Sales Manager's team, mirrored so the rules can test it.
   *
   * Computed here rather than read from the profile because this may be the
   * write that creates the profile. Everybody else gets two empty arrays,
   * which matters: a manager who has just been demoted must not keep the
   * scope their last sign-in left behind.
   */
  const managed = await managedScopeFor(email).catch((e) => {
    // Never block sign-in over the org chart. An empty scope costs a manager
    // sight of their team until the next sign-in or the next team edit; a
    // failed sign-in costs them the system.
    console.error('[session] computing managed scope failed', email, e);
    return { uids: [], emails: [] };
  });

  // An admin-entered name wins over the one Google reports: it is the name the
  // office actually uses, and it would be pointless to type it in Settings only
  // for the next sign-in to overwrite it.
  const enteredName = [entry.firstName, entry.lastName].filter(Boolean).join(' ').trim();

  const mirroredOther = otherPhone(entry);

  const profile = {
    uid,
    email,
    firstName:   entry.firstName ?? '',
    lastName:    entry.lastName ?? '',
    displayName: enteredName || entry.displayName || decoded.name || '',
    phone:       entry.phone ?? '',
    // Through the helper, so someone whose allowlist entry still holds the old
    // `phoneGt` gets their number mirrored rather than a blank. The legacy
    // field is mirrored as '' for the same reason it is cleared on write: two
    // places holding the number is one place too many.
    phoneOther:       mirroredOther.value,
    phoneOtherRegion: mirroredOther.region,
    phoneGt:          '',
    extension:   entry.extension ?? '',
    siteId:      entry.siteId ?? null,
    // Mirrored so the app can show who someone reports to without reading the
    // allowlist. The payroll fields on that entry — legal name, date of birth,
    // personal email, start date — deliberately stay behind, because every
    // signed-in user can read this document.
    teamId:      entry.teamId ?? null,
    photoPath:   entry.photoPath ?? null,
    ...roles,
    permissions,
    managedUids:   managed.uids,
    managedEmails: managed.emails,
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

  // This person now has a uid, and their manager's mirror is still holding
  // them by email. Re-running the scope sync swaps the one for the other —
  // without it, a manager would keep matching a new hire's records by address
  // long after the address stopped being how that person is identified.
  if (firstSignIn) {
    await syncManagedScopes().catch((e) => {
      console.error('[session] refreshing managed scopes failed', email, e);
    });
  }

  await syncClaims(uid, decoded, roles);

  return NextResponse.json({ profile });
}

/**
 * Storage rules can only see custom claims, so roles are mirrored there.
 *
 * `isHr` and `isSalesManager` are deliberately absent: nothing in storage.rules
 * or firestore.rules reads them — both are enforced against the `users/{uid}`
 * profile, which rules can look up — and a claim nobody reads is only one more
 * thing to drift out of sync. Add one the day a Storage path actually needs it.
 *
 * `intern` is here because a Storage path does need it. Driver's licences are
 * readable by every staff account, which is right for the people who cover the
 * phones and wrong for somebody who cannot open a load at all; that prefix is
 * the one place the bucket has to tell an intern apart from everyone else.
 *
 * The effective permission list is deliberately NOT mirrored into claims. It
 * is a few dozen strings, custom claims are capped at a kilobyte and ride on
 * every request, and the one consumer that cannot read Firestore needs a
 * single bit rather than the list.
 */
async function syncClaims(
  uid: string,
  decoded: Record<string, unknown>,
  roles: {
    isAdmin: boolean;
    isDispatcher: boolean;
    isFinance: boolean;
    isHr: boolean;
    isIntern: boolean;
  },
) {
  const desired = {
    ttlAccess:  true,
    admin:      roles.isAdmin,
    dispatcher: roles.isDispatcher,
    finance:    roles.isFinance,
    intern:     roles.isIntern,
  };
  const unchanged = Object.entries(desired).every(([key, value]) => decoded[key] === value);

  if (!unchanged) await adminAuth.setCustomUserClaims(uid, desired);
}

/** Strip access from an account that authenticated but is not on the allowlist. */
async function denyAccess(uid: string) {
  await adminAuth.setCustomUserClaims(uid, { ttlAccess: false }).catch(() => {});
  await adminAuth.revokeRefreshTokens(uid).catch(() => {});
}
