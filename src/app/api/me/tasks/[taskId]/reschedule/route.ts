import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { blocksQuery, carryBlocks, syncReminderQueue, taskItems, taskOwnerDoc, toTask } from '@/lib/personalTasksServer';
import { officeToday } from '@/types/celebration';
import { shiftedEnd } from '@/types/planning';
import { MAX_TASKS_PER_PERSON, cleanTaskInput } from '@/types/task';

class Refused extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * Move an open task to another day — and keep a record that it was meant for
 * this one.
 *
 * Body: `{ date, time? }`. In one transaction: the task is closed where it
 * is, as outcome 'rescheduled' with `rescheduledTo` naming the new day, and a
 * copy carries on from the new day with everything it had — its status, its
 * steps and their progress, its repeat. So the calendar still shows it on the
 * day it was planned for ("Rescheduled to Thursday"), and the board shows the
 * live copy. Changing a task's date in the editor still just moves it; this
 * is for when the move is worth remembering.
 *
 * No XP moves: moving something is not failing it. Overdue charges it ran up
 * while it sat open are not given back, as with any task.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { uid } = await requireCompanyUser(req);
    const { taskId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const to = cleanTaskInput({ date: body.date, ...('time' in body ? { time: body.time } : {}) });
    if (!to.date) return NextResponse.json({ error: 'Pick the day to move it to.' }, { status: 400 });

    const count = await taskItems(uid).count().get();
    if (count.data().count >= MAX_TASKS_PER_PERSON) {
      return NextResponse.json({
        error: `Your list is full (${MAX_TASKS_PER_PERSON} items). Clear out some finished ones first.`,
      }, { status: 409 });
    }

    const ref = taskItems(uid).doc(taskId);
    const copyRef = taskItems(uid).doc();
    let blockIds: string[] = [];
    try {
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Refused('That task no longer exists.', 404);
        const task = toTask(snap);
        if (task.kind !== 'task') throw new Refused('Only a task can be rescheduled. Move an event by its date.', 400);
        if (task.status === 'done') throw new Refused('That task is already closed.', 409);
        if (task.date === to.date && !('time' in to)) throw new Refused('It is already on that day.', 400);
        // Its work blocks, read before any write. Those still to come follow
        // the copy, which is where the work now is; past ones stay here.
        const blocks = (await tx.get(blocksQuery(uid, taskId))).docs;

        const time = 'time' in to ? to.time ?? null : task.time;
        // The copy keeps the block's length at its new start.
        const endTime = shiftedEnd(task.time, task.endTime, time);

        // The record, left on its day. Its steps' XP moves to the copy, which
        // now holds that progress, so unticking either cannot give it back twice.
        tx.update(ref, {
          status: 'done',
          outcome: 'rescheduled',
          rescheduledTo: to.date,
          nextId: copyRef.id,
          doneAt: FieldValue.serverTimestamp(),
          steps: task.steps.map((st) => ({ ...st, xp: 0 })),
          updatedAt: FieldValue.serverTimestamp(),
        });
        syncReminderQueue(tx, uid, null, taskId);

        tx.set(copyRef, {
          // `dueDate` comes across untouched: rescheduling moves when it is
          // planned, never when it is due.
          ...snap.data(),
          date: to.date,
          time,
          endTime,
          outcome: null,
          rescheduledTo: null,
          rescheduledFrom: taskId,
          nextId: null,
          xpLost: 0,
          archived: false,
          order: Date.now(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          doneAt: null,
        });
        syncReminderQueue(tx, uid, {
          kind: 'task', status: task.status, date: to.date!, time, reminders: task.reminders,
        }, copyRef.id);

        blockIds = carryBlocks(tx, blocks, copyRef.id, officeToday());

        // The planning card follows its slot to the new day.
        if (task.planning) {
          tx.set(taskOwnerDoc(uid), { planning: { [task.planning]: { taskId: copyRef.id } } }, { merge: true });
        }
      });
    } catch (e) {
      if (e instanceof Refused) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const [task, copy, blocks] = await Promise.all([
      ref.get(), copyRef.get(), Promise.all(blockIds.map((id) => taskItems(uid).doc(id).get())),
    ]);
    return NextResponse.json({
      task: toTask(task), copy: toTask(copy), blocks: blocks.filter((b) => b.exists).map(toTask),
    }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
