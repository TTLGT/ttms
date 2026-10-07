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
import type { PlanningKind } from './planning';

export const PERSONAL_TASKS_COLLECTION = 'personalTasks';
export const PERSONAL_TASK_ITEMS = 'items';
/** The reminder queue, `taskReminders/{uid}__{itemId}__{lead}` — see syncReminderQueue(). */
export const TASK_REMINDERS_COLLECTION = 'taskReminders';

export type TaskKind = 'task' | 'event';

/**
 * The columns everybody starts with, in their starting order. `ready` and
 * `review` were added after the first four; a layout saved before them gets
 * them back by `cleanBoardColumns()`, so nobody has to go looking.
 *
 * "Waiting" earns its place in freight: half of what is on a broker's plate
 * is sitting with a carrier, a shipper or a client, and mixing it in with
 * "In progress" hides what they can actually move today.
 */
export const TASK_STATUSES = ['todo', 'ready', 'doing', 'waiting', 'review', 'done'] as const;
export type BuiltInTaskStatus = typeof TASK_STATUSES[number];

/**
 * A built-in column, or one the person added (`c_` and a random tail — see
 * `newColumnId()`). A plain string on purpose: a custom column's id is data,
 * not something the code can list.
 */
export type TaskStatus = string;

export const TASK_STATUS_LABEL: Record<BuiltInTaskStatus, string> = {
  todo:    'To do',
  ready:   'Ready',
  doing:   'In progress',
  waiting: 'Waiting on someone',
  review:  'In review',
  done:    'Done',
};

const CUSTOM_STATUS_RE = /^c_[a-z0-9]{4,16}$/;

export function isBuiltInStatus(v: unknown): v is BuiltInTaskStatus {
  return typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v);
}

/** The shape of a status, not whether the person still has that column — see `placeOf()`. */
export function isTaskStatus(v: unknown): v is TaskStatus {
  return isBuiltInStatus(v) || (typeof v === 'string' && CUSTOM_STATUS_RE.test(v));
}

export function newColumnId(): string {
  return `c_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
}

/**
 * One column of somebody's board, in the order they arranged it. Saved on
 * `personalTasks/{uid}.boardColumns`; absent means the defaults.
 *
 * **To do and Done can be moved but never hidden.** To do is where a new task
 * lands and where a task falls back to when nothing else will take it; Done
 * is what stops a task's reminders and what "Clear done" clears. A board
 * without either would lose work.
 */
export interface BoardColumn {
  id: TaskStatus;
  /** Shown for a custom column. A built-in one always reads its own label. */
  label: string;
  hidden: boolean;
}

export const LOCKED_COLUMNS: readonly TaskStatus[] = ['todo', 'done'];
export const MAX_CUSTOM_COLUMNS = 12;
export const MAX_COLUMN_LABEL = 40;

export const DEFAULT_BOARD_COLUMNS: BoardColumn[] =
  TASK_STATUSES.map((id) => ({ id, label: TASK_STATUS_LABEL[id], hidden: false }));

/**
 * A layout as stored or as sent, made whole: unknown and duplicate ids
 * dropped, custom labels required and trimmed, the locked columns forced
 * visible, and any built-in column missing from it put back in its default
 * place among the others — which is how somebody who saved a layout before
 * "Ready" existed still gets it.
 */
export function cleanBoardColumns(raw: unknown): BoardColumn[] {
  if (!Array.isArray(raw)) return DEFAULT_BOARD_COLUMNS.map((c) => ({ ...c }));
  const out: BoardColumn[] = [];
  const seen = new Set<string>();
  let custom = 0;
  for (const item of raw) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    if (!isTaskStatus(r.id) || seen.has(r.id)) continue;
    const builtIn = isBuiltInStatus(r.id);
    const label = builtIn
      ? TASK_STATUS_LABEL[r.id as BuiltInTaskStatus]
      : (typeof r.label === 'string' ? r.label.trim().slice(0, MAX_COLUMN_LABEL) : '');
    if (!label) continue;
    if (!builtIn && ++custom > MAX_CUSTOM_COLUMNS) continue;
    seen.add(r.id);
    out.push({ id: r.id, label, hidden: !LOCKED_COLUMNS.includes(r.id) && r.hidden === true });
  }
  TASK_STATUSES.forEach((id, i) => {
    if (seen.has(id)) return;
    // After the nearest default neighbour on its left that is present.
    const prev = TASK_STATUSES.slice(0, i).reverse().find((p) => seen.has(p));
    const at = prev ? out.findIndex((c) => c.id === prev) + 1 : 0;
    out.splice(at, 0, { id, label: TASK_STATUS_LABEL[id], hidden: false });
    seen.add(id);
  });
  return out;
}

/**
 * Where a column's tasks go when it stops showing: the nearest column to its
 * left that is still showing, To do when there is none. The one definition of
 * "one step back", used by the route that does the moving and by the board
 * that says beforehand where they will go.
 */
export function stepBackFrom(
  layout: BoardColumn[],
  id: TaskStatus,
  isShowing: (id: TaskStatus) => boolean,
): TaskStatus {
  const i = layout.findIndex((c) => c.id === id);
  for (let j = i - 1; j >= 0; j--) if (isShowing(layout[j].id)) return layout[j].id;
  return 'todo';
}

/**
 * `id` taken out and put back beside `targetId` — after it when it was
 * dragged rightwards, before it when leftwards, which is where the drop line
 * is drawn. Positions are in the whole layout, hidden columns included, so a
 * hidden column keeps its place relative to its neighbours.
 */
export function moveColumn(layout: BoardColumn[], id: TaskStatus, targetId: TaskStatus): BoardColumn[] {
  const from = layout.findIndex((c) => c.id === id);
  const to = layout.findIndex((c) => c.id === targetId);
  if (from < 0 || to < 0 || from === to) return layout;
  const rest = layout.filter((c) => c.id !== id);
  const at = rest.findIndex((c) => c.id === targetId) + (from < to ? 1 : 0);
  return [...rest.slice(0, at), layout[from], ...rest.slice(at)];
}

export function statusLabel(columns: BoardColumn[], status: TaskStatus): string {
  if (isBuiltInStatus(status)) return TASK_STATUS_LABEL[status];
  return columns.find((c) => c.id === status)?.label ?? TASK_STATUS_LABEL.todo;
}

/**
 * Which visible column a task with this status is drawn in. Itself, when that
 * column is showing; otherwise the nearest showing column to its left — the
 * same "one step back" a hide moves tasks by; To do when the status is not on
 * the board at all (a column deleted in another tab).
 *
 * The server moves tasks out of a column when it is hidden, so this is the
 * fallback for the moment in between, not the mechanism.
 */
export function placeOf(columns: BoardColumn[], status: TaskStatus): TaskStatus {
  const i = columns.findIndex((c) => c.id === status);
  if (i < 0) return 'todo';
  for (let j = i; j >= 0; j--) if (!columns[j].hidden) return columns[j].id;
  return 'todo';
}

/**
 * How an item comes back. The two kinds repeat differently, because one has
 * something to finish and the other does not:
 *
 * - A repeating **task** is one task at a time, not a series laid out in
 *   advance: ticking it Done makes the next one, in To do, due on the next
 *   date — see `nextOccurrence()` and the PATCH route. Nothing runs on a clock
 *   to do it, so a repeat never fires for somebody who has left, and the board
 *   never fills with copies nobody looked at.
 * - A repeating **event** is one document standing for the whole series. Its
 *   `date` is the first occurrence; the calendar draws the rest from the
 *   pattern (`occurrencesBetween()`), and its reminders are queued for the
 *   next occurrence and re-queued by the run after each one is sent. Editing
 *   or deleting it changes the whole series.
 *
 * `monthlyNth` is "the 1st Tuesday", "the 2nd and 4th Wednesday", "the last
 * Friday": a weekday (`repeatWeekday`) and which of them in the month
 * (`repeatNths`, 1–4, with 5 meaning the last).
 */
export const TASK_REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'monthlyNth'] as const;
export type TaskRepeat = typeof TASK_REPEATS[number];

export const TASK_REPEAT_LABEL: Record<TaskRepeat, string> = {
  none:       'Does not repeat',
  daily:      'Every day',
  weekdays:   'Every weekday (Mon–Fri)',
  weekly:     'Every week',
  monthly:    'Every month, same date',
  monthlyNth: 'Every month, by weekday (e.g. 1st Tuesday)',
};

/** 1–4 are the 1st to 4th of that weekday in the month; 5 is the last, whether that is the 4th or the 5th. */
export const NTH_LAST = 5;
export const NTH_LABEL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: 'Last' };
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Which of its weekday a date is: the 1st Tuesday, the 3rd … — 1 to 5, read off the day of the month. */
export function nthOf(date: string): number {
  return Math.ceil(Number(date.slice(8, 10)) / 7);
}

export function weekdayNumberOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** "the 2nd and 4th Wednesday of every month". */
export function nthPatternLabel(weekday: number, nths: number[]): string {
  const names = nths.map((n) => (n === NTH_LAST ? 'last' : NTH_LABEL[n]));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
  return `the ${list} ${WEEKDAY_NAMES[weekday]} of every month`;
}

/** The pattern of a `monthlyNth` item, falling back to its own date's ("the 2nd Tuesday") when unset. */
export function nthPattern(
  t: Pick<PersonalTask, 'repeatWeekday' | 'repeatNths' | 'date'>,
): { weekday: number; nths: number[] } | null {
  if (t.repeatWeekday !== null && t.repeatNths.length) return { weekday: t.repeatWeekday, nths: t.repeatNths };
  if (!t.date) return null;
  return { weekday: weekdayNumberOf(t.date), nths: [nthOf(t.date)] };
}

/** How it repeats, in words — the label, with the weekday pattern spelled out. */
export function repeatText(t: Pick<PersonalTask, 'repeat' | 'repeatWeekday' | 'repeatNths' | 'date'>): string {
  if (t.repeat === 'monthlyNth') {
    const p = nthPattern(t);
    return p ? `On ${nthPatternLabel(p.weekday, p.nths)}` : TASK_REPEAT_LABEL.monthlyNth;
  }
  if (t.repeat === 'weekly' && t.date) return `Every ${WEEKDAY_NAMES[weekdayNumberOf(t.date)]}`;
  return TASK_REPEAT_LABEL[t.repeat];
}

/**
 * The stored repeat fields for a repeat and a date, so every writer agrees:
 * a monthly item's day of the month, and a `monthlyNth` item's weekday and
 * weeks — taken from the request when it sent them, otherwise read off the
 * date ("the 2nd Tuesday" for the 9th of a month that starts on a Sunday).
 */
/**
 * Nothing repeats for ever: every repeat ends, on a day the person picks, and
 * a month is both the default and the most this suggests.
 *
 * Not a hard cap — some things really do recur all quarter — but the editor
 * argues against going past it, in the person's own interest: a reminder
 * that has been on the board for months stops being read. A month, then a
 * deliberate "yes, keep it", keeps it a decision rather than wallpaper.
 */
export const REPEAT_ADVISED_MONTHS = 1;

export const REPEAT_ADVICE =
  'We advise against repeating anything for more than a month. Something that comes back week after week for months '
  + 'turns into wallpaper: you stop reading it, stop asking whether it still matters, and tick it out of habit — or '
  + 'stop ticking it at all. Set it for a month. When it ends, renew it on purpose if it still earns its place; '
  + 'that one decision is what keeps it worth doing.';

/** The same day next month (the last day of next month when it is shorter): the default, and advised, end. */
export function oneMonthAfter(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Ends later than advised: more than a month after it starts. */
export function repeatsTooLong(date: string | null, until: string | null): boolean {
  return !!date && !!until && until > oneMonthAfter(date);
}

/**
 * The end a repeat is saved with: the one sent, if it is on or after the
 * start; otherwise the one it had, if that still is; otherwise a month from
 * the start — so a repeat can be saved without one, but never stored without.
 */
export function repeatEnd(
  repeat: TaskRepeat, date: string | null, sent: string | null | undefined, stored: string | null,
): string | null {
  if (repeat === 'none' || !date) return null;
  if (sent && sent >= date) return sent;
  if (sent === undefined && stored && stored >= date) return stored;
  return oneMonthAfter(date);
}

export function repeatFields(
  repeat: TaskRepeat,
  date: string | null,
  sent: { repeatWeekday?: number | null; repeatNths?: number[] } = {},
): { repeatDay: number | null; repeatWeekday: number | null; repeatNths: number[] } {
  if (repeat === 'monthly' && date) return { repeatDay: Number(date.slice(8, 10)), repeatWeekday: null, repeatNths: [] };
  if (repeat === 'monthlyNth' && date) {
    const weekday = sent.repeatWeekday ?? weekdayNumberOf(date);
    const nths = sent.repeatNths?.length ? sent.repeatNths : [nthOf(date)];
    return { repeatDay: null, repeatWeekday: weekday, repeatNths: nths };
  }
  return { repeatDay: null, repeatWeekday: null, repeatNths: [] };
}

/** Repeat weeks as sent: 1–5, unique, in order. */
export function cleanNths(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= NTH_LAST))]
    .sort((a, b) => a - b);
}

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low', normal: 'Normal', high: 'High',
};

/** Sticky-note colours every person has. All six are families `tailwind.config.ts` maps for dark mode. */
export const BASE_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'] as const;
export type BaseColor = typeof BASE_COLORS[number];

/**
 * Colours a person can add as tags of their own, on top of the six. Each one
 * is a hue, not a colour: `globals.css` (`.tt-tag-*`) works out the pale,
 * the ink and the dark-and-dim shades from it the way tailwind.config.ts
 * does for a family, so no pick can come out unreadable in any theme. That
 * is why it is a fixed list rather than a free picker — a hex somebody chose
 * in light mode has no right answer in dark.
 *
 * The hues are the gaps left once everything else on the calendar is placed:
 * clear of the six above, of the layers (indigo birthdays, teal anniversaries,
 * brand blue, grey holidays — KIND_STYLE in CelebrationPanels.tsx) and of red,
 * which means overdue. Three between yellow and green, three between violet
 * and pink; past that the next one would look like a colour already in use.
 *
 * The value is the hue (`h90` is 90°), so a task's `color` is drawn on its
 * own with nothing to look up. **Never renumber one** — it is stored on tasks.
 */
export const EXTRA_COLORS = ['h70', 'h90', 'h110', 'h274', 'h292', 'h310'] as const;
export type ExtraColor = typeof EXTRA_COLORS[number];

/** Every value a task's `color` can hold. */
export const TASK_COLORS = [...BASE_COLORS, ...EXTRA_COLORS] as const;
export type TaskColor = typeof TASK_COLORS[number];

export function isExtraColor(c: unknown): c is ExtraColor {
  return typeof c === 'string' && (EXTRA_COLORS as readonly string[]).includes(c);
}

/**
 * A name somebody gave a colour — "Important, urgent", "On hold" — so the
 * colours work as tags, the way a Google Keep label extension does. Per
 * person, on `personalTasks/{uid}.colorLabels`; a colour with no name of its
 * own is called by its colour. Only the names are stored: which tag a task
 * carries is still just its `color`, so naming a colour retags nothing.
 *
 * **An extra colour exists while it has a name** — that is the whole of
 * "added". Clearing a base colour's name puts its own name back; clearing an
 * extra one removes it, and PUT /api/me/tasks/labels moves its tasks to
 * yellow so nothing is left wearing a tag the person can no longer see.
 */
export type ColorLabels = Partial<Record<TaskColor, string>>;

export const COLOR_LABEL_MAX = 40;

export const TASK_COLOR_NAME: Record<TaskColor, string> = {
  yellow: 'Yellow', pink: 'Pink', blue: 'Blue', green: 'Green', purple: 'Purple', orange: 'Orange',
  h70: 'Olive', h90: 'Lime', h110: 'Moss', h274: 'Grape', h292: 'Orchid', h310: 'Magenta',
};

/** What a colour is called for this person. */
export function colorLabel(labels: ColorLabels, color: TaskColor): string {
  return labels[color] || TASK_COLOR_NAME[color];
}

/** The colours this person has: the six, then the extras they added, in hue order. */
export function colorsInUse(labels: ColorLabels): TaskColor[] {
  return [...BASE_COLORS, ...EXTRA_COLORS.filter((c) => labels[c])];
}

/** Whatever was stored or sent, as clean names: known colours only, trimmed, empties dropped. */
export function cleanColorLabels(raw: unknown): ColorLabels {
  const out: ColorLabels = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const c of TASK_COLORS) {
    const v = (raw as Record<string, unknown>)[c];
    if (typeof v === 'string' && v.trim()) out[c] = v.trim().slice(0, COLOR_LABEL_MAX);
  }
  return out;
}

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

/**
 * One step of a task — "Call the carrier", "Send the rate con" — ticked off
 * one at a time on the way to finishing the whole thing. Stored as an array
 * on the task itself: a task has a handful, they are never read without it,
 * and a subcollection would cost a read per step on every visit.
 *
 * `xp` and `everDone` are the server's, set the same way as a task's own
 * `xpEarned` and `everDone`: whatever a request says about them is ignored
 * and carried over from the stored step with the same id.
 */
export interface TaskStep {
  /** `s_` and a random tail — see `newStepId()`. Made in the browser so a new step can be ticked before it is saved. */
  id: string;
  title: string;
  done: boolean;
  /**
   * When this step is due, `YYYY-MM-DD`, or null. A label on the step and
   * nothing more: it sets no reminder, moves no XP and never makes the task
   * itself overdue — the task's own date is still the one that counts.
   */
  date: string | null;
  /** Game mode: the XP this step is holding, taken back if it is unticked. */
  xp: number;
  /** Has counted toward the streak and today's count once, and never will again. */
  everDone: boolean;
}

export const MAX_TASK_STEPS = 50;
export const MAX_STEP_TITLE = 200;
const STEP_ID_RE = /^s_[a-z0-9]{4,16}$/;

export function newStepId(): string {
  return `s_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
}

/** Steps as sent: well-formed ids, unique, titled, at most MAX_TASK_STEPS. The server's fields reset. */
export function cleanSteps(raw: unknown): TaskStep[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskStep[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    if (typeof r.id !== 'string' || !STEP_ID_RE.test(r.id) || seen.has(r.id)) continue;
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, MAX_STEP_TITLE) : '';
    if (!title) continue;
    seen.add(r.id);
    const date = typeof r.date === 'string' && isRealDate(r.date) ? r.date : null;
    out.push({ id: r.id, title, done: r.done === true, date, xp: 0, everDone: false });
    if (out.length >= MAX_TASK_STEPS) break;
  }
  return out;
}

/** Stored steps, every field defaulted. */
export function toSteps(raw: unknown): TaskStep[] {
  if (!Array.isArray(raw)) return [];
  const clean = cleanSteps(raw);
  const stored = new Map((raw as Record<string, unknown>[]).map((r) => [r?.id, r]));
  return clean.map((s) => {
    const r = stored.get(s.id) ?? {};
    return { ...s, xp: typeof r.xp === 'number' ? r.xp : 0, everDone: r.everDone === true };
  });
}

/**
 * A colleague from the directory this task is with — the carrier rep's
 * account manager, the dispatcher holding the load — so reaching them is one
 * click from the task rather than a trip to the phone book.
 *
 * Keyed by email, not uid: the directory is keyed that way, and somebody
 * invited who has never signed in has an email and a desk number but no uid
 * yet. The name is a copy taken when they were added, so every view can draw
 * "with @Name" without loading the directory; the contact card looks the
 * person up live for their numbers, and shows the newer name when it finds one.
 *
 * Naming a colleague here tells them nothing and grants them nothing. It is a
 * note on the owner's own private list, like the rest of it — see the top of
 * this file.
 */
export interface TaskContact {
  email: string;
  name: string;
}

export const MAX_TASK_CONTACTS = 5;
const MAX_CONTACT_NAME = 120;
const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contacts as sent or stored: well-formed addresses, lower-cased, unique, at most MAX_TASK_CONTACTS. */
export function cleanContacts(raw: unknown): TaskContact[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskContact[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !CONTACT_EMAIL_RE.test(email) || seen.has(email)) continue;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, MAX_CONTACT_NAME) : '';
    seen.add(email);
    out.push({ email, name: name || email });
    if (out.length >= MAX_TASK_CONTACTS) break;
  }
  return out;
}

/**
 * A load this task is about — "chase the POD on TTL26000042" — drawn as a link
 * to the order on every view, so the load is one click from the reminder.
 *
 * Both halves are stored. The id is what the link needs, and finding it from a
 * number is a query; the number is what people read. The editor resolves them
 * once, through the same access-checked `/api/orders/lookup` that draws chat's
 * order cards, so only a load the owner could open gets added — and the views
 * then draw the link without a read per card.
 *
 * Storing it grants nothing. The order page applies `canSeeOrder()` when the
 * link is followed, so a task that outlives somebody's access to a load holds
 * a link that answers "no access", not a way back in. The number is a copy
 * taken when it was added; an order renumbered since still opens by its id.
 */
export interface TaskOrder {
  id: string;
  number: string;
}

/** Chat stops at three cards a message for the same reason: past that it is a list. */
export const MAX_TASK_ORDERS = 3;
// The same loose id shape chat's link parser accepts — see ORDER_REF in
// src/lib/orderCards.ts. It ends up in a URL path, so nothing else gets in.
const TASK_ORDER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_ORDER_NUMBER = 40;

/** Orders as sent or stored: a safe id, a number, unique by id, at most MAX_TASK_ORDERS. */
export function cleanOrders(raw: unknown): TaskOrder[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskOrder[] = [];
  for (const item of raw) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!TASK_ORDER_ID_RE.test(id) || out.some((o) => o.id === id)) continue;
    const number = typeof r.number === 'string' ? r.number.trim().slice(0, MAX_ORDER_NUMBER) : '';
    out.push({ id, number: number || id });
    if (out.length >= MAX_TASK_ORDERS) break;
  }
  return out;
}

export interface PersonalTask {
  id: string;
  kind: TaskKind;
  title: string;
  notes: string;
  /** Always 'todo' on an event, which has nothing to finish. */
  status: TaskStatus;
  priority: TaskPriority;
  color: TaskColor;
  /**
   * `YYYY-MM-DD`. When a task is planned to be worked on — the day it sits on
   * the calendar, the day its reminders count from and its repeats step from;
   * the day of an event. Not the deadline: that is `dueDate`, kept apart so
   * "do it Tuesday, due Friday" can be said. A task saved before the two were
   * separate has only this, and it still counts as the deadline (`deadlineOf()`).
   */
  date: string | null;
  /** `HH:MM`, 24-hour. Optional on both kinds. The planned time, beside `date`. */
  time: string | null;
  /** `HH:MM`. Events only. */
  endTime: string | null;
  /**
   * `YYYY-MM-DD`, the deadline. Tasks only — null on an event, and on any
   * task with no deadline of its own, which then answers to its planned day.
   * Drives overdue, the queue's order, Up next and game-mode penalties
   * (always through `deadlineOf()`); never the calendar or the reminders,
   * which follow the plan.
   */
  dueDate: string | null;
  /** `HH:MM`, the time on the deadline. Null without a `dueDate`. */
  dueTime: string | null;
  /** Events only; 'other' on a task, where it means nothing. */
  eventType: EventType;
  /** Where, or the meeting link. Free text; drawn as a link only when it is one. */
  location: string;
  /** When to be reminded. Empty for none. Never set on a finished task's queue. */
  reminders: TaskReminderLead[];
  /** 'none' on an event and on anything saved before repeats existed. */
  repeat: TaskRepeat;
  /**
   * The day of the month a monthly task belongs on, kept apart from `date`
   * so a task for the 31st comes back on the 31st after a short month
   * rather than drifting to the 28th for good. Set by the server.
   */
  repeatDay: number | null;
  /** `monthlyNth` only: the weekday, 0 (Sunday) to 6. Null on every other repeat. */
  repeatWeekday: number | null;
  /** `monthlyNth` only: which of that weekday — 1–4, and 5 for the last. Empty on every other repeat. */
  repeatNths: number[];
  /**
   * The last day it repeats on, `YYYY-MM-DD`. Every repeating item has one —
   * nothing here goes on for ever (see REPEAT_ADVICE). Null when it does not
   * repeat, and on a repeating item saved before ends existed, which takes a
   * month from its next save.
   */
  repeatUntil: string | null;
  /**
   * A repeating event's dates that have been taken out of the series — moved
   * or changed on their own, and now a separate event (`detachedFrom` on that
   * one). Skipped wherever the series is laid out, reminders included. Empty
   * on everything else.
   */
  skipDates: string[];
  /** The series a separate event was taken out of, for the record. Null on everything else. */
  detachedFrom: string | null;
  /** The copy finishing this one made. Set once, so un-ticking and re-ticking never makes two. */
  nextId: string | null;
  /** Game mode: the XP this task is holding, taken back if it is reopened. */
  xpEarned: number;
  /** Game mode: has counted toward missions once already, and never will again. */
  everDone: boolean;
  /** Game mode: what closing it as Not done cost, given back if that changes. */
  xpLost: number;
  /** Added from a suggested broker task — see src/types/brokerSuggestions.ts. */
  suggestionId: string | null;
  /**
   * The planning slot this task is — see src/types/planning.ts. Set by the
   * server when the slot is made and carried onto each repeat, never taken
   * from a save: it is how the planning card knows to stop asking.
   */
  planning: PlanningKind | null;
  /**
   * Position within its board column, and among the sticky notes. A fraction
   * between its neighbours, so a drag is one write rather than a renumbering
   * of the whole column — see `orderBetween()`.
   */
  order: number;
  /** The steps on the way to finishing it, in order. Tasks only. */
  steps: TaskStep[];
  /**
   * Its place in the queue, set by the person: lower comes first. Null for a
   * task nobody has placed, which queues after every placed one by due date.
   * The number shown beside it is its position, not this — so the queue
   * reads #1, #2, #3 with no gaps whatever has been finished. See `byQueue()`.
   */
  rank: number | null;
  /** Colleagues this task is with, in the order they were added. Empty for none. */
  contacts: TaskContact[];
  /** Loads this task is about, in the order they were added. Empty for none. */
  orders: TaskOrder[];
  /** ISO strings on the wire. */
  createdAt: string | null;
  updatedAt: string | null;
  /** When it last went to Done. Null while it is open. */
  doneAt: string | null;
  /**
   * How a closed task ended — see TASK_OUTCOMES. Null while it is open; a
   * task closed before outcomes existed reads 'done', which it was.
   */
  outcome: TaskOutcome | null;
  /** On a task closed as 'rescheduled': the day it was moved to. */
  rescheduledTo: string | null;
  /** On the copy a reschedule made: the task it was moved from. */
  rescheduledFrom: string | null;
  /**
   * Taken off My tasks by "Clear done", and kept: it still shows on the
   * calendar on its day, so a day can be looked back on. Reopening it brings
   * it back.
   */
  archived: boolean;
  /**
   * Browser only, never stored: this came from the history store (see
   * HISTORY_AFTER_DAYS) and is shown read-only.
   */
  fromHistory?: boolean;
}

/**
 * How a closed task ended. All three are status 'done' — closed, no
 * reminders, out of the queue, never overdue — so everything that asks "is it
 * finished?" needs no change. The outcome is the record of what happened on
 * the day, which is what a calendar looked back on needs:
 *
 * - **done**: it was done. The only one that earns XP or moves a streak.
 * - **notdone**: the day went by and it was not done — said, not deleted.
 * - **rescheduled**: moved to another day. This one stays on the day it was
 *   for, saying where it went; a copy carries on from the new day with its
 *   progress (POST /api/me/tasks/{id}/reschedule). A repeating task carries
 *   its repeat on from there.
 */
export const TASK_OUTCOMES = ['done', 'notdone', 'rescheduled'] as const;
export type TaskOutcome = typeof TASK_OUTCOMES[number];

export const TASK_OUTCOME_LABEL: Record<TaskOutcome, string> = {
  done: 'Done',
  notdone: 'Not done',
  rescheduled: 'Rescheduled',
};

/** The outcome of a closed task (absent reads 'done'); null for an open one or an event. */
export function outcomeOf(t: Pick<PersonalTask, 'kind' | 'status' | 'outcome'>): TaskOutcome | null {
  if (t.kind !== 'task' || t.status !== 'done') return null;
  return t.outcome ?? 'done';
}

/** What can be written. Everything else on a task is set by the server. */
export type PersonalTaskInput = Partial<Pick<PersonalTask,
  'kind' | 'title' | 'notes' | 'status' | 'priority' | 'color' | 'date' | 'time' | 'endTime' | 'dueDate' | 'dueTime' | 'order'
  | 'eventType' | 'location' | 'reminders' | 'repeat' | 'repeatWeekday' | 'repeatNths' | 'repeatUntil'
  | 'suggestionId' | 'steps' | 'rank' | 'contacts' | 'orders' | 'outcome'>>;

export const MAX_QUEUE_RANK = 100_000;

export const MAX_TASK_TITLE = 200;
export const MAX_TASK_NOTES = 4000;
export const MAX_TASK_LOCATION = 500;

/**
 * A ceiling, not a target. The whole list is read on every visit, so this is
 * also the most one page load can cost; a thousand is years of anybody's
 * to-dos, and "Clear done" is on the board for the rest. What has moved to
 * history (below) does not count.
 */
export const MAX_TASKS_PER_PERSON = 1000;

/**
 * History: `personalTasks/{uid}/history/{id}`, the same documents as the list
 * with the same ids, for what is long over.
 *
 * Every visit reads the whole list, and finished tasks are kept now rather
 * than deleted (so a day can be looked back on), so without this the cost of
 * opening My tasks would grow for ever. Anything finished or past more than
 * this many days ago is moved out — once a day, by the first GET of
 * /api/me/tasks — and read only when the Calendar is paged back that far
 * (GET /api/me/tasks/history). It is shown there read-only: it is a record.
 *
 * Never moved, however old: anything open (an overdue task is still work), a
 * repeating event series (it is still happening), and a repeating task that
 * has not made its next copy. Same rules for everybody, so nothing about it
 * is a setting.
 */
export const PERSONAL_TASK_HISTORY = 'history';
export const HISTORY_AFTER_DAYS = 90;

/** The first day still kept in the list: anything finished before it may be in history. */
export function historyCutoff(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - HISTORY_AFTER_DAYS)).toISOString().slice(0, 10);
}

/** Over and old enough to move out of the list. See PERSONAL_TASK_HISTORY. */
export function belongsInHistory(t: PersonalTask, cutoff: string): boolean {
  if (t.kind === 'event') return t.repeat === 'none' && !!t.date && t.date < cutoff;
  if (t.status !== 'done') return false;
  // A repeating task that has not made its next copy would stop repeating.
  if (t.repeat !== 'none' && !t.nextId) return false;
  // By the later of its two days, so a deadline still ahead keeps it in the list.
  const day = [t.date, t.dueDate].filter(Boolean).sort().pop();
  if (day) return day < cutoff;
  // Undated: by when it was closed, and only once it is off the board too.
  return t.archived && !!t.doneAt && t.doneAt.slice(0, 10) < cutoff;
}

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
  if (isTaskStatus(b.status)) out.status = b.status;
  if (oneOf(TASK_PRIORITIES, b.priority)) out.priority = b.priority;
  if (oneOf(TASK_COLORS, b.color)) out.color = b.color;

  for (const key of ['date', 'dueDate'] as const) {
    const v = b[key];
    if (v === null || v === '') out[key] = null;
    else if (typeof v === 'string' && isRealDate(v)) out[key] = v;
  }

  for (const key of ['time', 'endTime', 'dueTime'] as const) {
    const v = b[key];
    if (v === null || v === '') out[key] = null;
    else if (typeof v === 'string' && TIME_RE.test(v)) out[key] = v;
  }

  if (typeof b.order === 'number' && Number.isFinite(b.order)) out.order = b.order;
  if (oneOf(EVENT_TYPES, b.eventType)) out.eventType = b.eventType;
  if (typeof b.location === 'string') out.location = b.location.trim().slice(0, MAX_TASK_LOCATION);
  if (oneOf(TASK_REPEATS, b.repeat)) out.repeat = b.repeat;
  if (b.repeatWeekday === null) out.repeatWeekday = null;
  else if (Number.isInteger(b.repeatWeekday) && (b.repeatWeekday as number) >= 0 && (b.repeatWeekday as number) <= 6) {
    out.repeatWeekday = b.repeatWeekday as number;
  }
  if (Array.isArray(b.repeatNths)) out.repeatNths = cleanNths(b.repeatNths);
  if (b.repeatUntil === null || b.repeatUntil === '') out.repeatUntil = null;
  else if (typeof b.repeatUntil === 'string' && isRealDate(b.repeatUntil)) out.repeatUntil = b.repeatUntil;
  // Checked against the catalog by the route, which is the one that knows it.
  if (b.suggestionId === null) out.suggestionId = null;
  else if (typeof b.suggestionId === 'string' && /^[a-z_]{1,40}$/.test(b.suggestionId)) out.suggestionId = b.suggestionId;
  if (Array.isArray(b.reminders)) {
    out.reminders = TASK_REMINDER_LEADS.filter((l) => (b.reminders as unknown[]).includes(l));
  }
  if (Array.isArray(b.steps)) out.steps = cleanSteps(b.steps);
  if (b.rank === null) out.rank = null;
  else if (typeof b.rank === 'number' && Number.isInteger(b.rank) && b.rank >= 1 && b.rank <= MAX_QUEUE_RANK) out.rank = b.rank;
  if (Array.isArray(b.contacts)) out.contacts = cleanContacts(b.contacts);
  if (Array.isArray(b.orders)) out.orders = cleanOrders(b.orders);
  // 'rescheduled' only ever comes from the reschedule route, which makes the copy it points at.
  if (b.outcome === 'done' || b.outcome === 'notdone') out.outcome = b.outcome;
  return out;
}

/**
 * The deadline that counts: the task's own `dueDate` when it has one, and
 * otherwise its planned day. The fallback is what keeps a task saved before
 * the two were separate behaving as it always did — its one date was labelled
 * "Due" — and it means a planned task with no deadline still goes overdue once
 * its day has gone by, as a missed planning slot must (see `isLapsedPlanning()`).
 *
 * Everything that asks "is it late?" or "what is due soonest?" goes through
 * this; nothing that places a task on the calendar does.
 */
export function deadlineOf(
  t: Pick<PersonalTask, 'date' | 'time'> & Partial<Pick<PersonalTask, 'dueDate' | 'dueTime'>>,
): { date: string; time: string | null } | null {
  if (t.dueDate) return { date: t.dueDate, time: t.dueTime ?? null };
  return t.date ? { date: t.date, time: t.time } : null;
}

/** Just the day of `deadlineOf()`, for code that has no use for the time. */
export function deadlineDay(t: Pick<PersonalTask, 'date'> & Partial<Pick<PersonalTask, 'dueDate'>>): string | null {
  return t.dueDate || t.date || null;
}

/* ------------------------------------------------------------------ queue */

/**
 * Queue order, DankQuest-style: the tasks the person has placed, by the
 * place they gave them; then everything unplaced, soonest due first, undated
 * last. One definition, so the queue, its numbers and the focus screen agree.
 */
export function byQueue(a: PersonalTask, b: PersonalTask): number {
  if (a.rank !== null || b.rank !== null) {
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    if (a.rank !== b.rank) return a.rank - b.rank;
  }
  const da = deadlineOf(a)?.date ?? null;
  const db = deadlineOf(b)?.date ?? null;
  if (da !== db) {
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  }
  return byTime(a, b);
}

/** The open tasks, in queue order. Position + 1 is the number drawn beside each. */
export function taskQueue(tasks: PersonalTask[]): PersonalTask[] {
  return tasks.filter((t) => t.kind === 'task' && t.status !== 'done').sort(byQueue);
}

/**
 * The one task to do next: the closest deadline, overdue ones first (the
 * longest overdue soonest), and the queue's own order between two due the
 * same day. With nothing dated, the top of the queue.
 *
 * Deliberately not just "the queue's #1": a task somebody placed third
 * last week and is now due today is the one that cannot wait.
 */
export function upNextTask(tasks: PersonalTask[]): PersonalTask | null {
  const queue = taskQueue(tasks);
  const dated = queue.map((t) => ({ t, due: deadlineOf(t) })).filter((x) => x.due);
  if (dated.length === 0) return queue[0] ?? null;
  const position = new Map(queue.map((t, i) => [t.id, i]));
  return [...dated].sort(({ t: a, due: x }, { t: b, due: y }) =>
    x!.date.localeCompare(y!.date)
    || (x!.time && y!.time ? x!.time.localeCompare(y!.time) : x!.time ? -1 : y!.time ? 1 : 0)
    || position.get(a.id)! - position.get(b.id)!)[0].t;
}

/** The first step not yet ticked, or null when there is none left (or none at all). */
export function nextStepOf(t: Pick<PersonalTask, 'steps'>): TaskStep | null {
  return t.steps.find((s) => !s.done) ?? null;
}

/**
 * The task's steps with one ticked or unticked — the whole array, which is
 * what a save sends. The server carries each step's XP over by id.
 */
export function withStepToggled(t: Pick<PersonalTask, 'steps'>, stepId: string): TaskStep[] {
  return t.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
}

/** `ids` is the whole queue in its new order; each gets its position as its rank. */
export function rankedBy(ids: string[]): Map<string, number> {
  return new Map(ids.map((id, i) => [id, i + 1]));
}

/** The queue's ids with `id` taken out and put back at position `place` (1-based, clamped). */
export function placeInQueue(queueIds: string[], id: string, place: number): string[] {
  const rest = queueIds.filter((q) => q !== id);
  const at = Math.max(0, Math.min(rest.length, Math.round(place) - 1));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
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

/** Open, and its deadline (see `deadlineOf()`) has passed. Events are never overdue. */
export function isOverdue(t: PersonalTask, today: string): boolean {
  const due = deadlineOf(t);
  return t.kind === 'task' && t.status !== 'done' && !!due && due.date < today;
}

/**
 * A planning slot whose day went by without it being done. It stays on the
 * list as an ordinary task — overdue like any other, and tickable Done or
 * moved to any status — and is never taken off. All this marks is that a
 * repeating one is owed its next copy: the planning route makes it (see
 * there), so the slot keeps coming round and keeps reminding.
 */
export function isLapsedPlanning(
  t: Pick<PersonalTask, 'kind' | 'status' | 'date' | 'planning'>,
  today: string,
): boolean {
  return t.kind === 'task' && !!t.planning && t.status !== 'done' && !!t.date && t.date < today;
}

/** "9:00 AM", or "9:00 AM – 9:30 AM" when it has an end — an event, or a planning slot. */
export function timeRange(t: Pick<PersonalTask, 'time' | 'endTime'>): string {
  if (!t.time) return '';
  return t.endTime ? `${formatTime(t.time)} – ${formatTime(t.endTime)}` : formatTime(t.time);
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
  t: Pick<PersonalTask, 'kind' | 'status' | 'date' | 'time' | 'reminders'> & Partial<RepeatShape>,
  after?: number,
): Partial<Record<TaskReminderLead, number>> {
  const out: Partial<Record<TaskReminderLead, number>> = {};
  if (!t.date || (t.kind === 'task' && t.status === 'done')) return out;

  // A repeating event: for each lead, the first occurrence whose reminder is
  // still ahead of `after` (now, when queueing). Only the next one per lead is
  // ever queued; the run queues the one after when it sends. Without `after`
  // the series' first date stands for it, as a single event would.
  if (t.kind === 'event' && t.repeat && t.repeat !== 'none' && after !== undefined) {
    const shape: RepeatShape & Pick<PersonalTask, 'kind'> = {
      kind: 'event', repeat: t.repeat, date: t.date,
      repeatDay: t.repeatDay ?? null, repeatWeekday: t.repeatWeekday ?? null, repeatNths: t.repeatNths ?? [],
      skipDates: t.skipDates ?? [],
      repeatUntil: t.repeatUntil ?? null,
    };
    const fromDate = new Date(after + OFFICE_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
    // Seventy days covers every pattern plus the longest lead (a week).
    for (const date of occurrencesBetween(shape, fromDate, shiftDays(fromDate, 70))) {
      const one = reminderInstants({ kind: t.kind, status: t.status, time: t.time, reminders: t.reminders, date });
      for (const lead of Object.keys(one) as TaskReminderLead[]) {
        if (out[lead] === undefined && one[lead]! > after) out[lead] = one[lead];
      }
    }
    return out;
  }

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

/** The office date an occurrence starts on, from one of its reminder instants. */
export function occurrenceDateOf(at: number, lead: TaskReminderLead): string {
  return new Date(at + (LEAD_MINUTES[lead] + OFFICE_UTC_OFFSET_MINUTES) * 60_000).toISOString().slice(0, 10);
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

/* ---------------------------------------------------------------- repeats */

function shiftDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The dates in one month (`month` 1–12) that a weekday pattern lands on, in
 * order: `nths` [2, 4] with weekday 3 is that month's 2nd and 4th Wednesday.
 * The 4th and the last are the same day in a month with four of them, and are
 * listed once.
 */
export function nthDatesIn(year: number, month: number, weekday: number, nths: number[]): string[] {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstDay = 1 + ((weekday - firstDow + 7) % 7);
  const daysIn = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const all: number[] = [];
  for (let d = firstDay; d <= daysIn; d += 7) all.push(d);
  const days = new Set<number>();
  for (const n of nths) {
    const d = n === NTH_LAST ? all[all.length - 1] : all[n - 1];
    if (d) days.add(d);
  }
  return [...days].sort((a, b) => a - b)
    .map((d) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
}

/** The last Friday of a month (`month` 1–12) — where monthly planning sits. */
export function lastFridayOf(year: number, month: number): string {
  return nthDatesIn(year, month, 5, [NTH_LAST])[0];
}

type RepeatShape = Pick<PersonalTask, 'repeat' | 'repeatDay' | 'repeatWeekday' | 'repeatNths' | 'date'>
  & Partial<Pick<PersonalTask, 'skipDates' | 'repeatUntil'>>;

/** One step on from `date`, by the item's pattern. */
function stepRepeat(date: string, t: RepeatShape): string {
  const repeat = t.repeat;
  if (repeat === 'daily') return shiftDays(date, 1);
  if (repeat === 'monthlyNth') {
    // The first matching day after `date`: later this month, else the next
    // month that has one. Every month has one; the cap does not assume it.
    const p = nthPattern(t);
    if (!p) return shiftDays(date, 28);
    let [y, m] = date.split('-').map(Number);
    for (let i = 0; i < 14; i++) {
      const hit = nthDatesIn(y, m, p.weekday, p.nths).find((d) => d > date);
      if (hit) return hit;
      if (m === 12) { y++; m = 1; } else m++;
    }
    return shiftDays(date, 28);
  }
  if (repeat === 'weekly') return shiftDays(date, 7);
  if (repeat === 'weekdays') {
    let d = shiftDays(date, 1);
    // UTC throughout, so no time zone can turn a Monday into a Sunday.
    while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = shiftDays(d, 1);
    return d;
  }
  const day = t.repeatDay ?? Number((t.date ?? date).slice(8, 10));
  const [y, m] = date.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/**
 * The due date of the copy a finished repeating task makes: the next date in
 * its pattern that is today or later. Dates already missed are skipped, so a
 * daily task finished three days late makes one task due today, not three
 * overdue ones. Null for a task that does not repeat or has no date.
 */
export function nextOccurrence(t: RepeatShape, today: string): string | null {
  if (t.repeat === 'none' || !t.date) return null;
  let d = stepRepeat(t.date, t);
  // A daily task years overdue is a few hundred steps; the cap only guards a bug.
  for (let i = 0; i < 2000 && d < today; i++) d = stepRepeat(d, t);
  // Past its end it has no next one: the repeat is over.
  return t.repeatUntil && d > t.repeatUntil ? null : d;
}

/**
 * Every date an item falls on between `from` and `to`, inclusive. A single
 * item is its one date; a repeating event is its series, drawn from the
 * pattern. A repeating task is not expanded — only its current copy exists,
 * and drawing copies that will only exist once it is finished would show work
 * that is not on the board.
 */
export function occurrencesBetween(t: RepeatShape & Pick<PersonalTask, 'kind'>, from: string, to: string): string[] {
  if (!t.date) return [];
  if (t.repeat === 'none' || t.kind !== 'event') return t.date >= from && t.date <= to ? [t.date] : [];
  const out: string[] = [];
  const skip = new Set(t.skipDates ?? []);
  let d = t.date;
  // A daily series started years ago walks a few thousand steps; the cap only guards a bug.
  const last = t.repeatUntil && t.repeatUntil < to ? t.repeatUntil : to;
  for (let i = 0; i < 5000 && d <= last; i++) {
    if (d >= from && !skip.has(d)) out.push(d);
    d = stepRepeat(d, t);
  }
  return out;
}

export function occursOn(t: RepeatShape & Pick<PersonalTask, 'kind'>, date: string): boolean {
  return occurrencesBetween(t, date, date).length > 0;
}
