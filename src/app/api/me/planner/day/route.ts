import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { taskOwnerDoc } from '@/lib/personalTasksServer';
import { dueToday } from '@/lib/attendanceServer';
import { officeToday } from '@/types/celebration';
import { readTodayPicks } from '@/types/planner';
import { nextSnoozeMinutes, readDailyPlan, type DailyPlanState } from '@/types/dailyPlan';

/**
 * The caller's answer to today's planning pop-up — see src/types/dailyPlan.ts.
 *
 * Same shape as every /api/me route: the uid and email off the ID token, no
 * parameter for whose day. Stored on the list's parent document beside
 * Today's 3, so it is exactly as private as the list.
 *
 * `GET` answers the day's state, the caller's shift today (null when it is
 * not a working day for them — schedule, holiday, or time off, pending
 * included), and how many of Today's 3 are picked, which is what keeps the
 * "Just one thing" bar up. Reads: the owner document plus `dueToday()`'s few
 * small ones. The browser asks once per page load only while the day is
 * still undecided.
 *
 * `PATCH { action }` records an answer. The server keeps the count and the
 * clock: a snooze's length comes from how many were used before, never from
 * the request, so "Remind me in 15 minutes" cannot be asked for a third time.
 */

async function stateOf(uid: string, today: string): Promise<{ state: DailyPlanState; picks: number }> {
  const snap = await taskOwnerDoc(uid).get();
  const d = snap.data() ?? {};
  const picks = readTodayPicks(d.todayPicks);
  return { state: readDailyPlan(d.dailyPlan, today), picks: picks && picks.date === today ? picks.ids.length : 0 };
}

export async function GET(req: NextRequest) {
  try {
    const { uid, email } = await requireCompanyUser(req);
    const today = officeToday();
    const [{ state, picks }, shift] = await Promise.all([
      stateOf(uid, today),
      email ? dueToday(email.toLowerCase(), today, Date.now()) : Promise.resolve(null),
    ]);
    return NextResponse.json({ today, state, shift, picks });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

const ACTIONS = ['snooze', 'planned', 'one', 'off', 'closed', 'closeSkipped'] as const;
type Action = typeof ACTIONS[number];

export async function PATCH(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action;
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'What happened to the plan?' }, { status: 400 });
    }
    const today = officeToday();
    const ref = taskOwnerDoc(uid);

    // A transaction, because two tabs can both be showing the pop-up and the
    // snooze count is the thing that must not be lost between them.
    const state = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const s = readDailyPlan(snap.data()?.dailyPlan, today);
      const now = Date.now();
      switch (action) {
        case 'snooze': {
          const minutes = nextSnoozeMinutes(s.snoozes);
          if (minutes === null) throw new Refused('No more snoozes today — plan just one thing to get back to work.');
          // A snooze never undoes a plan already made in another tab.
          if (s.status === 'planned' || s.status === 'one') return s;
          s.status = 'snoozed';
          s.snoozes += 1;
          s.snoozedUntil = now + minutes * 60_000;
          break;
        }
        case 'planned':
        case 'one':
          // A whole plan made after "Just one thing" replaces it; one thing never downgrades a plan.
          if (action === 'one' && s.status === 'planned') return s;
          s.status = action;
          s.full = action === 'planned' && body?.full === true;
          s.plannedAt = new Date(now).toISOString();
          s.snoozedUntil = null;
          break;
        case 'off':
          s.status = 'off';
          s.snoozedUntil = null;
          break;
        case 'closed':
        case 'closeSkipped':
          s.closedAt = new Date(now).toISOString();
          s.closeSkipped = action === 'closeSkipped';
          break;
      }
      tx.set(ref, { dailyPlan: s, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return s;
    });
    return NextResponse.json({ state });
  } catch (e) {
    if (e instanceof Refused) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

class Refused extends Error {}
