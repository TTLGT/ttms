import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { syncReminderQueue, taskItems, taskOwnerDoc, toTask } from '@/lib/personalTasksServer';
import { cleanBoardColumns, stepBackFrom, type TaskStatus } from '@/types/task';

/**
 * The caller's own board layout: which columns, in what order, which hidden.
 * See `BoardColumn` in src/types/task.ts.
 *
 * Hiding or deleting a column moves its tasks **one step back** — into the
 * nearest column to its left that is still showing — in the same request, so
 * a hidden column never quietly holds work nobody can see. That happens here
 * rather than in the browser because it can be a few hundred writes, and a
 * tab closed halfway through would leave the board split between two states.
 */
export async function PUT(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = await req.json().catch(() => ({}));
    const next = cleanBoardColumns(body?.columns);

    const owner = taskOwnerDoc(uid);
    const before = cleanBoardColumns((await owner.get()).data()?.boardColumns);

    // Where each column that is no longer showing sends its tasks. A column
    // still in the layout steps left through the new order; a deleted one
    // steps left through the order it had, since it has no place in the new.
    const showing = new Set(next.filter((c) => !c.hidden).map((c) => c.id));
    const isShowing = (id: TaskStatus) => showing.has(id);
    const moves = new Map<TaskStatus, TaskStatus>();
    for (const c of next) if (c.hidden) moves.set(c.id, stepBackFrom(next, c.id, isShowing));
    for (const c of before) if (!next.some((n) => n.id === c.id)) moves.set(c.id, stepBackFrom(before, c.id, isShowing));

    await owner.set({ boardColumns: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // One single-field query per column being emptied — indexed by Firestore
    // on its own. A column that was already hidden comes back empty for the
    // price of one read.
    let moved = 0;
    for (const [from, to] of moves) {
      const snap = await taskItems(uid).where('status', '==', from).get();
      // Six writes a task at most (the task and five reminder slots), so 80
      // keeps a batch under Firestore's 500.
      for (let i = 0; i < snap.docs.length; i += 80) {
        const batch = adminDb.batch();
        snap.docs.slice(i, i + 80).forEach((d, k) => {
          const task = toTask(d);
          batch.update(d.ref, {
            status: to,
            // The bottom of the column it lands in, in the order it had.
            order: Date.now() + i + k,
            updatedAt: FieldValue.serverTimestamp(),
            ...(to === 'done' ? { doneAt: FieldValue.serverTimestamp() } : {}),
          });
          // Only Done changes what a reminder does — a custom column placed
          // after Done and then hidden steps back into it.
          if (to === 'done') syncReminderQueue(batch, uid, { ...task, status: to }, d.id);
        });
        await batch.commit();
        moved += Math.min(80, snap.docs.length - i);
      }
    }

    return NextResponse.json({ columns: next, moved });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
