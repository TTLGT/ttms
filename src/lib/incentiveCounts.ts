import { adminDb } from './firebase-admin';
import { OFFICE_UTC_OFFSET_MINUTES } from '@/types/attendance';
import { isBookedStatus } from '@/types/clientSnapshot';
import { shiftMonth, type GoalCounter, type MonthCounts } from '@/types/incentive';

/*
 * TTMS's counts for incentive goals — see GOAL_COUNTERS in
 * src/types/incentive.ts for what each one means.
 *
 * Worked out every time a month is read, never stored: an order reassigned or
 * cancelled after the fact is then simply counted as it is now, and there is
 * no stored number to go stale or to disagree with the records.
 *
 * Cost: two single-field range queries over the month — every order and every
 * party created in it, a few fields each. `createdAt` is indexed by Firestore
 * on its own, so neither needs a composite index. Firestore bills one read
 * per document returned, so a month's Incentives page costs roughly the
 * number of loads and parties created that month; with the sample in the
 * project today that is a handful. If the book grows back to thousands of
 * loads a month this is the line to watch on the Usage tab — and it runs only
 * for months that have at least one counted goal.
 */

/** Office midnight on the 1st of `month`, to the same on the 1st of the next. */
function monthBounds(month: string): { start: Date; end: Date } {
  const at = (m: string) => new Date(Date.parse(`${m}-01T00:00:00Z`) - OFFICE_UTC_OFFSET_MINUTES * 60_000);
  return { start: at(month), end: at(shiftMonth(month, 1)) };
}

type Row = Record<string, unknown>;

const uidList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** A party that is a client, or has no role yet (a client is what the Add Client form makes). */
function isClientParty(p: Row): boolean {
  const roles = uidList(p.roles);
  return roles.length === 0 || roles.includes('client');
}

export async function countMonth(month: string, uids: string[], counters: GoalCounter[]): Promise<MonthCounts> {
  const counts: MonthCounts = Object.fromEntries(uids.map((u) => [u, {}]));
  if (!uids.length || !counters.length) return counts;
  const people = new Set(uids);
  const { start, end } = monthBounds(month);

  const [orderSnap, partySnap] = await Promise.all([
    adminDb.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end)
      .select('createdBy', 'parentOrderId', 'status', 'clientId', 'brokerFee').get(),
    adminDb.collection('parties').where('createdAt', '>=', start).where('createdAt', '<', end)
      .select('assignedToUids', 'roles').get(),
  ]);

  // Client records added this month, and who owns each.
  const newClientOwners = new Map<string, string[]>();
  for (const d of partySnap.docs) {
    const p = d.data() as Row;
    if (isClientParty(p)) newClientOwners.set(d.id, uidList(p.assignedToUids));
  }

  const add = (uid: string, counter: GoalCounter, by = 1) => {
    if (!people.has(uid)) return;
    const row = counts[uid];
    row[counter] = (row[counter] ?? 0) + by;
  };

  const bookedNewClients = new Set<string>();
  for (const d of orderSnap.docs) {
    const o = d.data() as Row;
    // A suborder is the same piece of work as its parent.
    if (o.parentOrderId) continue;
    const by = typeof o.createdBy === 'string' ? o.createdBy : '';
    const clientId = typeof o.clientId === 'string' ? o.clientId : '';
    const booked = isBookedStatus(String(o.status ?? ''));
    add(by, 'quotes');
    if (clientId && newClientOwners.has(clientId)) add(by, 'quotesNewClients');
    if (booked) {
      add(by, 'bookedLoads');
      const fee = Number(o.brokerFee);
      if (Number.isFinite(fee) && fee > 0) add(by, 'brokerFee', fee);
      if (clientId && newClientOwners.has(clientId)) bookedNewClients.add(clientId);
    }
  }

  for (const [clientId, owners] of newClientOwners) {
    for (const uid of owners) {
      add(uid, 'newClients');
      if (bookedNewClients.has(clientId)) add(uid, 'newClientsBooked');
    }
  }

  // Dollars to the cent, so a sum of fees never shows $1,234.5600000001.
  for (const row of Object.values(counts)) {
    if (row.brokerFee !== undefined) row.brokerFee = Math.round(row.brokerFee * 100) / 100;
  }
  return counts;
}
