import { adminDb, AdminAuthError } from '@/lib/firebase-admin';
import { ALLOWED_USERS_COLLECTION, can, managesUid } from '@/lib/accessControl';
import { requireCaller, type Caller } from '@/lib/partyAccess';
import { fullName } from '@/types/allowedUser';
import { officeToday } from '@/types/celebration';
import { countMonth } from './incentiveCounts';
import {
  INCENTIVES_COLLECTION,
  MAX_NOTE,
  applyCounts,
  cleanProgram,
  countersIn,
  isMonthId,
  monthOf,
  withoutUndefined,
  type GoalMark,
  type IncentiveAbilities,
  type IncentiveGoal,
  type IncentivePrize,
  type IncentiveParticipant,
  type IncentiveProgram,
  type IncentiveProgress,
} from '@/types/incentive';

/**
 * Incentives, server side. `incentivePrograms` has no Firestore rule, so this
 * file and the Admin SDK are the only way in — see src/types/incentive.ts for
 * what the feature is and who may do what.
 *
 * Every write to a mark or to the programme also writes an `events` entry in
 * the same batch: the figures decide what people are paid, and "who changed
 * Andrew's quotes from 12 to 15, and when" has to be answerable.
 */

export class IncentiveError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function incentiveErrorResponse(e: unknown): { error: string; status: number } {
  if (e instanceof AdminAuthError || e instanceof IncentiveError) return { error: e.message, status: e.status };
  console.error('[incentives]', e);
  return { error: 'Something went wrong. Try again.', status: 500 };
}

const col = () => adminDb.collection(INCENTIVES_COLLECTION);

export { requireCaller as incentiveCaller };

export function officeMonth(): string {
  return monthOf(officeToday());
}

export function abilitiesFor(caller: Caller, program: IncentiveProgram | null): IncentiveAbilities {
  const p = caller.profile;
  const recordAll = can(p, 'incentives.record');
  // A Sales Manager records for the people on the teams they lead — the same
  // scope as their other team powers, resolved into `managedUids`.
  const recordUids = !recordAll && p.isSalesManager && program
    ? program.participants.map((x) => x.uid).filter((uid) => managesUid(p, uid))
    : [];
  return { manage: can(p, 'incentives.manage'), recordAll, recordUids };
}

function mayRecordFor(abilities: IncentiveAbilities, uid: string): boolean {
  return abilities.recordAll || abilities.recordUids.includes(uid);
}

// ── Reading ──────────────────────────────────────────────────────────────────

type Data = Record<string, unknown>;

function readProgram(month: string, d: Data): IncentiveProgram {
  // Stored as written by saveProgram(), which cleaned it; read defensively
  // anyway, since a document edited by hand in the Console has been through
  // nothing.
  const cleaned = cleanProgram(month, d);
  const base = 'program' in cleaned ? cleaned.program : {
    month, title: String(d.title ?? ''), intro: '', currency: 'GTQ' as const,
    goals: [] as IncentiveGoal[], prize: null as IncentivePrize | null, participants: [] as IncentiveParticipant[],
  };
  return {
    ...base,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : null,
    updatedByName: typeof d.updatedByName === 'string' ? d.updatedByName : null,
  };
}

function readMark(raw: unknown): GoalMark | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Data;
  return {
    value: typeof m.value === 'number' && Number.isFinite(m.value) ? m.value : null,
    done: m.done === true,
    na: m.na === true,
    note: typeof m.note === 'string' ? m.note : '',
    at: typeof m.at === 'string' ? m.at : '',
    byUid: typeof m.byUid === 'string' ? m.byUid : '',
    byName: typeof m.byName === 'string' ? m.byName : '',
    corrected: m.corrected === true,
    reason: typeof m.reason === 'string' ? m.reason : '',
  };
}

/**
 * Stored progress turned into what the cards show: counted goals filled in
 * from TTMS's records (lib/incentiveCounts.ts). A month with no counted goal
 * costs nothing extra.
 */
async function withCounts(month: string, program: IncentiveProgram, stored: IncentiveProgress[], onlyUid?: string): Promise<IncentiveProgress[]> {
  const counters = countersIn(program);
  if (!counters.length) return applyCounts(program, stored, {});
  const uids = onlyUid ? [onlyUid] : program.participants.map((p) => p.uid);
  const counts = await countMonth(month, uids, counters);
  const scoped = onlyUid ? { ...program, participants: program.participants.filter((p) => p.uid === onlyUid) } : program;
  return applyCounts(scoped, stored, counts);
}

function readProgress(uid: string, d: Data): IncentiveProgress {
  const marks: Record<string, GoalMark> = {};
  if (d.marks && typeof d.marks === 'object') {
    for (const [goalId, raw] of Object.entries(d.marks as Data)) {
      const m = readMark(raw);
      if (m) marks[goalId] = m;
    }
  }
  return {
    uid,
    marks,
    prizeValue: typeof d.prizeValue === 'number' && Number.isFinite(d.prizeValue) ? d.prizeValue : null,
    prizeNote: typeof d.prizeNote === 'string' ? d.prizeNote : '',
  };
}

/** The months that have a programme, newest first. Ids only — no documents read in full. */
export async function listMonths(): Promise<string[]> {
  const snap = await col().select().get();
  return snap.docs.map((d) => d.id).filter(isMonthId).sort().reverse();
}

export interface MonthView {
  month: string;
  program: IncentiveProgram | null;
  progress: IncentiveProgress[];
  abilities: IncentiveAbilities;
  /** The months that have a programme, for the month picker. */
  months: string[];
}

/**
 * One month, for anybody signed in: the programme and every participant's
 * marks. One document plus one small subcollection — a few dozen reads.
 */
export async function getMonth(caller: Caller, month: string): Promise<MonthView> {
  if (!isMonthId(month)) throw new IncentiveError('That is not a month.', 400);
  const [doc, progressSnap, months] = await Promise.all([
    col().doc(month).get(),
    col().doc(month).collection('progress').get(),
    listMonths(),
  ]);
  const program = doc.exists ? readProgram(month, doc.data() as Data) : null;
  const inProgram = new Set(program?.participants.map((p) => p.uid) ?? []);
  const stored = progressSnap.docs
    .filter((d) => inProgram.has(d.id))
    .map((d) => readProgress(d.id, d.data() as Data));
  const progress = program ? await withCounts(month, program, stored) : stored;
  return { month, program, progress, abilities: abilitiesFor(caller, program), months };
}

// ── The people who can take part ─────────────────────────────────────────────

export interface IncentivePerson {
  uid: string;
  name: string;
  email: string;
}

/**
 * Everybody who could be added to a month: on the allowlist, signed in at
 * least once (there is no uid to key progress by before that), not suspended,
 * not an intern. Only for whoever sets a month up.
 */
export async function listPeople(caller: Caller): Promise<IncentivePerson[]> {
  if (!can(caller.profile, 'incentives.manage')) {
    throw new IncentiveError('Only somebody who runs incentives can choose who takes part.', 403);
  }
  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
  return snap.docs
    .map((d) => ({ email: d.id, d: d.data() as Data }))
    .filter(({ d }) => typeof d.uid === 'string' && d.uid && d.suspended !== true && d.isIntern !== true)
    .map(({ email, d }) => ({
      uid: d.uid as string,
      email,
      name: fullName(d as Parameters<typeof fullName>[0]) || email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Writing the programme ────────────────────────────────────────────────────

export async function saveProgram(caller: Caller, month: string, raw: unknown): Promise<IncentiveProgram> {
  if (!can(caller.profile, 'incentives.manage')) {
    throw new IncentiveError('Only somebody who runs incentives can change the month’s set-up.', 403);
  }
  if (!isMonthId(month)) throw new IncentiveError('That is not a month.', 400);
  const cleaned = cleanProgram(month, raw);
  if ('problem' in cleaned) throw new IncentiveError(cleaned.problem, 400);

  // Names come from the allowlist, not from the request — a card says who it
  // is about, and the browser does not get to decide that.
  const entries = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
  const nameByUid = new Map<string, string>();
  for (const d of entries.docs) {
    const data = d.data() as Data;
    if (typeof data.uid === 'string' && data.uid) {
      nameByUid.set(data.uid, fullName(data as Parameters<typeof fullName>[0]) || d.id);
    }
  }
  const ref = col().doc(month);
  const before = await ref.get();
  const previous = before.exists ? readProgram(month, before.data() as Data) : null;
  const participants = cleaned.program.participants
    .map((p) => {
      // Somebody removed from TTMS since they were added keeps the name they
      // had; an uid nobody ever had is dropped.
      const name = nameByUid.get(p.uid) ?? previous?.participants.find((x) => x.uid === p.uid)?.name;
      return name ? { ...p, name } : null;
    })
    .filter((p): p is IncentiveParticipant => p !== null);

  const program: IncentiveProgram = {
    ...cleaned.program,
    participants,
    updatedAt: new Date().toISOString(),
    updatedByName: caller.displayName,
  };

  const batch = adminDb.batch();
  batch.set(ref, withoutUndefined(program));
  batch.create(ref.collection('events').doc(), withoutUndefined({
    at: program.updatedAt, byUid: caller.uid, byName: caller.displayName, kind: 'program',
    from: previous ? summaryOf(previous) : null,
    to: summaryOf(program),
  }));
  await batch.commit();
  return program;
}

/**
 * What the log keeps about a set-up change: enough to answer "who changed
 * the reward on goal 5", without copying every instruction into every entry.
 */
function summaryOf(p: IncentiveProgram) {
  return {
    title: p.title,
    goals: p.goals.map((g) => ({ id: g.id, title: g.title, reward: g.reward, target: g.target, kind: g.kind, compare: g.compare, counter: g.counter ?? null })),
    participants: p.participants.map((x) => ({ uid: x.uid, targets: x.targets })),
    prize: p.prize?.title ?? null,
  };
}

// ── Writing a mark ───────────────────────────────────────────────────────────

export interface MarkPatch {
  uid: string;
  /** A goal id, or `prize` for the prize number. */
  goalId: string;
  value?: number | null;
  done?: boolean;
  na?: boolean;
  note?: string;
  /** On a counted goal: true sets a correction (needs `value` and `reason`), false goes back to TTMS's count. */
  corrected?: boolean;
  reason?: string;
}

function parsePatch(raw: unknown): MarkPatch {
  if (!raw || typeof raw !== 'object') throw new IncentiveError('Nothing to save.', 400);
  const r = raw as Data;
  const uid = typeof r.uid === 'string' ? r.uid : '';
  const goalId = typeof r.goalId === 'string' ? r.goalId : '';
  if (!uid || !goalId) throw new IncentiveError('Say whose mark and which goal.', 400);
  const patch: MarkPatch = { uid, goalId };
  if ('value' in r) {
    if (r.value === null || r.value === '') patch.value = null;
    else {
      const n = typeof r.value === 'number' ? r.value : Number(r.value);
      if (!Number.isFinite(n)) throw new IncentiveError('That is not a number.', 400);
      if (Math.abs(n) > 1e9) throw new IncentiveError('That number is too large.', 400);
      patch.value = n;
    }
  }
  if ('done' in r) patch.done = r.done === true;
  if ('na' in r) patch.na = r.na === true;
  if ('note' in r) patch.note = typeof r.note === 'string' ? r.note.trim().slice(0, MAX_NOTE) : '';
  if ('corrected' in r) patch.corrected = r.corrected === true;
  if ('reason' in r) patch.reason = typeof r.reason === 'string' ? r.reason.trim().slice(0, MAX_NOTE) : '';
  return patch;
}

/**
 * Records one person's standing on one goal (or the prize), with a log entry
 * in the same transaction. Only the fields sent change.
 */
export async function recordMark(caller: Caller, month: string, raw: unknown): Promise<IncentiveProgress> {
  if (!isMonthId(month)) throw new IncentiveError('That is not a month.', 400);
  const patch = parsePatch(raw);
  const ref = col().doc(month);
  const progressRef = ref.collection('progress').doc(patch.uid);
  const now = new Date().toISOString();

  // A holder rather than a `let`: TypeScript does not follow an assignment made inside the callback.
  const seen: { program: IncentiveProgram | null } = { program: null };
  const stored = await adminDb.runTransaction(async (tx) => {
    const [programDoc, progressDoc] = await Promise.all([tx.get(ref), tx.get(progressRef)]);
    if (!programDoc.exists) throw new IncentiveError('There are no incentives set up for that month.', 404);
    const program = readProgram(month, programDoc.data() as Data);
    seen.program = program;
    if (!program.participants.some((p) => p.uid === patch.uid)) {
      throw new IncentiveError('That person is not taking part this month.', 400);
    }
    if (!mayRecordFor(abilitiesFor(caller, program), patch.uid)) {
      throw new IncentiveError('You can’t record progress for that person.', 403);
    }

    const current = progressDoc.exists ? readProgress(patch.uid, progressDoc.data() as Data) : { uid: patch.uid, marks: {}, prizeValue: null, prizeNote: '' };
    const event = { at: now, byUid: caller.uid, byName: caller.displayName, kind: 'progress' as const, uid: patch.uid, goalId: patch.goalId };

    if (patch.goalId === 'prize') {
      if (!program.prize) throw new IncentiveError('This month has no prize.', 400);
      const next = {
        prizeValue: patch.value !== undefined ? patch.value : current.prizeValue,
        prizeNote: patch.note !== undefined ? patch.note : current.prizeNote,
      };
      tx.set(progressRef, next, { merge: true });
      tx.create(ref.collection('events').doc(), withoutUndefined({
        ...event, from: { value: current.prizeValue, note: current.prizeNote }, to: { value: next.prizeValue, note: next.prizeNote },
      }));
      return { ...current, ...next };
    }

    const goal = program.goals.find((g) => g.id === patch.goalId);
    if (!goal) throw new IncentiveError('That goal is not in this month’s set-up any more. Reload the page.', 400);
    const was = current.marks[goal.id];

    // A counted goal's number is TTMS's until somebody corrects it, and a
    // correction always says why — it changes what somebody is paid, against
    // what the records say.
    let corrected = was?.corrected ?? false;
    let reason = was?.reason ?? '';
    if (goal.counter) {
      if (patch.corrected === true) {
        if (typeof patch.value !== 'number') throw new IncentiveError('Type the number it should be.', 400);
        if (!patch.reason) throw new IncentiveError('Say why TTMS’s count is wrong.', 400);
        corrected = true;
        reason = patch.reason;
      } else if (patch.corrected === false) {
        corrected = false;
        reason = '';
      } else if (patch.value !== undefined && !corrected) {
        throw new IncentiveError('TTMS counts this goal. Correct the number with a reason instead.', 400);
      }
    } else if (patch.corrected !== undefined) {
      throw new IncentiveError('This goal is typed by hand, so there is no count to correct.', 400);
    }

    const mark: GoalMark = {
      value: patch.value !== undefined ? patch.value : was?.value ?? null,
      done: patch.done !== undefined ? patch.done : was?.done ?? false,
      na: patch.na !== undefined ? patch.na : was?.na ?? false,
      note: patch.note !== undefined ? patch.note : was?.note ?? '',
      at: now, byUid: caller.uid, byName: caller.displayName,
      corrected, reason,
    };
    tx.set(progressRef, { marks: { [goal.id]: mark } }, { merge: true });
    tx.create(ref.collection('events').doc(), withoutUndefined({
      ...event,
      from: was ? { value: was.value, done: was.done, na: was.na, note: was.note, corrected: was.corrected ?? false, reason: was.reason ?? '' } : null,
      to: { value: mark.value, done: mark.done, na: mark.na, note: mark.note, corrected, reason },
    }));
    return { ...current, marks: { ...current.marks, [goal.id]: mark } };
  });

  // The page swaps in what comes back, so it must be what the cards read:
  // counted goals filled in, for this one person.
  if (!seen.program) return stored;
  const [shown] = await withCounts(month, seen.program, [stored], patch.uid);
  return shown ?? stored;
}
