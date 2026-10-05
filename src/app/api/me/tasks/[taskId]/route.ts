import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { syncReminderQueue, taskItems, taskOwnerDoc, toTask } from '@/lib/personalTasksServer';
import { gameClock, gameFrom, offDaysFor } from '@/lib/taskGameServer';
import { brokerSuggestion } from '@/types/brokerSuggestions';
import { GameTurn, addDays, daysBetween, type GameEvent, type GameState } from '@/types/taskGame';
import { cleanTaskInput, nextOccurrence, type PersonalTask, type TaskStep } from '@/types/task';
import { cleanTaskStreak, recordTaskProgress, type TaskStreak } from '@/types/taskStreak';

class Refused extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * One item on the caller's own list. The path is always under their own uid,
 * so a task id belonging to somebody else simply is not found.
 *
 * A transaction rather than a batch, because finishing a task can do three
 * things that must land together or not at all: the task itself, the next
 * copy of a repeating one, and the person's XP.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { uid, email } = await requireCompanyUser(req);
    const { taskId } = await params;
    const ref = taskItems(uid).doc(taskId);
    const owner = taskOwnerDoc(uid);
    const input = cleanTaskInput(await req.json().catch(() => ({})));
    if ('title' in input && !input.title) {
      return NextResponse.json({ error: 'Give it a title.' }, { status: 400 });
    }
    // An id not in the catalog would earn the bonus for nothing it names.
    if (input.suggestionId && !brokerSuggestion(input.suggestionId)) delete input.suggestionId;
    const { today, now } = gameClock();

    let result: { nextId: string | null; game: GameState | null; events: GameEvent[]; streak: TaskStreak | null };
    try {
      result = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Refused('That item no longer exists.', 404);
        const ownerSnap = await tx.get(owner);
        const current = toTask(snap);

        const kind = input.kind ?? current.kind;
        const date = 'date' in input ? input.date ?? null : current.date;
        if (kind === 'event' && !date) throw new Refused('An event needs a date.', 400);
        const repeat = kind === 'event' ? 'none' : input.repeat ?? current.repeat;
        if (repeat !== 'none' && !date) throw new Refused('A repeating task needs a due date.', 400);

        const update: Record<string, unknown> = { ...input, updatedAt: FieldValue.serverTimestamp() };
        // An event has nothing to finish and no end time is meaningful on a task;
        // turning one into the other tidies both rather than leaving stale fields.
        if (kind === 'event') { update.status = 'todo'; update.repeat = 'none'; }
        if (kind === 'task') { update.endTime = null; update.eventType = 'other'; }
        const repeatDay = 'date' in input || 'repeat' in input
          ? (repeat === 'monthly' && date ? Number(date.slice(8, 10)) : null)
          : current.repeatDay;
        if (repeatDay !== current.repeatDay) update.repeatDay = repeatDay;

        const status = (update.status as string | undefined) ?? current.status;
        const finishing = kind === 'task' && status === 'done' && current.status !== 'done';
        const reopening = current.status === 'done' && status !== 'done';
        if (finishing) update.doneAt = FieldValue.serverTimestamp();
        if (reopening) update.doneAt = null;

        // Steps: what was sent, with the server's own fields carried over from
        // the stored step of the same id. An event has nothing to finish.
        const newlyDone: TaskStep[] = [];
        const unticked: TaskStep[] = [];
        let steps = current.steps;
        if (kind === 'event') {
          if (current.steps.length) update.steps = [];
          steps = [];
        } else if (input.steps) {
          const storedSteps = new Map(current.steps.map((st) => [st.id, st]));
          steps = input.steps.map((st) => {
            const was = storedSteps.get(st.id);
            const step = { ...st, xp: was?.xp ?? 0, everDone: was?.everDone ?? false };
            if (step.done && !was?.done) newlyDone.push(step);
            if (!step.done && was?.done) unticked.push(step);
            return step;
          });
          update.steps = steps;
        } else {
          delete update.steps;
        }
        if (kind === 'event') update.rank = null;

        const merged = { ...current, ...input, kind, date, repeat, repeatDay, status, steps } as PersonalTask;

        // Counted once ever, in both the game and the plain streak, so ticking
        // a box on and off cannot pad either.
        const firstTasks = finishing && !current.everDone ? 1 : 0;
        const firstSteps = newlyDone.filter((st) => !st.everDone).length;
        if (finishing) update.everDone = true;
        for (const st of newlyDone) st.everDone = true;

        // Game mode. A task that has counted toward missions once never does
        // again, so ticking one on and off cannot farm them; its own XP is
        // taken back on reopening and paid again on finishing, which nets out.
        // A step works the same way, for a smaller sum.
        const stored = gameFrom(ownerSnap);
        const storedStreak = cleanTaskStreak(ownerSnap.data()?.streak);
        const gameMoves = stored.enabled && (
          finishing || (reopening && current.xpEarned > 0)
          || newlyDone.length > 0 || unticked.some((st) => st.xp > 0));
        const progress = firstTasks + firstSteps > 0;
        // The person's days off, read only when a streak can actually move
        // today — so an ordinary status change pays for no query.
        const needOffDays = (gameMoves && (finishing || newlyDone.length > 0) && stored.lastActiveDate !== today)
          || (progress && storedStreak.lastActiveDate !== today);
        const offDays = needOffDays ? await offDaysFor(email, today, tx) : undefined;

        let game: GameState | null = null;
        let events: GameEvent[] = [];
        if (gameMoves) {
          const turn = new GameTurn(stored, today, now, offDays);
          if (finishing) {
            update.xpEarned = turn.onTaskDone(merged, !current.everDone);
          } else if (reopening && current.xpEarned > 0) {
            turn.onTaskReopened(merged.title, current.xpEarned);
            update.xpEarned = 0;
          }
          for (const st of newlyDone) st.xp = turn.onStepDone(st.title);
          for (const st of unticked) {
            turn.onStepUndone(st.title, st.xp);
            st.xp = 0;
          }
          ({ state: game, events } = turn.finish());
        }

        // Null when nothing was finished: the page keeps the streak it has,
        // which GET worked out with the person's time off in hand.
        const streak = progress
          ? recordTaskProgress(storedStreak, today, offDays, { tasks: firstTasks, steps: firstSteps })
          : null;
        // One write to the owner for both, only when either moved.
        if (game || progress) {
          tx.set(owner, { ...(game ? { game } : {}), ...(progress ? { streak } : {}) }, { merge: true });
        }

        // A repeating task makes its next copy the first time it is finished.
        // `nextId` remembers that it has, so reopening and finishing it again
        // does not make a second; the copy stays even if this one is reopened.
        let nextId: string | null = null;
        const nextDate = finishing && !current.nextId ? nextOccurrence(merged, today) : null;
        if (nextDate) {
          const nextRef = taskItems(uid).doc();
          nextId = nextRef.id;
          update.nextId = nextId;
          tx.set(nextRef, {
            kind: 'task',
            title: merged.title,
            notes: merged.notes,
            status: 'todo',
            priority: merged.priority,
            color: merged.color,
            date: nextDate,
            time: merged.time,
            endTime: null,
            eventType: 'other',
            location: merged.location,
            reminders: merged.reminders,
            repeat,
            repeatDay,
            suggestionId: merged.suggestionId,
            // The next one starts with the same steps, none of them done, and
            // keeps its place in the queue. A step's due date moves with the
            // task's — two days before it stays two days before it — and is
            // dropped when the finished task had no date to measure from.
            steps: merged.steps.map((st) => ({
              ...st,
              done: false,
              date: st.date && merged.date ? addDays(st.date, daysBetween(merged.date, nextDate)) : null,
              xp: 0,
              everDone: false,
            })),
            rank: merged.rank ?? null,
            nextId: null,
            xpEarned: 0,
            everDone: false,
            order: Date.now(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            doneAt: null,
          });
          syncReminderQueue(tx, uid, {
            kind: 'task', status: 'todo', date: nextDate, time: merged.time, reminders: merged.reminders,
          }, nextId);
        }

        // The queue is rebuilt from what the item will be after this save, in the
        // same transaction — so ticking a task Done cancels its reminders, and moving
        // it to another day moves them with it. A drag that changes only `order`
        // touches none of the fields a reminder depends on and skips it.
        tx.update(ref, update);
        if (['kind', 'status', 'date', 'time', 'reminders'].some((k) => k in update)) {
          syncReminderQueue(tx, uid, {
            kind,
            status,
            date,
            time: 'time' in input ? input.time ?? null : current.time,
            reminders: input.reminders ?? current.reminders,
          }, taskId);
        }
        return { nextId, game, events, streak };
      });
    } catch (e) {
      if (e instanceof Refused) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const [task, next] = await Promise.all([
      ref.get(),
      result.nextId ? taskItems(uid).doc(result.nextId).get() : Promise.resolve(null),
    ]);
    return NextResponse.json({
      task: toTask(task),
      next: next ? toTask(next) : null,
      game: result.game,
      events: result.events,
      streak: result.streak,
    });
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
    // Its reminders go with it, or a deleted call would still ring. XP a
    // finished task earned stays earned — deleting is tidying, not undoing.
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
