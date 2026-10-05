/**
 * The streak on My tasks that runs whether or not game mode is on: how many
 * working days in a row somebody finished something, and how much they have
 * finished today and ever. Kept on `personalTasks/{uid}.streak`.
 *
 * It is the plain cousin of game mode's streak (src/types/taskGame.ts) and
 * uses the same calendar — Monday to Friday, frozen on Guatemalan holidays and
 * on the person's own time off — so the two never disagree about what a
 * working day is. What it does not have is a price: nothing is charged for a
 * broken streak here. It simply reads 0 again.
 *
 * **"Finished something" is a task or a step**, counted the first time only
 * (`everDone` on each), so ticking the same box on and off does not pad the
 * count or keep a streak alive. A big task worked through over a week still
 * keeps the streak going, one step a day.
 *
 * Like the game, it is only ever worked out when it is read or when a save
 * moves it — there is no job — and it is the person's own: nothing ranks or
 * reports on it.
 *
 * Pure: no Firestore, no clock except the dates passed in.
 */

import { prevWorkingDay } from './taskGame';

export interface TaskStreak {
  current: number;
  longest: number;
  /** Office date something was last finished on. */
  lastActiveDate: string | null;
  /** The office date the two "today" counts belong to. */
  day: string | null;
  todayTasks: number;
  todaySteps: number;
  totalTasks: number;
  totalSteps: number;
}

export const EMPTY_TASK_STREAK: TaskStreak = {
  current: 0, longest: 0, lastActiveDate: null, day: null,
  todayTasks: 0, todaySteps: 0, totalTasks: 0, totalSteps: 0,
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function cleanTaskStreak(raw: unknown): TaskStreak {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    current: num(r.current),
    longest: num(r.longest),
    lastActiveDate: str(r.lastActiveDate),
    day: str(r.day),
    todayTasks: num(r.todayTasks),
    todaySteps: num(r.todaySteps),
    totalTasks: num(r.totalTasks),
    totalSteps: num(r.totalSteps),
  };
}

/**
 * Whether reading the streak right needs the person's time off. Only when it
 * would otherwise look broken: on any ordinary day the last active date is
 * the last working day or today, and no query is spent finding that out.
 */
export function streakNeedsOffDays(s: TaskStreak, today: string): boolean {
  return s.current > 0 && !!s.lastActiveDate && s.lastActiveDate < prevWorkingDay(today);
}

/** The streak as it stands today: 0 once a working day has gone by without anything finished. */
export function liveTaskStreak(s: TaskStreak, today: string, offDays?: ReadonlySet<string>): TaskStreak {
  const out = { ...s };
  if (out.lastActiveDate && out.lastActiveDate < prevWorkingDay(today, offDays)) out.current = 0;
  if (out.day !== today) { out.day = today; out.todayTasks = 0; out.todaySteps = 0; }
  return out;
}

/**
 * Something was finished for the first time. The streak grows by one the
 * first time on any day, and starts again at 1 if a working day was missed —
 * the same rule as game mode's, see GameTurn.markActive().
 */
export function recordTaskProgress(
  s: TaskStreak,
  today: string,
  offDays: ReadonlySet<string> | undefined,
  done: { tasks: number; steps: number },
): TaskStreak {
  const out = liveTaskStreak(s, today, offDays);
  if (done.tasks + done.steps <= 0) return out;
  if (out.lastActiveDate !== today) {
    out.current = out.lastActiveDate && out.lastActiveDate >= prevWorkingDay(today, offDays) ? out.current + 1 : 1;
    out.longest = Math.max(out.longest, out.current);
    out.lastActiveDate = today;
  }
  out.todayTasks += done.tasks;
  out.todaySteps += done.steps;
  out.totalTasks += done.tasks;
  out.totalSteps += done.steps;
  return out;
}
