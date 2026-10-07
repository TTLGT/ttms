/**
 * Planning prompts: a card that asks somebody to put planning time on their
 * own calendar — a morning look at the day, an end-of-day plan for tomorrow,
 * a Friday plan for next week and a last-Friday plan for next month — and
 * does it for them in one click, as a task with a reminder at the time they
 * pick.
 *
 * It sits on top of the personal task list (src/types/task.ts) and adds
 * nothing to what that list can do: the slot is an ordinary task on the
 * person's own list, which they can move, edit or delete like any other. All
 * this adds is the asking, and a pointer back to the task so the card knows
 * when to stop.
 *
 * **The two daily ones need not repeat.** People plan at different times on
 * different days, so the morning and end-of-day slots are "just this once"
 * unless the person ticks "every weekday" — and a one-off counts as covering
 * its own day only, so the card asks again the next working day. Weekly and
 * monthly always repeat.
 *
 * Stored on the owner document, `personalTasks/{uid}.planning`, beside the
 * board's columns and the reminder settings — so it is as private as the list
 * itself and read through the same route shape (`/api/me/planning`).
 *
 * **It nags once per period at most, and never after "Don't ask again".**
 * "Not now" puts a kind off until the next day, Monday or first of the month;
 * "Don't ask again" stops it until the person turns it back on from the
 * Calendar page. A prompt that keeps coming back after being waved away
 * teaches people to click it shut without reading.
 */

import { OFFICE_UTC_OFFSET_MINUTES, STANDARD_SCHEDULE } from './attendance';
import { officeToday } from './celebration';
import { NTH_LAST, type TaskRepeat } from './task';

export const PLANNING_KINDS = ['morning', 'evening', 'weekly', 'monthly'] as const;
export type PlanningKind = typeof PLANNING_KINDS[number];

export function isPlanningKind(v: unknown): v is PlanningKind {
  return typeof v === 'string' && (PLANNING_KINDS as readonly string[]).includes(v);
}

/** The two that happen every working day, and may be one-offs. */
export function isDailyKind(kind: PlanningKind): boolean {
  return kind === 'morning' || kind === 'evening';
}

/** Wording per kind. The task's title is what lands on the board and in the reminder. */
export const PLANNING_COPY: Record<PlanningKind, {
  label: string; title: string; prompt: string; ask: string; detail: string; steps: string[];
}> = {
  // The morning one is a review, not a fresh plan: anybody who did the
  // end-of-day one already has today planned, and is told so.
  morning: {
    label: 'Morning review',
    title: 'Review my plan for today',
    prompt: 'Start the day with your plan in front of you.',
    ask: 'When will you go over today’s plan?',
    detail: 'Look over what you planned for today and adjust it — or make the plan now if you have not yet.',
    steps: [
      'Check today on my calendar and my queue',
      'Make sure the three things that matter most are at the top',
      'Move anything that will not fit today',
    ],
  },
  evening: {
    label: 'End-of-day planning',
    title: 'Plan tomorrow',
    prompt: 'Finish today by planning tomorrow.',
    ask: 'When will you plan tomorrow?',
    detail: 'Before you log off: what is left over, what is due tomorrow, and what goes first.',
    steps: [
      'Move whatever did not get done today',
      'Check tomorrow on my calendar',
      'Pick the three things that matter most tomorrow',
    ],
  },
  weekly: {
    label: 'Weekly planning',
    title: 'Plan next week',
    prompt: 'Finish the week by planning the next one.',
    ask: 'When will you plan next week?',
    detail: 'On Friday: what is due next week, who to follow up with, and what can wait.',
    steps: [
      'Look over next week on my calendar',
      'List the loads and clients to follow up',
      'Move anything that can wait',
    ],
  },
  monthly: {
    label: 'Monthly planning',
    title: 'Plan next month',
    prompt: 'Close out the month by planning the next one.',
    ask: 'When will you plan next month?',
    detail: 'On the last Friday: how this month went, what you want from the next, and the big dates to put on the calendar.',
    steps: [
      'Review how this month went',
      'Set my goals for next month',
      'Put the big dates on my calendar',
    ],
  },
};

/**
 * Where the card starts the time wheel, office time. The two daily ones move
 * to the person's own shift once the card has read it — the start of the day
 * and just before its end — unless the person has already picked a time.
 */
export const PLANNING_DEFAULT_TIME: Record<PlanningKind, string> = {
  morning: '07:00',
  evening: '16:30',
  weekly: '08:30',
  monthly: '10:00',
};

/**
 * Weekly and monthly are both Fridays on purpose: the week and the month are
 * planned before they start, not on their first morning when the phones are
 * already ringing. Weekly can be moved to another weekday on the card;
 * monthly is always the last Friday.
 */
export const PLANNING_DEFAULT_WEEKDAY = 5;

/** The monthly slot's pattern: the last Friday (see `monthlyNth` in src/types/task.ts). */
export const MONTHLY_PLANNING_PATTERN = { repeatWeekday: 5, repeatNths: [NTH_LAST] };

/** Mon–Fri as `getUTCDay()` numbers. Weekly planning on a weekend is not a thing anybody here does. */
export const PLANNING_WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * After this, office time, the morning review is not asked about: "when will
 * you go over today's plan?" at three in the afternoon would only land on
 * tomorrow, which is what the end-of-day one is for.
 */
export const MORNING_ASK_UNTIL = '13:00';

/** How long the slot is, in minutes. The card offers these; the end time is drawn on the calendar. */
export const PLANNING_DURATIONS = [15, 30, 45, 60, 90] as const;
export const PLANNING_DEFAULT_DURATION: Record<PlanningKind, number> = {
  morning: 15,
  evening: 15,
  weekly: 30,
  monthly: 60,
};

export function isPlanningDuration(v: unknown): v is number {
  return (PLANNING_DURATIONS as readonly unknown[]).includes(v);
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  // "1.5 h" rather than "1 h 30 min": it has to fit on a chip beside four others.
  return `${minutes / 60} h`;
}

/** One kind's state on the owner document. Every key optional; absent means "never asked". */
export interface PlanningKindState {
  /** The task this slot made last. Null when none, or when the person deleted it. */
  taskId: string | null;
  /** `YYYY-MM-DD`, office time: not asked again before this day. */
  snoozedUntil: string | null;
  /** "Don't ask again". Cleared from the Calendar page. */
  off: boolean;
}

export type PlanningState = Record<PlanningKind, PlanningKindState>;

export function cleanPlanningState(raw: unknown): PlanningState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as PlanningState;
  for (const kind of PLANNING_KINDS) {
    const k = (r[kind] && typeof r[kind] === 'object' ? r[kind] : {}) as Record<string, unknown>;
    out[kind] = {
      taskId: typeof k.taskId === 'string' && k.taskId ? k.taskId : null,
      snoozedUntil: typeof k.snoozedUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k.snoozedUntil)
        ? k.snoozedUntil : null,
      off: k.off === true,
    };
  }
  return out;
}

/** What the browser is told about one kind: is it on the calendar, and should the card ask today. */
export interface PlanningStatus {
  kind: PlanningKind;
  /** The live task, when there is one: its date and time, for the Calendar page to show. */
  scheduled: {
    taskId: string; date: string | null; time: string | null; endTime: string | null;
    repeat: TaskRepeat; repeatWeekday: number | null; repeatNths: number[];
  } | null;
  off: boolean;
  /** True when the card should ask about this kind today. */
  due: boolean;
}

/* ------------------------------------------------------------------ times */

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHhmm(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** `HH:MM` plus some minutes, stopping at 23:59 rather than running into tomorrow. */
export function addMinutes(hhmm: string, minutes: number): string {
  return toHhmm(Math.max(0, Math.min(minutesOf(hhmm) + minutes, 23 * 60 + 59)));
}

/**
 * A planning slot's end time after its start moves: the same length, from
 * the new start. Null when it has no start, or never had an end.
 */
export function shiftedEnd(oldTime: string | null, oldEnd: string | null, newTime: string | null): string | null {
  if (!newTime || !oldTime || !oldEnd) return null;
  const length = minutesOf(oldEnd) - minutesOf(oldTime);
  return length > 0 ? addMinutes(newTime, length) : null;
}

/* ------------------------------------------------------------ the day view */

/**
 * How long a task with a time but no end is taken to last when looking for
 * room in a day. A task's time is when somebody means to start it, not a
 * booking; half an hour is a guess, and the card says "about".
 */
export const UNTIMED_LENGTH_MINUTES = 30;

/** One thing already on the day the slot is going on, as the card draws it. */
export interface DayItem {
  id: string;
  title: string;
  kind: 'task' | 'event';
  time: string;
  endTime: string | null;
  /** A date of a repeating event: moved by editing the series on the Calendar, not from the card. */
  series: boolean;
  /** This is the planning slot itself (when one is already on the day). */
  planning: boolean;
}

/**
 * The working day assumed for somebody HR has not given a schedule — and when
 * there is no company default either: the office's standard weekday, the same
 * hours HR's "Standard week" button fills in (7am to 4pm). Read from there so
 * the two cannot drift apart.
 */
export const PLANNING_FALLBACK_SHIFT = STANDARD_SCHEDULE.days.mon ?? { start: '07:00', end: '16:00' };

export interface PlanningDay {
  date: string;
  /** The person's working hours that day. Null for a day off. */
  shift: { start: string; end: string } | null;
  /** False when neither the person nor the company has a schedule, and PLANNING_FALLBACK_SHIFT stands in. */
  scheduleSet: boolean;
  items: DayItem[];
}

export function itemEnd(item: Pick<DayItem, 'time' | 'endTime'>): string {
  return item.endTime && item.endTime > item.time ? item.endTime : addMinutes(item.time, UNTIMED_LENGTH_MINUTES);
}

/** What the slot `[time, time + minutes)` would sit on top of. */
export function clashes(items: DayItem[], time: string, minutes: number): DayItem[] {
  const end = addMinutes(time, minutes);
  return items.filter((i) => !i.planning && i.time < end && itemEnd(i) > time);
}

/**
 * Free starts for a slot of `minutes` inside the shift, on the quarter hour,
 * skipping anything already booked and — on today — anything already gone.
 * Empty means the day is full, which is when the card offers to move things.
 */
export function freeStarts(day: PlanningDay, minutes: number, notBefore: string | null): string[] {
  const shift = day.shift;
  if (!shift || shift.end <= shift.start) return [];
  const out: string[] = [];
  for (let t = Math.ceil(minutesOf(shift.start) / 15) * 15; t + minutes <= minutesOf(shift.end); t += 15) {
    const time = toHhmm(t);
    if (notBefore && time <= notBefore) continue;
    if (!clashes(day.items, time, minutes).length) out.push(time);
  }
  return out;
}

/** Quarter hours across a shift, for the "move to" box beside each item. */
export function shiftQuarterHours(shift: { start: string; end: string }): string[] {
  const out: string[] = [];
  for (let t = Math.ceil(minutesOf(shift.start) / 15) * 15; t < minutesOf(shift.end); t += 15) out.push(toHhmm(t));
  return out;
}

/* ------------------------------------------------------------------ dates */

function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The office clock right now, `HH:MM`. */
export function officeNowTime(now: number = Date.now()): string {
  const d = new Date(now + OFFICE_UTC_OFFSET_MINUTES * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * "Not now" puts a kind off until the start of its next period: tomorrow,
 * next Monday, or the first of next month. Asking about a weekly plan again
 * on Tuesday after a no on Monday would be the nagging this is built to avoid.
 */
export function snoozeUntil(kind: PlanningKind, today: string): string {
  if (isDailyKind(kind)) return shift(today, 1);
  if (kind === 'weekly') {
    const dow = dayOfWeek(today);
    return shift(today, dow === 0 ? 1 : 8 - dow);
  }
  const [y, m] = today.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/**
 * The first date the slot lands on: the soonest matching day whose time has
 * not already gone by. The daily ones skip weekends; a plan for a Saturday is
 * a task nobody does and then sees overdue on Monday.
 */
export function firstPlanningDate(
  kind: PlanningKind,
  time: string,
  opts: { weekday?: number },
  today: string = officeToday(),
  nowTime: string = officeNowTime(),
): string {
  const fits = (date: string): boolean => {
    if (date === today && time <= nowTime) return false;
    const dow = dayOfWeek(date);
    if (isDailyKind(kind)) return dow !== 0 && dow !== 6;
    if (kind === 'weekly') return dow === (opts.weekday ?? PLANNING_DEFAULT_WEEKDAY);
    return dow === 5 && shift(date, 7).slice(0, 7) !== date.slice(0, 7);
  };
  let d = today;
  // A monthly slot can be a month away; the cap only guards a bug.
  for (let i = 0; i < 62 && !fits(d); i++) d = shift(d, 1);
  return d;
}

/** Which repeat the task gets. The daily ones only when the person asked for it. */
export function planningRepeat(kind: PlanningKind, everyWeekday: boolean): TaskRepeat {
  if (isDailyKind(kind)) return everyWeekday ? 'weekdays' : 'none';
  return kind === 'weekly' ? 'weekly' : 'monthlyNth';
}

export function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** "Today", "Tomorrow", or null for a day the caller spells out itself. */
export function relativeDay(date: string, today: string = officeToday()): 'Today' | 'Tomorrow' | null {
  if (date === today) return 'Today';
  if (date === shift(today, 1)) return 'Tomorrow';
  return null;
}

/** Fired by the Calendar page's "Set a time", heard by the planning card in the dashboard layout. `detail` is the kind. */
export const PLANNING_ASK_EVENT = 'ttms:planning-ask';

/** Fired by the card after it saves anything, so an open Calendar page can show the new slot. */
export const PLANNING_CHANGED_EVENT = 'ttms:planning-changed';
