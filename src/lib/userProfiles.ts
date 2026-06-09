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

const COL         = 'users';
const SUPER_ADMIN = 'it@totaltransportlogistics.us';

export async function getOrCreateUserProfile(user: User): Promise<UserProfile> {
  const ref  = doc(db, COL, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const existing = snap.data() as UserProfile;
    if (user.email === SUPER_ADMIN && !existing.isAdmin) {
      await updateDoc(ref, { isAdmin: true });
      return { ...existing, isAdmin: true };
    }
    return existing;
  }

  const profile = {
    uid:         user.uid,
    email:       user.email ?? '',
    displayName: user.displayName ?? '',
    isAdmin:     user.email === SUPER_ADMIN,
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
