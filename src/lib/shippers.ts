import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Shipper } from '@/types/shipper';

const COL = 'shippers';

export async function createShipper(
  data: Omit<Shipper, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getShipper(shipperId: string): Promise<Shipper | null> {
  const snap = await getDoc(doc(db, COL, shipperId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Shipper;
}

export async function listShippers(uid?: string): Promise<Shipper[]> {
  const snap = uid
    ? await getDocs(query(collection(db, COL), where('assignedToUids', 'array-contains', uid)))
    : await getDocs(query(collection(db, COL), orderBy('companyName', 'asc')));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Shipper);
  return uid ? docs.sort((a, b) => a.companyName.localeCompare(b.companyName)) : docs;
}

export async function updateShipper(
  shipperId: string,
  data: Partial<Omit<Shipper, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, shipperId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
