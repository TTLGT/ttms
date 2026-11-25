import { adminDb } from './firebase-admin';
import { ALLOWED_USERS_COLLECTION, USERS_COLLECTION, isBootstrapAdmin, normalizeEmail } from './accessControl';
import { taskOwnerDoc } from './personalTasksServer';
import { postTaskNotice } from './personalTaskReminders';
import { dueToday } from './attendanceServer';
import { APP_URL } from './appUrl';
import { officeToday } from '@/types/celebration';
import { plannerState, readPlannerRollout, type PlannerChoice } from '@/types/planner';
import { PLAN_NOW_PARAM, PLAN_NUDGE_LEAD, closeDayAt, readDailyPlan } from '@/types/dailyPlan';
import { officeNowTime } from '@/types/planning';

/*
 * The Planner's 10:00 nudge: one line in the person's own reminders room
 * (`notice_tasks_{uid}`, the same room task reminders use) for anybody on the
 * new Planner who is working today and has not planned yet, with a button
 * that opens the planning pop-up. See src/types/dailyPlan.ts.
 *
 * **The sixth clock, and still not a precedent.** It posts a line and grants
 * or removes nothing — the same footing as the attendance alerts. Missing a
 * run costs one quiet morning.
 *
 * - **Once a day.** `plannerNudgeRuns/{YYYY-MM-DD}` is claimed with
 *   `create()`, so a cron delivered twice does not nudge twice — the
 *   celebrations post's lock, for the same at-least-once reason.
 * - **Only people the Planner has reached**, by `plannerState()` — the rule
 *   the sidebar uses — so nobody on the old pages is told about a pop-up they
 *   do not have.
 * - **Only somebody working today** (`dueToday()`: schedule, holidays, time
 *   off, pending included) and only before their close-of-day time.
 * - **The allowlist is checked again** before anything is sent: a person
 *   removed or suspended since their profile was written is not messaged.
 *
 * Reads: the rollout, the profiles, the allowlist entries of those it
 * reaches, then per person their list's owner document and dueToday()'s few.
 * For an office of a few dozen, a couple of hundred reads once a day.
 */

const RUNS = 'plannerNudgeRuns';

export interface PlannerNudgeRun {
  date: string;
  skipped?: 'already-ran' | 'nobody-has-it';
  considered: number;
  nudged: number;
  failed: number;
}

export async function runPlannerNudge(now = Date.now()): Promise<PlannerNudgeRun> {
  const date = officeToday();
  const run: PlannerNudgeRun = { date, considered: 0, nudged: 0, failed: 0 };

  const rollout = readPlannerRollout((await adminDb.collection('appSettings').doc('general').get()).data()?.plannerRollout);
  if (rollout.stage === 'nobody') return { ...run, skipped: 'nobody-has-it' };

  try {
    await adminDb.collection(RUNS).doc(date).create({ startedAt: new Date(now) });
  } catch {
    return { ...run, skipped: 'already-ran' };
  }

  const users = await adminDb.collection(USERS_COLLECTION).get();
  const reached = users.docs.filter((u) => {
    const d = u.data();
    const email = normalizeEmail(d.email);
    if (!email) return false;
    const choice = (d.preferences?.planner ?? null) as PlannerChoice | null;
    return plannerState({ stage: rollout.stage, chosen: rollout.chosenEmails.includes(email) }, choice).on;
  });

  const entries = reached.length
    ? await adminDb.getAll(...reached.map((u) => adminDb.collection(ALLOWED_USERS_COLLECTION).doc(normalizeEmail(u.data().email))))
    : [];

  const nowTime = officeNowTime(now);
  const link = `${APP_URL}/dashboard/planner?${PLAN_NOW_PARAM}=1`;

  await Promise.all(reached.map(async (u, i) => {
    const email = normalizeEmail(u.data().email);
    const entry = entries[i];
    const allowed = isBootstrapAdmin(email) || (entry.exists && entry.data()?.suspended !== true);
    if (!allowed) return;
    run.considered++;
    try {
      const [owner, shift] = await Promise.all([taskOwnerDoc(u.id).get(), dueToday(email, date, now)]);
      if (!shift || nowTime >= closeDayAt(shift)) return;
      const state = readDailyPlan(owner.data()?.dailyPlan, date);
      // A running snooze still counts as not planned: they have seen the
      // pop-up and put it off, and a line in chat is the gentlest next step.
      if (state.status === 'planned' || state.status === 'one' || state.status === 'off') return;
      await postTaskNotice(u.id, `${PLAN_NUDGE_LEAD} It takes about a minute: ${link}`, 'alert');
      run.nudged++;
    } catch (e) {
      run.failed++;
      console.error('Planner nudge failed', e instanceof Error ? e.message : e);
    }
  }));

  return run;
}
