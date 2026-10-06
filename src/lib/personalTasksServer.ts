import type { DocumentData, DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
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
  cleanContacts,
  cleanOrders,
  isTaskStatus,
  reminderInstants,
  toSteps,
  type PersonalTask,
  type TaskReminderSettings,
} from '@/types/task';

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
    repeat:    d.kind === 'event' ? 'none' : pick(TASK_REPEATS, d.repeat, 'none'),
    repeatDay: typeof d.repeatDay === 'number' ? d.repeatDay : null,
    nextId:    typeof d.nextId === 'string' ? d.nextId : null,
    xpEarned:  typeof d.xpEarned === 'number' ? d.xpEarned : 0,
    everDone:  d.everDone === true,
    suggestionId: typeof d.suggestionId === 'string' ? d.suggestionId : null,
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
  task: Pick<PersonalTask, 'kind' | 'status' | 'date' | 'time' | 'reminders'> | null,
  itemId: string,
) {
  const due = task ? reminderInstants(task) : {};
  const now = Date.now();
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
