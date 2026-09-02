/**
 * How much work one person is carrying: clients owned, loads still open.
 *
 * The two numbers on a directory page's book-of-business panel. Who may see
 * them is `canSeeBookOfBusiness()` in accessControl.ts; this file answers the
 * separate question of **what gets counted**, and the two are deliberately not
 * the same test.
 *
 * ## The viewer never counts what they cannot see
 *
 * Every row read here is put through `canSeeOrder()` / `canSeeParty()` against
 * the *viewer* before it is counted, so the panel can never become a way to
 * learn the size of a book you are not entitled to read. In practice the filter
 * removes nothing — the people who pass the gate are admin, dispatch, finance
 * and the subject's own manager, all of whom already see these records — and
 * that is exactly why it is worth keeping. A permission granted to one more
 * person one day must not silently turn this into a leak.
 *
 * ## Why it is not `listVisibleOrders(caller)` filtered down
 *
 * That would be the obvious way to guarantee the paragraph above, and it is
 * unusable: for an admin it reads every order in the company — ten thousand
 * documents and about seventeen seconds — to produce a two-digit number. The
 * queries below start from the **subject's** records instead, which is a set
 * bounded by one person's book, and then apply the same per-record test the
 * list would have applied. Same guarantee, three queries.
 *
 * ## What "theirs" means
 *
 * The two routes `canSeeOrder()` grants a person: the load assigned to them,
 * and the load's client owned by them. Work groups are deliberately left out.
 * A group's book belongs to everyone in it, so counting it here would credit
 * the same loads to three people at once and make the numbers uncomparable —
 * which is the one thing a figure like this gets used for. The panel says so
 * on screen rather than leaving it to be discovered.
 */

import { adminDb } from './firebase-admin';
import { canSeeOrder, canSeeParty } from './accessControl';
import type { Caller } from './partyAccess';
import type { OwnerFilter } from './ownerFilter';
import { ORDER_STATUSES } from '@/types/order';

/**
 * Still open: everything that is not finished and not called off.
 *
 * The same definition as the dashboard's "Active Orders" card and its busiest-
 * clients tally, so a broker's own dashboard and their manager's view of them
 * cannot disagree about how many loads they are running.
 *
 * Written as an `in` rather than `not-in ['completed','cancelled']` because
 * this is combined with an `array-contains` and an equality: an `in` is a plain
 * disjunction of equalities, where a `not-in` brings inequality semantics along
 * with it — and because it says on the page which seven statuses are meant.
 */
const OPEN_STATUSES: readonly string[] =
  ORDER_STATUSES.filter((s) => s !== 'completed' && s !== 'cancelled');

/** Exactly the fields `canSeeOrder()` reads. Nothing else is rendered. */
const ORDER_OWNER_FIELDS = [
  'assignedToUids', 'assignedToGroupIds', 'assignedToEmails',
  'clientOwnerUids', 'clientOwnerGroupIds',
] as const;

/** Exactly the fields `canSeeParty()` reads, plus the roles to filter on. */
const PARTY_OWNER_FIELDS = [
  'roles', 'assignedToUids', 'assignedToName', 'assignedToGroupIds', 'assignedToEmails',
] as const;

export interface BookOfBusiness {
  /** Parties this person owns that have been used as a client. */
  clients: number;
  /** Top-level loads of theirs that are neither completed nor cancelled. */
  openLoads: number;
}

/**
 * The subject's two numbers, as the caller is entitled to count them.
 *
 * Costs roughly one document read per record in the subject's book — a few
 * hundred on the current data. That is the price of counting distinct owned
 * records at all: Firestore's `count()` cannot be used, because a load can be
 * theirs by two routes at once and the overlap between two `array-contains`
 * queries is not something an aggregation can subtract.
 */
export async function bookOfBusiness(
  caller: Caller,
  subject: OwnerFilter,
): Promise<BookOfBusiness> {
  const [openLoads, clients] = await Promise.all([
    countOpenLoads(caller, subject),
    countClients(caller, subject),
  ]);
  return { openLoads, clients };
}

async function countOpenLoads(caller: Caller, subject: OwnerFilter): Promise<number> {
  const col = adminDb.collection('orders');
  // Suborders are excluded for the same reason the Orders list hides them: a
  // load split across two carriers is one piece of work being run, and counting
  // it twice would flatter whoever splits the most.
  const open = (q: FirebaseFirestore.Query) =>
    q.where('parentOrderId', '==', null)
      .where('status', 'in', [...OPEN_STATUSES])
      .select(...ORDER_OWNER_FIELDS)
      .get();

  const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [
    // Held under the address rather than a uid until first sign-in. Run even
    // for somebody who has signed in: claimPendingAssignments() converts these
    // at that moment, and a query returning nothing is cheaper than trusting
    // that it never missed one.
    open(col.where('assignedToEmails', 'array-contains', subject.email)),
  ];
  if (subject.uid) {
    queries.push(
      open(col.where('assignedToUids', 'array-contains', subject.uid)),
      // The second route in: they own the client, so its loads are theirs even
      // when somebody else is running them. See clientOwnerUids on Order.
      open(col.where('clientOwnerUids', 'array-contains', subject.uid)),
    );
  }

  const snaps = await Promise.all(queries);
  // De-duplicated by id: a load assigned to the person whose client they also
  // own comes back from two of the three queries, and that is the normal case
  // rather than the exception.
  const byId = new Map<string, FirebaseFirestore.DocumentData>();
  for (const snap of snaps) for (const d of snap.docs) byId.set(d.id, d.data());

  let count = 0;
  for (const order of byId.values()) {
    if (canSeeOrder(order, caller.uid, caller.profile)) count += 1;
  }
  return count;
}

async function countClients(caller: Caller, subject: OwnerFilter): Promise<number> {
  const col = adminDb.collection('parties');
  // No `roles array-contains 'client'` on the query: Firestore allows one
  // array-contains per query and the ownership field is the one that narrows.
  // The role is checked below, over a set the size of one person's book.
  const owned = (q: FirebaseFirestore.Query) => q.select(...PARTY_OWNER_FIELDS).get();

  const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [
    owned(col.where('assignedToEmails', 'array-contains', subject.email)),
  ];
  if (subject.uid) {
    queries.push(owned(col.where('assignedToUids', 'array-contains', subject.uid)));
  }

  const snaps = await Promise.all(queries);
  const byId = new Map<string, FirebaseFirestore.DocumentData>();
  for (const snap of snaps) for (const d of snap.docs) byId.set(d.id, d.data());

  let count = 0;
  for (const party of byId.values()) {
    // `roles` records the roles a party has actually been used in, so this is
    // "companies they have booked a load for", not "companies filed under
    // clients" — a shipper they happen to own is not part of their book.
    if (!(party.roles ?? []).includes('client')) continue;
    if (canSeeParty(party, caller.uid, caller.profile)) count += 1;
  }
  return count;
}
