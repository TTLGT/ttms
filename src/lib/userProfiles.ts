import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { USERS_COLLECTION } from './accessControl';
import type { UserProfile } from '@/types/userProfile';

/**
 * `users/{uid}` is the live profile for someone who has actually signed in.
 * It is written server-side by /api/auth/session, which provisions it from the
 * `allowedUsers` entry — profiles are never created from the client, so an
 * uninvited account cannot bring one into existence.
 *
 * Role changes go through /api/admin/users (see src/lib/allowedUsers.ts).
 */

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  return snap.docs.map((d) => d.data() as UserProfile);
}
