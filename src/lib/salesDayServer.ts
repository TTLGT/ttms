import { adminDb, FieldValue } from './firebase-admin';
import {
  ALLOWED_USERS_COLLECTION, can, isBootstrapAdmin, managesUid, normalizeEmail,
} from './accessControl';
import type { Caller } from './partyAccess';
import { fullName } from '@/types/allowedUser';
import { OFFICE_UTC_OFFSET_MINUTES } from '@/types/attendance';
import {
  DEFAULT_SALES_TARGETS, MAX_TALLY, SALES_DAYS_COLLECTION, SALES_TARGETS_COLLECTION, readTallies, readTargets,
  salesDayId, sellsLoads, type SalesDay, type SalesPerson, type SalesTargets, type TappedMetric,
} from '@/types/salesDay';

/*
 * A broker's daily numbers, server side — see src/types/salesDay.ts.
 *
 * Two collections, both closed to the browser by having no rule at all:
 *  - `salesTargets/{uid}` — the standing targets a Sales Manager or admin set;
 *  - `salesDays/{uid}__{YYYY-MM-DD}` — one day: the taps, and the targets if
 *    the broker changed them for that day.
 *
 * The two counted numbers are worked out on read, never stored: loads the
 * person created today and clients they own that were added today. Both are
 * one single-field range over today's records — `createdAt` is indexed by
 * Firestore on its own — read once and shared out, so a team's numbers cost
 * the same two queries as one person's.
 */

const targetsCol = () => adminDb.collection(SALES_TARGETS_COLLECTION);
const daysCol = () => adminDb.collection(SALES_DAYS_COLLECTION);

export class SalesRefused extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Office midnight to midnight for `date`, as Dates. */
function officeDayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${date}T00:00:00Z`) - OFFICE_UTC_OFFSET_MINUTES * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** Today's counted numbers for each of these people. */
async function countedFor(uids: string[], date: string): Promise<Map<string, { quotes: number; leads: number }>> {
  const out = new Map(uids.map((u) => [u, { quotes: 0, leads: 0 }]));
  if (!uids.length) return out;
  const { start, end } = officeDayBounds(date);
  const [orders, parties] = await Promise.all([
    adminDb.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end)
      .select('createdBy', 'parentOrderId').get(),
    adminDb.collection('parties').where('createdAt', '>=', start).where('createdAt', '<', end)
      .select('assignedToUids', 'roles').get(),
  ]);
  for (const d of orders.docs) {
    const o = d.data();
    // A suborder is the same piece of work as its parent.
    if (o.parentOrderId) continue;
    const row = out.get(String(o.createdBy ?? ''));
    if (row) row.quotes++;
  }
  for (const d of parties.docs) {
    const p = d.data();
    // A shipper or consignee added for a load is not a new client.
    const roles: string[] = Array.isArray(p.roles) ? p.roles : [];
    if (roles.length && !roles.includes('client')) continue;
    for (const u of (Array.isArray(p.assignedToUids) ? p.assignedToUids : []) as string[]) {
      const row = out.get(u);
      if (row) row.leads++;
    }
  }
  return out;
}

/** Several people's days at once — the team view, or one person's own. */
export async function salesDaysFor(uids: string[], date: string): Promise<SalesDay[]> {
  if (!uids.length) return [];
  const [targetSnaps, daySnaps, counted] = await Promise.all([
    adminDb.getAll(...uids.map((u) => targetsCol().doc(u))),
    adminDb.getAll(...uids.map((u) => daysCol().doc(salesDayId(u, date)))),
    countedFor(uids, date),
  ]);
  return uids.map((uid, i) => {
    const standing = readTargets(targetSnaps[i].data()?.targets);
    const day = daySnaps[i].data() ?? {};
    const adjusted = !!day.targets;
    const tallies = readTallies(day.tallies);
    const c = counted.get(uid) ?? { quotes: 0, leads: 0 };
    return {
      uid,
      date,
      targets: adjusted ? readTargets(day.targets, standing) : standing,
      adjusted,
      standing,
      done: { ...tallies, quotes: c.quotes, leads: c.leads },
    };
  });
}

/** One tap, up or down. Never below zero, never past MAX_TALLY. */
export async function tap(uid: string, date: string, metric: TappedMetric, delta: 1 | -1): Promise<void> {
  const ref = daysCol().doc(salesDayId(uid, date));
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const tallies = readTallies(snap.data()?.tallies);
    tallies[metric] = Math.max(0, Math.min(MAX_TALLY, tallies[metric] + delta));
    tx.set(ref, { uid, date, tallies, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** The broker's own change to one day's targets. The standing ones are untouched. */
export async function setDayTargets(uid: string, date: string, raw: unknown): Promise<void> {
  const standing = readTargets((await targetsCol().doc(uid).get()).data()?.targets);
  const targets = readTargets(raw, standing);
  await daysCol().doc(salesDayId(uid, date)).set(
    { uid, date, targets, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

// ── Who may see and set whose ────────────────────────────────────────────────

/** `sales.viewAll`, or a bootstrap admin. Also the rule for leads (lib/clientSalesServer.ts). */
export function seesEveryone(caller: Caller): boolean {
  return isBootstrapAdmin(caller.email) || can(caller.profile, 'sales.viewAll');
}

/** May the caller read this person's numbers? Themselves, their own team, or `sales.viewAll`. */
export function maySee(caller: Caller, uid: string): boolean {
  return uid === caller.uid || seesEveryone(caller) || managesUid(caller.profile, uid);
}

/**
 * May the caller set this person's standing targets? `incentives.manage` —
 * the permission that already sets each person's incentive targets — and
 * then an admin for anybody, a Sales Manager for their own team.
 */
export function maySetTargets(caller: Caller, uid: string): boolean {
  if (!can(caller.profile, 'incentives.manage') && !isBootstrapAdmin(caller.email)) return false;
  return caller.profile.isAdmin === true || isBootstrapAdmin(caller.email) || managesUid(caller.profile, uid);
}

/**
 * The people with daily numbers the caller may see: brokers and Sales
 * Managers (`sellsLoads()`), signed in at least once, not suspended. Roles
 * are read off the allowlist, which is their source of truth.
 */
export async function visibleSellers(caller: Caller): Promise<SalesPerson[]> {
  const everyone = seesEveryone(caller);
  if (!everyone && !(caller.profile.managedUids?.length)) {
    throw new SalesRefused('Only admins and Sales Managers can see team numbers.', 403);
  }
  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
  const out: SalesPerson[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const uid = typeof d.uid === 'string' ? d.uid : null;
    if (!uid || d.suspended === true || !sellsLoads(d)) continue;
    if (!maySee(caller, uid)) continue;
    out.push({
      uid,
      email: normalizeEmail(doc.id),
      name: fullName(d) || doc.id,
      teamId: typeof d.teamId === 'string' ? d.teamId : null,
      photoPath: typeof d.photoPath === 'string' ? d.photoPath : null,
      canSetTargets: maySetTargets(caller, uid),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A manager's or admin's change to somebody's standing targets. */
export async function setStandingTargets(caller: Caller, uid: string, raw: unknown): Promise<SalesTargets> {
  if (!maySetTargets(caller, uid)) {
    throw new SalesRefused('Only an admin, or this person’s Sales Manager, can set their targets.', 403);
  }
  const targets = readTargets(raw, DEFAULT_SALES_TARGETS);
  await targetsCol().doc(uid).set({
    targets,
    setByUid: caller.uid,
    setByName: caller.displayName,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return targets;
}
