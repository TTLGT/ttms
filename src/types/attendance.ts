import type { HolidayCountry } from './holidays';
import type { UserStatus } from './presence';
import type { BreakReminderSettings } from './breakReminders';

/**
 * Attendance: when people clock in and out, their breaks, and how a day is
 * judged against their schedule.
 *
 * **Pure, like the rest of src/types — no Firestore, no clock of its own.**
 * Every function that needs "now" is handed it. That is what lets the nightly
 * job and the report use the same `summarizeDay()`: the report runs it live
 * for today and for any day the job has not closed yet, the job runs it once
 * and stores the answer, and the two can never disagree about what "late"
 * means.
 *
 * **Everything here is HR data.** Every collection below is closed to the
 * browser in firestore.rules and read only through /api/attendance, which
 * decides who may see whom. Nothing from it is mirrored onto `users/{uid}` or
 * `presence/{uid}`, which every staff member can read. Online status in chat
 * is a separate, deliberately public thing — see src/types/presence.ts.
 *
 * **The clock button is the record of hours.** Activity (the five-minute
 * heartbeat) is shown beside it as evidence, and idle time is shown but never
 * subtracted: somebody on a long phone call looks idle to a browser.
 */

export const ATTENDANCE_DAYS_COLLECTION      = 'attendanceDays';
export const ATTENDANCE_SCHEDULES_COLLECTION = 'attendanceSchedules';
/** The schedule anybody without one of their own follows. */
export const DEFAULT_SCHEDULE_ID             = '_default';
export const TIME_OFF_COLLECTION             = 'timeOffRequests';
export const CORRECTIONS_COLLECTION          = 'attendanceCorrections';
export const HOLIDAY_OVERRIDES_COLLECTION    = 'holidayOverrides';
export const ATTENDANCE_CONFIG_COLLECTION    = 'attendanceConfig';
export const ATTENDANCE_CONFIG_DOC           = 'general';
export const ATTENDANCE_DEVICES_COLLECTION   = 'attendanceDevices';
export const ATTENDANCE_PREFS_COLLECTION     = 'attendancePrefs';
/** One per person per day — the lock that stops a "not in yet" alert going twice. */
export const ATTENDANCE_ALERTS_COLLECTION    = 'attendanceAlerts';

/** Minutes one heartbeat stands for. Keep equal to PRESENCE_HEARTBEAT_MS. */
export const BEAT_MINUTES = 5;

/** How many past days the nightly job re-checks, so one missed night heals itself. */
export const CLOSE_LOOKBACK_DAYS = 7;

// ── Office time ──────────────────────────────────────────────────────────────

/**
 * Guatemala is UTC−6 all year, with no daylight saving — the same fact the
 * celebrations cron leans on. A fixed offset rather than Intl here because
 * this file turns office times *into* instants ("8:00 on the 3rd" → a
 * timestamp), which Intl cannot do, and doing it with arithmetic on a fixed
 * offset has no edge cases to get wrong.
 *
 * If the office ever moves to a zone with daylight saving, this is the one
 * number that stops being true, and every schedule comparison with it.
 */
export const OFFICE_UTC_OFFSET_MINUTES = -6 * 60;

const pad = (n: number) => String(n).padStart(2, '0');
const OFFSET_MS = OFFICE_UTC_OFFSET_MINUTES * 60_000;

/** The office's calendar date at an instant, as `YYYY-MM-DD`. */
export function officeDateOf(ms: number): string {
  const d = new Date(ms + OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Minutes since office midnight, on whatever office day `ms` falls in. */
export function officeMinuteOf(ms: number): number {
  const d = new Date(ms + OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "08:30" on an office date, as an instant. */
export function officeTimeToMs(date: string, hhmm: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, hhmmToMinutes(hhmm)) - OFFSET_MS;
}

/** An instant as "08:30" in office time — what a time box holds. */
export function officeHhmm(ms: number): string {
  const minutes = officeMinuteOf(ms);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** An instant as "8:30 AM" in office time — for messages the server writes. */
export function officeClock(ms: number): string {
  const minutes = officeMinuteOf(ms);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

export function isCalendarDateString(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Every date from `from` to `to`, both included. Capped so a bad range cannot spin. */
export function datesBetween(from: string, to: string, max = 400): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < max; d = addDays(d, 1)) out.push(d);
  return out;
}

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export function weekdayOf(date: string): WeekdayKey {
  const [y, m, d] = date.split('-').map(Number);
  // getUTCDay: 0 = Sunday. Shifted so Monday is 0.
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

export function isHhmm(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** "8h 05m", or "45m" under an hour. For durations, never clock times. */
export function formatMinutes(total: number): string {
  const n = Math.max(0, Math.round(total));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h === 0 ? `${m}m` : `${h}h ${pad(m)}m`;
}

// ── Schedules ────────────────────────────────────────────────────────────────

/** One working day, in office time. `end` before `start` means it runs past midnight. */
export interface Shift {
  start: string;
  end: string;
}

/**
 * What somebody is expected to work.
 *
 * `attendanceSchedules/{email}` for a person, `attendanceSchedules/_default`
 * for everybody without one. Keyed by email rather than uid so HR can set a
 * new hire up before their first sign-in.
 *
 * Somebody with neither a schedule nor a company default is **not scheduled**:
 * never late, never absent. That is deliberate — the default does not exist
 * until HR writes it, so switching this feature on cannot mark the whole
 * company absent on its first night.
 */
export interface Schedule {
  days: Record<WeekdayKey, Shift | null>;
  /** Whose public holidays this person gets off. */
  holidayCountry: HolidayCountry;
  /** Minutes after the start before a clock-in counts as late. */
  graceMinutes: number;
}

/** What the "Standard week" button fills in. A starting point, not a default. */
export const STANDARD_SCHEDULE: Schedule = {
  days: {
    mon: { start: '07:00', end: '16:00' },
    tue: { start: '07:00', end: '16:00' },
    wed: { start: '07:00', end: '16:00' },
    thu: { start: '07:00', end: '16:00' },
    fri: { start: '07:00', end: '16:00' },
    sat: null,
    sun: null,
  },
  holidayCountry: 'GT',
  graceMinutes: 10,
};

export const MAX_GRACE_MINUTES = 120;

/** A schedule from a request body or a stored document, or the reason it is not one. */
export function readSchedule(raw: unknown): Schedule | string {
  if (!raw || typeof raw !== 'object') return 'The schedule is missing.';
  const r = raw as Record<string, unknown>;
  const rawDays = (r.days ?? {}) as Record<string, unknown>;
  const days = {} as Record<WeekdayKey, Shift | null>;

  for (const key of WEEKDAYS) {
    const shift = rawDays[key] as { start?: unknown; end?: unknown } | null | undefined;
    if (!shift) { days[key] = null; continue; }
    if (!isHhmm(shift.start) || !isHhmm(shift.end)) {
      return `${WEEKDAY_LABEL[key]} needs a start and an end time, like 08:00.`;
    }
    if (shift.start === shift.end) return `${WEEKDAY_LABEL[key]} starts and ends at the same time.`;
    days[key] = { start: shift.start, end: shift.end };
  }

  const country = r.holidayCountry === 'US' ? 'US' : 'GT';
  const grace = Number(r.graceMinutes ?? 0);
  if (!Number.isFinite(grace) || grace < 0 || grace > MAX_GRACE_MINUTES) {
    return `Grace minutes must be between 0 and ${MAX_GRACE_MINUTES}.`;
  }

  return { days, holidayCountry: country, graceMinutes: Math.round(grace) };
}

/** Minutes in a shift, handling one that runs past midnight. */
export function shiftMinutes(shift: Shift): number {
  const start = hhmmToMinutes(shift.start);
  const end = hhmmToMinutes(shift.end);
  return end > start ? end - start : end + 24 * 60 - start;
}

// ── The day record ───────────────────────────────────────────────────────────

export interface DeviceInfo {
  kind: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  os: string;
  browser: string;
}

/**
 * Where and on what somebody clocked in or out.
 *
 * `city` / `region` / `country` come from the IP address and are city-level
 * at best — most connections in Guatemala place as Guatemala City wherever
 * the person is, and a VPN moves them anywhere. They are shown as the
 * network's location, never as the person's. `office` is the reliable one:
 * the IP matched a network HR marked as the office's.
 */
export interface ClockDetails {
  at: number;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  /** Internet provider, from ipinfo. Null when the lookup failed or was skipped. */
  provider: string | null;
  device: DeviceInfo | null;
  /** A random id this browser keeps, to tell "same computer as usual" from a new one. */
  deviceId: string | null;
  /** The first time this person has clocked in from that browser. */
  newDevice: boolean;
  office: boolean;
  /**
   * Written by somebody other than the person clicking the button — an
   * approved correction, or the nightly job closing a day nobody clocked out
   * of. The network fields are empty on these: nobody was there.
   */
  manual?: 'correction' | 'autoClose';
}

export interface WorkSession {
  in: ClockDetails;
  out: ClockDetails | null;
}

export type BreakKind = 'break' | 'lunch';
export const BREAK_LABEL: Record<BreakKind, string> = { break: 'Break', lunch: 'Lunch' };

export interface BreakSpan {
  kind: BreakKind;
  start: number;
  end: number | null;
}

/**
 * The work counts behind idea 10. Counted in the browser at the moment each
 * thing succeeds and carried to the server on the next heartbeat or clock
 * action, so they cost no writes of their own. That makes them reports from
 * the person's own browser rather than audited figures: good for "was this a
 * busy day", not for pay.
 */
export type ActivityKind =
  | 'ordersCreated'
  | 'ordersUpdated'
  | 'statusChanges'
  | 'agreementsSent'
  | 'documentsUploaded'
  | 'messagesSent';

export const ACTIVITY_KINDS: ActivityKind[] = [
  'ordersCreated', 'ordersUpdated', 'statusChanges', 'agreementsSent', 'documentsUploaded', 'messagesSent',
];

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  ordersCreated:     'Loads created',
  ordersUpdated:     'Loads edited',
  statusChanges:     'Status changes',
  agreementsSent:    'Agreements sent',
  documentsUploaded: 'Documents uploaded',
  messagesSent:      'Chat messages',
};

/** Largest count one flush may add — a browser cannot claim a thousand loads a minute. */
export const MAX_ACTIVITY_PER_FLUSH = 200;

/** One change HR made to a day, kept forever beside the day it changed. */
export interface DayCorrection {
  at: number;
  byEmail: string;
  byName: string;
  reason: string;
  before: { clockIn: number | null; clockOut: number | null };
  after:  { clockIn: number | null; clockOut: number | null };
}

/**
 * `attendanceDays/{email}_{YYYY-MM-DD}` — one person's office day.
 *
 * Times are epoch milliseconds set by the server, never by the browser.
 */
export interface AttendanceDay {
  email: string;
  uid: string | null;
  name: string;
  date: string;
  sessions: WorkSession[];
  breaks: BreakSpan[];
  /** From the heartbeat. Evidence beside the clock, never the record. */
  firstActiveAt: number | null;
  lastActiveAt: number | null;
  activeMinutes: number;
  idleMinutes: number;
  /**
   * How the clocked-in check-ins were measured: `system` is the whole
   * computer (the browser's Idle Detection, Chrome and Edge, with
   * permission), `page` is the TTMS tab alone. A count of check-ins each, so a
   * day that switched halfway says so.
   */
  measuredBy?: { system?: number; page?: number };
  activity: Partial<Record<ActivityKind, number>>;
  corrections?: DayCorrection[];
  /** Set by the nightly job. A finalized day's `summary` is what the report shows. */
  finalized?: boolean;
  summary?: DaySummary;
}

export function dayDocId(email: string, date: string): string {
  return `${email.toLowerCase()}_${date}`;
}

export function emptyDay(email: string, uid: string | null, name: string, date: string): AttendanceDay {
  return {
    email, uid, name, date,
    sessions: [], breaks: [],
    firstActiveAt: null, lastActiveAt: null,
    activeMinutes: 0, idleMinutes: 0,
    activity: {},
  };
}

/** Clocked in with no clock-out yet. */
export function isClockedIn(day: Pick<AttendanceDay, 'sessions'> | null | undefined): boolean {
  const last = day?.sessions?.[day.sessions.length - 1];
  return Boolean(last && !last.out);
}

export function openBreak(day: Pick<AttendanceDay, 'breaks'> | null | undefined): BreakSpan | null {
  const last = day?.breaks?.[day.breaks.length - 1];
  return last && last.end === null ? last : null;
}

// ── Judging a day ────────────────────────────────────────────────────────────

/**
 * What a day came to.
 *
 * - `working`      — today, clocked in now.
 * - `present`      — clocked in at some point.
 * - `notClockedIn` — used TTMS but never pressed Clock in.
 * - `notIn`        — today, past their start, nothing yet.
 * - `notYet`       — today, before their start.
 * - `absent`       — a scheduled day that passed with nothing at all.
 * - `holiday` / `timeOff` / `off` (not a scheduled day) / `upcoming`.
 */
export type DayOutcome =
  | 'working' | 'present' | 'notClockedIn' | 'notIn' | 'notYet'
  | 'absent' | 'holiday' | 'timeOff' | 'off' | 'upcoming';

export const OUTCOME_LABEL: Record<DayOutcome, string> = {
  working:      'Working now',
  present:      'Present',
  notClockedIn: 'Active, never clocked in',
  notIn:        'Not in yet',
  notYet:       'Not started',
  absent:       'Absent',
  holiday:      'Holiday',
  timeOff:      'Time off',
  off:          'Not scheduled',
  upcoming:     '',
};

export interface DaySummary {
  outcome: DayOutcome;
  shift: Shift | null;
  holiday: string | null;
  timeOff: TimeOffKind | null;
  clockIn: number | null;
  clockOut: number | null;
  workedMinutes: number;
  breakMinutes: number;
  /** Past the grace period, in minutes after the shift start. 0 when on time. */
  lateMinutes: number;
  /** Minutes before the shift end they clocked out. 0 when they stayed. */
  earlyMinutes: number;
  /** A day left open. Closed by the nightly job at their last activity. */
  missedClockOut: boolean;
  /** Clocked in from an office network. Null when not clocked in. */
  office: boolean | null;
  newDevice: boolean;
  activeMinutes: number;
  idleMinutes: number;
  /** How active and idle were measured while clocked in. Null when nothing was. */
  measuredBy: MeasuredBy | null;
}

export type MeasuredBy = 'computer' | 'ttms' | 'mixed';

export const MEASURED_BY_LABEL: Record<MeasuredBy, string> = {
  computer: 'Whole computer',
  ttms:     'TTMS only',
  mixed:    'Partly whole computer, partly TTMS only',
};

function measuredByOf(day: AttendanceDay | null): MeasuredBy | null {
  const system = day?.measuredBy?.system ?? 0;
  const page = day?.measuredBy?.page ?? 0;
  if (!system && !page) return null;
  return system && page ? 'mixed' : system ? 'computer' : 'ttms';
}

export interface SummarizeInput {
  date: string;
  day: AttendanceDay | null;
  schedule: Schedule | null;
  /** The holiday's name if this date is one for this person's country. */
  holiday: string | null;
  timeOff: TimeOffKind | null;
  now: number;
}

/**
 * The single definition of late, early, absent and hours worked.
 *
 * A day that has not been closed yet is judged as it stands: an open
 * session on today counts up to `now`, and an open session on a past day —
 * one the nightly job has not reached — counts up to the last activity and is
 * flagged as a missed clock-out, which is exactly what the job will record.
 */
export function summarizeDay({ date, day, schedule, holiday, timeOff, now }: SummarizeInput): DaySummary {
  const today = officeDateOf(now);
  const shift = schedule ? schedule.days[weekdayOf(date)] : null;
  const grace = schedule?.graceMinutes ?? 0;
  const sessions = day?.sessions ?? [];

  const base: DaySummary = {
    outcome: 'off', shift, holiday, timeOff,
    clockIn: null, clockOut: null,
    workedMinutes: 0, breakMinutes: 0, lateMinutes: 0, earlyMinutes: 0,
    missedClockOut: false, office: null, newDevice: false,
    activeMinutes: day?.activeMinutes ?? 0,
    idleMinutes: day?.idleMinutes ?? 0,
    measuredBy: measuredByOf(day),
  };

  if (sessions.length > 0) {
    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    const open = !last.out;
    const autoClosed = last.out?.manual === 'autoClose';
    // Where an open session is counted up to: now, if it is still today;
    // otherwise the last sign of life, which is where the job will close it.
    const fallbackEnd = date === today ? now : Math.max(day?.lastActiveAt ?? 0, last.in.at);

    let worked = 0;
    for (const s of sessions) worked += Math.max(0, (s.out?.at ?? fallbackEnd) - s.in.at);
    let breaks = 0;
    for (const b of day?.breaks ?? []) breaks += Math.max(0, (b.end ?? fallbackEnd) - b.start);

    const clockIn = first.in.at;
    const clockOut = open ? null : last.out!.at;
    const missed = (open && date < today) || autoClosed;

    let late = 0;
    if (shift) {
      const minutesIn = officeDateOf(clockIn) === date ? officeMinuteOf(clockIn) : 24 * 60;
      const over = minutesIn - hhmmToMinutes(shift.start);
      late = over > grace ? over : 0;
    }
    let early = 0;
    if (shift && clockOut && !missed && officeDateOf(clockOut) === date) {
      const endMin = hhmmToMinutes(shift.end);
      // A shift that runs past midnight cannot be left early on the same day
      // in any way this comparison would understand, so it is not judged.
      if (endMin > hhmmToMinutes(shift.start)) early = Math.max(0, endMin - officeMinuteOf(clockOut));
    }

    return {
      ...base,
      outcome: open && date === today ? 'working' : 'present',
      clockIn,
      clockOut: clockOut ?? (missed ? fallbackEnd : null),
      workedMinutes: Math.max(0, (worked - breaks) / 60_000),
      breakMinutes: breaks / 60_000,
      lateMinutes: late,
      earlyMinutes: early,
      missedClockOut: missed,
      office: first.in.office,
      newDevice: sessions.some((s) => s.in.newDevice),
    };
  }

  if (date > today) {
    return { ...base, outcome: timeOff ? 'timeOff' : holiday ? 'holiday' : shift ? 'upcoming' : 'off' };
  }
  if (timeOff) return { ...base, outcome: 'timeOff' };
  if (holiday) return { ...base, outcome: 'holiday' };
  if (!shift) return { ...base, outcome: 'off' };
  if (day?.firstActiveAt) return { ...base, outcome: 'notClockedIn' };

  if (date === today) {
    const started = officeMinuteOf(now) >= hhmmToMinutes(shift.start) + grace;
    return { ...base, outcome: started ? 'notIn' : 'notYet' };
  }
  return { ...base, outcome: 'absent' };
}

/**
 * Close a day nobody clocked out of: at their last activity, or at the
 * clock-in itself when there was none after it. An open break is closed at
 * the same moment. Returns the day unchanged when nothing is open.
 *
 * Their last activity rather than the end of their shift, because the shift
 * end is what they were meant to do and the activity is what we know they
 * did. The flag stays on the day, so a correction request can put it right.
 */
export function closeOpenDay(day: AttendanceDay): AttendanceDay {
  const last = day.sessions[day.sessions.length - 1];
  if (!last || last.out) return day;
  const at = Math.max(day.lastActiveAt ?? 0, last.in.at);
  const out: ClockDetails = {
    at, ip: null, city: null, region: null, country: null, provider: null,
    device: null, deviceId: null, newDevice: false, office: false, manual: 'autoClose',
  };
  return {
    ...day,
    sessions: [...day.sessions.slice(0, -1), { ...last, out }],
    breaks: day.breaks.map((b) => (b.end === null ? { ...b, end: Math.max(b.start, at) } : b)),
  };
}

// ── Time off ─────────────────────────────────────────────────────────────────

export type TimeOffKind = 'vacation' | 'sick' | 'personal' | 'unpaid' | 'other';
export const TIME_OFF_KINDS: TimeOffKind[] = ['vacation', 'sick', 'personal', 'unpaid', 'other'];
export const TIME_OFF_LABEL: Record<TimeOffKind, string> = {
  vacation: 'Vacation',
  sick:     'Sick',
  personal: 'Personal',
  unpaid:   'Unpaid leave',
  other:    'Other',
};

export type RequestStatus = 'pending' | 'approved' | 'refused' | 'withdrawn';

export interface TimeOffRequest {
  id: string;
  email: string;
  name: string;
  from: string;
  to: string;
  kind: TimeOffKind;
  note: string;
  status: RequestStatus;
  createdAt: number;
  /** Entered by HR on somebody's behalf — a sick day phoned in. */
  enteredByEmail: string | null;
  decidedAt: number | null;
  decidedByEmail: string | null;
  decidedByName: string | null;
  decisionNote: string;
}

/** Longest single request. A year is a leave of absence, not a request. */
export const MAX_TIME_OFF_DAYS = 90;

/** The approved time off covering a date, if any. */
export function timeOffOn(date: string, email: string, requests: TimeOffRequest[]): TimeOffKind | null {
  const hit = requests.find((r) =>
    r.status === 'approved' && r.email === email && r.from <= date && date <= r.to);
  return hit ? hit.kind : null;
}

// ── Corrections ──────────────────────────────────────────────────────────────

/**
 * "I forgot to clock out at 6pm." Asked by the person, decided by HR.
 *
 * Times are office clock times on `date`; a clock-out earlier than the
 * clock-in is read as after midnight. Either may be null to leave that end as
 * it is. Approval rewrites the day and appends a `DayCorrection` holding the
 * before and after — the original is never lost.
 */
export interface CorrectionRequest {
  id: string;
  email: string;
  name: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  reason: string;
  status: RequestStatus;
  createdAt: number;
  decidedAt: number | null;
  decidedByEmail: string | null;
  decidedByName: string | null;
  decisionNote: string;
}

export const MAX_REASON_LENGTH = 500;

/**
 * The day with a correction applied, or the reason it cannot be.
 *
 * With several sessions, the clock-in moves the first and the clock-out moves
 * the last — which is what somebody asking means. A day with no sessions at
 * all (they forgot to clock in entirely) gets one.
 */
export function applyCorrection(
  day: AttendanceDay,
  change: { clockIn: string | null; clockOut: string | null },
  by: { email: string; name: string; reason: string; at: number },
): AttendanceDay | string {
  const manual = (at: number): ClockDetails => ({
    at, ip: null, city: null, region: null, country: null, provider: null,
    device: null, deviceId: null, newDevice: false, office: false, manual: 'correction',
  });

  const sessions = day.sessions.map((s) => ({ ...s }));
  const before = {
    clockIn: sessions[0]?.in.at ?? null,
    clockOut: sessions[sessions.length - 1]?.out?.at ?? null,
  };

  const inAt = change.clockIn ? officeTimeToMs(day.date, change.clockIn) : null;
  let outAt = change.clockOut ? officeTimeToMs(day.date, change.clockOut) : null;

  if (sessions.length === 0) {
    if (inAt === null || outAt === null) {
      return 'There is no clock-in on that day, so both times are needed.';
    }
    if (outAt <= inAt) outAt += 24 * 60 * 60_000;
    sessions.push({ in: manual(inAt), out: manual(outAt) });
  } else {
    if (inAt !== null) sessions[0] = { ...sessions[0], in: { ...sessions[0].in, at: inAt, manual: 'correction' } };
    if (outAt !== null) {
      const lastIn = sessions[sessions.length - 1].in.at;
      if (outAt <= lastIn) outAt += 24 * 60 * 60_000;
      const last = sessions[sessions.length - 1];
      sessions[sessions.length - 1] = { ...last, out: last.out ? { ...last.out, at: outAt, manual: 'correction' } : manual(outAt) };
    }
    for (const s of sessions) {
      if (s.out && s.out.at <= s.in.at) return 'The clock-out would be before the clock-in.';
    }
  }

  const after = {
    clockIn: sessions[0]?.in.at ?? null,
    clockOut: sessions[sessions.length - 1]?.out?.at ?? null,
  };
  const closeAt = after.clockOut ?? Date.now();
  return {
    ...day,
    sessions,
    breaks: day.breaks.map((b) => (b.end === null ? { ...b, end: Math.max(b.start, closeAt) } : b)),
    corrections: [...(day.corrections ?? []), { at: by.at, byEmail: by.email, byName: by.name, reason: by.reason, before, after }],
    // Re-judged: the nightly job's answer was about the day before this change.
    finalized: false,
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

export interface OfficeNetwork {
  ip: string;
  label: string;
}

/**
 * `attendanceConfig/general` — HR's settings for the whole feature.
 *
 * Closed to the browser, unlike `appSettings`, because the office's IP
 * address does not need to be readable by every account.
 */
export interface AttendanceConfig {
  officeNetworks: OfficeNetwork[];
  /** Post "not in yet" alerts at all. */
  alerts: boolean;
  /** How long past someone's start (after their grace) before the alert. */
  alertAfterMinutes: number;
  /** The company's break reminders. People can have their own on `attendancePrefs`. */
  reminders: BreakReminderSettings;
}

// Without `reminders`: their defaults live in breakReminders.ts, which imports
// from this file, and a value imported back the other way would be undefined
// while the two modules load. loadConfig() fills it in.
export const DEFAULT_ATTENDANCE_CONFIG: Omit<AttendanceConfig, 'reminders'> = {
  officeNetworks: [],
  alerts: true,
  alertAfterMinutes: 30,
};

export const MAX_OFFICE_NETWORKS = 20;

// ── Device ───────────────────────────────────────────────────────────────────

/**
 * "Windows · Chrome · desktop" from a user-agent string.
 *
 * Deliberately coarse. The user-agent is whatever the browser chooses to say,
 * and it cannot name a particular machine — that is what the device id is
 * for. Order matters: Edge and Opera claim to be Chrome, and Chrome claims to
 * be Safari.
 */
export function describeDevice(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? '';
  if (!s) return { kind: 'unknown', os: 'Unknown', browser: 'Unknown' };

  const os =
    /Windows/i.test(s) ? 'Windows'
    : /iPhone|iPod/i.test(s) ? 'iPhone'
    : /iPad/i.test(s) ? 'iPad'
    : /Android/i.test(s) ? 'Android'
    : /CrOS/i.test(s) ? 'ChromeOS'
    : /Mac OS X|Macintosh/i.test(s) ? 'Mac'
    : /Linux/i.test(s) ? 'Linux'
    : 'Unknown';

  const browser =
    /Edg\//i.test(s) ? 'Edge'
    : /OPR\/|Opera/i.test(s) ? 'Opera'
    : /Firefox|FxiOS/i.test(s) ? 'Firefox'
    : /Chrome|CriOS/i.test(s) ? 'Chrome'
    : /Safari/i.test(s) ? 'Safari'
    : 'Unknown';

  const kind: DeviceInfo['kind'] =
    /iPad|Tablet/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s)) ? 'tablet'
    : /Mobi|iPhone|iPod/i.test(s) ? 'mobile'
    : 'desktop';

  return { kind, os, browser };
}

export function deviceLabel(d: DeviceInfo | null | undefined): string {
  if (!d) return '—';
  return `${d.os} · ${d.browser} · ${d.kind}`;
}

/** "Guatemala City, Guatemala" — whatever parts there are. */
export function placeLabel(c: Pick<ClockDetails, 'city' | 'region' | 'country'> | null | undefined): string {
  if (!c) return '';
  return [c.city, c.region, c.country].filter(Boolean).join(', ');
}

// ── What the routes answer with ──────────────────────────────────────────────

/** What the sidebar clock shows. From GET /api/attendance/me and every clock action. */
export interface ClockState {
  date: string;
  clockedIn: boolean;
  /** Start of the session running now. */
  sessionStart: number | null;
  /** First clock-in of the day, for "in since 8:02". */
  firstClockIn: number | null;
  onBreak: BreakKind | null;
  breakStart: number | null;
  status: UserStatus | null;
  statusNote: string;
  hideLastSeen: boolean;
  /** Kinds of break already started on the open day — a reminder for one is then not due. */
  breaksTaken: BreakKind[];
  /** This person's break reminders: the company's, with any of their own over it. */
  reminders: BreakReminderSettings;
  /**
   * When this person is due in on `date`, for the clock-in reminder, or null
   * when they are not: a day off on their schedule, a holiday, time off
   * (pending included), or the reminder switched off. Worked out only before
   * the first clock-in of the day — after it nothing reads this, and it is
   * left null to save the reads.
   */
  dueAt: { start: string; end: string } | null;
}

export interface ReportPerson {
  email: string;
  uid: string | null;
  name: string;
  teamId: string | null;
  photoPath: string | null;
}

export interface AttendanceReport {
  from: string;
  to: string;
  today: string;
  people: ReportPerson[];
  /** email → date → summary. */
  cells: Record<string, Record<string, DaySummary>>;
  /** email → the break they are on now. Today only. */
  onBreak: Record<string, BreakKind>;
  /** email → date → work counts, for the days that have any. */
  activity: Record<string, Record<string, Partial<Record<ActivityKind, number>>>>;
  teams: { id: string; name: string }[];
}
