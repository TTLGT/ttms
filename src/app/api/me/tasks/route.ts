import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import {
  syncReminderQueue,
  taskItems,
  taskOwnerDoc,
  toReminderSettings,
  toTask,
} from '@/lib/personalTasksServer';
import { gameClock, gameFrom, runDailyCheck, writeGame } from '@/lib/taskGameServer';
import { brokerSuggestion } from '@/types/brokerSuggestions';
import { GameTurn, type GameEvent, type GameState } from '@/types/taskGame';
import { MAX_TASKS_PER_PERSON, cleanBoardColumns, cleanColorLabels, cleanTaskInput } from '@/types/task';

/**
 * The caller's own task list and calendar — see src/types/task.ts.
 *
 * Same shape as /api/me/words: the list is the uid off the verified ID token,
 * and there is no parameter for whose list it is. Nobody else's list is
 * reachable from here, admins included.
 */
export async function GET(req: NextRequest) {
  try {
    const { uid, email } = await requireCompanyUser(req);
    // The whole list, in one read per item. It is capped at
    // MAX_TASKS_PER_PERSON, and every view needs all of it: the board, the
    // notes and the table sort it differently, and the calendar pages months.
    // The settings, the board's columns and the colour names ride along so the page needs no
    // second request.
    const [snap, owner] = await Promise.all([taskItems(uid).get(), taskOwnerDoc(uid).get()]);
    const tasks = snap.docs.map(toTask);
    // Game mode's first look of the day — overdue and streak penalties, new
    // missions — happens here, because this is the read every visit makes.
    // Any other read that day skips it without a transaction.
    const { game, events } = await runDailyCheck(uid, email, gameFrom(owner), tasks);
    return NextResponse.json({
      tasks,
      settings: toReminderSettings(owner.data()?.reminderSettings),
      columns: cleanBoardColumns(owner.data()?.boardColumns),
      colorLabels: cleanColorLabels(owner.data()?.colorLabels),
      game,
      events,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const input = cleanTaskInput(await req.json().catch(() => ({})));

    if (!input.title) {
      return NextResponse.json({ error: 'Give it a title.' }, { status: 400 });
    }
    const kind = input.kind ?? 'task';
    if (kind === 'event' && !input.date) {
      return NextResponse.json({ error: 'An event needs a date.' }, { status: 400 });
    }
    const repeat = kind === 'event' ? 'none' : (input.repeat ?? 'none');
    if (repeat !== 'none' && !input.date) {
      return NextResponse.json({ error: 'A repeating task needs a due date.' }, { status: 400 });
    }
    const suggestionId = kind === 'task' && brokerSuggestion(input.suggestionId) ? input.suggestionId! : null;

    const items = taskItems(uid);
    // An aggregation, so this costs one read however long the list is.
    const count = await items.count().get();
    if (count.data().count >= MAX_TASKS_PER_PERSON) {
      return NextResponse.json({
        error: `Your list is full (${MAX_TASKS_PER_PERSON} items). Clear out some finished ones first.`,
      }, { status: 409 });
    }

    const status = kind === 'event' ? 'todo' : (input.status ?? 'todo');
    const ref = items.doc();
    const batch = adminDb.batch();
    batch.set(ref, {
      kind,
      title:     input.title,
      notes:     input.notes ?? '',
      status,
      priority:  input.priority ?? 'normal',
      color:     input.color ?? 'yellow',
      date:      input.date ?? null,
      time:      input.time ?? null,
      endTime:   kind === 'event' ? (input.endTime ?? null) : null,
      eventType: kind === 'event' ? (input.eventType ?? 'other') : 'other',
      location:  input.location ?? '',
      reminders: input.reminders ?? [],
      repeat,
      repeatDay: repeat === 'monthly' && input.date ? Number(input.date.slice(8, 10)) : null,
      nextId:    null,
      xpEarned:  0,
      everDone:  false,
      suggestionId,
      // The browser works out where a new card goes (the bottom of its column)
      // because it is the one holding the column. Absent, the clock stands in:
      // it is always larger than anything orderBetween() hands out, so a task
      // added from elsewhere lands last.
      order:     input.order ?? Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      doneAt:    status === 'done' ? FieldValue.serverTimestamp() : null,
    });
    // Same batch, so an item never exists without the reminders it was saved with.
    syncReminderQueue(batch, uid, {
      kind, status, date: input.date ?? null, time: input.time ?? null, reminders: input.reminders ?? [],
    }, ref.id);
    await batch.commit();

    // "Add N tasks" missions. A transaction of its own after the task exists
    // rather than one around both: the count above is an aggregation, which a
    // transaction cannot hold, and a mission a click short is the worst case.
    // An event is not a task to plan, and a task added already finished earns
    // nothing here — finishing it is where the XP is.
    let game: GameState | null = null;
    let events: GameEvent[] = [];
    if (kind === 'task' && status !== 'done') {
      const { today, now } = gameClock();
      const owner = taskOwnerDoc(uid);
      ({ game, events } = await adminDb.runTransaction(async (tx) => {
        const stored = gameFrom(await tx.get(owner));
        if (!stored.enabled) return { game: null, events: [] as GameEvent[] };
        const turn = new GameTurn(stored, today, now);
        turn.onTaskAdded();
        const out = turn.finish();
        writeGame(tx, uid, out.state);
        return { game: out.state, events: out.events };
      }));
    }

    return NextResponse.json({ task: toTask(await ref.get()), game, events }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * "Clear done": deletes every finished task in one go. Events are left alone
 * — an event has no Done, and last month's calendar is worth keeping.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    if (req.nextUrl.searchParams.get('status') !== 'done') {
      return NextResponse.json({ error: 'Only finished tasks can be cleared in bulk.' }, { status: 400 });
    }

    const snap = await taskItems(uid).where('status', '==', 'done').get();
    const done = snap.docs.filter((d) => d.data().kind !== 'event');
    // Six operations per task (the task and its five queue slots) against
    // Firestore's 500 per batch. A finished task has nothing queued, but the
    // slots are cleared anyway in case one was left by an older save.
    for (let i = 0; i < done.length; i += 80) {
      const batch = adminDb.batch();
      for (const d of done.slice(i, i + 80)) {
        batch.delete(d.ref);
        syncReminderQueue(batch, uid, null, d.id);
      }
      await batch.commit();
    }
    return NextResponse.json({ deleted: done.map((d) => d.id) });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
