import {
  hhmmToMinutes,
  isHhmm,
  officeClock,
  officeDateOf,
  officeMinuteOf,
  officeTimeToMs,
  weekdayOf,
  WEEKDAYS,
  type BreakKind,
  type WeekdayKey,
} from './attendance';
import { exercisesFor, type PauseExercise } from './pauseExercises';

/**
 * Break reminders: "you have an hour left to take your break", "time for
 * lunch", and the optional active pause — a few minutes to stand up and
 * stretch.
 *
 * **Run in the browser, not on a clock.** Each tab works out from the clock
 * state it already holds whether a reminder is due, so there is no cron, no
 * queue and no read per check. The cost is the same limit chatNotify.ts
 * states: nobody without TTMS open is reminded. That is acceptable here
 * because a reminder only ever goes to somebody clocked in, and the clock is
 * in TTMS.
 *
 * **They grant and record nothing.** A reminder is a nudge with a shortcut to
 * the Break button; taking the break is the ordinary clock action, recorded
 * the ordinary way. Dismissing one is remembered in this browser only.
 *
 * Every time here is office time (Guatemala, UTC−6), whatever the computer's
 * own clock says — see OFFICE_UTC_OFFSET_MINUTES.
 */

/**
 * A reminder at a time of day, once a day. All three kinds have this shape:
 * the active pause was a repeating timer first, and was made a single daily
 * slot (2026-10-08) because the break and lunch already split the day — the
 * only long stretch without one is the start of the morning.
 */
export interface SlotReminder {
  enabled: boolean;
  /** When the reminder appears. */
  at: string;
  /** When the window closes; the reminder disappears then. */
  until: string;
  /** How long the break or pause is, for the wording. */
  minutes: number;
  days: WeekdayKey[];
}

export interface BreakReminderSettings {
  break: SlotReminder;
  lunch: SlotReminder;
  activePause: SlotReminder;
}

export type ReminderKind = keyof BreakReminderSettings;
export const REMINDER_KINDS: ReminderKind[] = ['break', 'lunch', 'activePause'];
export const REMINDER_LABEL: Record<ReminderKind, string> = {
  break: 'Morning break',
  lunch: 'Lunch',
  activePause: 'Active pause',
};

/**
 * One person's differences from the company's. A kind that is absent follows
 * the company; a kind that is present replaces it whole, so turning the
 * company's lunch time later never half-changes somebody with their own.
 */
export type ReminderOverride = Partial<BreakReminderSettings>;

const WEEKDAYS_ONLY: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/**
 * What the company asked for (2026-10-08): a 20-minute break to be taken by
 * 11, lunch fixed at 1 to 2, Monday to Friday. The active pause is off until
 * HR turns it on; 8:30 sits in the middle of the 7-to-10 stretch, the longest
 * of a 7-to-4 day without a break. After lunch there are two hours left,
 * which the company judged not to need one.
 */
export const DEFAULT_BREAK_REMINDERS: BreakReminderSettings = {
  break:       { enabled: true,  at: '10:00', until: '11:00', minutes: 20, days: WEEKDAYS_ONLY },
  lunch:       { enabled: true,  at: '13:00', until: '14:00', minutes: 60, days: WEEKDAYS_ONLY },
  activePause: { enabled: false, at: '08:30', until: '09:30', minutes: 5,  days: WEEKDAYS_ONLY },
};

/** How long each kind may last. A pause is a stretch, not a second break. */
export const MINUTES_LIMITS: Record<ReminderKind, { min: number; max: number }> = {
  break:       { min: 5, max: 120 },
  lunch:       { min: 5, max: 120 },
  activePause: { min: 1, max: 15 },
};

/** Snoozing a reminder: "Later". */
export const SNOOZE_MINUTES = 15;

// ── Reading and checking ─────────────────────────────────────────────────────

function readDays(raw: unknown, label: string): WeekdayKey[] | string {
  if (!Array.isArray(raw)) return `${label}: pick the days.`;
  const days = WEEKDAYS.filter((d) => raw.includes(d));
  return days;
}

function readKind(kind: ReminderKind, raw: unknown): SlotReminder | string {
  const label = REMINDER_LABEL[kind];
  if (!raw || typeof raw !== 'object') return `${label} is missing.`;
  const r = raw as Record<string, unknown>;
  if (!isHhmm(r.at) || !isHhmm(r.until)) return `${label} needs a time and an end time, like 10:00.`;
  const window = hhmmToMinutes(r.until) - hhmmToMinutes(r.at);
  if (window <= 0) return `${label} must end after it starts (and not past midnight).`;
  const minutes = Math.round(Number(r.minutes));
  const { min, max } = MINUTES_LIMITS[kind];
  if (!Number.isFinite(minutes) || minutes < min || minutes > max) return `${label} must last between ${min} and ${max} minutes.`;
  if (minutes > window) return `A ${minutes}-minute ${label.toLowerCase()} does not fit between those times.`;
  const days = readDays(r.days, label);
  if (typeof days === 'string') return days;
  return { enabled: r.enabled === true, at: r.at, until: r.until, minutes, days };
}

/** The company's settings from a request body, or the reason they are not. */
export function readReminderSettings(raw: unknown): BreakReminderSettings | string {
  if (!raw || typeof raw !== 'object') return 'The reminder settings are missing.';
  const r = raw as Record<string, unknown>;
  const out: Partial<Record<ReminderKind, unknown>> = {};
  for (const kind of REMINDER_KINDS) {
    const v = readKind(kind, r[kind]);
    if (typeof v === 'string') return v;
    out[kind] = v;
  }
  return out as BreakReminderSettings;
}

/** One person's override from a request body; only the kinds it names. */
export function readReminderOverride(raw: unknown): ReminderOverride | string {
  if (!raw || typeof raw !== 'object') return 'The reminder settings are missing.';
  const r = raw as Record<string, unknown>;
  const out: Partial<Record<ReminderKind, unknown>> = {};
  for (const kind of REMINDER_KINDS) {
    if (r[kind] == null) continue;
    const v = readKind(kind, r[kind]);
    if (typeof v === 'string') return v;
    out[kind] = v;
  }
  return out as ReminderOverride;
}

/**
 * Stored settings, forgiving: a kind edited by hand into nonsense falls back
 * to the default rather than switching reminders off for the company.
 */
export function storedReminderSettings(raw: unknown): BreakReminderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_BREAK_REMINDERS } as Record<ReminderKind, unknown>;
  for (const kind of REMINDER_KINDS) {
    const v = r[kind] == null ? null : readKind(kind, r[kind]);
    if (v && typeof v !== 'string') out[kind] = v;
  }
  return out as BreakReminderSettings;
}

export function storedReminderOverride(raw: unknown): ReminderOverride {
  const v = raw == null ? {} : readReminderOverride(raw);
  return typeof v === 'string' ? {} : v;
}

export function effectiveReminders(company: BreakReminderSettings, own: ReminderOverride): BreakReminderSettings {
  return {
    break:       own.break       ?? company.break,
    lunch:       own.lunch       ?? company.lunch,
    activePause: own.activePause ?? company.activePause,
  };
}

// ── What is due ──────────────────────────────────────────────────────────────

/** What the browser needs from the clock state to decide. */
export interface ReminderClock {
  clockedIn: boolean;
  onBreak: BreakKind | null;
  /** Kinds of break already started on the open day. */
  breaksTaken: BreakKind[];
  reminders: BreakReminderSettings;
}

export interface DueReminder {
  kind: ReminderKind;
  /** Stable for one occurrence — what a dismissal and a notification are keyed on. */
  key: string;
  title: string;
  body: string;
  /** The break kind "Start" begins, or null for an active pause. */
  starts: BreakKind | null;
  /** The active pause's exercises for the day — see src/types/pauseExercises.ts. */
  exercises?: PauseExercise[];
}

/** "1 hour", "45 minutes", "1 hour 15 minutes". */
function spoken(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hours = h === 0 ? '' : h === 1 ? '1 hour' : `${h} hours`;
  const mins = m === 0 ? '' : m === 1 ? '1 minute' : `${m} minutes`;
  return [hours, mins].filter(Boolean).join(' ') || 'less than a minute';
}

/**
 * The reminder to show now, if any — one at a time, in the order of
 * REMINDER_KINDS. `snoozed` maps a reminder's key to when it may show again;
 * a reminder dealt with is snoozed for the day.
 */
export function dueReminder(
  clock: ReminderClock,
  now: number,
  snoozed: Record<string, number>,
): DueReminder | null {
  if (!clock.clockedIn || clock.onBreak) return null;
  const date = officeDateOf(now);
  const weekday = weekdayOf(date);
  const minute = officeMinuteOf(now);

  for (const kind of REMINDER_KINDS) {
    const r = clock.reminders[kind];
    if (!r.enabled || !r.days.includes(weekday)) continue;
    // An active pause is not a clock action, so nothing on the day says one
    // was taken; "Done" snoozing it for the day is the whole record.
    if (kind !== 'activePause' && clock.breaksTaken.includes(kind)) continue;
    const from = hhmmToMinutes(r.at);
    const to = hhmmToMinutes(r.until);
    if (minute < from || minute >= to) continue;
    const key = `${date}|${kind}`;
    if (snoozed[key] > now) continue;

    if (kind === 'activePause') {
      return {
        kind, key, starts: null,
        title: 'Active pause · Pausa activa',
        body: `Take ${r.minutes} minute${r.minutes === 1 ? '' : 's'} for today's exercises.`,
        exercises: exercisesFor(date),
      };
    }
    const name = kind === 'lunch' ? 'lunch' : 'break';
    const until = officeClock(officeTimeToMs(date, r.until));
    // A window exactly as long as the break is a fixed slot — lunch, 1 to 2 —
    // and "you have an hour left to take your hour" would be nonsense.
    const fixed = to - from === r.minutes;
    return fixed
      ? {
          kind, key, starts: kind,
          title: kind === 'lunch' ? 'Lunch time' : 'Break time',
          body: `Your ${name} is ${officeClock(officeTimeToMs(date, r.at))} to ${until}.`,
        }
      : {
          kind, key, starts: kind,
          title: `Take your ${r.minutes}-minute ${name}`,
          body: `You have ${spoken(to - minute)} left to take it — until ${until}.`,
        };
  }
  return null;
}
