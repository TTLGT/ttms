/**
 * Changing somebody's work email — the address they sign in with.
 *
 * This is not a field edit, and the reason is the whole of this file: the
 * address is the **key** of the allowlist entry (`allowedUsers/{email}`), and
 * it is the key or a stored value in a dozen other places that were built on
 * the assumption it never moves. Changing it means moving every one of them in
 * the same operation, or the person arrives on the new address to find their
 * attendance history, their schedule, their team and the clients waiting for
 * them still filed under the old one.
 *
 * What moves, and why each is here:
 *
 * - `allowedUsers/{old}` → `allowedUsers/{new}`. Created and deleted in one
 *   transaction, so there is never a moment with two entries (two ways in) or
 *   none (a locked-out person). The old address is kept on the new entry as
 *   `previousEmails`, so "who was selvin@?" stays answerable.
 * - `users/{uid}.email` and the Firebase Auth account's email, for somebody
 *   who has signed in. The uid does not change — see "Who this works for".
 * - Teams led by a pending person (`leadEmail`), work groups waiting for them
 *   (`memberEmails`), and parties and orders assigned before their first
 *   sign-in (`assignedToEmails`) — the shapes `claimPendingAssignments()`
 *   drains. Miss one and it is never claimed, and the record silently reads
 *   as somebody else's.
 * - Attendance, which is keyed by email throughout so HR can set a schedule
 *   before somebody's first day: `attendanceDays/{email}_{date}` (re-keyed),
 *   `attendanceSchedules`, `attendancePrefs`, `attendanceDevices` (moved), and
 *   the `email` on time off and corrections.
 * - Profile update requests (`subjectEmail`) — an approval writes against
 *   that address, and a request left on the old one would 404 on approval.
 * - One-off celebration reminders (`subjectEmail`), which the run matches
 *   against the allowlist.
 * - The onboarding programme, `onboardingPrograms/{email}` (moved), which HR
 *   starts before the first day for the same reason attendance is keyed by
 *   email. Its `email` field is rewritten with it.
 * - `managedEmails` on every Sales Manager, by re-running the scope sync.
 *
 * Deliberately left alone: the access history and the removal log (they record
 * what was true then), `avatars/{old}/…` in Storage (the stored `photoPath`
 * still points at the file, and the avatars prefix is readable by every staff
 * account whatever the folder is called), and the `attendanceAlerts` locks,
 * which only matter for the day they were written.
 *
 * ## Who this works for
 *
 * A **pending** invite (never signed in) is the easy case: nothing is bound to
 * the address but the records above, and the person simply signs in with the
 * new one.
 *
 * Somebody **already signed in** works when the address was changed on the
 * *same* Google account — renaming the user in the Google Workspace admin
 * console. Google keeps the account, so Firebase keeps the uid, and every
 * order, chat, task and permission held by uid carries straight over. They are
 * signed out here and sign back in with the new address.
 *
 * What it does **not** do is move somebody onto a *different* Google account.
 * That account would get a new uid, and the records held by the old uid would
 * stay with it. If a Firebase account already exists at the new address and it
 * is not this person's, the change is refused rather than half-done.
 */

import { adminAuth, adminDb, FieldValue } from './firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  USERS_COLLECTION,
  TEAMS_COLLECTION,
  WORK_GROUPS_COLLECTION,
  ALLOWED_EMAIL_DOMAIN,
  isAllowedEmailDomain,
  isBootstrapAdmin,
  normalizeEmail,
} from './accessControl';
import { syncManagedScopes } from './teamScope';
import { personName, recordPeopleEvent, rolesHeld } from './peopleEvents';
import {
  ATTENDANCE_DAYS_COLLECTION,
  ATTENDANCE_DEVICES_COLLECTION,
  ATTENDANCE_PREFS_COLLECTION,
  ATTENDANCE_SCHEDULES_COLLECTION,
  CORRECTIONS_COLLECTION,
  TIME_OFF_COLLECTION,
  dayDocId,
} from '@/types/attendance';
import { PROFILE_UPDATE_REQUESTS_COLLECTION } from '@/types/profileUpdateRequest';
import { ONBOARDING_COLLECTION } from '@/types/onboarding';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same name the reminder module uses; not exported there. */
const CELEBRATION_REMINDERS_COLLECTION = 'celebrationReminders';

/** A refusal the admin can act on, with the HTTP status to answer it with. */
export class EmailChangeError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface EmailChangeResult {
  email: string;
  /** True when the person had signed in, and so has been signed out. */
  signedOut: boolean;
  /** How many other records were moved to the new address. */
  moved: number;
}

type Write =
  | { op: 'set'; ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }
  | { op: 'update'; ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }
  | { op: 'delete'; ref: FirebaseFirestore.DocumentReference };

export async function changeWorkEmail(
  fromRaw: string,
  toRaw: string,
  actor: { uid: string; email: string | undefined },
): Promise<EmailChangeResult> {
  const from = normalizeEmail(fromRaw);
  const to   = normalizeEmail(toRaw);

  if (!EMAIL_RE.test(to)) throw new EmailChangeError('That is not a valid email address.');
  if (!isAllowedEmailDomain(to)) {
    throw new EmailChangeError(`Work emails must end in @${ALLOWED_EMAIL_DOMAIN}.`);
  }
  if (to === from) throw new EmailChangeError('That is already their work email.');
  // The bootstrap list is the lockout escape hatch and is matched by address:
  // moving one off it would quietly retire the hatch, and moving somebody onto
  // one would hand them permanent admin.
  if (isBootstrapAdmin(from) || isBootstrapAdmin(to)) {
    throw new EmailChangeError('Protected admin accounts cannot change address here.');
  }
  // Your own session is the one making this request; moving it out from under
  // yourself would sign you out mid-save. Another admin can do it.
  if (normalizeEmail(actor.email) === from) {
    throw new EmailChangeError('Ask another admin to change your own work email.');
  }

  const oldRef = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(from);
  const newRef = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(to);

  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) throw new EmailChangeError('That person is not on the access list.', 404);
  const entry = oldSnap.data() ?? {};
  const uid = typeof entry.uid === 'string' && entry.uid ? entry.uid : null;

  // Checked before anything is written. A Firebase account already at the new
  // address that is not this person's means a different Google account has
  // signed in with it — see "Who this works for" above.
  const holder = await adminAuth.getUserByEmail(to).catch(() => null);
  if (holder && uid && holder.uid !== uid) {
    throw new EmailChangeError(
      'A different Google account has already signed in with that address. '
      + 'Rename this person in Google Workspace instead of creating a new account, '
      + 'or remove that other account first.',
      409,
    );
  }

  // The move itself. A transaction, so a second admin adding the new address
  // at the same moment cannot end up with two entries for one person.
  await adminDb.runTransaction(async (tx) => {
    const [taken, current] = await Promise.all([tx.get(newRef), tx.get(oldRef)]);
    if (taken.exists) {
      throw new EmailChangeError('Somebody on the access list already has that address.', 409);
    }
    if (!current.exists) throw new EmailChangeError('That person is not on the access list.', 404);
    tx.set(newRef, {
      ...current.data(),
      email: to,
      previousEmails: FieldValue.arrayUnion(from),
      emailChangedAt: FieldValue.serverTimestamp(),
      emailChangedBy: actor.email ?? actor.uid,
    });
    tx.delete(oldRef);
  });

  // From here on the person is on the new address. Everything below is moving
  // the records that hang off it; a failure in one is logged and does not undo
  // the move, because undoing it would leave them half-moved the other way.
  let moved = 0;
  try {
    moved = await moveRecords(from, to);
  } catch (e) {
    console.error('[emailChange] moving records failed', from, to, e);
  }

  let signedOut = false;
  if (uid) {
    await adminDb.collection(USERS_COLLECTION).doc(uid).set({ email: to }, { merge: true });
    await adminAuth.updateUser(uid, { email: to }).catch((e) => {
      console.error('[emailChange] updating the sign-in account failed', uid, e);
    });
    // Every API guard looks the allowlist up by the address in the ID token.
    // Their current token still carries the old one, which is no longer on the
    // list, so every request would fail until it refreshed. Signing them out
    // now turns that into one clean "sign in again".
    await adminAuth.revokeRefreshTokens(uid).catch(() => {});
    signedOut = true;
  }

  await syncManagedScopes().catch((e) => {
    console.error('[emailChange] refreshing managed scopes failed', to, e);
  });

  await recordPeopleEvent({
    action:        'emailChanged',
    email:         to,
    previousEmail: from,
    name:          personName(entry),
    roles:         rolesHeld(entry),
    actorEmail:    actor.email ?? actor.uid,
    actorUid:      actor.uid,
    source:        'settings',
  });

  return { email: to, signedOut, moved };
}

/** Every record held under `from` that has to follow the person to `to`. */
async function moveRecords(from: string, to: string): Promise<number> {
  const db = adminDb;
  const [
    teams, groups, parties, orders,
    days, timeOff, corrections, requests, reminders,
    schedule, prefs, devices, onboarding,
  ] = await Promise.all([
    db.collection(TEAMS_COLLECTION).where('leadEmail', '==', from).get(),
    db.collection(WORK_GROUPS_COLLECTION).where('memberEmails', 'array-contains', from).get(),
    db.collection('parties').where('assignedToEmails', 'array-contains', from).get(),
    db.collection('orders').where('assignedToEmails', 'array-contains', from).get(),
    db.collection(ATTENDANCE_DAYS_COLLECTION).where('email', '==', from).get(),
    db.collection(TIME_OFF_COLLECTION).where('email', '==', from).get(),
    db.collection(CORRECTIONS_COLLECTION).where('email', '==', from).get(),
    db.collection(PROFILE_UPDATE_REQUESTS_COLLECTION).where('subjectEmail', '==', from).get(),
    db.collection(CELEBRATION_REMINDERS_COLLECTION).where('subjectEmail', '==', from).get(),
    db.collection(ATTENDANCE_SCHEDULES_COLLECTION).doc(from).get(),
    db.collection(ATTENDANCE_PREFS_COLLECTION).doc(from).get(),
    db.collection(ATTENDANCE_DEVICES_COLLECTION).doc(from).get(),
    db.collection(ONBOARDING_COLLECTION).doc(from).get(),
  ]);

  const writes: Write[] = [];
  const swap = (list: unknown) =>
    [...new Set(((Array.isArray(list) ? list : []) as string[]).map((e) => (e === from ? to : e)))];

  for (const d of teams.docs) writes.push({ op: 'update', ref: d.ref, data: { leadEmail: to } });
  for (const d of groups.docs) {
    writes.push({ op: 'update', ref: d.ref, data: { memberEmails: swap(d.data().memberEmails) } });
  }
  // Ownership itself is not changing hands — the same person owns the same
  // records — so these are not ownerEvents and not change-log entries. They
  // are the pending address being corrected before anybody claimed it.
  for (const d of [...parties.docs, ...orders.docs]) {
    writes.push({ op: 'update', ref: d.ref, data: { assignedToEmails: swap(d.data().assignedToEmails) } });
  }

  // Days are keyed `{email}_{date}`, so each is rewritten under its new id
  // rather than edited in place — every reader finds a day by building that id.
  for (const d of days.docs) {
    const data = d.data();
    const date = typeof data.date === 'string' ? data.date : null;
    if (!date) continue;
    writes.push({ op: 'set', ref: db.collection(ATTENDANCE_DAYS_COLLECTION).doc(dayDocId(to, date)), data: { ...data, email: to } });
    writes.push({ op: 'delete', ref: d.ref });
  }
  for (const d of [...timeOff.docs, ...corrections.docs]) {
    writes.push({ op: 'update', ref: d.ref, data: { email: to } });
  }
  for (const d of [...requests.docs, ...reminders.docs]) {
    writes.push({ op: 'update', ref: d.ref, data: { subjectEmail: to } });
  }

  // Per-person documents keyed by the address: moved whole.
  for (const [snap, collection] of [
    [schedule, ATTENDANCE_SCHEDULES_COLLECTION],
    [prefs, ATTENDANCE_PREFS_COLLECTION],
    [devices, ATTENDANCE_DEVICES_COLLECTION],
    [onboarding, ONBOARDING_COLLECTION],
  ] as const) {
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    writes.push({
      op: 'set',
      ref: db.collection(collection).doc(to),
      // A schedule document may carry its own `email`; keep it truthful.
      data: 'email' in data ? { ...data, email: to } : data,
    });
    writes.push({ op: 'delete', ref: snap.ref });
  }

  // A batch caps at 500 operations, and a year of attendance days alone is
  // two writes per working day. Each new copy is pushed before the delete of
  // the document it replaces, so a failure between two chunks can leave a
  // duplicate behind but never lose a day.
  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + CHUNK)) {
      if (w.op === 'set') batch.set(w.ref, w.data);
      else if (w.op === 'update') batch.update(w.ref, w.data);
      else batch.delete(w.ref);
    }
    await batch.commit();
  }

  return teams.size + groups.size + parties.size + orders.size + days.size
    + timeOff.size + corrections.size + requests.size + reminders.size
    + [schedule, prefs, devices, onboarding].filter((s) => s.exists).length;
}
