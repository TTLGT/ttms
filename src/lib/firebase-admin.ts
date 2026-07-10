import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

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

  return adminAuth.verifyIdToken(token).catch(() => {
    throw new AdminAuthError('Invalid or expired token', 401);
  });
}

/** Verifies the request's Bearer ID token and confirms the caller is a signed-in @totaltransportlogistics.us user. */
export async function requireCompanyUser(req: Request): Promise<{ uid: string; email: string | undefined }> {
  const decoded = await verifyRequestToken(req);
  if (!decoded.email?.endsWith('@totaltransportlogistics.us')) {
    throw new AdminAuthError('Unauthorized', 403);
  }
  return { uid: decoded.uid, email: decoded.email };
}

/** Verifies the request's Bearer ID token and confirms the caller is an admin (per their users/{uid} profile). */
export async function requireAdmin(req: Request): Promise<{ uid: string; email: string | undefined }> {
  const decoded = await verifyRequestToken(req);

  const profile = await adminDb.collection('users').doc(decoded.uid).get();
  if (!profile.exists || profile.data()?.isAdmin !== true) {
    throw new AdminAuthError('Admin access required', 403);
  }

  return { uid: decoded.uid, email: decoded.email };
}

export type Role = 'dispatcher' | 'finance';

const ROLE_FIELD: Record<Role, 'isDispatcher' | 'isFinance'> = {
  dispatcher: 'isDispatcher',
  finance:    'isFinance',
};

/** Verifies the caller is an admin, or holds at least one of the given non-admin roles. */
export async function requirePermission(req: Request, allowedRoles: Role[]): Promise<{ uid: string; email: string | undefined }> {
  const decoded = await verifyRequestToken(req);

  const profile = await adminDb.collection('users').doc(decoded.uid).get();
  const data = profile.data();
  const hasAccess = data?.isAdmin === true || allowedRoles.some((role) => data?.[ROLE_FIELD[role]] === true);
  if (!profile.exists || !hasAccess) {
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
