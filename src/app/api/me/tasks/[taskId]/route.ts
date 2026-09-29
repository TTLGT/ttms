import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { syncReminderQueue, taskItems, toTask } from '@/lib/personalTasksServer';
import { cleanTaskInput } from '@/types/task';

/**
 * One item on the caller's own list. The path is always under their own uid,
 * so a task id belonging to somebody else simply is not found.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { uid } = await requireCompanyUser(req);
    const { taskId } = await params;
    const ref  = taskItems(uid).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'That item no longer exists.' }, { status: 404 });
    }

    const input = cleanTaskInput(await req.json().catch(() => ({})));
    if ('title' in input && !input.title) {
      return NextResponse.json({ error: 'Give it a title.' }, { status: 400 });
    }

    const current = toTask(snap);
    const kind = input.kind ?? current.kind;
    if (kind === 'event' && ('date' in input ? !input.date : !current.date)) {
      return NextResponse.json({ error: 'An event needs a date.' }, { status: 400 });
    }

    const update: Record<string, unknown> = { ...input, updatedAt: FieldValue.serverTimestamp() };
    // An event has nothing to finish and no end time is meaningful on a task;
    // turning one into the other tidies both rather than leaving stale fields.
    if (kind === 'event') update.status = 'todo';
    if (kind === 'task') { update.endTime = null; update.eventType = 'other'; }

    const status = (update.status as string | undefined) ?? current.status;
    if (status === 'done' && current.status !== 'done') update.doneAt = FieldValue.serverTimestamp();
    if (status !== 'done' && current.status === 'done') update.doneAt = null;

    // The queue is rebuilt from what the item will be after this save, in the
    // same batch — so ticking a task Done cancels its reminders, and moving it
    // to another day moves them with it. A drag that changes only `order`
    // touches none of the fields a reminder depends on and skips it.
    const batch = adminDb.batch();
    batch.update(ref, update);
    if (['kind', 'status', 'date', 'time', 'reminders'].some((k) => k in update)) {
      syncReminderQueue(batch, uid, {
        kind,
        status: status as typeof current.status,
        date: 'date' in input ? input.date ?? null : current.date,
        time: 'time' in input ? input.time ?? null : current.time,
        reminders: input.reminders ?? current.reminders,
      }, taskId);
    }
    await batch.commit();

    return NextResponse.json({ task: toTask(await ref.get()) });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { uid } = await requireCompanyUser(req);
    const { taskId } = await params;
    // Deleting something already gone is not an error: two tabs, one click each.
    // Its reminders go with it, or a deleted call would still ring.
    const batch = adminDb.batch();
    batch.delete(taskItems(uid).doc(taskId));
    syncReminderQueue(batch, uid, null, taskId);
    await batch.commit();
    return NextResponse.json({ deleted: taskId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
