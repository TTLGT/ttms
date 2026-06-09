import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import type { UserProfile } from '@/types/userProfile';

const COL          = 'users';
const ADMIN_EMAILS = new Set([
  'it@totaltransportlogistics.us',
  'operations@totaltransportlogistics.us',
  'dispatch@totaltransportlogistics.us',
]);

function isAutoAdmin(email: string | null): boolean {
  return !!email && ADMIN_EMAILS.has(email);
}

export async function getOrCreateUserProfile(user: User): Promise<UserProfile> {
  const ref  = doc(db, COL, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const existing = snap.data() as UserProfile;
    if (isAutoAdmin(user.email) && !existing.isAdmin) {
      await updateDoc(ref, { isAdmin: true });
      return { ...existing, isAdmin: true };
    }
    return existing;
  }

  const profile = {
    uid:         user.uid,
    email:       user.email ?? '',
    displayName: user.displayName ?? '',
    isAdmin:     isAutoAdmin(user.email),
    createdAt:   serverTimestamp(),
  };
  await setDoc(ref, profile);
  // Return a plain object; createdAt will be a real Timestamp on the next read
  return { ...profile, createdAt: null } as unknown as UserProfile;
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map((d) => d.data() as UserProfile);
}

export async function setUserAdmin(uid: string, isAdmin: boolean): Promise<void> {
  await updateDoc(doc(db, COL, uid), { isAdmin });
}
