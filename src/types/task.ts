/**
 * One person's own to-do list and calendar: `personalTasks/{uid}/items/{id}`.
 *
 * Everybody on the allowlist has one, interns included, and nobody else can
 * see it — admins included. It is a notepad, not a record of work: nothing in
 * it is assigned by anybody else, reported on, or read by any other screen.
 * If a manager ever needs to hand out work, that is a different feature with
 * its own rules, not a door into this one.
 *
 * Read and written only through `/api/me/tasks`, keyed on the uid off the ID
 * token — the same shape as `vocabulary/{uid}`. There is no Firestore rule for
 * this collection and there should not be one: a rule would be a second door
 * to keep shut, and the list does not need to be live across devices.
 *
 * Two kinds share one list because they share one calendar:
 *
 * - a **task** has a status and sits on the board, the sticky notes and the
 *   table; a date on it is when it is due, and puts it on the calendar too.
 * - an **event** is something to turn up to — a call, an online meeting, a
 *   company activity. It has a date and nothing to finish, so it appears on
 *   the calendar only. `eventType` says which sort; it changes the icon and
 *   the wording of a reminder, and nothing else.
 *
 * Both can carry reminders — see `TASK_REMINDER_LEADS` below and
 * src/lib/personalTaskReminders.ts.
 *
 * **Every date and time here is office time** (Guatemala, UTC−6), the same
 * clock the celebrations and attendance run on. A reminder has to be sent by
 * a server that knows no browser's time zone, so "10:00" must mean one
 * instant; and a calendar that mixes birthdays with tasks cannot have two
 * ideas of which day is today.
 */

import { OFFICE_UTC_OFFSET_MINUTES } from './attendance';
import { officeToday } from './celebration';

export const PERSONAL_TASKS_COLLECTION = 'personalTasks';
export const PERSONAL_TASK_ITEMS = 'items';
/** The reminder queue, `taskReminders/{uid}__{itemId}__{lead}` — see syncReminderQueue(). */
export const TASK_REMINDERS_COLLECTION = 'taskReminders';

export type TaskKind = 'task' | 'event';

export const TASK_STATUSES = ['todo', 'doing', 'waiting', 'done'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

/**
 * Four columns and no more, fixed rather than per-person. "Waiting" earns its
 * place in freight: half of what is on a broker's plate is sitting with a
 * carrier, a shipper or a client, and mixing it in with "In progress" hides
 * what they can actually move today.
 */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo:    'To do',
  doing:   'In progress',
  waiting: 'Waiting on someone',
  done:    'Done',
};

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low', normal: 'Normal', high: 'High',
};

/** Sticky-note colours. All six are families `tailwind.config.ts` maps for dark mode. */
export const TASK_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'] as const;
export type TaskColor = typeof TASK_COLORS[number];

/**
 * What sort of event. A label, not a behaviour: an "online meeting" is not
 * joined through TTMS and a "company activity" is still only on the calendar
 * of the person who added it. A calendar the whole company shares would be a
 * different feature, with its own question of who may post on it.
 */
export const EVENT_TYPES = ['call', 'online', 'meeting', 'activity', 'appointment', 'other'] as const;
export type EventType = typeof EVENT_TYPES[number];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  call:        'Call',
  online:      'Online meeting',
  meeting:     'In-person meeting',
  activity:    'Company activity',
  appointment: 'Appointment',
  other:       'Other event',
};

/**
 * When a reminder goes out, relative to the item.
 *
 * With a time, each is that long before it. With no time there is no minute
 * to count back from, so the item is treated as starting at 8am — the same
 * hour the celebration reminders go out — and only the whole-day leads make
 * sense: "on the morning" and "the day before". `leadsFor()` is the one place
 * that says which leads apply.
 */
export const TASK_REMINDER_LEADS = ['start', '15m', '1h', '1d', '1w'] as const;
export type TaskReminderLead = typeof TASK_REMINDER_LEADS[number];

const LEAD_MINUTES: Record<TaskReminderLead, number> = {
  start: 0, '15m': 15, '1h': 60, '1d': 24 * 60, '1w': 7 * 24 * 60,
};

/** The hour an untimed item is reminded about, office time. */
export const UNTIMED_REMINDER_TIME = '08:00';

export function leadsFor(hasTime: boolean): readonly TaskReminderLead[] {
  return hasTime ? TASK_REMINDER_LEADS : ['start', '1d', '1w'];
}

export function reminderLeadLabel(lead: TaskReminderLead, hasTime: boolean): string {
  if (!hasTime) {
    return lead === 'start' ? 'That morning (8:00 AM)'
      : lead === '1d' ? 'The day before (8:00 AM)'
      : 'A week before (8:00 AM)';
  }
  return {
    start: 'At the time', '15m': '15 minutes before', '1h': '1 hour before',
    '1d': '1 day before', '1w': '1 week before',
  }[lead];
}

export interface TaskReminderSettings {
  email: boolean;
  chat: boolean;
}

/** Both on until somebody says otherwise — a reminder set and then never sent is the worse surprise. */
export const DEFAULT_TASK_REMINDER_SETTINGS: TaskReminderSettings = { email: true, chat: true };

export interface PersonalTask {
  id: string;
  kind: TaskKind;
  title: string;
  notes: string;
  /** Always 'todo' on an event, which has nothing to finish. */
  status: TaskStatus;
  priority: TaskPriority;
  color: TaskColor;
  /** `YYYY-MM-DD`. When a task is due; the day of an event. */
  date: string | null;
  /** `HH:MM`, 24-hour. Optional on both kinds. */
  time: string | null;
  /** `HH:MM`. Events only. */
  endTime: string | null;
  /** Events only; 'other' on a task, where it means nothing. */
  eventType: EventType;
  /** Where, or the meeting link. Free text; drawn as a link only when it is one. */
  location: string;
  /** When to be reminded. Empty for none. Never set on a finished task's queue. */
  reminders: TaskReminderLead[];
  /**
   * Position within its board column, and among the sticky notes. A fraction
   * between its neighbours, so a drag is one write rather than a renumbering
   * of the whole column — see `orderBetween()`.
   */
  order: number;
  /** ISO strings on the wire. */
  createdAt: string | null;
  updatedAt: string | null;
  /** When it last went to Done. Null while it is open. */
  doneAt: string | null;
}

/** What can be written. Everything else on a task is set by the server. */
export type PersonalTaskInput = Partial<Pick<PersonalTask,
  'kind' | 'title' | 'notes' | 'status' | 'priority' | 'color' | 'date' | 'time' | 'endTime' | 'order'
  | 'eventType' | 'location' | 'reminders'>>;

export const MAX_TASK_TITLE = 200;
export const MAX_TASK_NOTES = 4000;
export const MAX_TASK_LOCATION = 500;

/**
 * A ceiling, not a target. The whole list is read on every visit, so this is
 * also the most one page load can cost; a thousand is years of anybody's
 * to-dos, and "Clear done" is on the board for the rest.
 */
export const MAX_TASKS_PER_PERSON = 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * Keep only the fields a request may set, each checked. Anything unknown or
 * malformed is dropped rather than refused: this is somebody's own notepad,
 * and a stray key is not worth an error message. An empty title is the one
 * thing refused, by the caller, because a task with no words is nothing.
 *
 * '' and null both clear the optional fields — a date input sends ''.
 */
export function cleanTaskInput(body: unknown): PersonalTaskInput {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const out: PersonalTaskInput = {};

  if (oneOf(['task', 'event'] as const, b.kind)) out.kind = b.kind;
  if (typeof b.title === 'string') out.title = b.title.trim().slice(0, MAX_TASK_TITLE);
  if (typeof b.notes === 'string') out.notes = b.notes.slice(0, MAX_TASK_NOTES);
  if (oneOf(TASK_STATUSES, b.status)) out.status = b.status;
  if (oneOf(TASK_PRIORITIES, b.priority)) out.priority = b.priority;
  if (oneOf(TASK_COLORS, b.color)) out.color = b.color;

  if (b.date === null || b.date === '') out.date = null;
  else if (typeof b.date === 'string' && isRealDate(b.date)) out.date = b.date;

  for (const key of ['time', 'endTime'] as const) {
    const v = b[key];
    if (v === null || v === '') out[key] = null;
    else if (typeof v === 'string' && TIME_RE.test(v)) out[key] = v;
  }

  if (typeof b.order === 'number' && Number.isFinite(b.order)) out.order = b.order;
  if (oneOf(EVENT_TYPES, b.eventType)) out.eventType = b.eventType;
  if (typeof b.location === 'string') out.location = b.location.trim().slice(0, MAX_TASK_LOCATION);
  if (Array.isArray(b.reminders)) {
    out.reminders = TASK_REMINDER_LEADS.filter((l) => (b.reminders as unknown[]).includes(l));
  }
  return out;
}

/**
 * A position between two neighbours, or past the end of a column. Null when
 * the gap has closed up — after about fifty drops into the same slot the two
 * numbers are the same double — and the caller renumbers the column instead.
 */
export function orderBetween(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return 1000;
  if (before === null) return after! - 1000;
  if (after === null) return before + 1000;
  const mid = (before + after) / 2;
  return mid > before && mid < after ? mid : null;
}

/** Board and sticky-note order: by position, oldest first on a tie. */
export function byOrder(a: PersonalTask, b: PersonalTask): number {
  return a.order - b.order || (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
}

/** Calendar order within a day: timed items by time, then untimed ones. */
export function byTime(a: PersonalTask, b: PersonalTask): number {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return byOrder(a, b);
}

/**
 * Today on the calendar: the office's date, not the browser's — see the note
 * at the top of this file. Read on the client after mount, never during a
 * server render, where it would be baked into the page.
 */
export function calendarToday(): string {
  return officeToday();
}

/** Open, dated, and the date has passed. Events are never overdue. */
export function isOverdue(t: PersonalTask, today: string): boolean {
  return t.kind === 'task' && t.status !== 'done' && !!t.date && t.date < today;
}

/** "14:30" → "2:30 PM". Shown next to a date, never instead of one. */
export function formatTime(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * The instants an item's reminders are due, as epoch milliseconds, keyed by
 * lead. Pure, so the server that queues them and the editor that says "this
 * one has already gone by" agree.
 *
 * Empty when there is nothing to remind about: no date, a finished task, or
 * no leads. A lead that does not apply to an untimed item is skipped rather
 * than guessed at.
 */
export function reminderInstants(
  t: Pick<PersonalTask, 'kind' | 'status' | 'date' | 'time' | 'reminders'>,
): Partial<Record<TaskReminderLead, number>> {
  const out: Partial<Record<TaskReminderLead, number>> = {};
  if (!t.date || (t.kind === 'task' && t.status === 'done')) return out;

  const [y, m, d] = t.date.split('-').map(Number);
  const [hh, mm] = (t.time ?? UNTIMED_REMINDER_TIME).split(':').map(Number);
  // Office wall-clock → UTC: the office is UTC−6, so 10:00 there is 16:00 UTC.
  const start = Date.UTC(y, m - 1, d, hh, mm) - OFFICE_UTC_OFFSET_MINUTES * 60_000;

  const allowed = leadsFor(!!t.time);
  for (const lead of t.reminders) {
    if (!allowed.includes(lead)) continue;
    out[lead] = start - LEAD_MINUTES[lead] * 60_000;
  }
  return out;
}

/** A location worth drawing as a link: http(s) only, so nothing typed can become a `javascript:` URL. */
export function locationUrl(location: string): string | null {
  const v = location.trim();
  if (!/^https?:\/\/\S+$/i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
