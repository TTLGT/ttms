import type { PersonalTask } from './task';

/*
 * The Planner — My tasks and the Calendar as one page, with a Today tab in
 * front (the redesign agreed 2026-11-24). This file is the pure part: who has
 * it, what Today's 3 may hold, and which tasks are in the inbox. No Firestore,
 * no React, so the routes and the browser read the same rules.
 *
 * **It reaches people a few at a time.** My tasks and the Calendar keep
 * working exactly as they are until the Planner has proven itself; both read
 * and write the same tasks, so switching back and forth loses nothing. Who
 * has it is one company setting with four stages (`PlannerRollout`) plus each
 * person's own choice (`preferences.planner`), and `plannerAccess()` is the
 * one place the two are put together.
 *
 * Nothing here is access. The Planner shows the caller's own list through the
 * same /api/me/tasks routes the old pages use, so who has which page decides
 * what is drawn and never what can be read.
 */

// ── Rollout ──────────────────────────────────────────────────────────────────

/**
 * - `nobody`   — everyone keeps My tasks and the Calendar. The default.
 * - `chosen`   — the people listed have the Planner (and can go back to the
 *                old pages themselves); nobody else is offered it.
 * - `optIn`    — everybody is offered "Try the new Planner"; the people
 *                listed start on it.
 * - `everyone` — the switch disappears and the old links open the Planner.
 */
export type PlannerStage = 'nobody' | 'chosen' | 'optIn' | 'everyone';

export const PLANNER_STAGES: readonly PlannerStage[] = ['nobody', 'chosen', 'optIn', 'everyone'];

export function isPlannerStage(v: unknown): v is PlannerStage {
  return typeof v === 'string' && (PLANNER_STAGES as readonly string[]).includes(v);
}

export const PLANNER_STAGE_LABEL: Record<PlannerStage, string> = {
  nobody:   'Nobody yet',
  chosen:   'People I choose',
  optIn:    'Anyone who wants it',
  everyone: 'Everyone',
};

/** Stored as `appSettings/general.plannerRollout`. Emails, lower-cased, like the allowlist's keys. */
export interface PlannerRollout {
  stage: PlannerStage;
  chosenEmails: string[];
}

export const DEFAULT_PLANNER_ROLLOUT: PlannerRollout = { stage: 'nobody', chosenEmails: [] };

/** A pilot, not a department: past this the stage to pick is "Anyone who wants it". */
export const MAX_PLANNER_CHOSEN = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A stored or sent rollout, with anything unusable dropped rather than refused. */
export function readPlannerRollout(raw: unknown): PlannerRollout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const stage = isPlannerStage(r.stage) ? r.stage : DEFAULT_PLANNER_ROLLOUT.stage;
  const emails = Array.isArray(r.chosenEmails) ? r.chosenEmails : [];
  const chosenEmails = [...new Set(
    emails
      .filter((e): e is string => typeof e === 'string')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length <= 254 && EMAIL_RE.test(e)),
  )].slice(0, MAX_PLANNER_CHOSEN);
  return { stage, chosenEmails };
}

/** A person's own choice, on `users/{uid}.preferences.planner`. Absent means "whatever the stage gives". */
export type PlannerChoice = 'new' | 'old';

/** What the rollout means for one person, as the routes answer it to the browser. */
export interface PlannerAccess {
  stage: PlannerStage;
  /** Whether this person is named in the rollout. Their own entry only — never the list. */
  chosen: boolean;
}

export interface PlannerState {
  /** Whether they get the Planner rather than My tasks and the Calendar. */
  on: boolean;
  /** Whether "Try the new Planner" / "Back to the old pages" are offered at all. */
  canSwitch: boolean;
}

/**
 * The whole rule. Kept in one function because three places ask it — the
 * sidebar, the old pages' banner and redirect, and the Planner's own header —
 * and a person who saw the Planner in the menu but was sent back off it by
 * the page would be the result of two copies drifting.
 */
export function plannerState(access: PlannerAccess | null, choice: PlannerChoice | null | undefined): PlannerState {
  if (!access) return { on: false, canSwitch: false };
  switch (access.stage) {
    case 'nobody':
      return { on: false, canSwitch: false };
    case 'chosen':
      // On by default for the people chosen, and they can go back themselves.
      return access.chosen ? { on: choice !== 'old', canSwitch: true } : { on: false, canSwitch: false };
    case 'optIn':
      return { on: choice === 'new' || (access.chosen && choice !== 'old'), canSwitch: true };
    case 'everyone':
      return { on: true, canSwitch: false };
  }
}

// ── Tours ────────────────────────────────────────────────────────────────────

/**
 * The on-screen tours, one per tab. The number is the tour's version: a tour
 * comes back only when its content changes, which is a bump here. Stored per
 * person as `preferences.toursSeen.<id>`, so it follows the account rather
 * than the browser.
 */
// today: 2 since 2026-11-25 (the Today's targets step), so people who saw version 1 are shown it again.
// leads: the Clients → My leads board (step 4b), not a Planner tab, but the same tour and the same record.
// tasks: the Tasks tab (step 5, 2026-11-25).
export const PLANNER_TOURS = { today: 2, popup: 1, leads: 1, tasks: 1 } as const;
export type PlannerTourId = keyof typeof PLANNER_TOURS;

export function isPlannerTourId(v: unknown): v is PlannerTourId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PLANNER_TOURS, v);
}

/** The checklist step finishing a tour ticks. A new id — never reuse an old one. */
export const PLANNER_TOUR_STEP_ID = 'd2-planner-tour';

/** The step finishing the My leads tour ticks (2026-11-25). Same rule. */
export const LEADS_TOUR_STEP_ID = 'w2-leads-tour';

/**
 * Which checklist step finishing each tour ticks. The pop-up's ticks nothing:
 * "Take the Planner tour" is the Today tab's.
 */
export const TOUR_TICKS: Record<PlannerTourId, string | null> = {
  today: PLANNER_TOUR_STEP_ID,
  popup: null,
  leads: LEADS_TOUR_STEP_ID,
  // The Tasks tab's tour ticks nothing of its own: "Take the Planner tour" is the Today tab's.
  tasks: null,
};

// ── Today's 3 ────────────────────────────────────────────────────────────────

/**
 * The three things that matter most today, picked by the person. Stored on
 * the list's parent document as `todayPicks: { date, ids }`; a pick from an
 * earlier day reads as none, so nobody has to clear yesterday's.
 *
 * A pointer at tasks, never a copy, and only ever the person's own: the route
 * checks each id against their own list before saving.
 */
export const MAX_TODAY_PICKS = 3;

export interface TodayPicks {
  date: string;
  ids: string[];
}

/** A stored pick, or null when there is none worth reading. */
export function readTodayPicks(raw: unknown): TodayPicks | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r || typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Array.isArray(r.ids)) return null;
  const ids = r.ids.filter((v): v is string => typeof v === 'string').slice(0, MAX_TODAY_PICKS);
  return { date: r.date, ids };
}

/** Can this item go in Today's 3? Open tasks only — an event already has its time, and a finished task is done. */
export function canPickForToday(t: Pick<PersonalTask, 'kind' | 'status' | 'archived' | 'invitedBy'>): boolean {
  return t.kind === 'task' && t.status !== 'done' && !t.archived && !t.invitedBy;
}

/**
 * Today's 3 as it stands for the list on screen: in the order picked, with
 * anything finished kept (so it shows ticked off) and anything deleted gone.
 */
export function picksIn(tasks: PersonalTask[], picks: TodayPicks | null, today: string): PersonalTask[] {
  if (!picks || picks.date !== today) return [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return picks.ids.map((id) => byId.get(id)).filter((t): t is PersonalTask => !!t && t.kind === 'task' && !t.archived);
}

/**
 * The inbox: open tasks with no day — no planned date and no deadline. What
 * somebody jotted down and never placed, which is where things go missing.
 */
export function inboxTasks(tasks: PersonalTask[]): PersonalTask[] {
  return tasks.filter((t) => t.kind === 'task' && t.status !== 'done' && !t.archived && !t.date && !t.dueDate);
}

/** Open tasks that belong to today: planned for it, due on it, or overdue. */
export function tasksForToday(tasks: PersonalTask[], today: string): PersonalTask[] {
  return tasks.filter((t) => {
    if (t.kind !== 'task' || t.status === 'done' || t.archived) return false;
    const day = t.date && t.dueDate ? (t.date < t.dueDate ? t.date : t.dueDate) : (t.date ?? t.dueDate);
    return !!day && day <= today;
  });
}
