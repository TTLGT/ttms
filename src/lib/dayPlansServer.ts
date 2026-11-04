import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, FieldValue, requireCompanyUser } from './firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  TEAMS_COLLECTION,
  USERS_COLLECTION,
  can,
  isBootstrapAdmin,
  managesEmail,
  managesUid,
  normalizeEmail,
  type RoleFlags,
} from './accessControl';
import { taskItems, toTask } from './personalTasksServer';
import { fullName } from '@/types/allowedUser';
import { addDays } from '@/types/taskGame';
import { occursOn, type PersonalTask } from '@/types/task';
import { officeToday } from '@/types/celebration';
import {
  BUSY_TITLE,
  DAY_PLANS_COLLECTION,
  MAX_TEAM_PLAN_DAYS,
  dayPlanId,
  sortPlanItems,
  type DayPlan,
  type DayPlanItem,
  type DayPlanVia,
  type TeamPlanPerson,
  type TeamPlansReply,
} from '@/types/dayPlan';

/**
 * Shared day plans, server side — see src/types/dayPlan.ts for what they are
 * and why the task list itself is still never read by anybody but its owner.
 *
 * The one function here that touches `personalTasks` is `publishDayPlan()`,
 * and it is only ever called with the uid off the owner's own verified token:
 * from the task PATCH that finished their planning slot, or from their own
 * "Share again". The team view reads `dayPlans` and nothing else.
 */

const plansCol = () => adminDb.collection(DAY_PLANS_COLLECTION);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isPlanDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v);
}

/**
 * The items on somebody's own list that make up their plan for `date`: tasks
 * planned for that day and events that fall on it, series included. Archived
 * ones are left out ("Clear done" means off the board).
 *
 * Two single-field queries rather than the whole list: everything dated that
 * day, and every repeating item — a repeating event is one document for its
 * whole series, dated from its first day. A repeating *task* is a copy per
 * date, so the first query already finds it.
 */
async function planSources(uid: string, date: string): Promise<PersonalTask[]> {
  const [dated, repeating] = await Promise.all([
    taskItems(uid).where('date', '==', date).get(),
    taskItems(uid).where('repeat', 'in', ['daily', 'weekdays', 'weekly', 'monthly', 'monthlyNth']).get(),
  ]);
  const byId = new Map<string, PersonalTask>();
  for (const d of [...dated.docs, ...repeating.docs]) {
    const t = toTask(d);
    if (t.archived) continue;
    if (t.kind === 'event' ? occursOn(t, date) : t.date === date) byId.set(t.id, t);
  }
  return [...byId.values()];
}

function toItem(t: PersonalTask, busy: boolean): DayPlanItem {
  return {
    id: t.id,
    // Blanked here, before it is written: the copy never holds a title its
    // owner chose to hide, so there is nothing for a later reader to unhide.
    title: busy ? BUSY_TITLE : t.title,
    kind: t.kind,
    eventType: busy || t.kind !== 'event' ? null : t.eventType,
    start: t.time,
    end: t.endTime,
    busy,
  };
}

function readPlan(id: string, d: FirebaseFirestore.DocumentData | undefined): DayPlan | null {
  if (!d || !isPlanDate(d.date)) return null;
  const items = Array.isArray(d.items) ? (d.items as DayPlanItem[]) : [];
  const at = d.sharedAt instanceof Timestamp ? d.sharedAt.toDate().toISOString() : null;
  return {
    uid: String(d.uid ?? id.split('__')[0]),
    email: String(d.email ?? ''),
    name: String(d.name ?? ''),
    date: d.date,
    via: d.via === 'morning' || d.via === 'evening' ? d.via : 'manual',
    sharedAt: at,
    items: sortPlanItems(items),
    busyIds: Array.isArray(d.busyIds) ? (d.busyIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
  };
}

/**
 * Copy the owner's plan for `date` into `dayPlans`, replacing any earlier
 * copy of the same day. `busyIds` given replaces the stored list; omitted,
 * the stored one is kept, so finishing the slot again does not undo a
 * "Busy" somebody already chose. Ids no longer on the day are dropped.
 */
export async function publishDayPlan(
  owner: { uid: string; email: string; name: string },
  date: string,
  via: DayPlanVia,
  busyIds?: string[],
): Promise<DayPlan> {
  const ref = plansCol().doc(dayPlanId(owner.uid, date));
  const [sources, existing] = await Promise.all([planSources(owner.uid, date), ref.get()]);
  const keepBusy = new Set(busyIds ?? readPlan(ref.id, existing.data())?.busyIds ?? []);
  const items = sortPlanItems(sources.map((t) => toItem(t, keepBusy.has(t.id))));
  const stillBusy = items.filter((i) => i.busy).map((i) => i.id);
  await ref.set({
    uid: owner.uid,
    email: normalizeEmail(owner.email),
    name: owner.name,
    date,
    via,
    items,
    busyIds: stillBusy,
    sharedAt: FieldValue.serverTimestamp(),
  });
  return readPlan(ref.id, (await ref.get()).data())!;
}

/** The owner's own copy, for the panel that shows them what was shared. */
export async function myDayPlan(uid: string, date: string): Promise<DayPlan | null> {
  const snap = await plansCol().doc(dayPlanId(uid, date)).get();
  return readPlan(snap.id, snap.data());
}

/** The owner's name as the allowlist has it, falling back to the profile's. */
export async function ownerOf(req: Request): Promise<{ uid: string; email: string; name: string }> {
  const { uid, email, entry } = await requireCompanyUser(req);
  let name = entry ? fullName(entry) : '';
  if (!name) {
    const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
    name = String(snap.data()?.displayName ?? '');
  }
  return { uid, email: normalizeEmail(email), name: name || normalizeEmail(email) };
}

// ── The team view ────────────────────────────────────────────────────────────

export class TeamPlansRefused extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * Who the caller may see plans for: everybody with `plans.viewAll` (admins),
 * a Sales Manager their own team, and nobody for anybody else. The caller
 * themselves is included when they see anybody at all, so a manager's own
 * plan sits beside their team's. Leading a team grants nothing to anybody
 * but a Sales Manager, here as everywhere.
 */
export async function teamPlans(req: Request, from: string, to: string): Promise<TeamPlansReply> {
  // The guard first, as on every route: nothing about the request is looked
  // at until the caller is known to be on the allowlist and allowed here.
  const { uid, email: rawEmail } = await requireCompanyUser(req);
  const email = normalizeEmail(rawEmail);
  const profile = ((await adminDb.collection(USERS_COLLECTION).doc(uid).get()).data() ?? null) as RoleFlags | null;
  const seesAll = isBootstrapAdmin(email) || can(profile, 'plans.viewAll');
  const manager = profile?.isSalesManager === true;
  if (!seesAll && !manager) throw new TeamPlansRefused('Only admins and Sales Managers can see team plans.', 403);

  if (!isPlanDate(from) || !isPlanDate(to) || to < from) throw new TeamPlansRefused('Pick a date.', 400);
  const dates: string[] = [];
  for (let d = from; d <= to && dates.length <= MAX_TEAM_PLAN_DAYS; d = addDays(d, 1)) dates.push(d);
  if (dates.length > MAX_TEAM_PLAN_DAYS) throw new TeamPlansRefused(`Pick at most ${MAX_TEAM_PLAN_DAYS} days.`, 400);

  const [allowed, teamsSnap, plansSnap] = await Promise.all([
    adminDb.collection(ALLOWED_USERS_COLLECTION).get(),
    adminDb.collection(TEAMS_COLLECTION).get(),
    // One single-field query for the whole range. Every plan in it is read,
    // then filtered to the people the caller may see: the collection is one
    // document per person per day, so a week is at most a few hundred.
    dates.length === 1
      ? plansCol().where('date', '==', from).get()
      : plansCol().where('date', '>=', from).where('date', '<=', to).get(),
  ]);

  const people: TeamPlanPerson[] = [];
  for (const doc of allowed.docs) {
    const d = doc.data();
    const personUid = typeof d.uid === 'string' ? d.uid : null;
    // Nobody pending (no list yet) and nobody suspended.
    if (!personUid || d.suspended === true) continue;
    const visible = seesAll || personUid === uid
      || managesUid(profile, personUid) || managesEmail(profile, doc.id);
    if (!visible) continue;
    people.push({
      uid: personUid,
      email: doc.id,
      name: fullName(d) || doc.id,
      teamId: typeof d.teamId === 'string' ? d.teamId : null,
      photoPath: typeof d.photoPath === 'string' ? d.photoPath : null,
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  // A manager whose team is empty sees only themselves, which is no view.
  if (!seesAll && people.every((p) => p.uid === uid)) {
    throw new TeamPlansRefused('Nobody is on a team you lead yet. Teams are set in Settings → Teams.', 403);
  }

  const visibleUids = new Set(people.map((p) => p.uid));
  const plans: TeamPlansReply['plans'] = {};
  for (const doc of plansSnap.docs) {
    const plan = readPlan(doc.id, doc.data());
    if (!plan || !visibleUids.has(plan.uid)) continue;
    // Which item ids were blanked is the owner's business, not the reader's.
    (plans[plan.uid] ??= {})[plan.date] = { ...plan, busyIds: [], items: plan.items.map((i) => ({ ...i, id: '' })) };
  }

  const teamIds = new Set(people.map((p) => p.teamId).filter(Boolean));
  return {
    from,
    to: dates[dates.length - 1],
    today: officeToday(),
    people,
    plans,
    teams: teamsSnap.docs
      .filter((t) => teamIds.has(t.id))
      .map((t) => ({ id: t.id, name: String(t.data().name ?? '') }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
