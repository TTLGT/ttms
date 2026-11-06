import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { hasInvites, organizerFrom, syncInvitesQuietly } from '@/lib/taskInvitesServer';
import { syncReminderQueue, taskItems, taskOwnerDoc, toTask } from '@/lib/personalTasksServer';
import {
  MAX_TASKS_PER_PERSON, cleanTaskInput, dayBefore, dayDistance, occursOn, shiftedRepeat,
} from '@/types/task';

class Refused extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * Move one date of a repeating event and take the rest of the series with it
 * — the "This and following events" and "All events" answers to the question
 * the calendar asks (SeriesScope in src/types/task.ts). "This event" is the
 * detach route beside this one.
 *
 * Body: `{ scope, date, newDate?, time?, endTime? }`. `date` is the
 * occurrence that was dragged, stretched or edited; the rest is where and
 * when it goes, defaulting to where it was. Every other date moves by the
 * same number of days and takes the same time.
 *
 * - `all` shifts the series itself: its start, its end and the dates taken
 *   out of it, so a date already detached stays detached rather than coming
 *   back as a duplicate beside its separate event.
 * - `following` ends the series the day before `date` and writes a new
 *   series from the moved date, carrying everything the old one says and the
 *   taken-out dates from the cut on. From the first date of the series it is
 *   the same thing as `all`, and is done that way — a series ending before
 *   it starts would be an empty one.
 *
 * Other edits made in the editor at the same time are saved afterwards by
 * the page as an ordinary PATCH on whichever series this answers with, so
 * every check on a save applies to them unchanged.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { uid, email, entry } = await requireCompanyUser(req);
    const { taskId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.scope !== 'following' && body.scope !== 'all') {
      return NextResponse.json({ error: 'Move which dates?' }, { status: 400 });
    }
    // The same checks as any save: real dates, real times.
    const at = cleanTaskInput({ date: body.date });
    const to = cleanTaskInput({ date: body.newDate, time: body.time, endTime: body.endTime });
    if (!at.date) return NextResponse.json({ error: 'Which date?' }, { status: 400 });

    const seriesRef = taskItems(uid).doc(taskId);
    const before = await seriesRef.get();
    if (!before.exists) return NextResponse.json({ error: 'That event no longer exists.' }, { status: 404 });
    const splitting = body.scope === 'following' && toTask(before).date !== at.date;
    if (splitting) {
      const count = await taskItems(uid).count().get();
      if (count.data().count >= MAX_TASKS_PER_PERSON) {
        return NextResponse.json({
          error: `Your list is full (${MAX_TASKS_PER_PERSON} items). Clear out some finished ones first.`,
        }, { status: 409 });
      }
    }

    const newRef = splitting ? taskItems(uid).doc() : null;
    try {
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(seriesRef);
        if (!snap.exists) throw new Refused('That event no longer exists.', 404);
        const series = toTask(snap);
        if (series.invitedBy) throw new Refused(`Only ${series.invitedBy.name} can move this event.`, 409);
        if (series.kind !== 'event' || series.repeat === 'none' || !series.date) {
          throw new Refused('That is not a repeating event.', 400);
        }
        if (!occursOn(series, at.date!)) throw new Refused('That date is not part of the series.', 400);
        // Read before any write, as a transaction must.
        const owner = splitting && series.planning ? await tx.get(taskOwnerDoc(uid)) : null;

        const days = dayDistance(at.date!, to.date ?? at.date!);
        const time = 'time' in to ? to.time ?? null : series.time;
        const sentEnd = 'endTime' in to ? to.endTime ?? null : series.endTime;
        const endTime = time && sentEnd && sentEnd > time ? sentEnd : null;

        if (!newRef) {
          // All of it, shifted.
          const shifted = shiftedRepeat(series, days);
          tx.update(seriesRef, { ...shifted, time, endTime, updatedAt: FieldValue.serverTimestamp() });
          syncReminderQueue(tx, uid, { ...series, ...shifted, time }, taskId);
          return;
        }

        // The old series keeps the dates before the cut, and the taken-out
        // dates among them.
        const keptSkips = series.skipDates.filter((d) => d < at.date!);
        const oldUntil = dayBefore(at.date!);
        tx.update(seriesRef, {
          repeatUntil: oldUntil,
          skipDates: keptSkips,
          // A planning slot is the series still running; see below.
          ...(series.planning ? { planning: null } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        syncReminderQueue(tx, uid, { ...series, repeatUntil: oldUntil, skipDates: keptSkips }, taskId);

        // The new one starts on the moved date and keeps going as far as the
        // old one would have, shifted with it.
        const shifted = shiftedRepeat({
          ...series,
          date: at.date!,
          skipDates: series.skipDates.filter((d) => d >= at.date!),
        }, days);
        tx.set(newRef, {
          ...snap.data(),
          ...shifted,
          time,
          endTime,
          // For the record: where this series came from. It is a series in
          // its own right, so changing one of its dates asks again.
          detachedFrom: taskId,
          nextId: null,
          order: Date.now(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        syncReminderQueue(tx, uid, { ...series, ...shifted, time }, newRef.id);
        // The planning card's pointer follows the part still to come, or it
        // would read a series that has ended and ask again.
        if (series.planning && owner?.data()?.planning?.[series.planning]?.taskId === taskId) {
          tx.set(taskOwnerDoc(uid), { planning: { [series.planning]: { taskId: newRef.id } } }, { merge: true });
        }
      });
    } catch (e) {
      if (e instanceof Refused) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    // Invitees' calendars follow: their copy moves, or ends, and the new
    // series arrives with the answers they already gave.
    if (hasInvites(toTask(before))) {
      const org = organizerFrom(uid, email, entry);
      await syncInvitesQuietly(org, taskId);
      if (newRef) await syncInvitesQuietly(org, newRef.id);
    }

    const [series, made] = await Promise.all([seriesRef.get(), newRef ? newRef.get() : Promise.resolve(null)]);
    return NextResponse.json({ series: toTask(series), event: made ? toTask(made) : null });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
