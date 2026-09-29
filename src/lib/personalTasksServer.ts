import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import {
  PERSONAL_TASKS_COLLECTION,
  PERSONAL_TASK_ITEMS,
  TASK_COLORS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type PersonalTask,
} from '@/types/task';

/**
 * Server side of the personal task list — see src/types/task.ts.
 *
 * Every function takes the uid, and every caller passes the one off the
 * verified ID token. There is no way to name somebody else's list.
 */

export function taskItems(uid: string) {
  return adminDb.collection(PERSONAL_TASKS_COLLECTION).doc(uid).collection(PERSONAL_TASK_ITEMS);
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
    status:    pick(TASK_STATUSES, d.status, 'todo'),
    priority:  pick(TASK_PRIORITIES, d.priority, 'normal'),
    color:     pick(TASK_COLORS, d.color, 'yellow'),
    date:      typeof d.date === 'string' ? d.date : null,
    time:      typeof d.time === 'string' ? d.time : null,
    endTime:   typeof d.endTime === 'string' ? d.endTime : null,
    order:     typeof d.order === 'number' ? d.order : 0,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    doneAt:    iso(d.doneAt),
  };
}
