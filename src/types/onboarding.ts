/**
 * My onboarding: the 90-day programme every new person at TTL goes through,
 * and the learning library that sits beside it.
 *
 * ## The shape of it
 *
 * - A **track** is which programme somebody follows — the job they were hired
 *   into. Broker and Sales Manager are written out today. Intern, Dispatch,
 *   Finance, HR and Admin Assistant exist as tracks already so a person can be
 *   put on one, and so their department's steps can be written in later
 *   without a migration; until then they get the company-wide steps only, and
 *   the page says so.
 * - A **stage** is one of the four parts of the programme HR designed:
 *   pre-onboarding (interview to first day), training week, joining the floor
 *   (weeks 2–4), and months 2 and 3.
 * - A **step** is one line of the chronological checklist (catalogue in
 *   src/lib/onboarding/checklist.ts). Every step names the department that
 *   does it. The new hire ticks their own; everyone else's is ticked by the
 *   people running onboarding — see `mayTick()`.
 *
 * ## Where it is kept, and who reads it
 *
 * One document per person, `onboardingPrograms/{email}`, keyed by the
 * lowercased address for the reason attendance is: HR starts a programme
 * before the first day, when the person has an allowlist entry and no uid.
 * That makes it one of the things src/lib/emailChange.ts moves.
 *
 * Closed to the browser — there is no rule for the collection, so Firestore
 * refuses every client read and write — and read only through
 * /api/onboarding/*, which applies `canSeePerson()`-shaped visibility:
 * yourself; `onboarding.manage` (admin, HR, and the trainer if granted it);
 * and a Sales Manager their own team through `managedUids`/`managedEmails`.
 *
 * **Survey answers are narrower than progress.** They are candid feedback on
 * the interview, the trainer and the team, so a Sales Manager who sees a
 * report's progress does not see what that report said about them. Only
 * `onboarding.manage` reads them, and the route strips them for anybody else.
 *
 * Pure — no Firestore here, so the browser and the routes share one
 * definition of what "done" and "on track" mean.
 */

export const ONBOARDING_COLLECTION = 'onboardingPrograms';

/** Text the guide shows in English, with the Spanish line under it when the switch is on. */
export interface Bilingual {
  en: string;
  es: string;
}

// ── Tracks ───────────────────────────────────────────────────────────────────

export const ONBOARDING_TRACKS = [
  'broker', 'salesManager', 'intern', 'dispatch', 'finance', 'hr', 'adminAssistant',
] as const;
export type OnboardingTrack = (typeof ONBOARDING_TRACKS)[number];

export function isOnboardingTrack(v: unknown): v is OnboardingTrack {
  return typeof v === 'string' && (ONBOARDING_TRACKS as readonly string[]).includes(v);
}

export const TRACK_LABEL: Record<OnboardingTrack, Bilingual> = {
  broker:         { en: 'Freight Broker',  es: 'Bróker de carga' },
  salesManager:   { en: 'Sales Manager',   es: 'Gerente de ventas' },
  intern:         { en: 'Intern',          es: 'Practicante' },
  dispatch:       { en: 'Dispatch',        es: 'Despacho' },
  finance:        { en: 'Finance',         es: 'Finanzas' },
  hr:             { en: 'HR',              es: 'RR. HH.' },
  adminAssistant: { en: 'Admin Assistant', es: 'Asistente administrativo' },
};

/**
 * Tracks whose own department steps and playbook are written. The rest still
 * get the company-wide programme and a note that theirs is on its way —
 * better than a person on the Finance track seeing a broker's cold-calling
 * targets as if they were theirs.
 */
export const TRACKS_WRITTEN: readonly OnboardingTrack[] = ['broker', 'salesManager'];

/**
 * The track somebody starts on when nobody has chosen one, from the roles on
 * their allowlist entry. A Sales Manager is a broker too, so their track is
 * the manager one, which includes every broker step.
 */
export function defaultTrack(roles: {
  isSalesManager?: boolean; isIntern?: boolean; isDispatcher?: boolean;
  isFinance?: boolean; isHr?: boolean;
} | null | undefined): OnboardingTrack {
  if (roles?.isSalesManager) return 'salesManager';
  if (roles?.isIntern) return 'intern';
  if (roles?.isDispatcher) return 'dispatch';
  if (roles?.isFinance) return 'finance';
  if (roles?.isHr) return 'hr';
  return 'broker';
}

// ── Stages ───────────────────────────────────────────────────────────────────

export const ONBOARDING_STAGES = ['pre', 'training', 'floor', 'growth'] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export interface StageInfo {
  title: Bilingual;
  when: Bilingual;
  goal: Bilingual;
  /** Days from the first day of training: the stage covers [from, to). */
  from: number;
  to: number;
}

export const STAGE_INFO: Record<OnboardingStage, StageInfo> = {
  pre: {
    title: { en: 'Before you start', es: 'Antes de empezar' },
    when:  { en: 'From the interview to your first day', es: 'Desde la entrevista hasta tu primer día' },
    goal:  { en: 'Everything ready for you before you walk in: your email, your accounts, your computer and a first look at TTL.', es: 'Todo listo antes de que llegues: tu correo, tus cuentas, tu computadora y un primer vistazo a TTL.' },
    from: -30, to: 0,
  },
  training: {
    title: { en: 'Training week', es: 'Semana de training' },
    when:  { en: 'Week 1', es: 'Semana 1' },
    goal:  { en: 'Learn the company, the tools and the job — half theory, half practice beside experienced brokers.', es: 'Conocer la empresa, las herramientas y el puesto: mitad teoría, mitad práctica junto a brokers con experiencia.' },
    from: 0, to: 7,
  },
  floor: {
    title: { en: 'On the floor', es: 'Incorporación al piso' },
    when:  { en: 'Weeks 2 to 4', es: 'Semanas 2 a 4' },
    goal:  { en: 'Do the real work with an experienced broker beside you, and tell us how it is going.', es: 'Hacer el trabajo real con un broker experimentado a tu lado, y contarnos cómo te va.' },
    from: 7, to: 30,
  },
  growth: {
    title: { en: 'Growing on your own', es: 'Acompañamiento y desarrollo' },
    when:  { en: 'Months 2 and 3', es: 'Meses 2 y 3' },
    goal:  { en: 'Need less help each week, reach your first targets, and finish with your 90-day review.', es: 'Necesitar menos ayuda cada semana, alcanzar tus primeras metas y terminar con tu evaluación de 90 días.' },
    from: 30, to: 91,
  },
};

/** Office-calendar days between two YYYY-MM-DD dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const pb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((pb - pa) / 86_400_000);
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Which stage somebody is in today, from their first day of training.
 * No start date means HR has not set one, which is still "before you start".
 * Past day 90 the programme is over and the last stage is the answer.
 */
export function currentStage(startDate: string | null, today: string): OnboardingStage {
  if (!startDate) return 'pre';
  const d = daysBetween(startDate, today);
  if (d < 0) return 'pre';
  if (d < 7) return 'training';
  if (d < 30) return 'floor';
  return 'growth';
}

/** "Day 12 of 90", or null before the first day. */
export function programmeDay(startDate: string | null, today: string): number | null {
  if (!startDate) return null;
  const d = daysBetween(startDate, today);
  return d < 0 ? null : d + 1;
}

// ── Departments ──────────────────────────────────────────────────────────────

/**
 * Who does a step. `you` is the new hire. The rest are the people HR's plan
 * names; "mentor" is the experienced broker the new hire is paired with, who
 * is not a role in TTMS, so their steps are ticked by whoever runs onboarding.
 */
export const DEPARTMENTS = [
  'you', 'hr', 'training', 'mentor', 'manager', 'dispatch', 'admin', 'leadership', 'it',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABEL: Record<Department, Bilingual> = {
  you:        { en: 'You',                    es: 'Tú' },
  hr:         { en: 'HR',                     es: 'RR. HH.' },
  training:   { en: 'Trainer',                es: 'Trainer' },
  mentor:     { en: 'Experienced broker',     es: 'Broker experimentado' },
  manager:    { en: 'Your team lead',         es: 'Tu líder de equipo' },
  dispatch:   { en: 'Dispatch',               es: 'Despacho' },
  admin:      { en: 'Admin Assistant',        es: 'Asistente administrativo' },
  leadership: { en: 'Management',             es: 'Gerencia' },
  it:         { en: 'IT',                     es: 'TI' },
};

/** Tailwind classes for each department's badge. Families mapped for dark mode. */
export const DEPARTMENT_TONE: Record<Department, string> = {
  you:        'bg-brand-50 text-brand-700 border-brand-200',
  hr:         'bg-pink-50 text-pink-700 border-pink-200',
  training:   'bg-amber-50 text-amber-800 border-amber-200',
  mentor:     'bg-green-50 text-green-700 border-green-200',
  manager:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  dispatch:   'bg-cyan-50 text-cyan-700 border-cyan-200',
  admin:      'bg-purple-50 text-purple-700 border-purple-200',
  leadership: 'bg-gray-100 text-gray-700 border-gray-300',
  it:         'bg-blue-50 text-blue-700 border-blue-200',
};

// ── Steps ────────────────────────────────────────────────────────────────────

export interface ChecklistStep {
  /** Stable id. Stored as a key of `done`; renaming one un-ticks it for everybody. */
  id: string;
  stage: OnboardingStage;
  /** Short label for when in the stage: "Interview", "Day 1", "Week 2", "Day 90". */
  when: Bilingual;
  /** Sort order inside the stage. */
  order: number;
  owner: Department;
  title: Bilingual;
  detail?: Bilingual;
  /** `all`, or only these tracks. */
  tracks: 'all' | readonly OnboardingTrack[];
  /**
   * A guide in the Learn library that teaches this step. When set, finishing
   * that guide ticks the step — the new hire does not have to tick it twice.
   */
  guide?: string;
  /** A survey on the Surveys tab; submitting it ticks the step. */
  survey?: string;
  /** A page in TTMS the step is done on. */
  href?: string;
}

export function stepAppliesTo(step: ChecklistStep, track: OnboardingTrack): boolean {
  return step.tracks === 'all' || step.tracks.includes(track);
}

// ── The stored programme ─────────────────────────────────────────────────────

export interface StepMark {
  at: string;          // ISO
  byUid: string;
  byName: string;
  note?: string;
}

export interface GuideMark {
  at: string;          // ISO
  /** Best quick-check score, when the guide has one. */
  score?: number;
  total?: number;
}

export interface SurveyAnswers {
  submittedAt: string; // ISO
  /** Question id → 1–5 rating or written answer. */
  answers: Record<string, number | string>;
}

export interface OnboardingProgram {
  email: string;
  track: OnboardingTrack;
  /** First day of training, YYYY-MM-DD, office time. Null until HR sets it. */
  startDate: string | null;
  /** The experienced broker the new hire is paired with, by name. Free text. */
  mentorName: string | null;
  done: Record<string, StepMark>;
  guides: Record<string, GuideMark>;
  /** Only present for callers allowed to read answers — see the file header. */
  surveys?: Record<string, SurveyAnswers>;
  /** Survey ids submitted, which everybody who sees the programme may know. */
  surveysSubmitted: string[];
  /** Whether a document exists, or this is the default for somebody never set up. */
  stored: boolean;
  updatedAt: string | null;
}

export const MAX_NOTE = 300;
export const MAX_MENTOR_NAME = 80;
export const MAX_SURVEY_TEXT = 2000;

/** A programme for somebody nothing has been stored for yet. */
export function emptyProgram(email: string, track: OnboardingTrack, startDate: string | null): OnboardingProgram {
  return {
    email, track, startDate, mentorName: null,
    done: {}, guides: {}, surveysSubmitted: [], stored: false, updatedAt: null,
  };
}

/** Is a step complete — ticked, or completed by the guide or survey it points at. */
export function stepDone(step: ChecklistStep, p: Pick<OnboardingProgram, 'done' | 'guides' | 'surveysSubmitted'>): boolean {
  if (p.done[step.id]) return true;
  if (step.guide && p.guides[step.guide]) return true;
  if (step.survey && p.surveysSubmitted.includes(step.survey)) return true;
  return false;
}

export interface ProgressSummary {
  done: number;
  total: number;
  /** 0–100. */
  percent: number;
  /** Steps from stages that should be finished by today and are not. */
  behind: number;
  stage: OnboardingStage;
  day: number | null;
}

/**
 * How far along somebody is. `behind` counts only steps from stages already
 * over: something in this week is not late yet, and calling it late would
 * make every new hire look behind on their first morning.
 */
export function summarize(
  steps: readonly ChecklistStep[],
  p: OnboardingProgram,
  today: string,
): ProgressSummary {
  const mine = steps.filter((s) => stepAppliesTo(s, p.track));
  const done = mine.filter((s) => stepDone(s, p)).length;
  const stage = currentStage(p.startDate, today);
  const stageIdx = ONBOARDING_STAGES.indexOf(stage);
  const over = p.startDate && daysBetween(p.startDate, today) >= 91 ? ONBOARDING_STAGES.length : stageIdx;
  const behind = mine.filter((s) => ONBOARDING_STAGES.indexOf(s.stage) < over && !stepDone(s, p)).length;
  return {
    done, total: mine.length,
    percent: mine.length ? Math.round((done / mine.length) * 100) : 0,
    behind, stage, day: programmeDay(p.startDate, today),
  };
}

// ── Who may tick what ────────────────────────────────────────────────────────

export interface OnboardingViewer {
  /** The viewer is the person the programme belongs to. */
  self: boolean;
  /** `onboarding.manage`: runs onboarding for everybody. */
  manages: boolean;
  /** A Sales Manager looking at somebody on their own team. */
  leadsThem: boolean;
}

/**
 * The new hire ticks their own steps; the people running onboarding tick any;
 * a Sales Manager ticks the team-lead and mentor steps for their own team,
 * because those are the conversations they are the ones having.
 *
 * Nobody but the new hire ticks a `you` step on their behalf except someone
 * who runs onboarding — a trainer clearing up after a person who forgot is
 * normal; a team lead doing it is reporting progress that did not happen.
 */
export function mayTick(step: ChecklistStep, v: OnboardingViewer): boolean {
  if (v.manages) return true;
  if (step.owner === 'you') return v.self;
  if (v.leadsThem) return step.owner === 'manager' || step.owner === 'mentor';
  return false;
}

/** The visible half of a programme for a viewer who may not read survey answers. */
export function withoutAnswers(p: OnboardingProgram): OnboardingProgram {
  const { surveys: _omit, ...rest } = p;
  void _omit;
  return rest;
}
