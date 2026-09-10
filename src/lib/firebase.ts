import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Firestore, with its cache kept on disk in the browser rather than in memory.
 *
 * The default is memory-only, which means every full page reload throws the
 * cache away and re-reads every watched document from the server — and the
 * chat listeners in ChatProvider start on *every* dashboard page, not just the
 * chat one. That was most of the cost of a reload.
 *
 * On disk, a listener restarted within Firestore's resume window asks the
 * server only for what changed since it last ran, so a reload a few minutes
 * after the last one is close to free. A reload after a long gap still pays
 * full price; this shortens the bill, it does not remove it.
 *
 * It changes nothing about what the app shows. A cached snapshot is delivered
 * first and the server's answer replaces it a moment later, which is the same
 * data sooner rather than different data.
 *
 * The multi-tab manager is not optional here. With the single-tab default,
 * persistence works in whichever tab claimed it first and fails in the rest,
 * and people in this office keep chat open in one tab and work in another.
 */
function firestore() {
  // No IndexedDB on the server, and nothing to cache for: every server-side
  // read in this app goes through the Admin SDK, not this handle. Client
  // components are rendered in Node too, so this branch is really taken.
  if (typeof window === 'undefined') return getFirestore(app);

  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already started — a hot reload re-running this module — or a browser
    // that will not give us IndexedDB, which is what a private window and a
    // "block site data" setting both look like from here. The memory cache is
    // the right fallback: more expensive, identical in what it returns.
    return getFirestore(app);
  }
}

export const auth    = getAuth(app);
export const db      = firestore();
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
// No "hd" domain restriction: access is granted per-address via the allowlist
// (see src/lib/accessControl.ts), so pinning the account picker to one domain
// would block a collaborator an admin deliberately invited from outside it.
// Authenticating still grants nothing without an allowedUsers entry.
googleProvider.setCustomParameters({ prompt: 'select_account' });

export default app;
