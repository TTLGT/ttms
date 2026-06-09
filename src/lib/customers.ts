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
import type { Customer } from '@/types/customer';

const COL = 'customers';

export async function createCustomer(
  data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getCustomer(customerId: string): Promise<Customer | null> {
  const snap = await getDoc(doc(db, COL, customerId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Customer;
}

export async function listCustomers(): Promise<Customer[]> {
  const q = query(collection(db, COL), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer);
}

export async function updateCustomer(
  customerId: string,
  data: Partial<Omit<Customer, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, customerId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
