import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { syncReminderQueue, taskItems, toTask } from '@/lib/personalTasksServer';
import { MAX_TASKS_PER_PERSON, cleanTaskInput, occursOn } from '@/types/task';

class Refused extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * Take one date out of a repeating event and make it an event of its own —
 * what happens when somebody drags a single date of a series, or stretches it
 * and answers "just this one".
 *
 * Body: `{ date, newDate?, time?, endTime? }`. `date` is the occurrence being
 * taken out; the rest is where and when the separate event goes, defaulting
 * to where it was. In one transaction: the date is added to the series'
 * `skipDates`, the separate event is written as a copy of the series with no
 * repeat, and both have their reminders queued again — so the series never
 * reminds about a date that has moved, and the moved one reminds at its new
 * time.
 *
 * The separate event is an ordinary event from then on: dragging or
 * stretching it again asks nothing, because it is in no series.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { uid } = await requireCompanyUser(req);
    const { taskId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // The same checks as any save: real dates, real times.
    const at = cleanTaskInput({ date: body.date });
    const to = cleanTaskInput({ date: body.newDate, time: body.time, endTime: body.endTime });
    if (!at.date) return NextResponse.json({ error: 'Which date?' }, { status: 400 });

    const seriesRef = taskItems(uid).doc(taskId);
    const count = await taskItems(uid).count().get();
    if (count.data().count >= MAX_TASKS_PER_PERSON) {
      return NextResponse.json({
        error: `Your list is full (${MAX_TASKS_PER_PERSON} items). Clear out some finished ones first.`,
      }, { status: 409 });
    }

    const newRef = taskItems(uid).doc();
    try {
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(seriesRef);
        if (!snap.exists) throw new Refused('That event no longer exists.', 404);
        const series = toTask(snap);
        if (series.kind !== 'event' || series.repeat === 'none') {
          throw new Refused('That is not a repeating event.', 400);
        }
        if (!occursOn(series, at.date!)) throw new Refused('That date is not part of the series.', 400);

        const skipDates = [...series.skipDates, at.date!].sort();
        tx.update(seriesRef, { skipDates, updatedAt: FieldValue.serverTimestamp() });
        syncReminderQueue(tx, uid, { ...series, skipDates }, taskId);

        const date = to.date ?? at.date!;
        const time = 'time' in to ? to.time ?? null : series.time;
        const endTime = 'endTime' in to ? to.endTime ?? null : series.endTime;
        // Everything the series says, as of now, on one date — then on its own.
        tx.set(newRef, {
          ...snap.data(),
          date,
          time,
          endTime: time && endTime && endTime > time ? endTime : null,
          repeat: 'none',
          repeatDay: null,
          repeatWeekday: null,
          repeatNths: [],
          repeatUntil: null,
          skipDates: [],
          detachedFrom: taskId,
          nextId: null,
          order: Date.now(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        syncReminderQueue(tx, uid, {
          kind: 'event', status: 'todo', date, time, reminders: series.reminders,
        }, newRef.id);
      });
    } catch (e) {
      if (e instanceof Refused) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const [series, event] = await Promise.all([seriesRef.get(), newRef.get()]);
    return NextResponse.json({ series: toTask(series), event: toTask(event) }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
