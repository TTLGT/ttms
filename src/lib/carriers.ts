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
  limit as limitTo,
  startAfter,
  getCountFromServer,
  serverTimestamp,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Carrier } from '@/types/carrier';
import { carrierNameKey } from '@/types/carrier';

const COL = 'carriers';

/**
 * Carriers are read straight from Firestore rather than through an API route,
 * unlike orders and parties. That is safe here because they are not owned
 * records — the rules let any allowed user read the whole collection — so
 * there is no visibility union for a server to work out. What there *is* is
 * eleven thousand of them, which is why nothing below fetches them all.
 */

export async function createCarrier(
  data: Omit<Carrier, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    // Written on every save so search keeps working. See carrierNameKey.
    nameKey: carrierNameKey(data.companyName),
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

export interface CarrierQuery {
  /** Page size. */
  limit?: number;
  /** The last carrier of the previous page. */
  after?: QueryDocumentSnapshot | null;
  /** Name prefix, DOT, or MC. Matched by the server, not in the browser. */
  search?: string;
  /** false includes inactive carriers as well. */
  activeOnly?: boolean;
}

export interface CarrierPage {
  carriers: Carrier[];
  /** Feed back as `after`. null when the last page has been served. */
  cursor: QueryDocumentSnapshot | null;
}

/**
 * One page of carriers, by name.
 *
 * The list used to read all eleven thousand — six megabytes and about ten
 * seconds — and filter them in the browser as the user typed. Both halves of
 * that are now the database's job.
 *
 * Search is a prefix match, not a substring one: Firestore has no substring
 * index, and the alternative is downloading the collection to run `includes`
 * over it, which is exactly the cost being removed here. Typing a DOT or MC
 * number matches it exactly instead — those are the two lookups that have to
 * be precise anyway, because a broker checking authority wants that carrier,
 * not one whose number contains those digits.
 */
export async function listCarriersPage(q: CarrierQuery = {}): Promise<CarrierPage> {
  const search = (q.search ?? '').trim();
  const constraints: QueryConstraint[] = [];

  // A search that is all digits is a DOT or MC number. Both are tried, because
  // a broker reading a number off a rate confirmation rarely says which it is.
  if (/^\d+$/.test(search)) {
    const [byDot, byMc] = await Promise.all([
      getDocs(query(collection(db, COL), where('dot', '==', search), limitTo(25))),
      getDocs(query(collection(db, COL), where('mc',  '==', search), limitTo(25))),
    ]);
    const byId = new Map<string, Carrier>();
    for (const d of [...byDot.docs, ...byMc.docs]) {
      byId.set(d.id, { id: d.id, ...d.data() } as Carrier);
    }
    const found = [...byId.values()].filter((c) => !q.activeOnly || c.isActive);
    // An exact-number lookup returns everything it found in one go — there is
    // no meaningful second page of "the carrier with this DOT".
    return { carriers: found, cursor: null };
  }

  if (search) {
    // U+F8FF sorts above any character that appears in a name, so the pair
    // bounds every key starting with the typed text. Written as an escape
    // rather than the literal character, which not every editor preserves.
    const key = carrierNameKey(search);
    constraints.push(where('nameKey', '>=', key), where('nameKey', '<', key + '\uf8ff'));
    constraints.push(orderBy('nameKey', 'asc'));
  } else {
    constraints.push(orderBy('companyName', 'asc'));
  }

  if (q.activeOnly) constraints.unshift(where('isActive', '==', true));
  if (q.after) constraints.push(startAfter(q.after));

  const size = q.limit ?? 50;
  // One more than asked for, to learn whether a next page exists.
  constraints.push(limitTo(size + 1));

  const snap = await getDocs(query(collection(db, COL), ...constraints));
  const docs = snap.docs.slice(0, size);
  return {
    carriers: docs.map((d) => ({ id: d.id, ...d.data() }) as Carrier),
    cursor:   snap.docs.length > size ? docs[docs.length - 1] : null,
  };
}

/**
 * How many carriers are active and how many are not.
 *
 * An aggregation rather than a length: the header used to read this off the
 * fully-loaded list, which was the reason the list had to be fully loaded.
 * count() bills one document read per thousand counted, so both numbers
 * together cost about twenty-two reads instead of eleven thousand.
 */
export async function countCarriers(): Promise<{ active: number; inactive: number }> {
  const [all, active] = await Promise.all([
    getCountFromServer(query(collection(db, COL))),
    getCountFromServer(query(collection(db, COL), where('isActive', '==', true))),
  ]);
  const total = all.data().count;
  const live  = active.data().count;
  return { active: live, inactive: total - live };
}

/**
 * Every carrier, for the pickers that need a full dropdown.
 *
 * Eleven thousand documents and about ten seconds — use `listCarriersPage`
 * anywhere a person is browsing or searching.
 */
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
    // Only when the name actually changed — writing it unconditionally would
    // blank the key on every edit that does not touch companyName.
    ...(data.companyName !== undefined && { nameKey: carrierNameKey(data.companyName) }),
    updatedAt: serverTimestamp(),
  });
}
