import { Resend } from 'resend';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb, FieldValue } from './firebase-admin';
import { systemLine } from './chatAlerts';
import { ALLOWED_USERS_COLLECTION, USERS_COLLECTION, isBootstrapAdmin, normalizeEmail } from './accessControl';
import { syncReminderQueue, taskItems, taskOwnerDoc, toReminderSettings, toTask } from './personalTasksServer';
import { officeToday } from '@/types/celebration';
import { spelledOutDay } from '@/types/celebrationCalendar';
import { CONVERSATIONS_COLLECTION, NOTICE_ROOM_POLICY, SYSTEM_SENDER_UID } from '@/types/conversation';
import {
  EVENT_TYPE_LABEL,
  TASK_REMINDERS_COLLECTION,
  formatTime,
  occurrenceDateOf,
  reminderInstants,
  type PersonalTask,
  type TaskReminderLead,
} from '@/types/task';

/**
 * Sends the reminders people set on their own tasks and events.
 *
 * Called every five minutes by the Vercel cron in vercel.json. Each run asks
 * the queue one question — what is due by now? — and sends each person one
 * message covering everything of theirs that came due, by the channels they
 * chose. See syncReminderQueue() for how the queue is kept.
 *
 * Like the celebration reminders this grants and removes nothing; its worst
 * failure is a reminder that arrives late or not at all. It is not a
 * precedent for putting access on a clock.
 */

/** Most entries one run takes. Five minutes' worth for the whole company is a handful. */
const BATCH = 300;

/**
 * A reminder more than this late is dropped instead of sent. If the cron was
 * down for an afternoon, "your call starts in 15 minutes" about a call four
 * hours ago is noise, not help.
 */
const STALE_MS = 3 * 60 * 60_000;

export interface TaskReminderRun {
  due: number;
  sent: number;
  people: number;
  dropped: number;
  failed: number;
}

interface DueEntry {
  task: PersonalTask;
  lead: TaskReminderLead;
  /** The day this reminder is about — a repeating event's occurrence, not its first date. */
  date: string;
}

export async function runTaskReminders(now = Date.now()): Promise<TaskReminderRun> {
  const snap = await adminDb.collection(TASK_REMINDERS_COLLECTION)
    .where('sendAt', '<=', new Date(now))
    .orderBy('sendAt')
    .limit(BATCH)
    .get();

  const run: TaskReminderRun = { due: snap.size, sent: 0, people: 0, dropped: 0, failed: 0 };
  const byPerson = new Map<string, {
    entry: QueryDocumentSnapshot; lead: TaskReminderLead; itemId: string; stale: boolean;
  }[]>();

  for (const doc of snap.docs) {
    const d = doc.data();
    // Claim it: delete on the condition that nobody has touched it since we
    // read it. Vercel invokes a cron at least once, not exactly once, and two
    // overlapping runs must not both send — only one of them wins this delete.
    try {
      await doc.ref.delete({ lastUpdateTime: doc.updateTime });
    } catch {
      continue; // Another run has it, or the item was saved again in between.
    }
    const sendAt = (d.sendAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
    if (typeof d.uid !== 'string' || typeof d.itemId !== 'string') {
      run.dropped++;
      continue;
    }
    // A stale one is not sent, but is still read: if it belongs to a
    // repeating event, the series' next reminder has to be queued all the same.
    const stale = now - sendAt > STALE_MS;
    if (stale) run.dropped++;
    const list = byPerson.get(d.uid) ?? [];
    list.push({ entry: doc, lead: d.lead as TaskReminderLead, itemId: d.itemId, stale });
    byPerson.set(d.uid, list);
  }

  for (const [uid, claimed] of byPerson) {
    try {
      const items = await Promise.all(claimed.map((c) => taskItems(uid).doc(c.itemId).get()));
      const due: DueEntry[] = [];
      const series = new Map<string, PersonalTask>();
      items.forEach((snapItem, i) => {
        if (!snapItem.exists) return;
        const task = toTask(snapItem);
        if (task.kind === 'event' && task.repeat !== 'none') series.set(task.id, task);
        if (claimed[i].stale) return;
        // Belt and braces: the queue is rebuilt on every save, but if the item
        // no longer asks for this reminder at this time, it is not sent. A
        // repeating event is asked from just before the stored time, so the
        // occurrence it finds is the one this entry was queued for.
        const sentAt = claimed[i].entry.data().sendAt?.toMillis?.() ?? 0;
        const at = reminderInstants(task, sentAt - 60_000)[claimed[i].lead];
        if (at === undefined || Math.abs(at - sentAt) > 60_000) return;
        due.push({ task, lead: claimed[i].lead, date: occurrenceDateOf(at, claimed[i].lead) });
      });
      // A repeating event's next occurrence is queued now that this one is
      // claimed — the one place a series moves on, since nothing else touches
      // it between saves. Whatever happens to the sending below.
      if (series.size) {
        const batch = adminDb.batch();
        for (const [id, task] of series) syncReminderQueue(batch, uid, task, id, now + 60_000);
        await batch.commit();
      }
      const fresh = claimed.filter((c) => !c.stale).length;
      if (due.length === 0) { run.dropped += fresh; continue; }

      const outcome = await deliver(uid, due);
      if (outcome === 'sent') { run.sent += due.length; run.people++; }
      else run.dropped += due.length;
    } catch (e) {
      run.failed += claimed.length;
      console.error('Task reminder delivery failed', e instanceof Error ? e.message : e);
      // Put them back so the next run tries again; the staleness rule stops
      // that going on forever.
      const batch = adminDb.batch();
      for (const c of claimed) if (!c.stale) batch.set(c.entry.ref, c.entry.data());
      await batch.commit().catch(() => {});
    }
  }

  return run;
}

/**
 * Sends one person their reminders, if they are still somebody who should get
 * them. Somebody removed from TTMS or suspended must stop hearing from it the
 * same day, not when their list happens to empty.
 */
async function deliver(uid: string, due: DueEntry[]): Promise<'sent' | 'not-allowed' | 'nothing'> {
  const [profileSnap, ownerSnap] = await Promise.all([
    adminDb.collection(USERS_COLLECTION).doc(uid).get(),
    taskOwnerDoc(uid).get(),
  ]);
  const profile = profileSnap.data() as { email?: string; suspended?: boolean } | undefined;
  if (!profile || profile.suspended === true) return 'not-allowed';

  const email = normalizeEmail(profile.email);
  if (!email) return 'not-allowed';
  if (!isBootstrapAdmin(email)) {
    const entry = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();
    if (!entry.exists || entry.data()?.suspended === true) return 'not-allowed';
  }

  const settings = toReminderSettings(ownerSnap.data()?.reminderSettings);
  if (!settings.email && !settings.chat) return 'nothing';

  const text = reminderText(due);
  const failures: unknown[] = [];
  if (settings.email) await sendEmail(email, due, text).catch((e) => failures.push(e));
  if (settings.chat) await postTaskNotice(uid, text).catch((e) => failures.push(e));

  const attempted = (settings.email ? 1 : 0) + (settings.chat ? 1 : 0);
  // Only a total failure is retried: if one channel got through, a retry
  // would send that one twice.
  if (failures.length === attempted) throw failures[0];
  return 'sent';
}

/* ------------------------------------------------------------- the wording */

/** "today at 10:00 AM", "tomorrow", "Friday, September 26 at 3:30 PM". */
function whenText(t: PersonalTask, date: string): string {
  const today = officeToday();
  const [y, m, d] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const day = date === today ? 'today' : date === tomorrow ? 'tomorrow' : spelledOutDay(date);
  if (!t.time) return day;
  return `${day} at ${formatTime(t.time)}${t.endTime ? `–${formatTime(t.endTime)}` : ''}`;
}

function reminderLine({ task, date }: DueEntry): string {
  const what = task.kind === 'event' ? EVENT_TYPE_LABEL[task.eventType] : 'Task due';
  const where = task.location ? ` — ${task.location}` : '';
  return `${task.title} — ${what}, ${whenText(task, date)}${where}`;
}

/** First line is the heading, one line per item after it — the shape the celebration reminders use. */
export function reminderText(due: DueEntry[]): string {
  const heading = due.length === 1 ? 'Reminder:' : `${due.length} reminders:`;
  return [heading, ...due.map(reminderLine)].join('\n');
}

/**
 * The person's own "Your reminders" room, made the first time.
 *
 * A notice room like the celebration and attendance ones — born locked,
 * nobody else in it, nobody can write in it — and a separate one from both,
 * because it is a different conversation: HR's birthday planning and your own
 * 10:00 call should not share a thread. Needs no rules change: a `notice`
 * room is closed by its policy, not by its id. See `notice` in
 * src/types/conversation.ts.
 */
async function postTaskNotice(uid: string, text: string): Promise<void> {
  const room = adminDb.collection(CONVERSATIONS_COLLECTION).doc(`notice_tasks_${uid}`);
  await room.create({
    kind:        'notice',
    name:        'Your reminders',
    memberUids:  [uid],
    createdBy:   SYSTEM_SENDER_UID,
    adminUids:   [],
    policy:      NOTICE_ROOM_POLICY,
    createdAt:   FieldValue.serverTimestamp(),
    updatedAt:   FieldValue.serverTimestamp(),
    lastMessage: null,
  }).catch((e: { code?: number }) => {
    if (e?.code !== 6) throw e; // ALREADY_EXISTS is the ordinary case.
  });

  const batch = adminDb.batch();
  batch.update(room, systemLine(batch, room, text, { systemKind: 'announcement' }));
  await batch.commit();
}

/** Lazily made, like the agreement routes — a missing key fails here, not at build. */
async function sendEmail(to: string, due: DueEntry[], text: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const first = due[0].task;
  const subject = due.length === 1
    ? `Reminder: ${first.title} — ${whenText(first, due[0].date)}`
    : `${due.length} reminders from your TTMS calendar`;

  const { error } = await resend.emails.send({
    from: `TTMS <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
    to,
    subject: subject.slice(0, 250),
    text: `${text}\n\nYou set this reminder on your Calendar in TTMS. Change or stop it there.`,
    html: emailHtml(text),
  });
  if (error) throw new Error(error.message);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emailHtml(text: string): string {
  const [head, ...lines] = text.split('\n');
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:14px;line-height:1.5">
<p style="font-weight:bold;margin:0 0 8px">${escapeHtml(head)}</p>
<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
<p style="color:#6b7280;font-size:12px;margin:0">You set this reminder on your Calendar in TTMS. Change or stop it there.</p>
</body></html>`;
}
