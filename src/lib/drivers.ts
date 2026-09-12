import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Driver } from '@/types/driver';
import { driverNameKey } from '@/types/driver';

const COL = 'drivers';

/**
 * Drivers are read straight from Firestore rather than through an API route,
 * for the same reason carriers are: they are not owned records. The rules open
 * the collection to anyone holding `carriers.view` and gate writes on
 * `carriers.edit`, so there is no visibility union for a server to work out.
 *
 * Every read here is filtered to one carrier. There is deliberately no
 * "list every driver" function: unlike carriers, nothing in the app has a
 * reason to hold the whole collection, and the one that grew into an
 * eleven-thousand-document fetch started exactly that way.
 */

export async function createDriver(
  data: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    // Written on every save so matching keeps working. See driverNameKey.
    nameKey: driverNameKey(data.name),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getDriver(driverId: string): Promise<Driver | null> {
  const snap = await getDoc(doc(db, COL, driverId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Driver;
}

/**
 * Every driver on file for one carrier, by name.
 *
 * Inactive ones come back too — the carrier page shows them greyed out, and a
 * load run last year still has to be able to name its driver. Filtering that
 * in the browser rather than the query keeps this to one composite index
 * (`carrierId` + `name`), and a carrier has drivers in the dozens at most.
 */
export async function listDriversForCarrier(carrierId: string): Promise<Driver[]> {
  if (!carrierId) return [];
  const snap = await getDocs(query(
    collection(db, COL),
    where('carrierId', '==', carrierId),
    orderBy('name', 'asc'),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Driver);
}

export async function updateDriver(
  driverId: string,
  data: Partial<Omit<Driver, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, driverId), {
    ...data,
    // Only when the name actually changed — writing it unconditionally would
    // blank the key on every edit that does not touch the name.
    ...(data.name !== undefined && { nameKey: driverNameKey(data.name) }),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deleting a driver is offered nowhere in the UI on purpose — `isActive: false`
 * is how a driver leaves, so the loads they ran keep pointing at a real record.
 * This exists for the case a record was created in error, and is used by the
 * carrier page's own "delete" on a driver with no loads behind it.
 */
export async function deleteDriver(driverId: string): Promise<void> {
  await deleteDoc(doc(db, COL, driverId));
}
