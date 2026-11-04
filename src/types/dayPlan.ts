/**
 * Shared day plans: what somebody planned for a day, handed to their manager.
 *
 * **This is not a window into the task list.** `personalTasks` stays exactly
 * as private as CLAUDE.md says — nobody reads it but its owner, admins
 * included. What a manager reads is a *copy*, `dayPlans/{uid}__{date}`, made
 * from the list by the owner's own act: finishing their morning review (that
 * day) or their end-of-day planning (the next working day), or pressing
 * "Share again" on the Calendar. The copy holds a title and a time per item
 * and nothing else — no notes, steps, contacts, orders, status or XP.
 *
 * It was asked for when the company went fully remote (2026-11-04): admins
 * and Sales Managers wanted to see at a glance what their people planned and
 * when. That is a reading of somebody's plan, not of their work, so it stays
 * a plan — the copy is not updated when a task is ticked Done, and nothing
 * here says whether anybody did what they planned. Do not add that: a plan
 * that is scored is a plan people stop writing honestly.
 *
 * **The owner can always see what was shared and blank any item** to "Busy"
 * (`busyIds`). The time stays, so the block still reads as taken; the title
 * is replaced on the server and never stored in the copy.
 *
 * Who may read it: anybody with `plans.viewAll` (admins), and a Sales
 * Manager their own team through `managedUids` — the same shape as
 * attendance's `canSeePerson()`. Closed to the browser in firestore.rules.
 */

import { EVENT_TYPE_LABEL, type EventType, type TaskKind } from './task';

export const DAY_PLANS_COLLECTION = 'dayPlans';

/** One document per person per day: re-sharing the same day replaces it. */
export function dayPlanId(uid: string, date: string): string {
  return `${uid}__${date}`;
}

/** What finished it: a planning slot, or the "Share again" button. */
export type DayPlanVia = 'morning' | 'evening' | 'manual';

export interface DayPlanItem {
  /** The task or event's id on the owner's list — what `busyIds` names. Never shown. */
  id: string;
  /** The item's title, or "Busy" when the owner blanked it. */
  title: string;
  kind: TaskKind;
  /** An event's label (Call, Meeting…). Null on a task and on a blanked item. */
  eventType: EventType | null;
  /** `HH:MM` office time, or null for "some time that day". */
  start: string | null;
  end: string | null;
  busy: boolean;
}

export interface DayPlan {
  uid: string;
  email: string;
  name: string;
  date: string;
  via: DayPlanVia;
  /** ISO time of the latest share. */
  sharedAt: string | null;
  items: DayPlanItem[];
  busyIds: string[];
}

/** One row of the team view: a person, and their plan for the day if they shared one. */
export interface TeamPlanPerson {
  uid: string;
  email: string;
  name: string;
  teamId: string | null;
  photoPath: string | null;
}

export interface TeamPlansReply {
  from: string;
  to: string;
  today: string;
  people: TeamPlanPerson[];
  /** `plans[uid][date]` — absent means not shared yet. */
  plans: Record<string, Record<string, DayPlan>>;
  teams: { id: string; name: string }[];
}

/** The team view covers a day or a working week at most. */
export const MAX_TEAM_PLAN_DAYS = 7;

export const BUSY_TITLE = 'Busy';

/** Window event fired when a task save shared a plan; `detail` is the date. */
export const DAY_PLAN_SHARED_EVENT = 'ttms:day-plan-shared';

/** A block with no end is drawn and counted as half an hour, as on "Your day". */
export const DEFAULT_ITEM_MINUTES = 30;

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Start and end in minutes past midnight, or null for an untimed item. */
export function itemSpan(item: Pick<DayPlanItem, 'start' | 'end'>): { from: number; to: number } | null {
  if (!item.start) return null;
  const from = minutesOf(item.start);
  const to = item.end && minutesOf(item.end) > from ? minutesOf(item.end) : from + DEFAULT_ITEM_MINUTES;
  return { from, to };
}

/** Timed first, by start; then the "any time" ones in the order they came. */
export function sortPlanItems<T extends Pick<DayPlanItem, 'start' | 'end'>>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (!a.start || !b.start) return a.start ? -1 : b.start ? 1 : 0;
    return a.start.localeCompare(b.start) || (a.end ?? '').localeCompare(b.end ?? '');
  });
}

/**
 * The summary the table and the week view show. Planned time merges
 * overlapping blocks, so a call inside a focus block is not counted twice.
 */
export function planSummary(items: DayPlanItem[]): {
  count: number; timed: number; minutes: number; first: string | null; last: string | null;
} {
  const spans = items.map(itemSpan).filter((s): s is { from: number; to: number } => !!s)
    .sort((a, b) => a.from - b.from);
  let minutes = 0;
  let curFrom = -1;
  let curTo = -1;
  for (const s of spans) {
    if (s.from > curTo) {
      if (curTo > curFrom) minutes += curTo - curFrom;
      curFrom = s.from;
      curTo = s.to;
    } else if (s.to > curTo) {
      curTo = s.to;
    }
  }
  if (curTo > curFrom) minutes += curTo - curFrom;
  const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return {
    count: items.length,
    timed: spans.length,
    minutes,
    first: spans.length ? toHHMM(spans[0].from) : null,
    last: spans.length ? toHHMM(Math.max(...spans.map((s) => s.to))) : null,
  };
}

/** "6h 30m", "45m", "—". */
export function formatMinutes(m: number): string {
  if (m <= 0) return '—';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

export function itemLabel(item: DayPlanItem): string {
  if (item.busy || item.kind === 'task' || !item.eventType || item.eventType === 'other') return item.kind === 'task' ? 'Task' : 'Event';
  return EVENT_TYPE_LABEL[item.eventType];
}

/**
 * The next working day after `date`: tomorrow, or Monday from a Friday or a
 * weekend. What "Plan for tomorrow" shares — the plan made on Friday
 * afternoon is Monday's. Holidays are not skipped: a plan made for a holiday
 * is still the plan somebody made.
 */
export function nextWorkingDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week `date` is in. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * What the owner is told, on the Calendar beside their shared plan. The
 * wording is the disclosure; change what is copied and this changes the
 * same day.
 */
export const DAY_PLAN_DISCLOSURE =
  'When you finish your morning review or your end-of-day planning, the names and times of that day’s tasks and events are shared with your manager (and with admins). Nothing else is shared — no notes, steps, contacts or whether you finished them — and your list itself stays private. Mark anything personal as Busy: the time stays, the name is hidden.';
