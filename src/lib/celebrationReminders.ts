import { Resend } from 'resend';
import { adminDb, FieldValue } from './firebase-admin';
import { systemLine } from './chatAlerts';
import { ALLOWED_USERS_COLLECTION, USERS_COLLECTION, can, isBootstrapAdmin, normalizeEmail, type RoleFlags } from './accessControl';
import { fullName, isCalendarDate } from '@/types/allowedUser';
import { completedYears, officeToday } from '@/types/celebration';
import {
  CONVERSATIONS_COLLECTION,
  NOTICE_ROOM_POLICY,
  SYSTEM_SENDER_UID,
  noticeConversationId,
} from '@/types/conversation';
import {
  REMINDER_LEADS,
  addDays,
  dayIn,
  isCelebrationKind,
  isReminderLead,
  occurrencesOn,
  reminderHeading,
  reminderText,
  toReminderSettings,
  type CalendarPerson,
  type CelebrationKind,
  type OneOffReminder,
  type ReminderItem,
  type ReminderLead,
  type ReminderSettings,
} from '@/types/celebrationCalendar';

/**
 * The celebrations calendar's data, and the reminders sent from it.
 *
 * All of it Admin SDK, all of it behind `people.view`. None of these
 * collections has a rule in firestore.rules, which means the client SDK is
 * refused on every one of them — and that is the design, not an omission:
 * what is in them is birthdays and start dates, which are payroll data, and
 * there is no reason for a browser to touch them except through a route that
 * has checked.
 *
 * **The second thing in TTMS that runs on a clock**, after the Everyone-room
 * post in src/lib/celebrations.ts, and for the same reason it is allowed to:
 * the worst this can do by not running is a reminder that did not arrive.
 * It decides nothing about access.
 */

/** Per-person standing rules and channels, keyed by uid. */
const SETTINGS_COLLECTION = 'celebrationReminderSettings';
/** One-off reminders, deleted once sent. */
const REMINDERS_COLLECTION = 'celebrationReminders';
/** `{date}_{uid}` — one per person per morning. See claimMorning. */
const RUNS_COLLECTION = 'celebrationReminderRuns';

/* ------------------------------------------------------------ the calendar */

/**
 * Everybody who belongs on the calendar.
 *
 * The whole allowlist in one read, the same trade the celebrations post makes:
 * one document per person at this company, and nothing else in it grows.
 *
 * Suspended people are left off. Whatever is going on there, a reminder to
 * plan something for them is not what anybody wants in their inbox. A pending
 * invite is kept — they are somebody HR hired, and dates on file for them are
 * as real as anybody else's.
 */
export async function loadCalendarPeople(): Promise<CalendarPerson[]> {
  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
  const people: CalendarPerson[] = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.suspended === true) continue;
    const startDate = isCalendarDate(d.startDate) ? (d.startDate as string) : null;
    const dateOfBirth = isCalendarDate(d.dateOfBirth) ? (d.dateOfBirth as string) : null;
    if (!startDate && !dateOfBirth) continue;

    people.push({
      email:     doc.id,
      name:      fullName(d) || doc.id,
      photoPath: typeof d.photoPath === 'string' ? d.photoPath : null,
      startDate,
      dateOfBirth,
      // Absent means yes — see ANNOUNCE_FIELDS in src/types/celebration.ts.
      announced: {
        birthday:    d.announceBirthday !== false,
        anniversary: d.announceAnniversary !== false,
      },
      pending: !d.uid,
    });
  }

  return people.sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------- the settings */

export async function getReminderSettings(uid: string): Promise<ReminderSettings> {
  const snap = await adminDb.collection(SETTINGS_COLLECTION).doc(uid).get();
  return toReminderSettings(snap.data());
}

export async function saveReminderSettings(uid: string, settings: ReminderSettings): Promise<void> {
  await adminDb.collection(SETTINGS_COLLECTION).doc(uid).set({
    ...toReminderSettings(settings),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/* ------------------------------------------------------- one-off reminders */

export async function listOneOffs(uid: string): Promise<OneOffReminder[]> {
  const snap = await adminDb.collection(REMINDERS_COLLECTION).where('ownerUid', '==', uid).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as OneOffReminder)
    .sort((a, b) => a.sendOn.localeCompare(b.sendOn));
}

export class ReminderError extends Error {}

/**
 * Asks to be reminded about one person's one birthday or anniversary.
 *
 * The id is derived from everything that makes it the same reminder, so
 * pressing the button twice leaves one reminder rather than sending two.
 *
 * Refused when the send date is today or earlier. The run goes at 8am, and a
 * reminder set at noon for this morning would sit in the list looking pending
 * while never being sent — worse than being told now.
 */
export async function createOneOff(input: {
  ownerUid: string;
  kind: CelebrationKind;
  subjectEmail: string;
  date: string;
  leadDays: ReminderLead;
}): Promise<OneOffReminder> {
  const subjectEmail = normalizeEmail(input.subjectEmail);
  if (!isCelebrationKind(input.kind)) throw new ReminderError('Say whether it is a birthday or an anniversary.');
  if (!isCalendarDate(input.date)) throw new ReminderError('That is not a date.');
  if (!isReminderLead(input.leadDays)) throw new ReminderError('Pick when to be reminded.');

  const entry = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(subjectEmail).get();
  const data = entry.data();
  if (!entry.exists || !data || data.suspended === true) {
    throw new ReminderError('That person is not on the calendar.');
  }

  // The date has to be one of their birthdays or anniversaries, not any date
  // the browser sent. Otherwise the reminder would name a day that is not.
  const source = input.kind === 'birthday' ? data.dateOfBirth : data.startDate;
  if (!isCalendarDate(source)) {
    throw new ReminderError(input.kind === 'birthday'
      ? 'That person has no birthday on file.'
      : 'That person has no start date on file.');
  }
  const year = Number(input.date.slice(0, 4));
  if (dayIn((source as string).slice(5), year) !== input.date
      || completedYears(source, input.date) < 1) {
    throw new ReminderError(input.kind === 'birthday'
      ? 'That is not their birthday.'
      : 'That is not one of their work anniversaries.');
  }

  const sendOn = addDays(input.date, -input.leadDays);
  if (sendOn <= officeToday()) {
    throw new ReminderError('Reminders go out at 8am, so the earliest this one could arrive has already passed. Pick a shorter lead time.');
  }

  const id = [input.ownerUid, input.kind, subjectEmail, input.date, input.leadDays].join('_');
  const reminder: Omit<OneOffReminder, 'id'> = {
    ownerUid: input.ownerUid,
    kind: input.kind,
    subjectEmail,
    subjectName: fullName(data) || subjectEmail,
    date: input.date,
    leadDays: input.leadDays,
    sendOn,
  };
  await adminDb.collection(REMINDERS_COLLECTION).doc(id).set({
    ...reminder,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id, ...reminder };
}

/** Deletes one of the caller's own reminders. Someone else's reads as not found. */
export async function deleteOneOff(uid: string, id: string): Promise<boolean> {
  const ref = adminDb.collection(REMINDERS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.ownerUid !== uid) return false;
  await ref.delete();
  return true;
}

/* ------------------------------------------------------------- the daily run */

export interface ReminderRun {
  date: string;
  /** People sent something this morning. Counts only, for the Vercel log. */
  sent: number;
  /** Already sent this morning by an earlier invocation. */
  skipped: number;
  failed: number;
}

/**
 * Sends this morning's reminders. Called once a day by the Vercel cron.
 *
 * Works out, per person who asked, what they should hear today — their
 * standing rules plus any one-off falling due — and sends it as **one** email
 * and **one** chat message, however many names are in it. Three reminders
 * arriving as three emails reads as a fault, the same argument the Everyone
 * room's post makes for being one message.
 */
export async function runCelebrationReminders(options: { today?: string } = {}): Promise<ReminderRun> {
  const today = options.today ?? officeToday();
  const run: ReminderRun = { date: today, sent: 0, skipped: 0, failed: 0 };

  const [people, settingsSnap, dueSnap] = await Promise.all([
    loadCalendarPeople(),
    adminDb.collection(SETTINGS_COLLECTION).get(),
    // `<=` rather than `==` so a morning the cron did not run is caught up on
    // the next one, rather than those reminders sitting unsent forever.
    // A single-field range, so no composite index.
    adminDb.collection(REMINDERS_COLLECTION).where('sendOn', '<=', today).get(),
  ]);

  const byEmail = new Map(people.map((p) => [p.email, p]));
  const settingsOf = new Map(settingsSnap.docs.map((d) => [d.id, toReminderSettings(d.data())]));

  // Worked out once per lead rather than once per person who asked: the
  // answer to "whose day is in a week" is the same for everybody.
  const onLead = new Map(REMINDER_LEADS.map((lead) => [lead, occurrencesOn(people, addDays(today, lead))]));

  // What each person is owed, keyed so a standing rule and a one-off naming
  // the same day at the same lead land as one line, not two.
  const owed = new Map<string, Map<string, ReminderItem>>();
  const add = (uid: string, email: string, item: ReminderItem) => {
    const items = owed.get(uid) ?? new Map<string, ReminderItem>();
    items.set(`${item.kind}|${email}|${item.date}|${item.leadDays}`, item);
    owed.set(uid, items);
  };

  for (const [uid, settings] of settingsOf) {
    for (const lead of REMINDER_LEADS) {
      for (const o of onLead.get(lead) ?? []) {
        if (!settings.leadDays[o.kind].includes(lead)) continue;
        add(uid, o.person.email, { kind: o.kind, name: o.person.name, years: o.years, date: o.date, leadDays: lead });
      }
    }
  }

  // One-offs spent this morning, deleted only after their owner's message has
  // gone — so a failed send is retried by the next run rather than lost.
  const spent = new Map<string, FirebaseFirestore.DocumentReference[]>();
  for (const doc of dueSnap.docs) {
    const r = doc.data() as Omit<OneOffReminder, 'id'>;
    const refs = spent.get(r.ownerUid) ?? [];
    refs.push(doc.ref);
    spent.set(r.ownerUid, refs);

    // Late (the cron missed its morning) is still worth sending while the day
    // has not passed. Once it has, the reminder is just dropped.
    const person = byEmail.get(r.subjectEmail);
    if (!person || !isCelebrationKind(r.kind) || r.date < today) continue;
    // The date the person has on file now, not when the reminder was set: a
    // corrected birthday or start date must not be reminded about under the
    // old one.
    const onFile = r.kind === 'birthday' ? person.dateOfBirth : person.startDate;
    if (!onFile || dayIn(onFile.slice(5), Number(r.date.slice(0, 4))) !== r.date) continue;

    add(r.ownerUid, person.email, {
      kind: r.kind,
      name: person.name,
      years: completedYears(onFile, r.date),
      date: r.date,
      leadDays: Math.round((Date.parse(r.date) - Date.parse(today)) / 86_400_000),
    });
  }

  for (const uid of new Set([...owed.keys(), ...spent.keys()])) {
    const items = [...(owed.get(uid)?.values() ?? [])];
    try {
      const outcome = items.length === 0
        ? 'nothing'
        : await deliver(uid, items, settingsOf.get(uid) ?? toReminderSettings(undefined), today);
      if (outcome === 'already') { run.skipped += 1; continue; }
      if (outcome === 'sent') run.sent += 1;
      // 'nothing' and 'not-allowed' still spend the one-offs: there is
      // nothing to retry, and leaving them would re-read them every morning.
      await Promise.all((spent.get(uid) ?? []).map((ref) => ref.delete()));
    } catch (e) {
      run.failed += 1;
      console.error('[celebration reminders] could not send', e);
    }
  }

  return run;
}

type DeliveryOutcome = 'sent' | 'already' | 'not-allowed' | 'nothing';

/**
 * Sends one person their reminder for this morning, if they may still have it.
 *
 * **Re-checks the permission at send time.** Somebody who set up a standing
 * rule while in HR and has since moved to dispatch must stop getting
 * birthdays in their inbox the day they move, not whenever somebody remembers
 * to clear their settings.
 */
async function deliver(
  uid: string,
  items: ReminderItem[],
  settings: ReminderSettings,
  today: string,
): Promise<DeliveryOutcome> {
  const profileSnap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
  const profile = profileSnap.data() as (RoleFlags & { email?: string; suspended?: boolean }) | undefined;
  if (!profile || profile.suspended === true) return 'not-allowed';
  if (!isBootstrapAdmin(profile.email) && !can(profile, 'people.view')) return 'not-allowed';
  if (!settings.email && !settings.chat) return 'nothing';

  if (!(await claimMorning(today, uid))) return 'already';

  const text = reminderText(items);
  const failures: unknown[] = [];

  if (settings.email && profile.email) {
    await sendEmail(profile.email, items, text).catch((e) => failures.push(e));
  }
  if (settings.chat) {
    await postToNoticeRoom(uid, text).catch((e) => failures.push(e));
  }

  const attempted = (settings.email && profile.email ? 1 : 0) + (settings.chat ? 1 : 0);
  if (failures.length > 0 && failures.length === attempted) {
    // Nothing got through, so hand the morning back and let a retry try again.
    // If one channel did get through, the claim stays: a retry would send the
    // one that worked a second time.
    await adminDb.collection(RUNS_COLLECTION).doc(`${today}_${uid}`).delete().catch(() => {});
    throw failures[0];
  }
  return 'sent';
}

/**
 * Takes this morning for this person, or reports that a run already has.
 * `create` rather than `set` — see claimDay in src/lib/celebrations.ts, which
 * this copies for the same reason: Vercel invokes a cron at least once, not
 * exactly once.
 */
async function claimMorning(date: string, uid: string): Promise<boolean> {
  try {
    await adminDb.collection(RUNS_COLLECTION).doc(`${date}_${uid}`).create({
      at: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (e) {
    if ((e as { code?: number })?.code === 6) return false; // ALREADY_EXISTS
    throw e;
  }
}

/**
 * Posts into the person's own notice room, making it the first time.
 *
 * Born locked — see NOTICE_ROOM_POLICY and the `notice` kind in
 * src/types/conversation.ts for why that alone keeps everybody else out and
 * the member from writing in it.
 */
async function postToNoticeRoom(uid: string, text: string): Promise<void> {
  const room = adminDb.collection(CONVERSATIONS_COLLECTION).doc(noticeConversationId(uid));

  await room.create({
    kind:        'notice',
    name:        'Birthday and anniversary reminders',
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
  // An announcement rather than an alert: the alert is an 11px pill with
  // `truncate` on it, and this is several lines somebody is meant to read.
  batch.update(room, systemLine(batch, room, text, { systemKind: 'announcement' }));
  await batch.commit();
}

/** Lazily made, like the agreement routes — a missing key fails here, not at build. */
async function sendEmail(to: string, items: ReminderItem[], text: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const subject = items.length === 1
    ? `${items[0].kind === 'birthday' ? 'Birthday' : 'Work anniversary'}: ${items[0].name}`
    : reminderHeading(items).replace(/:$/, '');

  const { error } = await resend.emails.send({
    from: `TTMS <${process.env.RESEND_FROM_EMAIL ?? 'noreply@totaltransportlogistics.us'}>`,
    to,
    subject,
    text: `${text}\n\nYou set this reminder up on the Celebrations page in TTMS. Change or stop it there.`,
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
<p style="color:#6b7280;font-size:12px;margin:0">You set this reminder up on the Celebrations page in TTMS. Change or stop it there.</p>
</body></html>`;
}
