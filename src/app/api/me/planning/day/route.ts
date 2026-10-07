import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { taskItems, toTask } from '@/lib/personalTasksServer';
import {
  ATTENDANCE_SCHEDULES_COLLECTION,
  DEFAULT_SCHEDULE_ID,
  isCalendarDateString,
  readSchedule,
  weekdayOf,
} from '@/types/attendance';
import { TASK_REPEATS, occursOn } from '@/types/task';
import { PLANNING_FALLBACK_SHIFT, type DayItem, type PlanningDay } from '@/types/planning';

/**
 * One day of the caller's own calendar, for the planning card: their working
 * hours that day and the timed things already on it, so the card can say
 * whether the slot fits and offer to move something when it does not.
 *
 * `?date=YYYY-MM-DD`. Everything is the caller's own — the list under the uid
 * off the ID token, and the schedule under the email off it. A person's own
 * shift is theirs to see (`canSeePerson()` says the same for the attendance
 * screens); nothing here reaches anybody else's.
 *
 * Reads: the two schedule documents, the items dated that day, and the
 * repeating items (to find any series that falls on it). Never the whole list.
 */
export async function GET(req: NextRequest) {
  try {
    const { uid, email } = await requireCompanyUser(req);
    const date = req.nextUrl.searchParams.get('date') ?? '';
    if (!isCalendarDateString(date)) {
      return NextResponse.json({ error: 'Which day?' }, { status: 400 });
    }

    const schedules = adminDb.collection(ATTENDANCE_SCHEDULES_COLLECTION);
    const repeats = TASK_REPEATS.filter((r) => r !== 'none');
    const [own, fallback, dated, repeating] = await Promise.all([
      email ? schedules.doc(email.toLowerCase()).get() : Promise.resolve(null),
      schedules.doc(DEFAULT_SCHEDULE_ID).get(),
      taskItems(uid).where('date', '==', date).get(),
      // Single-field `in`, indexed by Firestore on its own — no deploy needed.
      taskItems(uid).where('repeat', 'in', repeats).get(),
    ]);

    const parsed = [own?.exists ? readSchedule(own.data()) : null, fallback.exists ? readSchedule(fallback.data()) : null]
      .find((s) => s && typeof s !== 'string');
    const schedule = parsed && typeof parsed !== 'string' ? parsed : null;
    // No schedule anywhere is not a day off: it is HR not having set one up,
    // and the office's usual weekday is a better guess than "you have no time today".
    const weekday = weekdayOf(date);
    const shift = schedule
      ? schedule.days[weekday]
      : weekday === 'sat' || weekday === 'sun' ? null : PLANNING_FALLBACK_SHIFT;

    const seen = new Set<string>();
    const items: DayItem[] = [];
    for (const doc of [...dated.docs, ...repeating.docs]) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      const t = toTask(doc);
      // Untimed things take no slot; finished tasks have left the day.
      if (!t.time || (t.kind === 'task' && t.status === 'done')) continue;
      // A repeating task's other dates do not exist yet; only its current copy, dated above.
      if (t.date !== date && !(t.kind === 'event' && occursOn(t, date))) continue;
      items.push({
        id: t.id,
        title: t.title,
        kind: t.kind,
        time: t.time,
        endTime: t.endTime,
        series: t.kind === 'event' && t.repeat !== 'none',
        planning: !!t.planning,
      });
    }
    items.sort((a, b) => a.time.localeCompare(b.time));

    const day: PlanningDay = {
      date,
      shift: shift && shift.end > shift.start ? { start: shift.start, end: shift.end } : null,
      scheduleSet: !!schedule,
      items,
    };
    return NextResponse.json({ day });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
