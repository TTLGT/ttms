import { adminDb, FieldValue } from './firebase-admin';
import { TEAMS_COLLECTION, USERS_COLLECTION, can, type RoleFlags } from './accessControl';
import { systemLine } from './chatAlerts';
import {
  judge,
  loadConfig,
  loadJudgeContext,
  loadPeople,
  readDay,
  type AttendancePerson,
} from './attendanceServer';
import {
  ATTENDANCE_ALERTS_COLLECTION,
  ATTENDANCE_DAYS_COLLECTION,
  CLOSE_LOOKBACK_DAYS,
  addDays,
  closeOpenDay,
  datesBetween,
  dayDocId,
  emptyDay,
  hhmmToMinutes,
  officeDateOf,
  officeMinuteOf,
  weekdayOf,
  type AttendanceDay,
} from '@/types/attendance';
import {
  CONVERSATIONS_COLLECTION,
  NOTICE_ROOM_POLICY,
  SYSTEM_SENDER_UID,
} from '@/types/conversation';

/**
 * Attendance's two scheduled jobs, both called only by Vercel crons (see
 * vercel.json) and both authorized by CRON_SECRET alone.
 *
 * **Neither decides anybody's access.** CLAUDE.md is firm that nothing which
 * grants or removes access may run on a clock, because a job that fails to
 * fire would leave a grant standing. These only finish records and post a
 * notice; the worst either can do by not running is leave a report a day
 * behind or an alert unsent.
 */

const daysCol = () => adminDb.collection(ATTENDANCE_DAYS_COLLECTION);

// ── The nightly close ────────────────────────────────────────────────────────

export interface CloseRun {
  from: string;
  to: string;
  checked: number;
  closedOpen: number;
  absences: number;
  written: number;
}

/**
 * Finish every day from a week ago up to yesterday that is not finished yet.
 *
 * Three things only the job can do, because each is about something that did
 * *not* happen:
 *  - a clock-out nobody pressed: the day is closed at their last activity and
 *    flagged, which is what a correction request then works from;
 *  - an absence: a scheduled day that passed with nothing, which no other
 *    part of the app would ever write down;
 *  - the verdict itself — late, early, hours — stored, so a year of reports
 *    does not re-judge a year of days every time it is opened.
 *
 * Runs at 3am office time rather than midnight so somebody working late is
 * not closed out mid-shift. Looks a week back every night, so a night the
 * cron did not fire heals itself the next night. Idempotent: a finalized day
 * is skipped, so running it twice writes nothing the second time.
 */
export async function closeDays(now: number = Date.now()): Promise<CloseRun> {
  const today = officeDateOf(now);
  const to = addDays(today, -1);
  const from = addDays(today, -CLOSE_LOOKBACK_DAYS);
  const dates = datesBetween(from, to);

  const [people, ctx, snap] = await Promise.all([
    loadPeople(),
    loadJudgeContext(from, to, now),
    daysCol().where('date', '>=', from).where('date', '<=', to).get(),
  ]);
  const byKey = new Map<string, AttendanceDay>();
  for (const doc of snap.docs) {
    const d = readDay(doc.data());
    if (d) byKey.set(`${d.email}|${d.date}`, d);
  }

  const run: CloseRun = { from, to, checked: 0, closedOpen: 0, absences: 0, written: 0 };
  let batch = adminDb.batch();
  let pending = 0;
  const flush = async () => {
    if (pending > 0) await batch.commit();
    batch = adminDb.batch();
    pending = 0;
  };

  // Only people who have ever signed in. A day with records is closed
  // whoever it belongs to — somebody suspended this afternoon still worked
  // this morning.
  const active = people.filter((p) => p.uid);
  const known = new Set(active.map((p) => p.email));
  const extras = [...byKey.values()]
    .filter((d) => !known.has(d.email))
    .map<AttendancePerson>((d) => ({ email: d.email, uid: d.uid, name: d.name, teamId: null, photoPath: null, suspended: true, since: null }));

  for (const person of [...active, ...extras]) {
    for (const date of dates) {
      run.checked++;
      let day = byKey.get(`${person.email}|${date}`) ?? null;
      if (day?.finalized) continue;
      // Suspended with nothing on the day: not an absence, just not here.
      if (!day && person.suspended) continue;

      if (day && day.sessions.length > 0 && !day.sessions[day.sessions.length - 1].out) {
        day = closeOpenDay(day);
        run.closedOpen++;
      }
      const summary = judge(person, date, day, ctx);
      if (!day && summary.outcome === 'off') continue; // nothing to record
      if (summary.outcome === 'absent') run.absences++;

      const ref = daysCol().doc(dayDocId(person.email, date));
      if (day) {
        batch.update(ref, { sessions: day.sessions, breaks: day.breaks, finalized: true, summary });
      } else {
        batch.set(ref, { ...emptyDay(person.email, person.uid, person.name, date), finalized: true, summary });
      }
      run.written++;
      if (++pending >= 400) await flush();
    }
  }
  await flush();
  return run;
}

// ── "Not in yet" alerts ──────────────────────────────────────────────────────

export interface AlertRun {
  date: string;
  due: number;
  alerted: number;
  recipients: number;
  outcome: 'disabled' | 'nobody' | 'sent';
}

/**
 * Tell HR — and the person's team lead — when somebody is a set time past
 * their start with no clock-in and no activity (idea 17).
 *
 * Every fifteen minutes through office hours. Each person is alerted about at
 * most once a day: `attendanceAlerts/{date}_{email}` is claimed with
 * `create()` before anything is posted, which is also what keeps a cron that
 * Vercel delivers twice from posting twice — the same lock as the birthday
 * post.
 *
 * Somebody who used TTMS without clocking in is not alerted about: they are
 * plainly at work, and the report already calls that out.
 */
export async function runLateAlerts(now: number = Date.now()): Promise<AlertRun> {
  const date = officeDateOf(now);
  const config = await loadConfig();
  if (!config.alerts) return { date, due: 0, alerted: 0, recipients: 0, outcome: 'disabled' };

  const [people, ctx] = await Promise.all([loadPeople(), loadJudgeContext(date, date, now)]);
  const minute = officeMinuteOf(now);

  // Cheap pass first: who is past their alert time on paper. Only if anybody
  // is does it cost the read of today's records.
  const candidates = people.filter((p) => {
    if (!p.uid || p.suspended) return false;
    const summary = judge(p, date, null, ctx);
    if (summary.outcome !== 'notIn' || !summary.shift) return false;
    const schedule = ctx.schedules.byEmail.get(p.email) ?? ctx.schedules.fallback;
    const due = hhmmToMinutes(summary.shift.start) + (schedule?.graceMinutes ?? 0) + config.alertAfterMinutes;
    // Not a shift that started yesterday evening, and not hours late: a
    // cron that was down all morning should not alert at 5pm about 8am.
    return minute >= due && minute - due < 4 * 60;
  });
  if (candidates.length === 0) return { date, due: 0, alerted: 0, recipients: 0, outcome: 'nobody' };

  const refs = candidates.map((p) => daysCol().doc(dayDocId(p.email, date)));
  const snaps = await adminDb.getAll(...refs);
  const late = candidates.filter((p, i) => {
    const day = readDay(snaps[i].data());
    return judge(p, date, day, ctx).outcome === 'notIn';
  });

  const claimed: AttendancePerson[] = [];
  for (const p of late) {
    try {
      await adminDb.collection(ATTENDANCE_ALERTS_COLLECTION).doc(`${date}_${p.email}`).create({ at: now });
      claimed.push(p);
    } catch (e) {
      if ((e as { code?: number }).code !== 6) throw e; // ALREADY_EXISTS: told already
    }
  }
  if (claimed.length === 0) return { date, due: late.length, alerted: 0, recipients: 0, outcome: 'nobody' };

  // Who hears: everybody who can see all attendance, plus each late
  // person's team lead for their own people.
  const [usersSnap, teamsSnap] = await Promise.all([
    adminDb.collection(USERS_COLLECTION).get(),
    adminDb.collection(TEAMS_COLLECTION).get(),
  ]);
  const recipients = new Map<string, AttendancePerson[]>();
  for (const u of usersSnap.docs) {
    const profile = u.data() as RoleFlags & { suspended?: boolean };
    if (profile.suspended === true) continue;
    if (can(profile, 'attendance.view')) recipients.set(u.id, [...claimed]);
  }
  const leadOf = new Map(teamsSnap.docs.map((t) => [t.id, t.data().leadUid as string | null]));
  for (const p of claimed) {
    const lead = p.teamId ? leadOf.get(p.teamId) : null;
    if (!lead || lead === p.uid) continue;
    const list = recipients.get(lead) ?? [];
    if (!list.includes(p)) list.push(p);
    recipients.set(lead, list);
  }

  for (const [uid, list] of recipients) {
    const lines = list.map((p) => {
      const shift = judge(p, date, null, ctx).shift!;
      return `• ${p.name} — due at ${formatHhmm(shift.start)}`;
    });
    const text = `${list.length === 1 ? 'Not in yet' : `${list.length} people not in yet`} (${weekdayName(date)}):\n${lines.join('\n')}\n\nNo clock-in and no activity in TTMS so far.`;
    await postAttendanceNotice(uid, text).catch((e) => {
      console.error('[attendance alerts] posting failed', uid, e);
    });
  }

  return { date, due: late.length, alerted: claimed.length, recipients: recipients.size, outcome: 'sent' };
}

function formatHhmm(hhmm: string): string {
  const m = hhmmToMinutes(hhmm);
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function weekdayName(date: string): string {
  return { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }[weekdayOf(date)];
}

/**
 * The person's own "Attendance alerts" room, made the first time.
 *
 * A notice room like the celebration reminders' — born locked, nobody else in
 * it, nobody can write in it — but a separate one, so a room called "Birthday
 * and anniversary reminders" is not where somebody finds out a colleague has
 * not turned up. Needs no rules change: a `notice` room is closed by its
 * policy, not by its id. See `notice` in src/types/conversation.ts.
 */
async function postAttendanceNotice(uid: string, text: string): Promise<void> {
  const room = adminDb.collection(CONVERSATIONS_COLLECTION).doc(`notice_attendance_${uid}`);
  await room.create({
    kind:        'notice',
    name:        'Attendance alerts',
    memberUids:  [uid],
    createdBy:   SYSTEM_SENDER_UID,
    adminUids:   [],
    policy:      NOTICE_ROOM_POLICY,
    createdAt:   FieldValue.serverTimestamp(),
    updatedAt:   FieldValue.serverTimestamp(),
    lastMessage: null,
  }).catch((e: { code?: number }) => {
    if (e?.code !== 6) throw e;
  });

  const batch = adminDb.batch();
  batch.update(room, systemLine(batch, room, text, { systemKind: 'announcement' }));
  await batch.commit();
}
