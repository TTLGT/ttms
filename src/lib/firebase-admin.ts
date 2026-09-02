import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import {
  ALLOWED_USERS_COLLECTION,
  can,
  isBootstrapAdmin,
  normalizeEmail,
  type RoleFlags,
} from './accessControl';
import type { Permission } from '@/types/permission';

export { FieldValue };

function initAdmin() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const adminApp = initAdmin();

export const adminDb      = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp);
export const adminAuth    = getAuth(adminApp);

async function verifyRequestToken(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new AdminAuthError('Missing Authorization header', 401);

  // checkRevoked: true so a revoked user is rejected immediately rather than
  // staying valid until their ID token expires.
  return adminAuth.verifyIdToken(token, true).catch(() => {
    throw new AdminAuthError('Invalid or expired token', 401);
  });
}

/**
 * Verifies the request's Bearer ID token and confirms the caller is on the
 * sign-in allowlist. Email domain grants nothing on its own — an admin must
 * have added the address via Settings → Team Access.
 */
export async function requireCompanyUser(req: Request): Promise<{ uid: string; email: string | undefined }> {
  const decoded = await verifyRequestToken(req);
  const email = normalizeEmail(decoded.email);

  if (!email) throw new AdminAuthError('Unauthorized', 403);
  if (isBootstrapAdmin(email)) return { uid: decoded.uid, email: decoded.email };

  const allowed = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();
  if (!allowed.exists) {
    throw new AdminAuthError('Your access to TTMS has been removed.', 403);
  }
  if (allowed.data()?.suspended === true) {
    throw new AdminAuthError('Your access to TTMS is suspended.', 403);
  }

  return { uid: decoded.uid, email: decoded.email };
}

/** Verifies the request's Bearer ID token and confirms the caller is an admin (per their users/{uid} profile). */
export async function requireAdmin(req: Request): Promise<{ uid: string; email: string | undefined }> {
  const decoded = await verifyRequestToken(req);

  // Bootstrap admins pass without a profile, so an empty allowlist is recoverable.
  if (isBootstrapAdmin(decoded.email)) return { uid: decoded.uid, email: decoded.email };

  const profile = await adminDb.collection('users').doc(decoded.uid).get();
  if (!profile.exists || profile.data()?.isAdmin !== true) {
    throw new AdminAuthError('Admin access required', 403);
  }
  if (profile.data()?.suspended === true) {
    throw new AdminAuthError('Your access to TTMS is suspended.', 403);
  }

  return { uid: decoded.uid, email: decoded.email };
}

/**
 * Verifies the caller holds a named permission.
 *
 * This used to name a role — `requirePermission(req, ['dispatcher'])` — which
 * meant every route asking "may you send an agreement?" was really asking "are
 * you a dispatcher?", and the only way to let somebody send agreements was to
 * hand them every client in the company. Routes now name the ability itself
 * and the role maths happens once, at sign-in; see src/types/permission.ts.
 *
 * Admins pass everything, checked against the flag rather than the mirrored
 * list, for the same reason `can()` short-circuits them: a mirror that failed
 * to write must never be able to lock out the people who would fix it.
 *
 * Reads the profile rather than the ID token on purpose. A permission removed
 * a minute ago has already been written to `users/{uid}`, whereas the token in
 * the caller's hand can be up to an hour old.
 */
export async function requirePermission(
  req: Request,
  permission: Permission,
): Promise<{ uid: string; email: string | undefined }> {
  const decoded = await verifyRequestToken(req);

  if (isBootstrapAdmin(decoded.email)) return { uid: decoded.uid, email: decoded.email };

  const profile = await adminDb.collection('users').doc(decoded.uid).get();
  const data = profile.data();

  if (!profile.exists || data?.suspended === true) {
    throw new AdminAuthError('You do not have permission to perform this action', 403);
  }
  // `can()` handles the profile written before permissions existed by deriving
  // the list from the role flags, so an old profile keeps exactly the access it
  // had rather than failing every guard until its owner signs in again.
  if (!can(data as RoleFlags, permission)) {
    throw new AdminAuthError('You do not have permission to perform this action', 403);
  }

  return { uid: decoded.uid, email: decoded.email };
}

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
