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
 * - an **event** is an appointment — a call with a client at 10:00. It has a
 *   date and nothing to finish, so it appears on the calendar only.
 */

export const PERSONAL_TASKS_COLLECTION = 'personalTasks';
export const PERSONAL_TASK_ITEMS = 'items';

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
  'kind' | 'title' | 'notes' | 'status' | 'priority' | 'color' | 'date' | 'time' | 'endTime' | 'order'>>;

export const MAX_TASK_TITLE = 200;
export const MAX_TASK_NOTES = 4000;

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
 * Today in the viewer's own browser. Deliberately not the office date that
 * celebrations and attendance use: this is somebody's own list, and "due
 * today" should mean today where they are sitting.
 */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
