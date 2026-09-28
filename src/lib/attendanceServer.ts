import { adminDb, AdminAuthError, FieldValue, requireCompanyUser } from './firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  TEAMS_COLLECTION,
  USERS_COLLECTION,
  can,
  isBootstrapAdmin,
  managesEmail,
  managesUid,
  normalizeEmail,
  type RoleFlags,
} from './accessControl';
import { providerFor, requestIp, requestPlace } from './networkInfo';
import { fullName } from '@/types/allowedUser';
import {
  ACTIVITY_KINDS,
  ATTENDANCE_CONFIG_COLLECTION,
  ATTENDANCE_CONFIG_DOC,
  ATTENDANCE_DAYS_COLLECTION,
  ATTENDANCE_DEVICES_COLLECTION,
  ATTENDANCE_PREFS_COLLECTION,
  ATTENDANCE_SCHEDULES_COLLECTION,
  BEAT_MINUTES,
  DEFAULT_ATTENDANCE_CONFIG,
  DEFAULT_SCHEDULE_ID,
  HOLIDAY_OVERRIDES_COLLECTION,
  MAX_ACTIVITY_PER_FLUSH,
  TIME_OFF_COLLECTION,
  addDays,
  datesBetween,
  dayDocId,
  describeDevice,
  emptyDay,
  isClockedIn,
  officeDateOf,
  openBreak,
  readSchedule,
  summarizeDay,
  timeOffOn,
  type ActivityKind,
  type AttendanceConfig,
  type AttendanceDay,
  type AttendanceReport,
  type BreakKind,
  type ClockState,
  type ClockDetails,
  type DaySummary,
  type Schedule,
  type TimeOffRequest,
} from '@/types/attendance';
import { observedHolidaysInYear, type HolidayOverride } from '@/types/holidays';
import { PRESENCE_COLLECTION, isUserStatus, MAX_STATUS_NOTE, type UserStatus } from '@/types/presence';

/**
 * Attendance, server side: who may see whom, the heartbeat, the clock, and
 * the report. Everything reads and writes through the Admin SDK — every
 * attendance collection is closed to the browser in firestore.rules.
 *
 * The scheduled jobs are in src/lib/attendanceJobs.ts and the HR-side
 * records (schedules, holidays, time off, corrections) in
 * src/lib/attendanceAdmin.ts. The rules for judging a day are in
 * src/types/attendance.ts and are shared by all three.
 */

const daysCol = () => adminDb.collection(ATTENDANCE_DAYS_COLLECTION);

export class AttendanceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Who is asking ────────────────────────────────────────────────────────────

export interface AttendanceCaller {
  uid: string;
  email: string;
  name: string;
  profile: RoleFlags | null;
  /** `attendance.view`: everybody's records. */
  seesAll: boolean;
  /** `attendance.manage`: schedules, holidays, decisions. */
  manages: boolean;
}

/**
 * The caller, with what they may do. Two reads: the allowlist entry (inside
 * requireCompanyUser) and the profile, which carries the permissions and the
 * Sales Manager's team.
 */
export async function attendanceCaller(req: Request): Promise<AttendanceCaller> {
  const { uid, email: rawEmail, entry } = await requireCompanyUser(req);
  const email = normalizeEmail(rawEmail);
  const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
  const profile = (snap.data() ?? null) as (RoleFlags & { displayName?: string }) | null;
  const boot = isBootstrapAdmin(email);
  return {
    uid,
    email,
    name: (entry ? fullName(entry) : '') || profile?.displayName || email,
    profile,
    seesAll: boot || can(profile, 'attendance.view'),
    manages: boot || can(profile, 'attendance.manage'),
  };
}

/**
 * May this caller see this person's attendance?
 *
 * Themselves always; everybody with `attendance.view`; and a Sales Manager
 * their own team — the one role a team's setup affects (see CLAUDE.md).
 * Leading a team grants nothing to anybody else, here as everywhere.
 */
export function canSeePerson(caller: AttendanceCaller, person: { email: string; uid: string | null }): boolean {
  if (caller.seesAll) return true;
  if (normalizeEmail(person.email) === caller.email) return true;
  if (caller.profile?.isSalesManager !== true) return false;
  return managesUid(caller.profile, person.uid) || managesEmail(caller.profile, person.email);
}

/** Anybody beyond themselves — decides whether the Attendance page is offered. */
export function seesOthers(caller: AttendanceCaller): boolean {
  if (caller.seesAll) return true;
  if (caller.profile?.isSalesManager !== true) return false;
  return (caller.profile.managedUids?.length ?? 0) + (caller.profile.managedEmails?.length ?? 0) > 0;
}

export function authErrorResponse(e: unknown): { error: string; status: number } {
  if (e instanceof AdminAuthError || e instanceof AttendanceError) return { error: e.message, status: e.status };
  console.error('[attendance]', e);
  return { error: 'Something went wrong. Try again.', status: 500 };
}

// ── What the judgement needs ─────────────────────────────────────────────────

export interface AttendancePerson {
  email: string;
  uid: string | null;
  name: string;
  teamId: string | null;
  photoPath: string | null;
  suspended: boolean;
  /**
   * The first date this person can be judged on: their start date if HR has
   * one, otherwise the day they were added. Nobody is marked absent for the
   * weeks before they were hired.
   */
  since: string | null;
}

export async function loadPeople(): Promise<AttendancePerson[]> {
  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    const invited = d.invitedAt?.toMillis?.() as number | undefined;
    const start = typeof d.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.startDate) ? d.startDate : null;
    const added = invited ? officeDateOf(invited) : null;
    return {
      email: doc.id,
      uid: typeof d.uid === 'string' ? d.uid : null,
      name: fullName(d) || doc.id,
      teamId: typeof d.teamId === 'string' ? d.teamId : null,
      photoPath: typeof d.photoPath === 'string' ? d.photoPath : null,
      suspended: d.suspended === true,
      // The later of the two: a start date typed in years after somebody was
      // added is still the day they started, and an invite sent ahead of a
      // start date is not a working day.
      since: start && added ? (start > added ? start : added) : start ?? added,
    };
  });
}

export interface Schedules {
  byEmail: Map<string, Schedule>;
  fallback: Schedule | null;
}

export async function loadSchedules(): Promise<Schedules> {
  const snap = await adminDb.collection(ATTENDANCE_SCHEDULES_COLLECTION).get();
  const byEmail = new Map<string, Schedule>();
  let fallback: Schedule | null = null;
  for (const doc of snap.docs) {
    const s = readSchedule(doc.data());
    if (typeof s === 'string') continue; // a document edited by hand into nonsense is ignored, not obeyed
    if (doc.id === DEFAULT_SCHEDULE_ID) fallback = s;
    else byEmail.set(doc.id, s);
  }
  return { byEmail, fallback };
}

export function scheduleFor(email: string, schedules: Schedules): Schedule | null {
  return schedules.byEmail.get(email) ?? schedules.fallback;
}

export async function loadOverrides(): Promise<HolidayOverride[]> {
  const snap = await adminDb.collection(HOLIDAY_OVERRIDES_COLLECTION).get();
  return snap.docs.map((d) => ({ ...(d.data() as Omit<HolidayOverride, 'id'>), id: d.id }));
}

/** Approved time off only — the one kind that changes how a day is judged. */
export async function loadApprovedTimeOff(): Promise<TimeOffRequest[]> {
  const snap = await adminDb.collection(TIME_OFF_COLLECTION).where('status', '==', 'approved').get();
  return snap.docs.map((d) => ({ ...(d.data() as Omit<TimeOffRequest, 'id'>), id: d.id }));
}

export async function loadConfig(): Promise<AttendanceConfig> {
  const snap = await adminDb.collection(ATTENDANCE_CONFIG_COLLECTION).doc(ATTENDANCE_CONFIG_DOC).get();
  const d = snap.data() ?? {};
  return {
    officeNetworks: Array.isArray(d.officeNetworks) ? d.officeNetworks : DEFAULT_ATTENDANCE_CONFIG.officeNetworks,
    alerts: typeof d.alerts === 'boolean' ? d.alerts : DEFAULT_ATTENDANCE_CONFIG.alerts,
    alertAfterMinutes: typeof d.alertAfterMinutes === 'number' ? d.alertAfterMinutes : DEFAULT_ATTENDANCE_CONFIG.alertAfterMinutes,
  };
}

export interface JudgeContext {
  schedules: Schedules;
  timeOff: TimeOffRequest[];
  /** `country|date` → holiday name, for every year the range touches. */
  holidays: Map<string, string>;
  now: number;
}

export async function loadJudgeContext(from: string, to: string, now: number): Promise<JudgeContext> {
  const [schedules, overrides, timeOff] = await Promise.all([loadSchedules(), loadOverrides(), loadApprovedTimeOff()]);
  const holidays = new Map<string, string>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of observedHolidaysInYear(y, overrides)) {
      const key = `${h.country}|${h.date}`;
      // Two holidays one day (rare) read as one: the office is shut either way.
      if (!holidays.has(key)) holidays.set(key, h.name);
    }
  }
  return { schedules, timeOff, holidays, now };
}

/**
 * How one person's day came out. A day the nightly job has closed is taken
 * as stored; anything else is judged now, by the same function the job uses.
 */
export function judge(person: AttendancePerson, date: string, day: AttendanceDay | null, ctx: JudgeContext): DaySummary {
  if (day?.finalized && day.summary) return day.summary;
  const before = person.since !== null && date < person.since;
  const schedule = before ? null : scheduleFor(person.email, ctx.schedules);
  return summarizeDay({
    date,
    day,
    schedule,
    holiday: schedule ? ctx.holidays.get(`${schedule.holidayCountry}|${date}`) ?? null : null,
    timeOff: timeOffOn(date, person.email, ctx.timeOff),
    now: ctx.now,
  });
}

// ── The day documents ────────────────────────────────────────────────────────

export function readDay(data: FirebaseFirestore.DocumentData | undefined): AttendanceDay | null {
  if (!data) return null;
  return {
    ...emptyDay(data.email ?? '', data.uid ?? null, data.name ?? '', data.date ?? ''),
    ...data,
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    breaks: Array.isArray(data.breaks) ? data.breaks : [],
    activity: data.activity ?? {},
  } as AttendanceDay;
}

async function getDay(email: string, date: string): Promise<AttendanceDay | null> {
  return readDay((await daysCol().doc(dayDocId(email, date)).get()).data());
}

/**
 * The day an open clock-in lives on: today's, or yesterday's for somebody
 * who clocked in before midnight and is still going. Null when not clocked in.
 */
async function openDay(email: string, now: number): Promise<{ date: string; day: AttendanceDay } | null> {
  const today = officeDateOf(now);
  const yesterday = addDays(today, -1);
  const [t, y] = await Promise.all([getDay(email, today), getDay(email, yesterday)]);
  if (t && isClockedIn(t)) return { date: today, day: t };
  if (y && isClockedIn(y)) return { date: yesterday, day: y };
  return null;
}

/** Counts from the browser, bounded — see ActivityKind. */
function readCounts(raw: unknown): Partial<Record<ActivityKind, number>> {
  const out: Partial<Record<ActivityKind, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const kind of ACTIVITY_KINDS) {
    const n = Math.floor(Number((raw as Record<string, unknown>)[kind]));
    if (Number.isFinite(n) && n > 0) out[kind] = Math.min(n, MAX_ACTIVITY_PER_FLUSH);
  }
  return out;
}

function countIncrements(counts: Partial<Record<ActivityKind, number>>): Record<string, FirebaseFirestore.FieldValue> {
  const patch: Record<string, FirebaseFirestore.FieldValue> = {};
  for (const [kind, n] of Object.entries(counts)) patch[`activity.${kind}`] = FieldValue.increment(n as number);
  return patch;
}

/**
 * Write to a day that may not exist yet, without ever overwriting one that
 * does. `create` for a new day and `update` for an existing one — a merge-set
 * of a fresh empty day would wipe a clock-in that landed a moment earlier.
 */
async function writeDay(
  email: string, uid: string | null, name: string, date: string,
  fresh: Partial<AttendanceDay>,
  patch: Record<string, unknown>,
): Promise<void> {
  const ref = daysCol().doc(dayDocId(email, date));
  try {
    await ref.update(patch);
  } catch (e) {
    if ((e as { code?: number }).code !== 5) throw e; // NOT_FOUND
    try {
      await ref.create({ ...emptyDay(email, uid, name, date), ...fresh });
    } catch (e2) {
      if ((e2 as { code?: number }).code !== 6) throw e2; // ALREADY_EXISTS: created in between
      await ref.update(patch);
    }
  }
}

// ── The heartbeat ────────────────────────────────────────────────────────────

/**
 * Five minutes of somebody's day, from their browser.
 *
 * `active` means they clicked, typed or scrolled since the last beat. An
 * inactive beat is only sent while they are clocked in, and counts as idle.
 * Nothing here is the record of hours — that is the clock — so a beat is
 * written with increments rather than a read-modify-write, and a beat that
 * races a clock-in cannot undo it.
 *
 * Costs, per beat: the allowlist read in requireCompanyUser, one read of the
 * day on an active beat, one write to the day and one to presence. Whether
 * they are clocked in is the browser's claim rather than read from the day:
 * it only decides which counter an inactive beat lands in.
 */
export async function recordBeat(
  caller: { uid: string; email: string; name: string },
  body: { active?: unknown; clockedIn?: unknown; hidden?: unknown; counts?: unknown; source?: unknown; presenceOnly?: unknown },
  now: number,
): Promise<void> {
  // "Back at the desk" between two full beats: chat's Online, and nothing on
  // the day — the next full beat counts those minutes, once. See
  // usePresenceHeartbeat.
  if (body.presenceOnly === true) {
    if (body.hidden !== true) {
      await adminDb.collection(PRESENCE_COLLECTION).doc(caller.uid).set({
        lastBeatAt: FieldValue.serverTimestamp(),
        lastActiveAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return;
  }

  const active = body.active === true;
  const clockedIn = body.clockedIn === true;
  const counts = readCounts(body.counts);
  const date = officeDateOf(now);
  // Whole computer or TTMS only — see src/lib/idleDetection.ts. Counted per
  // beat while clocked in, so the report can say how a day was measured.
  const source = body.source === 'system' ? 'system' : 'page';

  if (active || clockedIn || Object.keys(counts).length > 0) {
    const patch: Record<string, unknown> = { ...countIncrements(counts) };
    if (clockedIn) patch[`measuredBy.${source}`] = FieldValue.increment(1);
    if (active) {
      patch.lastActiveAt = now;
      patch.activeMinutes = FieldValue.increment(BEAT_MINUTES);
      // "First active at 8:40" needs to know whether there was an earlier
      // one, and Firestore has no set-if-empty. One read, on active beats
      // only: a day created by a clock-in has no activity time yet.
      const existing = await daysCol().doc(dayDocId(caller.email, date)).get();
      if (!existing.data()?.firstActiveAt) patch.firstActiveAt = now;
    } else if (clockedIn) {
      patch.idleMinutes = FieldValue.increment(BEAT_MINUTES);
    }
    await writeDay(caller.email, caller.uid, caller.name, date, {
      firstActiveAt: active ? now : null,
      lastActiveAt: active ? now : null,
      activeMinutes: active ? BEAT_MINUTES : 0,
      idleMinutes: !active && clockedIn ? BEAT_MINUTES : 0,
      activity: counts,
      ...(clockedIn ? { measuredBy: { [source]: 1 } } : {}),
    }, patch);
  }

  if (body.hidden !== true) {
    await adminDb.collection(PRESENCE_COLLECTION).doc(caller.uid).set({
      lastBeatAt: FieldValue.serverTimestamp(),
      ...(active ? { lastActiveAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
  }
}

// ── The clock ────────────────────────────────────────────────────────────────

export async function clockState(caller: { uid: string; email: string }, now: number): Promise<ClockState> {
  const today = officeDateOf(now);
  const [open, todayDay, presence, prefs] = await Promise.all([
    openDay(caller.email, now),
    getDay(caller.email, today),
    adminDb.collection(PRESENCE_COLLECTION).doc(caller.uid).get(),
    adminDb.collection(ATTENDANCE_PREFS_COLLECTION).doc(caller.email).get(),
  ]);
  const day = open?.day ?? todayDay;
  const last = open ? open.day.sessions[open.day.sessions.length - 1] : null;
  const brk = open ? openBreak(open.day) : null;
  const p = presence.data() ?? {};
  return {
    date: open?.date ?? today,
    clockedIn: Boolean(open),
    sessionStart: last?.in.at ?? null,
    firstClockIn: day?.sessions[0]?.in.at ?? null,
    onBreak: brk?.kind ?? null,
    breakStart: brk?.start ?? null,
    status: isUserStatus(p.status) ? p.status : null,
    statusNote: typeof p.statusNote === 'string' ? p.statusNote : '',
    hideLastSeen: prefs.data()?.hideLastSeen === true,
  };
}

async function clockDetails(req: Request, email: string, deviceIdRaw: unknown, now: number): Promise<ClockDetails> {
  const ip = requestIp(req);
  const place = requestPlace(req);
  const deviceId = typeof deviceIdRaw === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(deviceIdRaw) ? deviceIdRaw : null;

  const devicesRef = adminDb.collection(ATTENDANCE_DEVICES_COLLECTION).doc(email);
  const [provider, config, devices] = await Promise.all([
    providerFor(ip),
    loadConfig(),
    devicesRef.get(),
  ]);

  const known: string[] = Array.isArray(devices.data()?.ids) ? devices.data()!.ids : [];
  // The very first clock-in is not flagged — every device is new to somebody
  // who has never clocked in, and a report full of flags on day one teaches
  // HR to ignore the flag.
  const newDevice = Boolean(deviceId) && known.length > 0 && !known.includes(deviceId!);
  if (deviceId && !known.includes(deviceId)) {
    await devicesRef.set({ ids: FieldValue.arrayUnion(deviceId) }, { merge: true });
  }

  return {
    at: now,
    ip,
    ...place,
    provider,
    device: describeDevice(req.headers.get('user-agent')),
    deviceId,
    newDevice,
    office: Boolean(ip) && config.officeNetworks.some((n) => n.ip === ip),
  };
}

export type ClockAction = 'in' | 'out' | 'breakStart' | 'breakEnd';

/**
 * Clock in, clock out, start or end a break.
 *
 * In a transaction, because the button can be pressed twice before the first
 * press comes back, and two clock-ins would be two sessions.
 */
export async function clockAction(
  caller: { uid: string; email: string; name: string },
  req: Request,
  body: { action?: unknown; kind?: unknown; deviceId?: unknown; counts?: unknown },
  now: number,
): Promise<ClockState> {
  const action = body.action as ClockAction;
  if (!['in', 'out', 'breakStart', 'breakEnd'].includes(action)) throw new AttendanceError('Unknown clock action.');

  const needsDetails = action === 'in' || action === 'out';
  const details = needsDetails ? await clockDetails(req, caller.email, body.deviceId, now) : null;
  const today = officeDateOf(now);
  const yesterday = addDays(today, -1);

  await adminDb.runTransaction(async (tx) => {
    const tRef = daysCol().doc(dayDocId(caller.email, today));
    const yRef = daysCol().doc(dayDocId(caller.email, yesterday));
    const [tSnap, ySnap] = await Promise.all([tx.get(tRef), tx.get(yRef)]);
    const t = readDay(tSnap.data());
    const y = readDay(ySnap.data());
    const open = t && isClockedIn(t) ? { ref: tRef, day: t } : y && isClockedIn(y) ? { ref: yRef, day: y } : null;

    if (action === 'in') {
      if (open) throw new AttendanceError('You are already clocked in.', 409);
      const day = t ?? emptyDay(caller.email, caller.uid, caller.name, today);
      const sessions = [...day.sessions, { in: details!, out: null }];
      if (tSnap.exists) tx.update(tRef, { sessions });
      else tx.create(tRef, { ...day, sessions });
      return;
    }

    if (!open) throw new AttendanceError('You are not clocked in.', 409);
    const day = open.day;
    const brk = openBreak(day);

    if (action === 'out') {
      const sessions = day.sessions.map((s, i) => (i === day.sessions.length - 1 ? { ...s, out: details! } : s));
      // Clocking out ends a break rather than leaving one running overnight.
      const breaks = day.breaks.map((b) => (b.end === null ? { ...b, end: now } : b));
      tx.update(open.ref, { sessions, breaks });
    } else if (action === 'breakStart') {
      if (brk) throw new AttendanceError('You are already on a break.', 409);
      const kind: BreakKind = body.kind === 'lunch' ? 'lunch' : 'break';
      tx.update(open.ref, { breaks: [...day.breaks, { kind, start: now, end: null }] });
    } else {
      if (!brk) throw new AttendanceError('You are not on a break.', 409);
      tx.update(open.ref, { breaks: day.breaks.map((b) => (b.end === null ? { ...b, end: now } : b)) });
    }
  });

  // Carried on the clock too, so counts are not lost when the heartbeat is
  // switched off (Settings → Online Status) and never flushes them.
  const counts = readCounts(body.counts);
  if (Object.keys(counts).length > 0) {
    await writeDay(caller.email, caller.uid, caller.name, today, { activity: counts }, countIncrements(counts));
  }

  // What colleagues see. A break is a status like any other; the clock
  // itself is not — nobody else is told when somebody clocked in.
  if (action === 'breakStart' || action === 'breakEnd' || action === 'out') {
    await adminDb.collection(PRESENCE_COLLECTION).doc(caller.uid)
      .set({ onBreak: action === 'breakStart' }, { merge: true });
  }

  return clockState(caller, now);
}

/** Busy, In a meeting, Away — or null for available. */
export async function setStatus(uid: string, statusRaw: unknown, noteRaw: unknown): Promise<void> {
  const status = statusRaw === null ? null : isUserStatus(statusRaw) ? statusRaw : undefined;
  if (status === undefined) throw new AttendanceError('Unknown status.');
  const note = typeof noteRaw === 'string' ? noteRaw.trim().slice(0, MAX_STATUS_NOTE) : '';
  await adminDb.collection(PRESENCE_COLLECTION).doc(uid).set(
    { status, statusNote: status ? note : '' },
    { merge: true },
  );
}

/**
 * Hide "last seen" from colleagues (idea 20). HR still sees attendance —
 * that is a different record, and the profile page says so.
 *
 * Hiding removes the two times from the presence document at once, rather
 * than waiting for them to go stale, and the browser stops sending them.
 */
export async function setHideLastSeen(caller: { uid: string; email: string }, hide: boolean): Promise<void> {
  await adminDb.collection(ATTENDANCE_PREFS_COLLECTION).doc(caller.email).set({ hideLastSeen: hide }, { merge: true });
  if (hide) {
    await adminDb.collection(PRESENCE_COLLECTION).doc(caller.uid).set(
      { lastActiveAt: FieldValue.delete(), lastBeatAt: FieldValue.delete() },
      { merge: true },
    );
  }
}

// ── The report ───────────────────────────────────────────────────────────────

/** The longest range one report may ask for — a quarter and a bit. */
export const MAX_REPORT_DAYS = 100;

export async function buildReport(
  caller: AttendanceCaller,
  from: string,
  to: string,
  scope: 'self' | 'visible',
  now: number,
): Promise<AttendanceReport> {
  const dates = datesBetween(from, to, MAX_REPORT_DAYS + 1);
  if (dates.length === 0) throw new AttendanceError('The date range is empty.');
  if (dates.length > MAX_REPORT_DAYS) throw new AttendanceError(`A report can cover at most ${MAX_REPORT_DAYS} days.`);

  const [people, ctx, teamsSnap] = await Promise.all([
    loadPeople(),
    loadJudgeContext(from, to, now),
    scope === 'self' ? null : adminDb.collection(TEAMS_COLLECTION).get(),
  ]);

  // Only people who can have a day: signed in at least once. Somebody still
  // pending has never used TTMS, and a column of "absent" for them is noise.
  const visible = people.filter((p) =>
    p.uid && !p.suspended
    && (scope === 'self' ? p.email === caller.email : canSeePerson(caller, p)));

  // Your own history reads your own documents by id; everybody else's is one
  // range query. A missing document by id is still a billed read, so the
  // switch-over is at the point the query becomes the cheaper of the two.
  let dayDocs: AttendanceDay[];
  if (visible.length * dates.length <= 120) {
    const refs = visible.flatMap((p) => dates.map((d) => daysCol().doc(dayDocId(p.email, d))));
    const snaps = refs.length ? await adminDb.getAll(...refs) : [];
    dayDocs = snaps.map((s) => readDay(s.data())).filter((d): d is AttendanceDay => d !== null);
  } else {
    const snap = await daysCol().where('date', '>=', from).where('date', '<=', to).get();
    dayDocs = snap.docs.map((s) => readDay(s.data())!);
  }

  const byKey = new Map(dayDocs.map((d) => [`${d.email}|${d.date}`, d]));
  const today = officeDateOf(now);
  const cells: AttendanceReport['cells'] = {};
  const onBreak: AttendanceReport['onBreak'] = {};
  const activity: AttendanceReport['activity'] = {};

  for (const p of visible) {
    cells[p.email] = {};
    for (const date of dates) {
      const day = byKey.get(`${p.email}|${date}`) ?? null;
      cells[p.email][date] = judge(p, date, day, ctx);
      if (day && Object.keys(day.activity ?? {}).length) {
        (activity[p.email] ??= {})[date] = day.activity;
      }
      if (date === today && day) {
        const brk = openBreak(day);
        if (brk && isClockedIn(day)) onBreak[p.email] = brk.kind;
      }
    }
  }

  return {
    from, to, today,
    people: visible
      .map(({ email, uid, name, teamId, photoPath }) => ({ email, uid, name, teamId, photoPath }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    cells,
    onBreak,
    activity,
    teams: teamsSnap
      ? teamsSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? '') })).sort((a, b) => a.name.localeCompare(b.name))
      : [],
  };
}

/** One person's day in full — every clock action with its network and device. */
export async function dayDetail(caller: AttendanceCaller, emailRaw: string, date: string): Promise<AttendanceDay | null> {
  const email = normalizeEmail(emailRaw);
  const entry = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();
  const uid = typeof entry.data()?.uid === 'string' ? entry.data()!.uid : null;
  if (!canSeePerson(caller, { email, uid })) throw new AttendanceError('You cannot see this person’s attendance.', 403);
  return getDay(email, date);
}
