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

/** Verifies the request's Bearer ID token and confirms the caller is an admin (per their users/{uid} profile). */
export async function requireAdmin(req: Request): Promise<{ uid: string; email: string | undefined }> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new AdminAuthError('Missing Authorization header', 401);

  const decoded = await adminAuth.verifyIdToken(token).catch(() => {
    throw new AdminAuthError('Invalid or expired token', 401);
  });

  const profile = await adminDb.collection('users').doc(decoded.uid).get();
  if (!profile.exists || profile.data()?.isAdmin !== true) {
    throw new AdminAuthError('Admin access required', 403);
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
