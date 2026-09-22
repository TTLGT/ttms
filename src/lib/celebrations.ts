import { adminDb, FieldValue } from './firebase-admin';
import { systemLine } from './chatAlerts';
import { ALLOWED_USERS_COLLECTION } from './accessControl';
import { DEFAULT_APP_SETTINGS } from '@/types/appSettings';
import {
  COMPANY_CONVERSATION_ID,
  CONVERSATIONS_COLLECTION,
} from '@/types/conversation';
import {
  COMPANY_NAME,
  DEFAULT_CELEBRATION_TEMPLATES,
  celebrationMessage,
  celebrationsToday,
  officeToday,
  validateTemplate,
  type Celebration,
  type CelebrationCandidate,
  type CelebrationTemplates,
} from '@/types/celebration';

/**
 * The daily birthday and work-anniversary post in the Everyone room.
 *
 * Called once a day by a Vercel cron at 14:00 UTC, which is 8am in Guatemala
 * permanently — see OFFICE_TIME_ZONE. Everything about *who* is celebrating
 * and *what it says* is in src/types/celebration.ts, deliberately free of
 * Firestore; this file is the part that reads, decides whether to write, and
 * writes.
 *
 * **This is the first thing in TTMS that runs on a clock**, and the rest of
 * the codebase avoids that on purpose: a mute and an order access grant both
 * expire when they are read rather than when a job fires, because a grant that
 * outlived its deadline because cron did not run is the worst failure either
 * could have. That argument does not reach here — the worst failure this can
 * have is that nobody is congratulated this morning, which is a disappointment
 * and not a security problem. Nothing else should take this as a precedent for
 * putting access on a schedule.
 */

/** One document per day that has been posted. See claimDay below. */
const RUNS_COLLECTION = 'celebrationRuns';

export type CelebrationOutcome =
  /** Posted. */
  | 'posted'
  /** Would have posted; nothing was written because this was a preview. */
  | 'preview'
  /** The company-wide switch in Settings → Operations is off. */
  | 'disabled'
  /** Nobody has a birthday or an anniversary today. */
  | 'nobody'
  /** Today's message has already gone out. See claimDay. */
  | 'already-posted'
  /** Nobody has ever opened chat, so there is no room to post into. */
  | 'no-room';

export interface CelebrationRun {
  outcome: CelebrationOutcome;
  /** The office's own date, `YYYY-MM-DD`. */
  date: string;
  /** Who is celebrating, whether or not anything was written. */
  celebrations: Celebration[];
  /** The message as it would read, or '' when there is nothing to say. */
  message: string;
}

/**
 * Works out who is celebrating today and, unless this is a preview, says so.
 *
 * `today` is injectable so the wording and the day's edge cases can be checked
 * from the Settings panel against a date other than the real one without
 * waiting until the 29th of February to find out.
 */
export async function runCelebrations(
  options: { today?: string; preview?: boolean } = {},
): Promise<CelebrationRun> {
  const date    = options.today ?? officeToday();
  const preview = options.preview === true;

  const settings     = await celebrationSettings();
  const enabled      = settings.enabled;
  const celebrations = enabled ? celebrationsToday(await candidates(), date) : [];
  const message      = celebrationMessage(celebrations, settings.templates);

  const result = (outcome: CelebrationOutcome): CelebrationRun =>
    ({ outcome, date, celebrations, message });

  if (!enabled)                return result('disabled');
  if (celebrations.length === 0) return result('nobody');

  const room = adminDb.collection(CONVERSATIONS_COLLECTION).doc(COMPANY_CONVERSATION_ID);

  if (preview) {
    // Reported rather than ignored, so the panel can say "already sent this
    // morning" instead of showing a message that will not arrive again.
    const claimed = await adminDb.collection(RUNS_COLLECTION).doc(date).get();
    return result(claimed.exists ? 'already-posted' : 'preview');
  }

  // The Everyone room is created on demand by whoever opens chat first, not by
  // a migration — so on a database nobody has ever opened it in, it is not
  // there. Posting into a conversation that does not exist would leave a
  // message nobody can reach, so this does what postOrderAlert does and says
  // nothing at all. It is also not worth claiming the day over: if the room
  // appears an hour later, tomorrow still works.
  const roomSnap = await room.get();
  if (!roomSnap.exists) return result('no-room');

  if (!(await claimDay(date, celebrations))) return result('already-posted');

  try {
    const batch = adminDb.batch();
    batch.update(room, systemLine(batch, room, message, {
      // Signed with the company's name, not "TTMS". A birthday greeting from
      // an initialism is a birthday greeting from the software.
      senderName: COMPANY_NAME,
      // Drawn as a card somebody is meant to read rather than as the thin
      // grey line a load alert gets — see SystemMessage.
      systemKind: 'announcement',
    }));
    await batch.commit();
  } catch (e) {
    // Hand the day back. The claim exists to stop a second invocation posting
    // the same message twice, not to record an attempt — and a claim left
    // behind by a write that failed would mean a retry five minutes later
    // silently did nothing.
    await adminDb.collection(RUNS_COLLECTION).doc(date).delete().catch(() => {});
    throw e;
  }

  return result('posted');
}

/**
 * Takes today, or reports that somebody already has.
 *
 * Vercel invokes a cron at least once, not exactly once, and a retry after a
 * timeout is a normal thing for it to do — so without this, a slow morning
 * would wish the same person a happy birthday twice in the same room. `create`
 * rather than `set` is what makes the claim atomic: two invocations racing each
 * other both try to create the same document id and exactly one of them wins,
 * the same trick the company room's own creation uses.
 *
 * Counts rather than names. Nothing reads this back except a person debugging
 * why the room was quiet, and there is no reason to copy birthdays into a
 * second collection to answer that.
 */
async function claimDay(date: string, celebrations: Celebration[]): Promise<boolean> {
  try {
    await adminDb.collection(RUNS_COLLECTION).doc(date).create({
      at:            FieldValue.serverTimestamp(),
      birthdays:     celebrations.filter((c) => c.kind === 'birthday').length,
      anniversaries: celebrations.filter((c) => c.kind === 'anniversary').length,
    });
    return true;
  } catch (e) {
    // 6 = ALREADY_EXISTS. Someone else got there first, which is exactly what
    // this is for.
    if ((e as { code?: number })?.code === 6) return false;
    throw e;
  }
}

/**
 * The switch and the wording, in one read, defaulted the same way every other
 * setting is.
 *
 * **A stored template is re-checked here rather than trusted.** The route that
 * saved it validated it, but a document edited by hand in the Firebase Console
 * has been through nothing at all — and the cost of a bad one is a message
 * reading `Congratulations to {Name}` going out to the whole company on
 * somebody's anniversary, once, with no way to take it back. Falling back to
 * the default wording is a far better failure than that.
 */
async function celebrationSettings(): Promise<{ enabled: boolean; templates: CelebrationTemplates }> {
  const snap   = await adminDb.collection('appSettings').doc('general').get();
  const stored = snap.exists ? snap.data() : undefined;

  const raw = (stored?.celebrationTemplates ?? {}) as Partial<CelebrationTemplates>;
  const pick = (kind: keyof CelebrationTemplates): string => {
    const value = typeof raw[kind] === 'string' ? raw[kind] : '';
    return validateTemplate(kind, value) === '' ? value.trim() : DEFAULT_CELEBRATION_TEMPLATES[kind];
  };

  return {
    enabled: typeof stored?.celebrations === 'boolean'
      ? stored.celebrations
      : DEFAULT_APP_SETTINGS.celebrations,
    templates: { birthday: pick('birthday'), anniversary: pick('anniversary') },
  };
}

/**
 * Every allowlist entry, as the fields the decision needs.
 *
 * The whole collection in one read, which is the right shape here: it is one
 * document per person at this company, read once a day, and the alternative —
 * a query per month-day — would need a stored `MM-DD` field on every entry,
 * kept in step by everything that can write a birthday, to save a few dozen
 * reads. See the note on reads in CLAUDE.md: this is not the collection that
 * grows.
 */
async function candidates(): Promise<CelebrationCandidate[]> {
  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
  return snap.docs.map((doc) => doc.data() as CelebrationCandidate);
}
