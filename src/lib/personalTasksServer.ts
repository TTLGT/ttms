import type { DocumentData, DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { FieldValue, adminDb } from './firebase-admin';
import { addDays, daysBetween } from '@/types/taskGame';
import {
  DEFAULT_TASK_REMINDER_SETTINGS,
  EVENT_TYPES,
  PERSONAL_TASKS_COLLECTION,
  PERSONAL_TASK_ITEMS,
  TASK_COLORS,
  TASK_PRIORITIES,
  TASK_REMINDERS_COLLECTION,
  TASK_REMINDER_LEADS,
  TASK_REPEATS,
  PERSONAL_TASK_HISTORY,
  belongsInHistory,
  cleanNths,
  historyCutoff,
  cleanContacts,
  cleanOrders,
  isTaskStatus,
  reminderInstants,
  toSteps,
  type PersonalTask,
  type TaskReminderSettings,
} from '@/types/task';
import { isPlanningKind } from '@/types/planning';

/**
 * Server side of the personal task list — see src/types/task.ts.
 *
 * Every function takes the uid, and every caller passes the one off the
 * verified ID token (or, for the reminder run, the one stored on the queue
 * entry by that same route). There is no way to name somebody else's list.
 */

export function taskItems(uid: string) {
  return adminDb.collection(PERSONAL_TASKS_COLLECTION).doc(uid).collection(PERSONAL_TASK_ITEMS);
}

/** The parent document: holds the person's reminder settings and their board's columns. */
export function taskOwnerDoc(uid: string) {
  return adminDb.collection(PERSONAL_TASKS_COLLECTION).doc(uid);
}

/** What is long over — see PERSONAL_TASK_HISTORY. */
export function taskHistory(uid: string) {
  return taskOwnerDoc(uid).collection(PERSONAL_TASK_HISTORY);
}

/**
 * Move whatever has become history out of the list: once per office day per
 * person, from the first GET, which has the whole list in hand already — so
 * finding it costs nothing, and only the moves are writes. Same id in both
 * places, written then deleted in one batch, so it is never in neither. A
 * second tab doing the same at the same moment writes the same document twice
 * and deletes one already gone, which is harmless.
 *
 * Returns the ids moved, for the caller to leave out of what it sends back.
 */
export async function sweepToHistory(
  uid: string, docs: DocumentSnapshot[], tasks: PersonalTask[], today: string,
): Promise<Set<string>> {
  const cutoff = historyCutoff(today);
  const moving = tasks.filter((t) => belongsInHistory(t, cutoff)).map((t) => t.id);
  const byId = new Map(docs.map((d) => [d.id, d]));
  // Two writes each against Firestore's 500 per batch.
  for (let i = 0; i < moving.length; i += 200) {
    const batch = adminDb.batch();
    for (const id of moving.slice(i, i + 200)) {
      batch.set(taskHistory(uid).doc(id), { ...byId.get(id)!.data(), movedToHistoryAt: FieldValue.serverTimestamp() });
      batch.delete(taskItems(uid).doc(id));
    }
    await batch.commit();
  }
  await taskOwnerDoc(uid).set({ historySweptOn: today }, { merge: true });
  return new Set(moving);
}

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return typeof t?.toDate === 'function' ? t.toDate().toISOString() : null;
}

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;

/** The stored document as the browser sees it, with every field defaulted. */
export function toTask(snap: DocumentSnapshot): PersonalTask {
  const d = snap.data() ?? {};
  return {
    id:        snap.id,
    kind:      d.kind === 'event' ? 'event' : 'task',
    title:     typeof d.title === 'string' ? d.title : '',
    notes:     typeof d.notes === 'string' ? d.notes : '',
    status:    isTaskStatus(d.status) ? d.status : 'todo',
    priority:  pick(TASK_PRIORITIES, d.priority, 'normal'),
    color:     pick(TASK_COLORS, d.color, 'yellow'),
    date:      typeof d.date === 'string' ? d.date : null,
    time:      typeof d.time === 'string' ? d.time : null,
    endTime:   typeof d.endTime === 'string' ? d.endTime : null,
    // Items saved before events had types or reminders read as the plainest
    // version of each — which is what they were.
    eventType: pick(EVENT_TYPES, d.eventType, 'other'),
    location:  typeof d.location === 'string' ? d.location : '',
    reminders: Array.isArray(d.reminders)
      ? TASK_REMINDER_LEADS.filter((l) => (d.reminders as unknown[]).includes(l))
      : [],
    // Events have repeated since monthlyNth came in; one saved before then reads 'none', which it was.
    repeat:    pick(TASK_REPEATS, d.repeat, 'none'),
    repeatDay: typeof d.repeatDay === 'number' ? d.repeatDay : null,
    repeatWeekday: typeof d.repeatWeekday === 'number' ? d.repeatWeekday : null,
    repeatNths: cleanNths(d.repeatNths),
    repeatUntil: d.repeat && d.repeat !== 'none' && typeof d.repeatUntil === 'string' ? d.repeatUntil : null,
    skipDates: Array.isArray(d.skipDates)
      ? (d.skipDates as unknown[]).filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))
      : [],
    detachedFrom: typeof d.detachedFrom === 'string' ? d.detachedFrom : null,
    outcome: d.kind !== 'event' && d.status === 'done'
      ? (d.outcome === 'notdone' || d.outcome === 'rescheduled' ? d.outcome : 'done')
      : null,
    rescheduledTo: typeof d.rescheduledTo === 'string' ? d.rescheduledTo : null,
    rescheduledFrom: typeof d.rescheduledFrom === 'string' ? d.rescheduledFrom : null,
    archived: d.archived === true,
    nextId:    typeof d.nextId === 'string' ? d.nextId : null,
    xpEarned:  typeof d.xpEarned === 'number' ? d.xpEarned : 0,
    xpLost:    typeof d.xpLost === 'number' ? d.xpLost : 0,
    everDone:  d.everDone === true,
    suggestionId: typeof d.suggestionId === 'string' ? d.suggestionId : null,
    planning:  isPlanningKind(d.planning) ? d.planning : null,
    order:     typeof d.order === 'number' ? d.order : 0,
    // Items saved before steps and the queue existed have none and are unplaced.
    steps:     d.kind === 'event' ? [] : toSteps(d.steps),
    rank:      typeof d.rank === 'number' ? d.rank : null,
    // Absent on everything saved before contacts existed, which had none.
    contacts:  cleanContacts(d.contacts),
    // Likewise orders.
    orders:    cleanOrders(d.orders),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    doneAt:    iso(d.doneAt),
  };
}

export function toReminderSettings(raw: unknown): TaskReminderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    email: typeof r.email === 'boolean' ? r.email : DEFAULT_TASK_REMINDER_SETTINGS.email,
    chat:  typeof r.chat === 'boolean' ? r.chat : DEFAULT_TASK_REMINDER_SETTINGS.chat,
  };
}

/**
 * The next copy of a repeating task, due on `nextDate` — made when one is
 * finished (the PATCH route), and when a planning slot's day went by undone
 * (the planning route), which leaves the missed one where it is. One
 * definition, so the two cannot make different copies.
 */
export function nextCopyData(t: PersonalTask, nextDate: string): DocumentData {
  return {
    kind: 'task',
    title: t.title,
    notes: t.notes,
    status: 'todo',
    priority: t.priority,
    color: t.color,
    date: nextDate,
    time: t.time,
    // Only a planning slot keeps an end; the caller passes null for anything else.
    endTime: t.endTime,
    eventType: 'other',
    location: t.location,
    reminders: t.reminders,
    repeat: t.repeat,
    repeatDay: t.repeatDay,
    repeatWeekday: t.repeatWeekday,
    repeatNths: t.repeatNths,
    // The same end: a copy past it is never made (nextOccurrence() says so).
    repeatUntil: t.repeatUntil,
    suggestionId: t.suggestionId,
    // A planning slot stays one, and the card's pointer moves to the copy —
    // otherwise it would read the finished task and ask somebody who planned
    // this morning to schedule planning again.
    planning: t.planning,
    // The next one starts with the same steps, none of them done, and keeps
    // its place in the queue. A step's due date moves with the task's — two
    // days before it stays two days before it — and is dropped when the task
    // had no date to measure from.
    steps: t.steps.map((st) => ({
      ...st,
      done: false,
      date: st.date && t.date ? addDays(st.date, daysBetween(t.date, nextDate)) : null,
      xp: 0,
      everDone: false,
    })),
    rank: t.rank ?? null,
    // Still the same people next week.
    contacts: t.contacts,
    // But not the same load: a weekly "chase the POD" is a different order
    // each week, and a link to last week's would be wrong, not empty.
    orders: [],
    nextId: null,
    xpEarned: 0,
    everDone: false,
    order: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    doneAt: null,
  };
}

/** One queue entry per item per lead, so the id is the whole key and no query is needed to find them. */
export function reminderQueueId(uid: string, itemId: string, lead: string): string {
  return `${uid}__${itemId}__${lead}`;
}

/**
 * Bring an item's entries in the reminder queue into line with the item.
 *
 * The queue (`taskReminders`) exists because the run needs one question it can
 * ask cheaply every five minutes — "what is due by now?" — and that is a range
 * on one field of one top-level collection, which Firestore indexes by itself.
 * Asked of the items directly it would be a collection-group query, needing an
 * index somebody has to deploy by hand.
 *
 * Every lead is written or deleted every time, rather than working out which
 * changed: five operations, and no way for a moved date to leave a reminder
 * behind at the old time. Anything already in the past is deleted rather than
 * queued — nobody wants "in 15 minutes" about a call that was yesterday.
 */
/** A batch or a transaction — the queue is written inside whichever the caller is using. */
interface Writes {
  set(ref: DocumentReference, data: DocumentData): unknown;
  delete(ref: DocumentReference): unknown;
}

export function syncReminderQueue(
  batch: Writes,
  uid: string,
  task: (Pick<PersonalTask, 'kind' | 'status' | 'date' | 'time' | 'reminders'>
    & Partial<Pick<PersonalTask, 'repeat' | 'repeatDay' | 'repeatWeekday' | 'repeatNths' | 'skipDates' | 'repeatUntil'>>) | null,
  itemId: string,
  now: number = Date.now(),
) {
  // `now` matters only to a repeating event, whose next occurrence is the one queued.
  const due = task ? reminderInstants(task, now) : {};
  for (const lead of TASK_REMINDER_LEADS) {
    const ref = adminDb.collection(TASK_REMINDERS_COLLECTION).doc(reminderQueueId(uid, itemId, lead));
    const at = due[lead];
    if (at !== undefined && at > now) {
      batch.set(ref, { uid, itemId, lead, sendAt: Timestamp.fromMillis(at) });
    } else {
      batch.delete(ref);
    }
  }
}
