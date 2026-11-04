import type { DocumentData, DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { adminDb, FieldValue } from './firebase-admin';
import { ALLOWED_USERS_COLLECTION, normalizeEmail } from './accessControl';
import { syncReminderQueue, taskItems, toTask } from './personalTasksServer';
import { postTaskNotice, whenText } from './personalTaskReminders';
import { fullName } from '@/types/allowedUser';
import {
  MAX_TASK_CONTACTS, defaultColorFor, formatTime, repeatText, type InviteResponse, type PersonalTask, type TaskContact, type TaskInvitee,
} from '@/types/task';

/**
 * Inviting colleagues to an event (2026-11-04).
 *
 * **The one place TTMS writes into somebody else's task list**, and the
 * boundary is what makes it acceptable: what it writes is always a copy of
 * an event somebody chose to invite them to, marked `invitedBy` with who,
 * under a fixed id (`inviteCopyId()`) — never one of the person's own items,
 * which nothing here can name. The invitee decides what stays: Decline (or
 * deleting the copy) takes it off and it is not put back by later edits.
 *
 * - **The organiser's event is the truth.** Every save, move, one-date
 *   detach and delete of it runs `syncInvites()`, which rewrites each copy
 *   from it, removes copies of people taken off the "With" box, and removes
 *   every copy when the event is cancelled, turned into a task or has
 *   `invite` switched off. A copy is refused any edit but its answer, its
 *   colour and its reminders, in the PATCH route.
 * - **Invitees are the "With" box**, resolved against the allowlist: a
 *   suspended person, a pending invite (no uid yet) or the organiser's own
 *   address is skipped. Capped at MAX_TASK_CONTACTS, like the box.
 * - **Told in their private reminders room** (`notice_tasks_{uid}`): invited,
 *   moved or changed, cancelled; the organiser hears each answer. Never
 *   email, by choice — a calendar that emails on every drag is one people
 *   filter to the bin.
 * - The copy carries no orders: an order linked on the organiser's event is
 *   not one every invitee may open.
 *
 * Best-effort after the organiser's own save: their event is never refused
 * because a colleague's copy could not be written. The next save repairs it.
 */

export function inviteCopyId(organizerUid: string, eventId: string): string {
  return `inv_${organizerUid}_${eventId}`;
}

export interface Organizer { uid: string; email: string; name: string }

/** The caller as an organiser, from what requireCompanyUser() handed back. */
export function organizerFrom(uid: string, email: string | undefined, entry?: DocumentData): Organizer {
  const e = normalizeEmail(email);
  return { uid, email: e, name: (entry ? fullName(entry) : '') || e };
}

/** Worth a sync at all: an event that invites, or one that used to. */
export function hasInvites(t: Pick<PersonalTask, 'invite' | 'invitees'> | null | undefined): boolean {
  return !!t && (t.invite === true || (t.invitees?.length ?? 0) > 0);
}

/** The fields a copy takes from the event. What the organiser changed is read off these. */
function sharedFields(ev: PersonalTask) {
  return {
    kind: 'event' as const,
    title: ev.title,
    notes: ev.notes,
    date: ev.date,
    time: ev.time,
    endTime: ev.endTime,
    eventType: ev.eventType,
    location: ev.location,
    repeat: ev.repeat,
    repeatDay: ev.repeatDay,
    repeatWeekday: ev.repeatWeekday,
    repeatNths: ev.repeatNths,
    repeatUntil: ev.repeatUntil,
    skipDates: ev.skipDates,
  };
}

function when(ev: PersonalTask): string {
  if (!ev.date) return '';
  if (ev.repeat === 'none') return whenText(ev, ev.date);
  return `${repeatText(ev).toLowerCase()}${ev.time ? ` at ${formatTime(ev.time)}${ev.endTime ? `–${formatTime(ev.endTime)}` : ''}` : ''}`;
}

/**
 * Bring every invitee's copy in line with the organiser's event.
 *
 * `before` is the event as it was, for a delete (the event is gone by the
 * time this runs) — otherwise it is read fresh.
 */
export async function syncInvites(org: Organizer, eventId: string, before?: PersonalTask | null): Promise<void> {
  const evRef = taskItems(org.uid).doc(eventId);
  const evSnap = await evRef.get();
  const ev = evSnap.exists ? toTask(evSnap) : null;
  const prev: TaskInvitee[] = (ev ?? before)?.invitees ?? [];
  const live = !!ev && ev.kind === 'event' && ev.invite === true && !!ev.date && !ev.archived;

  // Who the "With" box names now, as people with a list of their own.
  const wanted = live
    ? ev!.contacts.map((c) => normalizeEmail(c.email)).filter((e) => e && e !== org.email)
    : [];
  const entries = wanted.length
    ? await adminDb.getAll(...wanted.map((e) => adminDb.collection(ALLOWED_USERS_COLLECTION).doc(e)))
    : [];
  const prevByEmail = new Map(prev.map((i) => [i.email, i]));
  const invitees: TaskInvitee[] = [];
  for (const snap of entries) {
    const d = snap.data();
    if (!d || typeof d.uid !== 'string' || d.suspended === true) continue;
    invitees.push({
      email: snap.id,
      uid: d.uid,
      name: fullName(d) || snap.id,
      response: prevByEmail.get(snap.id)?.response ?? 'pending',
    });
  }

  const keep = new Set(invitees.map((i) => i.uid));
  const gone = prev.filter((i) => !keep.has(i.uid));
  const all = [...invitees, ...gone];
  const copySnaps = all.length
    ? await adminDb.getAll(...all.map((i) => taskItems(i.uid).doc(inviteCopyId(org.uid, eventId))))
    : [];
  const copyOf = new Map<string, DocumentSnapshot>(all.map((i, n) => [i.uid, copySnaps[n]]));

  const batch = adminDb.batch();
  const notices: { uid: string; text: string }[] = [];

  for (const inv of invitees) {
    const snap = copyOf.get(inv.uid)!;
    const ref = taskItems(inv.uid).doc(inviteCopyId(org.uid, eventId));
    // A no stays a no: later edits do not put a declined event back.
    if (inv.response === 'declined') {
      if (snap.exists) { batch.delete(ref); syncReminderQueue(batch, inv.uid, null, ref.id); }
      continue;
    }
    const was = snap.exists ? toTask(snap) : null;
    const shared = sharedFields(ev!);
    // Everybody else on it, with the organiser first — the copy's own "With".
    const contacts: TaskContact[] = [
      { email: org.email, name: org.name },
      ...invitees.filter((o) => o.uid !== inv.uid).map((o) => ({ email: o.email, name: o.name })),
    ].slice(0, MAX_TASK_CONTACTS);
    const reminders = was ? was.reminders : ev!.reminders;
    batch.set(ref, {
      ...shared,
      status: 'todo',
      priority: 'normal',
      difficulty: 'medium',
      color: was?.color ?? defaultColorFor('event'),
      dueDate: null,
      dueTime: null,
      reminders,
      detachedFrom: null,
      nextId: null,
      xpEarned: 0,
      xpLost: 0,
      everDone: false,
      suggestionId: null,
      planning: null,
      steps: [],
      rank: null,
      contacts,
      orders: [],
      workFor: null,
      archived: false,
      invitedBy: { uid: org.uid, email: org.email, name: org.name, eventId },
      inviteResponse: inv.response,
      order: was?.order ?? Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(was ? {} : { createdAt: FieldValue.serverTimestamp(), doneAt: null }),
    }, { merge: true });
    syncReminderQueue(batch, inv.uid, { ...shared, status: 'todo', reminders }, ref.id);

    if (!was) {
      notices.push({
        uid: inv.uid,
        text: `${org.name} invited you to "${ev!.title}" — ${when(ev!)}. It is on your Calendar: open it there to accept or decline.`,
      });
    } else {
      const moved = ['date', 'time', 'endTime', 'repeat', 'repeatWeekday', 'repeatNths', 'repeatUntil', 'skipDates']
        .some((k) => JSON.stringify(was[k as keyof PersonalTask]) !== JSON.stringify(shared[k as keyof typeof shared]));
      const renamed = was.title !== ev!.title || was.location !== ev!.location;
      if (moved) notices.push({ uid: inv.uid, text: `${org.name} moved "${ev!.title}" to ${when(ev!)}.` });
      else if (renamed) notices.push({ uid: inv.uid, text: `${org.name} changed "${ev!.title}" — ${when(ev!)}.` });
    }
  }

  for (const inv of gone) {
    const snap = copyOf.get(inv.uid)!;
    if (!snap.exists) continue;
    const was = toTask(snap);
    batch.delete(snap.ref);
    syncReminderQueue(batch, inv.uid, null, snap.id);
    notices.push({
      uid: inv.uid,
      // Cancelled only when the event itself is gone or no longer an event;
      // "Invite them" switched off, or a name taken off, is being taken off.
      text: ev && ev.kind === 'event' && !ev.archived
        ? `${org.name} took you off "${was.title}" (${when(was)}). It is off your Calendar.`
        : `${org.name} cancelled "${was.title}" (${when(was)}). It is off your Calendar.`,
    });
  }

  if (ev && JSON.stringify(ev.invitees ?? []) !== JSON.stringify(invitees)) {
    batch.update(evRef, { invitees });
  }
  await batch.commit();

  for (const n of notices) {
    await postTaskNotice(n.uid, n.text).catch((e) => console.error('[invites] notice failed', e));
  }
}

/** `syncInvites()` with its failure logged rather than thrown — see the header. */
export async function syncInvitesQuietly(org: Organizer, eventId: string, before?: PersonalTask | null): Promise<void> {
  try {
    await syncInvites(org, eventId, before);
  } catch (e) {
    console.error('[invites] sync failed', eventId, e);
  }
}

/**
 * An invitee's answer, written on the organiser's event in the caller's
 * transaction (read first, as a transaction must). Returns the line to tell
 * the organiser, or null when nothing changed or the event is gone.
 */
export async function recordAnswer(
  tx: Transaction, copy: PersonalTask, invitee: { uid: string; name: string }, response: InviteResponse,
): Promise<(() => void) | null> {
  const by = copy.invitedBy;
  if (!by) return null;
  const evRef = taskItems(by.uid).doc(by.eventId);
  const evSnap = await tx.get(evRef);
  if (!evSnap.exists) return null;
  const ev = toTask(evSnap);
  const list = ev.invitees ?? [];
  const at = list.findIndex((i) => i.uid === invitee.uid);
  if (at < 0 || list[at].response === response) return null;
  const invitees = list.map((i, n) => (n === at ? { ...i, response } : i));
  // Returned as a thunk so the caller makes it after its own reads.
  return () => {
    tx.update(evRef, { invitees });
  };
}

export async function tellOrganizer(copy: PersonalTask, name: string, response: InviteResponse): Promise<void> {
  if (!copy.invitedBy || response === 'pending') return;
  const word = response === 'accepted' ? 'accepted' : 'declined';
  await postTaskNotice(copy.invitedBy.uid, `${name} ${word} "${copy.title}" (${when(copy)}).`)
    .catch((e) => console.error('[invites] organiser notice failed', e));
}
