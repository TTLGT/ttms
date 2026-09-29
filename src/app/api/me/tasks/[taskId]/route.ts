import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, requireCompanyUser } from '@/lib/firebase-admin';
import { taskItems, toTask } from '@/lib/personalTasksServer';
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
      return NextResponse.json({ error: 'An appointment needs a date.' }, { status: 400 });
    }

    const update: Record<string, unknown> = { ...input, updatedAt: FieldValue.serverTimestamp() };
    // An event has nothing to finish and no end time is meaningful on a task;
    // turning one into the other tidies both rather than leaving stale fields.
    if (kind === 'event') update.status = 'todo';
    if (kind === 'task') update.endTime = null;

    const status = (update.status as string | undefined) ?? current.status;
    if (status === 'done' && current.status !== 'done') update.doneAt = FieldValue.serverTimestamp();
    if (status !== 'done' && current.status === 'done') update.doneAt = null;

    await ref.update(update);
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
    await taskItems(uid).doc(taskId).delete();
    return NextResponse.json({ deleted: taskId });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
