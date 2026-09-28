import { adminDb } from './firebase-admin';
import { ALLOWED_USERS_COLLECTION, normalizeEmail } from './accessControl';
import {
  AttendanceError,
  canSeePerson,
  judge,
  loadConfig,
  loadJudgeContext,
  loadPeople,
  readDay,
  type AttendanceCaller,
} from './attendanceServer';
import { fullName } from '@/types/allowedUser';
import {
  ATTENDANCE_CONFIG_COLLECTION,
  ATTENDANCE_CONFIG_DOC,
  ATTENDANCE_DAYS_COLLECTION,
  ATTENDANCE_SCHEDULES_COLLECTION,
  CORRECTIONS_COLLECTION,
  DEFAULT_SCHEDULE_ID,
  HOLIDAY_OVERRIDES_COLLECTION,
  MAX_OFFICE_NETWORKS,
  MAX_REASON_LENGTH,
  MAX_TIME_OFF_DAYS,
  TIME_OFF_COLLECTION,
  TIME_OFF_KINDS,
  applyCorrection,
  datesBetween,
  dayDocId,
  emptyDay,
  isCalendarDateString,
  isHhmm,
  officeDateOf,
  readSchedule,
  type AttendanceConfig,
  type CorrectionRequest,
  type OfficeNetwork,
  type Schedule,
  type TimeOffKind,
  type TimeOffRequest,
} from '@/types/attendance';
import { overrideIdFor, type HolidayCountry, type HolidayOverride } from '@/types/holidays';

/**
 * The records HR keeps around attendance: schedules, holiday changes, the
 * office networks, and the two kinds of request people make — time off, and
 * a correction to a day. Every write here names who made it.
 */

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function personEntry(emailRaw: string): Promise<{ email: string; uid: string | null; name: string }> {
  const email = normalizeEmail(emailRaw);
  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();
  if (!snap.exists) throw new AttendanceError('That person is not on the access list.', 404);
  const d = snap.data()!;
  return { email, uid: typeof d.uid === 'string' ? d.uid : null, name: fullName(d) || email };
}

// ── Schedules ────────────────────────────────────────────────────────────────

export async function listSchedules(): Promise<{ fallback: Schedule | null; byEmail: Record<string, Schedule> }> {
  const snap = await adminDb.collection(ATTENDANCE_SCHEDULES_COLLECTION).get();
  const byEmail: Record<string, Schedule> = {};
  let fallback: Schedule | null = null;
  for (const doc of snap.docs) {
    const s = readSchedule(doc.data());
    if (typeof s === 'string') continue;
    if (doc.id === DEFAULT_SCHEDULE_ID) fallback = s;
    else byEmail[doc.id] = s;
  }
  return { fallback, byEmail };
}

/**
 * Set or clear one schedule. `target` is an email or `_default`. Null clears:
 * a person then follows the company default, and a cleared default means
 * anybody without their own is not scheduled at all.
 */
export async function saveSchedule(caller: AttendanceCaller, target: string, raw: unknown): Promise<void> {
  const id = target === DEFAULT_SCHEDULE_ID ? DEFAULT_SCHEDULE_ID : (await personEntry(target)).email;
  const ref = adminDb.collection(ATTENDANCE_SCHEDULES_COLLECTION).doc(id);
  if (raw === null) {
    await ref.delete();
    return;
  }
  const schedule = readSchedule(raw);
  if (typeof schedule === 'string') throw new AttendanceError(schedule);
  await ref.set({ ...schedule, updatedAt: Date.now(), updatedByEmail: caller.email });
}

// ── Holidays ─────────────────────────────────────────────────────────────────

export async function listOverrides(): Promise<HolidayOverride[]> {
  const snap = await adminDb.collection(HOLIDAY_OVERRIDES_COLLECTION).get();
  return snap.docs.map((d) => ({ ...(d.data() as Omit<HolidayOverride, 'id'>), id: d.id }));
}

/**
 * Move a calculated holiday, stop observing it, or add a day.
 *
 * The id of a change to a calculated holiday is derived from it, so moving
 * the same holiday twice replaces the first move rather than stacking two.
 */
export async function saveOverride(caller: AttendanceCaller, raw: Record<string, unknown>): Promise<HolidayOverride> {
  const country: HolidayCountry = raw.country === 'US' ? 'US' : 'GT';
  const originalDate = raw.originalDate == null ? null : String(raw.originalDate);
  const movedTo = raw.movedTo == null ? null : String(raw.movedTo);
  const name = text(raw.name, 100);
  const note = text(raw.note, 200);

  if (originalDate !== null && !isCalendarDateString(originalDate)) throw new AttendanceError('The holiday’s date is not a date.');
  if (movedTo !== null && !isCalendarDateString(movedTo)) throw new AttendanceError('The new date is not a date.');
  if (originalDate === null && movedTo === null) throw new AttendanceError('Pick a date for the day off.');
  if (originalDate === null && !name) throw new AttendanceError('Give the day off a name.');
  if (originalDate !== null && movedTo === originalDate) throw new AttendanceError('That is the date it is already on.');

  const id = originalDate
    ? overrideIdFor(country, originalDate)
    : adminDb.collection(HOLIDAY_OVERRIDES_COLLECTION).doc().id;

  const doc: Omit<HolidayOverride, 'id'> = {
    country, originalDate, movedTo, name, ...(note ? { note } : {}),
    updatedByEmail: caller.email, updatedAt: Date.now(),
  };
  await adminDb.collection(HOLIDAY_OVERRIDES_COLLECTION).doc(id).set(doc);
  return { ...doc, id };
}

/** Deleting a change puts the calculated holiday back (or removes an added day). */
export async function deleteOverride(id: string): Promise<void> {
  await adminDb.collection(HOLIDAY_OVERRIDES_COLLECTION).doc(id).delete();
}

// ── Setup ────────────────────────────────────────────────────────────────────

export async function saveConfig(caller: AttendanceCaller, raw: Record<string, unknown>): Promise<AttendanceConfig> {
  const current = await loadConfig();
  const next: AttendanceConfig = { ...current };

  if ('officeNetworks' in raw) {
    if (!Array.isArray(raw.officeNetworks)) throw new AttendanceError('The office networks must be a list.');
    const networks: OfficeNetwork[] = [];
    for (const n of raw.officeNetworks as Record<string, unknown>[]) {
      const ip = text(n?.ip, 64);
      // Loose on purpose: IPv4 and IPv6 both, compared as typed. A range or a
      // mask would need parsing this does not do, so it is refused rather than
      // silently never matching.
      if (!/^[0-9a-fA-F:.]+$/.test(ip)) throw new AttendanceError(`"${ip || 'blank'}" is not an IP address.`);
      if (!networks.some((x) => x.ip === ip)) networks.push({ ip, label: text(n?.label, 60) });
    }
    if (networks.length > MAX_OFFICE_NETWORKS) throw new AttendanceError(`At most ${MAX_OFFICE_NETWORKS} office networks.`);
    next.officeNetworks = networks;
  }
  if ('alerts' in raw) {
    if (typeof raw.alerts !== 'boolean') throw new AttendanceError('Alerts must be on or off.');
    next.alerts = raw.alerts;
  }
  if ('alertAfterMinutes' in raw) {
    const n = Math.round(Number(raw.alertAfterMinutes));
    if (!Number.isFinite(n) || n < 5 || n > 240) throw new AttendanceError('The alert delay must be between 5 and 240 minutes.');
    next.alertAfterMinutes = n;
  }

  await adminDb.collection(ATTENDANCE_CONFIG_COLLECTION).doc(ATTENDANCE_CONFIG_DOC).set({
    ...next, updatedAt: Date.now(), updatedByEmail: caller.email,
  });
  return next;
}

// ── Time off ─────────────────────────────────────────────────────────────────

function readTimeOff(id: string, d: FirebaseFirestore.DocumentData): TimeOffRequest {
  return { ...(d as Omit<TimeOffRequest, 'id'>), id };
}

/** Somebody's own requests, or — for `attendance.manage` — everybody's still waiting plus recent. */
export async function listTimeOff(caller: AttendanceCaller, scope: 'self' | 'all'): Promise<TimeOffRequest[]> {
  const col = adminDb.collection(TIME_OFF_COLLECTION);
  if (scope === 'self' || !caller.manages) {
    const snap = await col.where('email', '==', caller.email).get();
    return snap.docs.map((d) => readTimeOff(d.id, d.data())).sort((a, b) => b.from.localeCompare(a.from));
  }
  // Everybody's: bounded by date rather than paged. A year back covers "how
  // much has she taken this year", which is the question asked of it.
  const since = officeDateOf(Date.now() - 366 * 24 * 60 * 60_000);
  const snap = await col.where('to', '>=', since).get();
  return snap.docs.map((d) => readTimeOff(d.id, d.data())).sort((a, b) => b.from.localeCompare(a.from));
}

/**
 * Ask for time off — or, for HR, record it for somebody, which is approved as
 * it is written (a sick day phoned in is not a request anybody decides).
 */
export async function createTimeOff(caller: AttendanceCaller, raw: Record<string, unknown>): Promise<TimeOffRequest> {
  const from = String(raw.from ?? '');
  const to = String(raw.to ?? from);
  if (!isCalendarDateString(from) || !isCalendarDateString(to)) throw new AttendanceError('Pick the dates.');
  if (to < from) throw new AttendanceError('The last day is before the first.');
  if (datesBetween(from, to, MAX_TIME_OFF_DAYS + 1).length > MAX_TIME_OFF_DAYS) {
    throw new AttendanceError(`One request can cover at most ${MAX_TIME_OFF_DAYS} days.`);
  }
  const kind: TimeOffKind = TIME_OFF_KINDS.includes(raw.kind as TimeOffKind) ? (raw.kind as TimeOffKind) : 'other';

  const forOther = typeof raw.email === 'string' && normalizeEmail(raw.email) !== caller.email;
  if (forOther && !caller.manages) throw new AttendanceError('You can only ask for your own time off.', 403);
  const person = forOther ? await personEntry(raw.email as string) : { email: caller.email, name: caller.name };

  const now = Date.now();
  const doc: Omit<TimeOffRequest, 'id'> = {
    email: person.email,
    name: person.name,
    from, to, kind,
    note: text(raw.note, MAX_REASON_LENGTH),
    status: forOther ? 'approved' : 'pending',
    createdAt: now,
    enteredByEmail: forOther ? caller.email : null,
    decidedAt: forOther ? now : null,
    decidedByEmail: forOther ? caller.email : null,
    decidedByName: forOther ? caller.name : null,
    decisionNote: '',
  };
  const ref = await adminDb.collection(TIME_OFF_COLLECTION).add(doc);
  if (forOther) await rejudgeRange(person.email, from, to);
  return { ...doc, id: ref.id };
}

/**
 * Approve, refuse or withdraw. The person may withdraw their own; only
 * `attendance.manage` decides — and never their own request, the same rule
 * as every other approval in TTMS.
 */
export async function decideTimeOff(
  caller: AttendanceCaller,
  id: string,
  decision: unknown,
  noteRaw: unknown,
): Promise<TimeOffRequest> {
  const ref = adminDb.collection(TIME_OFF_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AttendanceError('That request no longer exists.', 404);
  const req = readTimeOff(id, snap.data()!);

  let status: TimeOffRequest['status'];
  if (decision === 'withdraw') {
    if (req.email !== caller.email && !caller.manages) throw new AttendanceError('Only the person who asked can withdraw it.', 403);
    if (req.status === 'withdrawn' || req.status === 'refused') throw new AttendanceError('That request is already closed.', 409);
    status = 'withdrawn';
  } else if (decision === 'approve' || decision === 'refuse') {
    if (!caller.manages) throw new AttendanceError('You cannot decide time-off requests.', 403);
    if (req.email === caller.email) throw new AttendanceError('Somebody else has to decide your own request.', 403);
    if (req.status !== 'pending') throw new AttendanceError('That request has already been decided.', 409);
    status = decision === 'approve' ? 'approved' : 'refused';
  } else {
    throw new AttendanceError('Unknown decision.');
  }

  const patch = {
    status,
    decidedAt: Date.now(),
    decidedByEmail: caller.email,
    decidedByName: caller.name,
    decisionNote: text(noteRaw, MAX_REASON_LENGTH),
  };
  await ref.update(patch);
  // Approving or withdrawing changes how those days are judged, and the
  // nightly job has already closed the past ones.
  if (req.status === 'approved' || status === 'approved') await rejudgeRange(req.email, req.from, req.to);
  return { ...req, ...patch };
}

// ── Corrections ──────────────────────────────────────────────────────────────

function readCorrection(id: string, d: FirebaseFirestore.DocumentData): CorrectionRequest {
  return { ...(d as Omit<CorrectionRequest, 'id'>), id };
}

export async function listCorrections(caller: AttendanceCaller, scope: 'self' | 'all'): Promise<CorrectionRequest[]> {
  const col = adminDb.collection(CORRECTIONS_COLLECTION);
  const snap = scope === 'self' || !caller.manages
    ? await col.where('email', '==', caller.email).get()
    : await col.where('createdAt', '>=', Date.now() - 120 * 24 * 60 * 60_000).get();
  return snap.docs.map((d) => readCorrection(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
}

function readTimes(raw: Record<string, unknown>): { clockIn: string | null; clockOut: string | null } {
  const clockIn = raw.clockIn ? String(raw.clockIn) : null;
  const clockOut = raw.clockOut ? String(raw.clockOut) : null;
  if (clockIn !== null && !isHhmm(clockIn)) throw new AttendanceError('The clock-in time should look like 08:00.');
  if (clockOut !== null && !isHhmm(clockOut)) throw new AttendanceError('The clock-out time should look like 17:30.');
  if (!clockIn && !clockOut) throw new AttendanceError('Give a clock-in time, a clock-out time, or both.');
  return { clockIn, clockOut };
}

export async function createCorrection(caller: AttendanceCaller, raw: Record<string, unknown>): Promise<CorrectionRequest> {
  const date = String(raw.date ?? '');
  if (!isCalendarDateString(date)) throw new AttendanceError('Pick the day.');
  if (date > officeDateOf(Date.now())) throw new AttendanceError('That day has not happened yet.');
  const times = readTimes(raw);
  const reason = text(raw.reason, MAX_REASON_LENGTH);
  if (!reason) throw new AttendanceError('Say what happened — it is what HR decides on.');

  const doc: Omit<CorrectionRequest, 'id'> = {
    email: caller.email, name: caller.name, date, ...times, reason,
    status: 'pending', createdAt: Date.now(),
    decidedAt: null, decidedByEmail: null, decidedByName: null, decisionNote: '',
  };
  const ref = await adminDb.collection(CORRECTIONS_COLLECTION).add(doc);
  return { ...doc, id: ref.id };
}

export async function decideCorrection(
  caller: AttendanceCaller,
  id: string,
  decision: unknown,
  noteRaw: unknown,
): Promise<CorrectionRequest> {
  const ref = adminDb.collection(CORRECTIONS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AttendanceError('That request no longer exists.', 404);
  const req = readCorrection(id, snap.data()!);

  let status: CorrectionRequest['status'];
  if (decision === 'withdraw') {
    if (req.email !== caller.email) throw new AttendanceError('Only the person who asked can withdraw it.', 403);
    if (req.status !== 'pending') throw new AttendanceError('That request has already been decided.', 409);
    status = 'withdrawn';
  } else if (decision === 'approve' || decision === 'refuse') {
    if (!caller.manages) throw new AttendanceError('You cannot decide corrections.', 403);
    if (req.email === caller.email) throw new AttendanceError('Somebody else has to decide your own request.', 403);
    if (req.status !== 'pending') throw new AttendanceError('That request has already been decided.', 409);
    status = decision === 'approve' ? 'approved' : 'refused';
  } else {
    throw new AttendanceError('Unknown decision.');
  }

  if (status === 'approved') {
    await editDay(caller, req.email, req.date, { clockIn: req.clockIn, clockOut: req.clockOut }, `Request: ${req.reason}`);
  }
  const patch = {
    status,
    decidedAt: Date.now(),
    decidedByEmail: caller.email,
    decidedByName: caller.name,
    decisionNote: text(noteRaw, MAX_REASON_LENGTH),
  };
  await ref.update(patch);
  return { ...req, ...patch };
}

/**
 * Change a day's clock times — from an approved request, or HR editing
 * directly. Either way the before and after are appended to the day, with who
 * and why, and never removed.
 */
export async function editDay(
  caller: AttendanceCaller,
  emailRaw: string,
  date: string,
  times: { clockIn: string | null; clockOut: string | null } | Record<string, unknown>,
  reasonRaw: unknown,
): Promise<void> {
  if (!caller.manages) throw new AttendanceError('You cannot change attendance records.', 403);
  if (!isCalendarDateString(date)) throw new AttendanceError('Pick the day.');
  const person = await personEntry(emailRaw);
  if (!canSeePerson(caller, person)) throw new AttendanceError('You cannot see this person’s attendance.', 403);
  const change = readTimes(times as Record<string, unknown>);
  const reason = text(reasonRaw, MAX_REASON_LENGTH);
  if (!reason) throw new AttendanceError('Say why — it is kept with the change.');

  const ref = adminDb.collection(ATTENDANCE_DAYS_COLLECTION).doc(dayDocId(person.email, date));
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const day = readDay(snap.data()) ?? emptyDay(person.email, person.uid, person.name, date);
    const next = applyCorrection(day, change, { email: caller.email, name: caller.name, reason, at: Date.now() });
    if (typeof next === 'string') throw new AttendanceError(next);
    tx.set(ref, next);
  });
  await rejudgeRange(person.email, date, date);
}

/**
 * Re-close past days after something changed how they are judged.
 *
 * The nightly job only looks a week back, so a correction to last month, or
 * time off approved after the fact, has to settle its own days here — or the
 * report would go on showing the old verdict. Today and later are left alone:
 * they are judged live anyway.
 */
async function rejudgeRange(email: string, from: string, to: string): Promise<void> {
  const today = officeDateOf(Date.now());
  const last = to < today ? to : null;
  if (!last || from > last) return;

  const [people, ctx] = await Promise.all([loadPeople(), loadJudgeContext(from, last, Date.now())]);
  const person = people.find((p) => p.email === email);
  if (!person) return;

  const dates = datesBetween(from, last);
  const refs = dates.map((d) => adminDb.collection(ATTENDANCE_DAYS_COLLECTION).doc(dayDocId(email, d)));
  const snaps = await adminDb.getAll(...refs);
  const batch = adminDb.batch();
  snaps.forEach((snap, i) => {
    const day = readDay(snap.data());
    const summary = judge(person, dates[i], day ? { ...day, finalized: false } : null, ctx);
    if (day) batch.update(refs[i], { finalized: true, summary });
    else if (summary.outcome !== 'off') {
      batch.set(refs[i], { ...emptyDay(email, person.uid, person.name, dates[i]), finalized: true, summary });
    }
  });
  await batch.commit();
}

