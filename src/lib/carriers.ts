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
import type { Carrier } from '@/types/carrier';

const COL = 'carriers';

export async function createCarrier(
  data: Omit<Carrier, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getCarrier(carrierId: string): Promise<Carrier | null> {
  const snap = await getDoc(doc(db, COL, carrierId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Carrier;
}

export async function listCarriers(): Promise<Carrier[]> {
  const q = query(collection(db, COL), orderBy('companyName', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Carrier);
}

export async function updateCarrier(
  carrierId: string,
  data: Partial<Omit<Carrier, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, carrierId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
