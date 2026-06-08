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
import type { Order, OrderStatus } from '@/types/order';

const COL = 'orders';

function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `TTL-${year}-${rand}`;
}

export async function createOrder(
  data: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    orderNumber: generateOrderNumber(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const snap = await getDoc(doc(db, COL, orderId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Order;
}

export async function listOrders(): Promise<Order[]> {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<void> {
  await updateDoc(doc(db, COL, orderId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateOrder(
  orderId: string,
  data: Partial<Omit<Order, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, orderId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
