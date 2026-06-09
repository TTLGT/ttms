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
import type { Client } from '@/types/client';

const COL = 'customers';

export async function createClient(
  data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getClient(clientId: string): Promise<Client | null> {
  const snap = await getDoc(doc(db, COL, clientId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Client;
}

export async function listClients(uid?: string): Promise<Client[]> {
  const snap = uid
    ? await getDocs(query(collection(db, COL), where('assignedToUids', 'array-contains', uid)))
    : await getDocs(query(collection(db, COL), orderBy('name', 'asc')));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Client);
  return uid ? docs.sort((a, b) => a.name.localeCompare(b.name)) : docs;
}

export async function updateClient(
  clientId: string,
  data: Partial<Omit<Client, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, clientId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
