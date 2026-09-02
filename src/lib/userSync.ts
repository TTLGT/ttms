import { adminAuth, adminDb } from './firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  USERS_COLLECTION,
  normalizeEmail,
} from './accessControl';
import { effectivePermissions } from '@/types/permission';

/**
 * Re-mirrors what one person is allowed to do onto their live profile.
 *
 * The allowlist entry is the source of truth for roles and for individually
 * granted permissions; `users/{uid}.permissions` is the effective list the
 * security rules and the API guards actually read. Anything that writes a role
 * or a grant has to call this, or the change sits on the allowlist entry doing
 * nothing until that person next signs in.
 *
 * It is deliberately a separate step rather than something the callers compute
 * inline: the CSV importer, the role toggle and the permission editor all
 * change the same thing, and three copies of the expansion would drift.
 *
 * Returns the list it wrote, or null when the person has never signed in —
 * there is no profile to mirror onto yet, and /api/auth/session computes the
 * list from scratch when they do.
 */
export async function syncPermissionsFor(email: string): Promise<string[] | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(normalized).get();
  if (!snap.exists) return null;

  const entry = snap.data() ?? {};
  const uid   = typeof entry.uid === 'string' && entry.uid ? entry.uid : null;

  const permissions = effectivePermissions(
    {
      isAdmin:        entry.isAdmin === true,
      isDispatcher:   entry.isDispatcher === true,
      isFinance:      entry.isFinance === true,
      isHr:           entry.isHr === true,
      isSalesManager: entry.isSalesManager === true,
      isIntern:       entry.isIntern === true,
    },
    Array.isArray(entry.grantedPermissions) ? entry.grantedPermissions : [],
  );

  if (!uid) return null;

  await adminDb.collection(USERS_COLLECTION).doc(uid).set({ permissions }, { merge: true });
  return permissions;
}

/**
 * The custom claims for one entry, kept in one place because three routes set
 * them: sign-in, restoring a suspended account, and changing a role.
 *
 * Only what Storage rules read. See syncClaims in /api/auth/session for why the
 * permission list itself is not mirrored here, and why `intern` is.
 */
export function claimsFor(entry: FirebaseFirestore.DocumentData): Record<string, boolean> {
  return {
    ttlAccess:  true,
    admin:      entry.isAdmin === true,
    dispatcher: entry.isDispatcher === true,
    finance:    entry.isFinance === true,
    intern:     entry.isIntern === true,
  };
}

/**
 * Push a role change through to the live session.
 *
 * Firestore is read fresh on every request, so the profile mirror is enough
 * for the rules — but Storage rules read the ID token, which the holder can
 * keep for up to an hour. Revoking forces a new one on the next request.
 */
export async function applyClaims(uid: string, entry: FirebaseFirestore.DocumentData) {
  await adminAuth.setCustomUserClaims(uid, claimsFor(entry)).catch(() => {});
  await adminAuth.revokeRefreshTokens(uid).catch(() => {});
}
