import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
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

export async function listShippers(): Promise<Shipper[]> {
  const q = query(collection(db, COL), orderBy('companyName', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Shipper);
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
