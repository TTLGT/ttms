import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, FieldValue, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { nextCopyData, syncReminderQueue, taskItems, taskOwnerDoc, toTask } from '@/lib/personalTasksServer';
import { officeToday } from '@/types/celebration';
import {
  MAX_TASKS_PER_PERSON, MAX_TASK_TITLE, isLapsedPlanning, newStepId, nextOccurrence, repeatEnd, repeatFields, type PersonalTask,
} from '@/types/task';
import {
  MORNING_ASK_UNTIL,
  PLANNING_ASK_FROM,
  PLANNING_COPY,
  PLANNING_DEFAULT_DURATION,
  PLANNING_DEFAULT_NTH,
  PLANNING_DEFAULT_WEEKDAY,
  PLANNING_KINDS,
  PLANNING_WEEKDAYS,
  addMinutes,
  canBePlanningSlot,
  cleanPlanningState,
  firstPlanningDate,
  isDailyKind,
  isPlanningAskDay,
  isPlanningDuration,
  isPlanningKind,
  isPlanningNth,
  isValidTime,
  officeNowTime,
  planningRepeat,
  snoozeUntil,
  type PlanningKind,
  type PlanningState,
  type PlanningStatus,
} from '@/types/planning';

/**
 * The caller's own planning prompts — see src/types/planning.ts.
 *
 * Same shape as /api/me/tasks: everything is under the uid off the verified
 * ID token, and there is no parameter for whose. The card in the dashboard
 * asks GET once per full page load, so it is kept to the owner document and
 * a read or two per kind for the tasks it points at — never the list.
 */

function fail(e: unknown) {
  if (e instanceof AdminAuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

/**
 * Follow each kind's pointer to the slot it stands for, if there still is one.
 *
 * - A **one-off** covers its own day and any later one it was put on, done
 *   or not: somebody who reviewed today's plan at 8:10 is not asked again at
 *   noon, and is asked again tomorrow.
 * - A **repeating** slot covers everything until it is deleted, or finished
 *   with nothing to carry it on. A hop or two along `nextId` covers a copy
 *   made by a save that did not move the pointer.
 */
async function statusFor(
  uid: string, state: PlanningState, today: string, nowTime: string, tidy = false,
): Promise<PlanningStatus[]> {
  const live = async (taskId: string | null, hops = 0): Promise<PersonalTask | null> => {
    if (!taskId) return null;
    const snap = await taskItems(uid).doc(taskId).get();
    if (!snap.exists) return null;
    let task = toTask(snap);
    if (tidy && isLapsedPlanning(task, today)) task = await carryOn(uid, task, today);
    if (task.repeat === 'none') return task.date && task.date >= today ? task : null;
    // A missed one already carried on still sits open; the slot is its copy.
    const passed = !!task.nextId && !!task.date && task.date < today;
    // A repeat past its end covers nothing more: a missed last copy has no
    // next one to carry on to, and an event series is never marked done. The
    // card asks again, which is the renewal (REPEAT_ADVICE).
    if (task.repeatUntil && task.repeatUntil < today) return null;
    if (task.status !== 'done' && !passed) return task;
    return task.nextId && hops < 2 ? live(task.nextId, hops + 1) : null;
  };
  return Promise.all(PLANNING_KINDS.map(async (kind) => {
    const s = state[kind];
    const task = await live(s.taskId);
    // Morning until 1pm; end-of-day all day; weekly and monthly only from
    // noon on their own Friday — see PLANNING_ASK_FROM.
    const inHours = kind === 'morning'
      ? nowTime < MORNING_ASK_UNTIL
      : isDailyKind(kind) || (nowTime >= PLANNING_ASK_FROM && isPlanningAskDay(kind, today));
    return {
      kind,
      scheduled: task
        ? {
          taskId: task.id, date: task.date, time: task.time, endTime: task.endTime,
          repeat: task.repeat, repeatWeekday: task.repeatWeekday, repeatNths: task.repeatNths,
          repeatUntil: task.repeatUntil,
        }
        : null,
      off: s.off,
      due: !task && !s.off && inHours && (!s.snoozedUntil || s.snoozedUntil <= today),
    };
  }));
}

/**
 * A repeating planning slot whose day went by undone (isLapsedPlanning()).
 *
 * The missed one stays exactly where it is — an ordinary task, overdue like
 * any other, to be ticked Done or moved to any status, never taken off the
 * list. What it is owed is its next copy: a repeating task otherwise makes
 * one only when it is finished, so a missed plan would stop the slot coming
 * round, and its reminders with it. This makes the copy the same way
 * finishing would (`nextCopyData()`), marks the missed one's `nextId` so
 * ticking it later makes no second copy, and moves the card's pointer on.
 *
 * A one-off is left alone: its day has gone, so the card asks for a new one.
 *
 * A write from a GET, deliberately: this is the read every page load makes,
 * so it is the first chance, and it only touches the caller's own planning
 * slot. In a transaction that re-reads the slot, so two tabs make one copy.
 * Returns the slot the pointer now names.
 */
async function carryOn(uid: string, task: PersonalTask, today: string): Promise<PersonalTask> {
  if (task.repeat === 'none' || task.nextId || !task.planning) return task;
  const kind = task.planning;
  const ref = taskItems(uid).doc(task.id);
  const nextRef = taskItems(uid).doc();
  const made = await adminDb.runTransaction(async (tx) => {
    const fresh = toTask(await tx.get(ref));
    if (!isLapsedPlanning(fresh, today) || fresh.nextId) return false;
    const nextDate = nextOccurrence(fresh, today);
    if (!nextDate) return false;
    tx.set(nextRef, nextCopyData(fresh, nextDate));
    tx.update(ref, { nextId: nextRef.id, updatedAt: FieldValue.serverTimestamp() });
    syncReminderQueue(tx, uid, { ...fresh, status: 'todo', date: nextDate }, nextRef.id);
    tx.set(taskOwnerDoc(uid), { planning: { [kind]: { taskId: nextRef.id } } }, { merge: true });
    return true;
  });
  return made ? toTask(await nextRef.get()) : task;
}

export async function GET(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const owner = await taskOwnerDoc(uid).get();
    const kinds = await statusFor(uid, cleanPlanningState(owner.data()?.planning), officeToday(), officeNowTime(), true);
    return NextResponse.json({ kinds });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Put a planning slot on the caller's calendar: one task, with a reminder at
 * the time, and the pointer to it — in one batch, so the card never stops
 * asking about a slot that failed to save.
 *
 * Body: `{ kind, time, title?, minutes?, weekday?, nth?, everyWeekday? }`.
 * `title` is the person's own name for the slot; blank or missing is the
 * kind's usual one (PLANNING_COPY). `weekday`
 * is weekly and monthly; `nth` (1–4, 5 = last) is monthly only, and the two
 * default to the last Friday. `everyWeekday` is the daily ones' repeat box,
 * off unless sent. Everything else is fixed here; the person changes it
 * afterwards like any other task.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!isPlanningKind(body.kind)) {
      return NextResponse.json({ error: 'Pick which planning this is for.' }, { status: 400 });
    }
    if (!isValidTime(body.time)) {
      return NextResponse.json({ error: 'Pick a time.' }, { status: 400 });
    }
    const kind: PlanningKind = body.kind;
    const time = body.time;
    const weekday = (PLANNING_WEEKDAYS as readonly number[]).includes(body.weekday as number)
      ? body.weekday as number : PLANNING_DEFAULT_WEEKDAY;
    const nth = isPlanningNth(body.nth) ? body.nth : PLANNING_DEFAULT_NTH;
    const minutes = isPlanningDuration(body.minutes) ? body.minutes : PLANNING_DEFAULT_DURATION[kind];
    const endTime = addMinutes(time, minutes);
    const repeat = planningRepeat(kind, body.everyWeekday === true);

    const ownerRef = taskOwnerDoc(uid);
    const today = officeToday();
    const [owner, count] = await Promise.all([ownerRef.get(), taskItems(uid).count().get()]);

    // Two tabs, or a double click: the second gets the slot the first made
    // rather than a second "Plan tomorrow" on the same day.
    // Carrying a missed repeating slot on here too, so it is found to be
    // scheduled rather than made a second time.
    const existing = (await statusFor(uid, cleanPlanningState(owner.data()?.planning), today, '00:00', true))
      .find((s) => s.kind === kind);
    if (existing?.scheduled) {
      return NextResponse.json({ status: existing, already: true });
    }
    if (count.data().count >= MAX_TASKS_PER_PERSON) {
      return NextResponse.json({
        error: `Your list is full (${MAX_TASKS_PER_PERSON} items). Clear out some finished ones first.`,
      }, { status: 409 });
    }

    const copy = PLANNING_COPY[kind];
    const title = (typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TASK_TITLE) : '') || copy.title;
    const date = firstPlanningDate(kind, time, { weekday, nth }, today);
    const repeating = {
      ...repeatFields(repeat, date, kind === 'monthly' ? { repeatWeekday: weekday, repeatNths: [nth] } : {}),
      // A month, like every repeat (REPEAT_ADVICE). When it runs out the card
      // asks again, which is the renewal: a plan worth keeping is a click away.
      repeatUntil: repeatEnd(repeat, date, undefined, null),
    };
    // "At the time" only. The point is a nudge when the slot comes round, and
    // the card said so; anything earlier is the person's to add.
    const reminders = ['start' as const];
    const ref = taskItems(uid).doc();
    const batch = adminDb.batch();
    batch.set(ref, {
      kind: 'task',
      title,
      notes: copy.detail,
      status: 'todo',
      priority: 'normal',
      color: 'blue',
      date,
      time,
      // A planning slot is a block of time, so unlike other tasks it keeps an
      // end — see the PATCH route, which carries it when the start moves.
      endTime,
      eventType: 'other',
      location: '',
      reminders,
      repeat,
      ...repeating,
      nextId: null,
      xpEarned: 0,
      everDone: false,
      suggestionId: null,
      planning: kind,
      steps: copy.steps.map((title) => ({ id: newStepId(), title, done: false, date: null, xp: 0, everDone: false })),
      rank: null,
      contacts: [],
      orders: [],
      order: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      doneAt: null,
    });
    syncReminderQueue(batch, uid, { kind: 'task', status: 'todo', date, time, reminders }, ref.id);
    batch.set(ownerRef, {
      planning: { [kind]: { taskId: ref.id, snoozedUntil: null, off: false } },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();

    const status: PlanningStatus = {
      kind, scheduled: { taskId: ref.id, date, time, endTime, repeat, ...repeating }, off: false, due: false,
    };
    return NextResponse.json({ status }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Use a task or event the caller already has as a planning slot: `{ kind,
 * taskId }`. The person picked it on the card — nothing here matches titles.
 *
 * It changes one thing on the item, `planning`, which is what makes the rest
 * of the app treat it as the slot: finishing a repeat, rescheduling and the
 * missed-day carry-on all move the pointer along with it. Its time, length
 * and reminders stay exactly as the person set them; the card says so when
 * it has no reminder rather than adding one.
 *
 * Whatever the pointer named before loses its `planning` mark, so an old
 * slot that is rescheduled later cannot pull the pointer back to itself.
 */
export async function PUT(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!isPlanningKind(body.kind)) {
      return NextResponse.json({ error: 'Pick which planning this is for.' }, { status: 400 });
    }
    if (typeof body.taskId !== 'string' || !body.taskId || body.taskId.includes('/')) {
      return NextResponse.json({ error: 'Pick one of your tasks or events.' }, { status: 400 });
    }
    const kind: PlanningKind = body.kind;
    const taskId = body.taskId;
    const today = officeToday();
    const ownerRef = taskOwnerDoc(uid);
    const taskRef = taskItems(uid).doc(taskId);

    // Same guard as POST: a kind already on the calendar keeps its slot. The
    // card only offers this when it is not.
    const owner = await ownerRef.get();
    const existing = (await statusFor(uid, cleanPlanningState(owner.data()?.planning), today, '00:00', true))
      .find((s) => s.kind === kind);
    if (existing?.scheduled) {
      return NextResponse.json({ status: existing, already: true });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const [ownerSnap, taskSnap] = await Promise.all([tx.get(ownerRef), tx.get(taskRef)]);
      if (!taskSnap.exists) return { error: 'That one is no longer on your list.', code: 404 } as const;
      const task = toTask(taskSnap);
      if (!canBePlanningSlot(task, today)) {
        return { error: 'Pick something still to come, with a day and a time.', code: 409 } as const;
      }
      const state = cleanPlanningState(ownerSnap.data()?.planning);
      // One item stands for one kind: a morning review is not also the weekly plan.
      if (task.planning && task.planning !== kind && state[task.planning].taskId === task.id) {
        return { error: `That is already your ${PLANNING_COPY[task.planning].label.toLowerCase()}.`, code: 409 } as const;
      }
      const previous = state[kind].taskId && state[kind].taskId !== taskId
        ? await tx.get(taskItems(uid).doc(state[kind].taskId))
        : null;

      if (previous?.exists && previous.data()?.planning === kind) {
        tx.update(previous.ref, { planning: null, updatedAt: FieldValue.serverTimestamp() });
      }
      tx.update(taskRef, { planning: kind, updatedAt: FieldValue.serverTimestamp() });
      tx.set(ownerRef, {
        planning: { [kind]: { taskId, snoozedUntil: null, off: false } },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { task } as const;
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.code });
    }
    const t = result.task;
    const status: PlanningStatus = {
      kind,
      scheduled: {
        taskId: t.id, date: t.date, time: t.time, endTime: t.endTime,
        repeat: t.repeat, repeatWeekday: t.repeatWeekday, repeatNths: t.repeatNths, repeatUntil: t.repeatUntil,
      },
      off: false,
      due: false,
    };
    return NextResponse.json({ status });
  } catch (e) {
    return fail(e);
  }
}

/**
 * `{ kind, action }`: `snooze` ("Not now", until the next period), `off`
 * ("Don't ask again"), or `on` (asked again from the Calendar page). None of
 * them touches the task itself — taking a slot off the calendar is deleting
 * the task, from the task's own screen.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!isPlanningKind(body.kind) || !['snooze', 'off', 'on'].includes(body.action as string)) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }
    const kind: PlanningKind = body.kind;
    const change = body.action === 'snooze'
      ? { snoozedUntil: snoozeUntil(kind, officeToday()) }
      : body.action === 'off'
        ? { off: true }
        : { off: false, snoozedUntil: null };
    await taskOwnerDoc(uid).set(
      { planning: { [kind]: change }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
