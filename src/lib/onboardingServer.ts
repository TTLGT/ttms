import { adminDb, requireCompanyUser, AdminAuthError } from '@/lib/firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  USERS_COLLECTION,
  TEAMS_COLLECTION,
  can,
  isBootstrapAdmin,
  managesEmail,
  managesUid,
  normalizeEmail,
  type RoleFlags,
} from '@/lib/accessControl';
import { fullName } from '@/types/allowedUser';
import { officeToday } from '@/types/celebration';
import {
  ONBOARDING_COLLECTION,
  MAX_MENTOR_NAME,
  MAX_NOTE,
  MAX_SURVEY_TEXT,
  defaultTrack,
  emptyProgram,
  isIsoDate,
  isOnboardingTrack,
  mayTick,
  summarize,
  withoutAnswers,
  type GuideMark,
  type OnboardingProgram,
  type OnboardingTrack,
  type OnboardingViewer,
  type ProgressSummary,
  type StepMark,
  type SurveyAnswers,
} from '@/types/onboarding';
import { CHECKLIST, stepById } from '@/lib/onboarding/checklist';
import { isGuideId } from '@/lib/onboarding/guides';
import { surveyById, surveyQuestionIds } from '@/lib/onboarding/surveys';

/**
 * My onboarding, server side. Every read and write goes through here and the
 * Admin SDK: `onboardingPrograms` has no rule, so the browser can neither read
 * nor write it. See src/types/onboarding.ts for who sees what.
 */

export class OnboardingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function onboardingErrorResponse(e: unknown): { error: string; status: number } {
  if (e instanceof AdminAuthError || e instanceof OnboardingError) return { error: e.message, status: e.status };
  console.error('[onboarding]', e);
  return { error: 'Something went wrong. Try again.', status: 500 };
}

const col = () => adminDb.collection(ONBOARDING_COLLECTION);

// ── Who is asking ────────────────────────────────────────────────────────────

export interface OnboardingCaller {
  uid: string;
  email: string;
  name: string;
  profile: RoleFlags | null;
  manages: boolean;
}

export async function onboardingCaller(req: Request): Promise<OnboardingCaller> {
  const { uid, email: raw, entry } = await requireCompanyUser(req);
  const email = normalizeEmail(raw);
  const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
  const profile = (snap.data() ?? null) as (RoleFlags & { displayName?: string }) | null;
  return {
    uid, email,
    name: (entry ? fullName(entry) : '') || profile?.displayName || email,
    profile,
    manages: isBootstrapAdmin(email) || can(profile, 'onboarding.manage'),
  };
}

// ── The people ───────────────────────────────────────────────────────────────

export interface OnboardingPerson {
  email: string;
  uid: string | null;
  name: string;
  photoPath: string | null;
  teamId: string | null;
  teamName: string | null;
  suspended: boolean;
  defaultTrack: OnboardingTrack;
}

type Entry = Record<string, unknown>;

function personFrom(email: string, d: Entry, teams: Map<string, string>): OnboardingPerson {
  const teamId = typeof d.teamId === 'string' ? d.teamId : null;
  return {
    email,
    uid: typeof d.uid === 'string' ? d.uid : null,
    name: fullName(d as Parameters<typeof fullName>[0]) || email,
    photoPath: typeof d.photoPath === 'string' ? d.photoPath : null,
    teamId,
    teamName: teamId ? teams.get(teamId) ?? null : null,
    suspended: d.suspended === true,
    defaultTrack: defaultTrack(d as Parameters<typeof defaultTrack>[0]),
  };
}

async function teamNames(): Promise<Map<string, string>> {
  const snap = await adminDb.collection(TEAMS_COLLECTION).get();
  return new Map(snap.docs.map((t) => [t.id, String(t.data().name ?? '')]));
}

export function viewerFor(caller: OnboardingCaller, person: { email: string; uid: string | null }): OnboardingViewer {
  const self = person.email === caller.email;
  const leadsThem = caller.profile?.isSalesManager === true
    && (managesUid(caller.profile, person.uid) || managesEmail(caller.profile, person.email));
  return { self, manages: caller.manages, leadsThem };
}

function maySee(v: OnboardingViewer): boolean {
  return v.self || v.manages || v.leadsThem;
}

// ── Reading a programme ──────────────────────────────────────────────────────

function readMarks<T>(raw: unknown, ok: (v: Record<string, unknown>) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const m = ok(v as Record<string, unknown>);
    if (m) out[k] = m;
  }
  return out;
}

function readProgram(email: string, data: Entry | undefined, fallback: OnboardingTrack, fallbackStart: string | null): OnboardingProgram {
  if (!data) return emptyProgram(email, fallback, fallbackStart);
  const surveys = readMarks<SurveyAnswers>(data.surveys, (v) =>
    typeof v.submittedAt === 'string' && v.answers && typeof v.answers === 'object'
      ? { submittedAt: v.submittedAt, answers: v.answers as SurveyAnswers['answers'] }
      : null);
  return {
    email,
    track: isOnboardingTrack(data.track) ? data.track : fallback,
    startDate: isIsoDate(data.startDate) ? data.startDate : fallbackStart,
    mentorName: typeof data.mentorName === 'string' && data.mentorName ? data.mentorName : null,
    done: readMarks<StepMark>(data.done, (v) =>
      typeof v.at === 'string'
        ? { at: v.at, byUid: String(v.byUid ?? ''), byName: String(v.byName ?? ''), ...(typeof v.note === 'string' && v.note ? { note: v.note } : {}) }
        : null),
    guides: readMarks<GuideMark>(data.guides, (v) =>
      typeof v.at === 'string'
        ? { at: v.at, ...(typeof v.score === 'number' ? { score: v.score } : {}), ...(typeof v.total === 'number' ? { total: v.total } : {}) }
        : null),
    surveys,
    surveysSubmitted: Object.keys(surveys),
    stored: true,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
  };
}

/**
 * The start date to use when HR has not set one on the programme. Only for
 * the person themselves or somebody running onboarding: `startDate` on the
 * allowlist entry is a payroll field, and a Sales Manager is not given it.
 */
function entryStart(d: Entry, v: OnboardingViewer): string | null {
  if (!v.self && !v.manages) return null;
  return isIsoDate(d.startDate) ? d.startDate : null;
}

function shaped(p: OnboardingProgram, v: OnboardingViewer): OnboardingProgram {
  return v.self || v.manages ? p : withoutAnswers(p);
}

export async function myProgram(caller: OnboardingCaller): Promise<OnboardingProgram> {
  const [entry, doc] = await Promise.all([
    adminDb.collection(ALLOWED_USERS_COLLECTION).doc(caller.email).get(),
    col().doc(caller.email).get(),
  ]);
  const d = (entry.data() ?? {}) as Entry;
  const v: OnboardingViewer = { self: true, manages: caller.manages, leadsThem: false };
  // A bootstrap admin with no allowlist entry still has a programme to look at.
  const track = entry.exists ? defaultTrack(d as Parameters<typeof defaultTrack>[0]) : 'broker';
  return readProgram(caller.email, doc.data(), track, entryStart(d, v));
}

export interface PersonProgress {
  person: OnboardingPerson;
  program: OnboardingProgram;
  summary: ProgressSummary;
}

/**
 * Everybody the caller may see, with their progress. Two collection reads
 * (the allowlist and the programmes, both small) plus the team names.
 */
export async function listProgress(caller: OnboardingCaller): Promise<PersonProgress[]> {
  if (!caller.manages && caller.profile?.isSalesManager !== true) {
    throw new OnboardingError('You do not have permission to see other people’s onboarding.', 403);
  }
  const [people, programmes, teams] = await Promise.all([
    adminDb.collection(ALLOWED_USERS_COLLECTION).get(),
    col().get(),
    teamNames(),
  ]);
  const byEmail = new Map(programmes.docs.map((p) => [p.id, p.data() as Entry]));
  const today = officeToday();
  const out: PersonProgress[] = [];
  for (const doc of people.docs) {
    const d = doc.data() as Entry;
    const person = personFrom(doc.id, d, teams);
    if (person.suspended) continue;
    const v = viewerFor(caller, person);
    if (!(v.manages || v.leadsThem)) continue;
    const program = shaped(readProgram(person.email, byEmail.get(person.email), person.defaultTrack, entryStart(d, v)), v);
    // The list never carries answers, even for somebody allowed them: it is
    // drawn as a table, and answers belong on one person's page.
    out.push({ person, program: withoutAnswers(program), summary: summarize(CHECKLIST, program, today) });
  }
  return out.sort((a, b) => a.person.name.localeCompare(b.person.name));
}

export async function personProgress(caller: OnboardingCaller, rawEmail: string): Promise<PersonProgress & { viewer: OnboardingViewer }> {
  const email = normalizeEmail(rawEmail);
  const [entry, doc, teams] = await Promise.all([
    adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get(),
    col().doc(email).get(),
    teamNames(),
  ]);
  // Same answer for "nobody by that address" and "not yours to see", so the
  // route cannot be used to test whether an address is on the allowlist.
  if (!entry.exists) throw new OnboardingError('Nobody to show.', 404);
  const d = (entry.data() ?? {}) as Entry;
  const person = personFrom(email, d, teams);
  const viewer = viewerFor(caller, person);
  if (!maySee(viewer)) throw new OnboardingError('Nobody to show.', 404);
  const program = shaped(readProgram(email, doc.data(), person.defaultTrack, entryStart(d, viewer)), viewer);
  return { person, program, summary: summarize(CHECKLIST, program, officeToday()), viewer };
}

// ── Writing ──────────────────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();

/**
 * Tick or untick one step for one person. `set` with merge on dotted paths
 * would not work for a map key, so the step map is written with `update`,
 * after making sure the document exists.
 */
export async function setStep(
  caller: OnboardingCaller,
  rawEmail: string,
  stepId: string,
  done: boolean,
  note?: unknown,
): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const step = stepById(stepId);
  if (!step) throw new OnboardingError('That step does not exist.');

  const entry = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();
  if (!entry.exists && !(email === caller.email && isBootstrapAdmin(email))) {
    throw new OnboardingError('Nobody to show.', 404);
  }
  const d = (entry.data() ?? {}) as Entry;
  const viewer = viewerFor(caller, { email, uid: typeof d.uid === 'string' ? d.uid : null });
  if (!maySee(viewer)) throw new OnboardingError('Nobody to show.', 404);
  if (!mayTick(step, viewer)) {
    throw new OnboardingError(step.owner === 'you'
      ? 'Only the new hire, or somebody running onboarding, can tick this one.'
      : 'This step is ticked by the department that does it.', 403);
  }

  const ref = col().doc(email);
  const mark: StepMark = {
    at: nowIso(), byUid: caller.uid, byName: caller.name,
    ...(typeof note === 'string' && note.trim() ? { note: note.trim().slice(0, MAX_NOTE) } : {}),
  };
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const base = snap.exists ? {} : { email, createdAt: nowIso() };
    const done0 = (snap.data()?.done ?? {}) as Record<string, unknown>;
    const next = { ...done0 };
    if (done) next[stepId] = mark; else delete next[stepId];
    tx.set(ref, { ...base, done: next, updatedAt: nowIso() }, { merge: true });
  });
}

/** Finishing a guide, and the best quick-check score. Only ever your own. */
export async function markGuide(caller: OnboardingCaller, guideId: unknown, score: unknown, total: unknown): Promise<void> {
  if (!isGuideId(guideId)) throw new OnboardingError('That guide does not exist.');
  const ref = col().doc(caller.email);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const guides = { ...((snap.data()?.guides ?? {}) as Record<string, GuideMark>) };
    const prev = guides[guideId];
    const s = typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.round(score)) : undefined;
    const t = typeof total === 'number' && Number.isFinite(total) ? Math.max(0, Math.round(total)) : undefined;
    // Keep the best score: retaking the check to practise should never make
    // somebody look worse to the person running their onboarding.
    const keepPrev = prev && (s === undefined || (prev.score ?? -1) >= s);
    guides[guideId] = keepPrev ? prev : {
      at: prev?.at ?? nowIso(),
      ...(s !== undefined ? { score: s } : {}),
      ...(t !== undefined ? { total: t } : {}),
    };
    tx.set(ref, {
      ...(snap.exists ? {} : { email: caller.email, createdAt: nowIso() }),
      guides, updatedAt: nowIso(),
    }, { merge: true });
  });
}

/** Taking a guide back off the finished list — "I want to read it again". */
export async function unmarkGuide(caller: OnboardingCaller, guideId: unknown): Promise<void> {
  if (!isGuideId(guideId)) throw new OnboardingError('That guide does not exist.');
  const ref = col().doc(caller.email);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const guides = { ...((snap.data()?.guides ?? {}) as Record<string, GuideMark>) };
    delete guides[guideId];
    tx.set(ref, { guides, updatedAt: nowIso() }, { merge: true });
  });
}

/**
 * A survey, once. Answers are checked against the survey's own questions:
 * anything that is not one of its ids is dropped, ratings must be 1–5, and
 * text is capped.
 */
export async function submitSurvey(caller: OnboardingCaller, surveyId: unknown, raw: unknown): Promise<void> {
  const survey = typeof surveyId === 'string' ? surveyById(surveyId) : undefined;
  if (!survey) throw new OnboardingError('That survey does not exist.');
  if (!raw || typeof raw !== 'object') throw new OnboardingError('Answer at least one question.');
  const kinds = new Map(survey.sections.flatMap((s) => s.questions.map((q) => [q.id, q.kind] as const)));
  const answers: Record<string, number | string> = {};
  for (const id of surveyQuestionIds(survey)) {
    const v = (raw as Record<string, unknown>)[id];
    if (kinds.get(id) === 'rating') {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) answers[id] = v;
    } else if (typeof v === 'string' && v.trim()) {
      answers[id] = v.trim().slice(0, MAX_SURVEY_TEXT);
    }
  }
  if (Object.keys(answers).length === 0) throw new OnboardingError('Answer at least one question.');

  const ref = col().doc(caller.email);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const surveys = { ...((snap.data()?.surveys ?? {}) as Record<string, SurveyAnswers>) };
    if (surveys[survey.id]) throw new OnboardingError('You already sent this survey. Thank you!', 409);
    surveys[survey.id] = { submittedAt: nowIso(), answers };
    tx.set(ref, {
      ...(snap.exists ? {} : { email: caller.email, createdAt: nowIso() }),
      surveys, updatedAt: nowIso(),
    }, { merge: true });
  });
}

/** Track, start date and mentor. Only for somebody running onboarding. */
export async function setupProgram(caller: OnboardingCaller, rawEmail: string, body: Record<string, unknown>): Promise<void> {
  if (!caller.manages) throw new OnboardingError('Only somebody running onboarding can change this.', 403);
  const email = normalizeEmail(rawEmail);
  const entry = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();
  if (!entry.exists) throw new OnboardingError('Nobody to show.', 404);

  const patch: Record<string, unknown> = {};
  if ('track' in body) {
    if (!isOnboardingTrack(body.track)) throw new OnboardingError('Pick a track.');
    patch.track = body.track;
  }
  if ('startDate' in body) {
    if (body.startDate !== null && !isIsoDate(body.startDate)) throw new OnboardingError('Pick a start date.');
    patch.startDate = body.startDate;
  }
  if ('mentorName' in body) {
    if (body.mentorName !== null && typeof body.mentorName !== 'string') throw new OnboardingError('Type the mentor’s name.');
    const name = typeof body.mentorName === 'string' ? body.mentorName.trim().slice(0, MAX_MENTOR_NAME) : '';
    patch.mentorName = name || null;
  }
  if (Object.keys(patch).length === 0) throw new OnboardingError('Nothing to change.');

  const ref = col().doc(email);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    tx.set(ref, {
      ...(snap.exists ? {} : { email, createdAt: nowIso() }),
      ...patch,
      updatedAt: nowIso(),
      setupBy: { uid: caller.uid, name: caller.name, at: nowIso() },
    }, { merge: true });
  });
}
