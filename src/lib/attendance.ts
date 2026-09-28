'use client';

import { auth } from './firebase';
import type {
  AttendanceConfig,
  AttendanceDay,
  AttendanceReport,
  ClockState,
  ActivityKind,
  BreakKind,
  CorrectionRequest,
  DaySummary,
  Schedule,
  TimeOffKind,
  TimeOffRequest,
} from '@/types/attendance';
import type { HolidayOverride, HolidayCountry } from '@/types/holidays';
import type { UserStatus } from '@/types/presence';

/**
 * Attendance from the browser. Everything goes through /api/attendance —
 * none of these collections can be read with the client SDK.
 */

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Something went wrong');
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

// ── The device id ────────────────────────────────────────────────────────────

const DEVICE_KEY = 'ttms.deviceId';

/**
 * A random id this browser keeps, sent with every clock action so the report
 * can say "a device we have not seen before". It identifies a browser profile,
 * not a person or a machine: clearing site data makes a new one, and that is
 * fine — the flag is a prompt to look, not an accusation.
 */
export function deviceId(): string | null {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

// ── Work counts ──────────────────────────────────────────────────────────────

const COUNTS_KEY = 'ttms.activityCounts';
let countsInMemory: Partial<Record<ActivityKind, number>> = {};

/**
 * Count one piece of work — a load created, a message sent.
 *
 * Kept in this browser until the next heartbeat or clock action carries it to
 * the server, so counting costs no writes of its own. localStorage rather
 * than memory so a count made just before a reload is not lost, and so every
 * tab adds to one tally. Never throws: counting must not be able to break the
 * thing being counted.
 */
export function trackActivity(kind: ActivityKind, n = 1): void {
  try {
    const current = readCounts();
    current[kind] = (current[kind] ?? 0) + n;
    writeCounts(current);
  } catch {
    // Nothing: the work happened whether or not it was counted.
  }
}

function readCounts(): Partial<Record<ActivityKind, number>> {
  try {
    return JSON.parse(window.localStorage.getItem(COUNTS_KEY) ?? '{}') ?? {};
  } catch {
    return { ...countsInMemory };
  }
}

function writeCounts(counts: Partial<Record<ActivityKind, number>>) {
  countsInMemory = counts;
  try {
    window.localStorage.setItem(COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // In memory only, then.
  }
}

/**
 * Take the counts to send, emptying the tally. If the send then fails, the
 * caller puts them back with `restoreCounts`.
 */
export function takeCounts(): Partial<Record<ActivityKind, number>> {
  const counts = readCounts();
  writeCounts({});
  return counts;
}

export function restoreCounts(counts: Partial<Record<ActivityKind, number>>): void {
  const current = readCounts();
  for (const [k, n] of Object.entries(counts)) {
    current[k as ActivityKind] = (current[k as ActivityKind] ?? 0) + (n as number);
  }
  writeCounts(current);
}

// ── The clock ────────────────────────────────────────────────────────────────

export interface MyAttendance {
  state: ClockState;
  seesOthers: boolean;
  manages: boolean;
}

export const fetchMyAttendance = () => call<MyAttendance>('/api/attendance/me');

export async function clock(action: 'in' | 'out' | 'breakStart' | 'breakEnd', kind?: BreakKind): Promise<ClockState> {
  const counts = takeCounts();
  try {
    const res = await call<{ state: ClockState }>('/api/attendance/clock', json('POST', {
      action, kind, deviceId: deviceId(), counts,
    }));
    return res.state;
  } catch (e) {
    restoreCounts(counts);
    throw e;
  }
}

export async function sendBeat(body: {
  active: boolean;
  clockedIn: boolean;
  hidden: boolean;
  /** Whole computer, or this TTMS tab only — recorded on the day. */
  source: 'system' | 'page';
}): Promise<void> {
  const counts = takeCounts();
  try {
    await call('/api/attendance/beat', json('POST', { ...body, counts }));
  } catch (e) {
    restoreCounts(counts);
    throw e;
  }
}

export const saveStatus = (status: UserStatus | null, note: string) =>
  call('/api/attendance/status', json('PUT', { status, note }));

export const saveHideLastSeen = (hideLastSeen: boolean) =>
  call<{ state: ClockState }>('/api/attendance/me', json('PATCH', { hideLastSeen }));

// ── Reports ──────────────────────────────────────────────────────────────────

export const fetchReport = (from: string, to: string, scope: 'self' | 'visible') =>
  call<AttendanceReport>(`/api/attendance/report?from=${from}&to=${to}${scope === 'self' ? '&scope=self' : ''}`);

export const fetchToday = () => call<{ report: AttendanceReport | null }>('/api/attendance/today');

export const fetchDay = (email: string, date: string) =>
  call<{ day: AttendanceDay | null }>(`/api/attendance/day?email=${encodeURIComponent(email)}&date=${date}`);

export const editDay = (input: { email: string; date: string; clockIn: string | null; clockOut: string | null; reason: string }) =>
  call<{ day: AttendanceDay | null }>('/api/attendance/day', json('PATCH', input));

// ── Setup ────────────────────────────────────────────────────────────────────

export interface SchedulesResponse {
  fallback: Schedule | null;
  byEmail: Record<string, Schedule>;
  people: { email: string; name: string; pending: boolean }[];
}

export const fetchSchedules = () => call<SchedulesResponse>('/api/attendance/schedules');
export const saveSchedule = (target: string, schedule: Schedule | null) =>
  call('/api/attendance/schedules', json('PUT', { target, schedule }));

export const fetchHolidayOverrides = () => call<{ overrides: HolidayOverride[] }>('/api/attendance/holidays');
export const saveHolidayOverride = (input: {
  country: HolidayCountry; originalDate: string | null; movedTo: string | null; name: string; note?: string;
}) => call<{ override: HolidayOverride }>('/api/attendance/holidays', json('POST', input));
export const deleteHolidayOverride = (id: string) =>
  call(`/api/attendance/holidays?id=${encodeURIComponent(id)}`, { method: 'DELETE' });

export const fetchConfig = () => call<{ config: AttendanceConfig; yourIp: string | null }>('/api/attendance/config');
export const saveConfig = (patch: Partial<AttendanceConfig>) =>
  call<{ config: AttendanceConfig }>('/api/attendance/config', json('PUT', patch));

// ── Requests ─────────────────────────────────────────────────────────────────

export const fetchTimeOff = (scope: 'self' | 'all') =>
  call<{ requests: TimeOffRequest[] }>(`/api/attendance/time-off?scope=${scope}`);
export const requestTimeOff = (input: { from: string; to: string; kind: TimeOffKind; note: string; email?: string }) =>
  call<{ request: TimeOffRequest }>('/api/attendance/time-off', json('POST', input));
export const decideTimeOff = (id: string, decision: 'approve' | 'refuse' | 'withdraw', note = '') =>
  call<{ request: TimeOffRequest }>('/api/attendance/time-off', json('PATCH', { id, decision, note }));

export const fetchCorrections = (scope: 'self' | 'all') =>
  call<{ requests: CorrectionRequest[] }>(`/api/attendance/corrections?scope=${scope}`);
export const requestCorrection = (input: { date: string; clockIn: string | null; clockOut: string | null; reason: string }) =>
  call<{ request: CorrectionRequest }>('/api/attendance/corrections', json('POST', input));
export const decideCorrection = (id: string, decision: 'approve' | 'refuse' | 'withdraw', note = '') =>
  call<{ request: CorrectionRequest }>('/api/attendance/corrections', json('PATCH', { id, decision, note }));
