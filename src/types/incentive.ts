/**
 * Incentives — a month's bonus programme and how far each person has got.
 *
 * Each month an admin or a Sales Manager writes down what can be won: a list of
 * **goals**, each paying a fixed amount when it is reached, and optionally one
 * **prize** that goes to whoever ranks first on a number (the TV for the best
 * sales percentage, in November 2026). Admins, HR and a Sales Manager for their
 * own team then record where everybody stands, and every broker sees a card per
 * goal saying what is done and what is left.
 *
 * ## What this is deliberately not
 *
 * - **Not fed from the orders.** The first programme ran on figures kept in a
 *   spreadsheet, and several goals ("15 quotes to new clients", "closed within
 *   24 hours of the quote") are about things TTMS does not record. A recorded
 *   number is what a person typed, with who and when beside it. If a goal is
 *   ever worked out from orders, it gets a new `kind` rather than quietly
 *   replacing typed values.
 * - **Not private.** Everybody signed in sees everybody's cards and amounts —
 *   the office asked for a public scoreboard (2026-11-20). That is the opposite
 *   choice from My tasks, which is a private notepad; the two must not be
 *   confused. Nothing here reads a task list, attendance or payroll.
 *
 * ## Storage
 *
 * `incentivePrograms/{YYYY-MM}` holds the programme; `progress/{uid}` under it
 * holds one person's marks; `events/{id}` under it is an append-only log of
 * every change to a mark or to the programme. The collection has no Firestore
 * rule, so the browser can neither read nor write it — everything goes through
 * /api/incentives. Keyed by uid rather than email, so a change of address
 * (src/lib/emailChange.ts) has nothing here to move.
 */

export const INCENTIVES_COLLECTION = 'incentivePrograms';

// ── Shapes ───────────────────────────────────────────────────────────────────

/**
 * How a goal is measured.
 *
 * - `count`   — a number of things: clients, quotes, loads.
 * - `percent` — a percentage, stored as a plain number (32 means 32%).
 * - `usd`     — dollars, e.g. a month's broker fee.
 * - `check`   — met or not, with nothing to count.
 */
export const GOAL_KINDS = ['count', 'percent', 'usd', 'check'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  count:   'A number to reach',
  percent: 'A percentage to reach',
  usd:     'A dollar amount to reach',
  check:   'Done or not done',
};

/**
 * `atLeast` is met on reaching the target; `above` only on passing it — "beat
 * your best month" is not met by equalling it.
 */
export type GoalCompare = 'atLeast' | 'above';

/** The currency the rewards are paid in. Not the currency a `usd` goal counts. */
export const INCENTIVE_CURRENCIES = ['GTQ', 'USD'] as const;
export type IncentiveCurrency = (typeof INCENTIVE_CURRENCIES)[number];

export interface IncentiveLink {
  label: string;
  url: string;
}

export interface IncentiveGoal {
  /** Stable for the month: marks are stored under it. */
  id: string;
  title: string;
  /** Optional Spanish, shown under the English with the Spanish switch on. */
  titleEs?: string;
  /** Paid when the goal is met, in the programme's currency. */
  reward: number;
  kind: GoalKind;
  compare: GoalCompare;
  /** The target for everybody, unless `perPerson` is set. Null for `check`. */
  target: number | null;
  /**
   * Each participant has their own target (`IncentiveParticipant.targets`),
   * e.g. 10% growth for some and 20% for the rest, or "your best month".
   * `target` is then the fallback for anybody without one.
   */
  perPerson: boolean;
  /** What the target means, when it is not obvious: "Your best month, June–October". */
  targetNote?: string;
  /** What the person has to do for it to count. Plain text, one step per line. */
  how: string;
  howEs?: string;
  links: IncentiveLink[];
}

/**
 * A prize that goes to whoever is first on a number, rather than to everybody
 * who reaches a target. It may not be money — November's was a TV — so it is
 * described, never added to anybody's total.
 */
export interface IncentivePrize {
  title: string;
  titleEs?: string;
  /** What is won: "A new TV, 43\" or larger (or something of equal value)". */
  description: string;
  kind: Exclude<GoalKind, 'check'>;
  how: string;
  howEs?: string;
  links: IncentiveLink[];
}

export interface IncentiveParticipant {
  uid: string;
  /** As it was when they were added, for a person later removed from TTMS. */
  name: string;
  /** Per-person targets for goals with `perPerson`, by goal id. */
  targets: Record<string, number>;
}

export interface IncentiveProgram {
  /** `YYYY-MM`, office time. */
  month: string;
  title: string;
  titleEs?: string;
  intro: string;
  introEs?: string;
  currency: IncentiveCurrency;
  goals: IncentiveGoal[];
  prize: IncentivePrize | null;
  participants: IncentiveParticipant[];
  updatedAt: string | null;
  updatedByName: string | null;
}

/** One person's standing on one goal. */
export interface GoalMark {
  /** For a measured goal. Null means "not recorded yet", which is not zero. */
  value: number | null;
  /** For a `check` goal. */
  done: boolean;
  /** Does not apply to this person this month. Pays nothing and is not counted as missed. */
  na: boolean;
  /** Which clients, which orders — what the recorder wants on the card. */
  note: string;
  at: string;
  byUid: string;
  byName: string;
}

export interface IncentiveProgress {
  uid: string;
  marks: Record<string, GoalMark>;
  /** The number the prize is ranked on. Null until recorded. */
  prizeValue: number | null;
  prizeNote: string;
}

/** Why the viewer may or may not change things, worked out on the server. */
export interface IncentiveAbilities {
  /** Set up the month: goals, prize, participants, targets. */
  manage: boolean;
  /** Record progress for everybody in the programme. */
  recordAll: boolean;
  /** Record progress for these people only (a Sales Manager's team). */
  recordUids: string[];
}

export interface IncentiveEvent {
  at: string;
  byUid: string;
  byName: string;
  /** `progress` for a mark, `program` for the set-up. */
  kind: 'progress' | 'program';
  uid?: string;
  goalId?: string;
  from?: unknown;
  to?: unknown;
}

// ── Limits ───────────────────────────────────────────────────────────────────

export const MAX_GOALS = 20;
export const MAX_PARTICIPANTS = 200;
export const MAX_TITLE = 160;
export const MAX_HOW = 2000;
export const MAX_NOTE = 1000;
export const MAX_LINKS = 5;

// ── Months ───────────────────────────────────────────────────────────────────

export function isMonthId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** `2026-11` from an office date such as `2026-11-20`. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "November 2026". Spelled out, so it reads the same under every date setting. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1] ?? ''} ${y}`;
}

// ── Reading a goal ───────────────────────────────────────────────────────────

/** The target this person is measured against, or null for a `check` goal. */
export function targetFor(goal: IncentiveGoal, participant: IncentiveParticipant | undefined): number | null {
  if (goal.kind === 'check') return null;
  if (goal.perPerson) {
    const own = participant?.targets?.[goal.id];
    if (typeof own === 'number' && Number.isFinite(own)) return own;
  }
  return goal.target;
}

export type GoalState = 'met' | 'partial' | 'none' | 'na' | 'unrecorded';

/**
 * Where this person stands on a goal. The single definition of "met" — the
 * cards, the totals, the scoreboard and the record grid all read it.
 */
export function goalState(goal: IncentiveGoal, target: number | null, mark: GoalMark | undefined): GoalState {
  if (mark?.na) return 'na';
  if (goal.kind === 'check') return mark?.done ? 'met' : mark ? 'none' : 'unrecorded';
  const value = mark?.value;
  if (value === null || value === undefined) return 'unrecorded';
  if (target === null) return 'none';
  const met = goal.compare === 'above' ? value > target : value >= target;
  if (met) return 'met';
  return value > 0 ? 'partial' : 'none';
}

/** How far along, 0 to 1, for a progress bar. */
export function goalRatio(goal: IncentiveGoal, target: number | null, mark: GoalMark | undefined): number {
  const state = goalState(goal, target, mark);
  if (state === 'met') return 1;
  if (goal.kind === 'check' || target === null || target <= 0) return 0;
  const value = mark?.value ?? 0;
  return Math.max(0, Math.min(0.99, value / target));
}

/** `3`, `32%`, `$6,670`. */
export function formatGoalValue(kind: GoalKind, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (kind === 'percent') return `${roundTo(value, 1)}%`;
  if (kind === 'usd') return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return roundTo(value, 1).toLocaleString('en-US');
}

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** `Q 200.00`, `$200.00`. */
export function formatReward(amount: number, currency: IncentiveCurrency): string {
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'GTQ' ? `Q ${n}` : `$${n}`;
}

/**
 * What is still needed, in one short line, for the card. Empty when met, not
 * applicable, or a `check` goal (whose "how" says it all).
 */
export function remainingText(goal: IncentiveGoal, target: number | null, mark: GoalMark | undefined): string {
  const state = goalState(goal, target, mark);
  if (state === 'met' || state === 'na' || goal.kind === 'check' || target === null) return '';
  const value = mark?.value ?? 0;
  if (goal.kind === 'usd') {
    return goal.compare === 'above'
      ? `More than ${formatGoalValue('usd', target)} needed — ${formatGoalValue('usd', Math.max(0, target - value))} to go`
      : `${formatGoalValue('usd', Math.max(0, target - value))} to go`;
  }
  if (goal.kind === 'percent') {
    const gap = Math.max(0, target - value);
    return goal.compare === 'above'
      ? `Above ${formatGoalValue('percent', target)} needed`
      : `${formatGoalValue('percent', gap).replace('%', '')} points to go`;
  }
  const gap = goal.compare === 'above' ? Math.max(1, Math.floor(target - value) + 1) : Math.max(0, Math.ceil(target - value));
  return `${gap} more to go`;
}

// ── A person's month ─────────────────────────────────────────────────────────

export interface PersonSummary {
  earned: number;
  /** Everything they could still win, i.e. every goal that applies to them. */
  possible: number;
  met: number;
  /** Goals that apply to them. */
  counted: number;
}

export function summarize(program: IncentiveProgram, participant: IncentiveParticipant, progress: IncentiveProgress | undefined): PersonSummary {
  let earned = 0, possible = 0, met = 0, counted = 0;
  for (const goal of program.goals) {
    const mark = progress?.marks[goal.id];
    const state = goalState(goal, targetFor(goal, participant), mark);
    if (state === 'na') continue;
    counted += 1;
    possible += goal.reward;
    if (state === 'met') { met += 1; earned += goal.reward; }
  }
  return { earned, possible, met, counted };
}

/** The most one person can earn from the goals: the "up to" on the banner. */
export function maxReward(program: IncentiveProgram): number {
  return program.goals.reduce((sum, g) => sum + g.reward, 0);
}

/**
 * The prize standings, highest first. People with nothing recorded are left
 * out rather than ranked last — "not recorded" is not a score. Ties share a
 * place, the same as RANK.EQ in the spreadsheet this replaced.
 */
export function prizeRanking(program: IncentiveProgram, progress: IncentiveProgress[]): { uid: string; value: number; place: number }[] {
  const byUid = new Map(progress.map((p) => [p.uid, p]));
  const rows = program.participants
    .map((p) => ({ uid: p.uid, value: byUid.get(p.uid)?.prizeValue ?? null }))
    .filter((r): r is { uid: string; value: number } => typeof r.value === 'number')
    .sort((a, b) => b.value - a.value);
  return rows.map((r) => ({ ...r, place: rows.findIndex((x) => x.value === r.value) + 1 }));
}

// ── Cleaning what arrives from the browser ───────────────────────────────────

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function optStr(v: unknown, max: number): string | undefined {
  const s = str(v, max);
  return s ? s : undefined;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Only http(s) links: a `javascript:` URL on a card everybody opens is a hole. */
export function isSafeUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

function cleanLinks(raw: unknown): IncentiveLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({ label: str((l as IncentiveLink)?.label, 120), url: str((l as IncentiveLink)?.url, 1000) }))
    .filter((l) => l.url && isSafeUrl(l.url))
    .map((l) => ({ label: l.label || l.url, url: l.url }))
    .slice(0, MAX_LINKS);
}

function isGoalKind(v: unknown): v is GoalKind {
  return typeof v === 'string' && (GOAL_KINDS as readonly string[]).includes(v);
}

export function newGoalId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function cleanGoal(raw: unknown): IncentiveGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const id = str(g.id, 40);
  const title = str(g.title, MAX_TITLE);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !title) return null;
  const kind = isGoalKind(g.kind) ? g.kind : 'count';
  const reward = Math.max(0, num(g.reward) ?? 0);
  return {
    id, title, titleEs: optStr(g.titleEs, MAX_TITLE),
    reward,
    kind,
    compare: g.compare === 'above' ? 'above' : 'atLeast',
    target: kind === 'check' ? null : num(g.target),
    perPerson: kind !== 'check' && g.perPerson === true,
    targetNote: optStr(g.targetNote, MAX_TITLE),
    how: str(g.how, MAX_HOW), howEs: optStr(g.howEs, MAX_HOW),
    links: cleanLinks(g.links),
  };
}

function cleanPrize(raw: unknown): IncentivePrize | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const title = str(p.title, MAX_TITLE);
  if (!title) return null;
  const kind = p.kind === 'count' || p.kind === 'usd' ? p.kind : 'percent';
  return {
    title, titleEs: optStr(p.titleEs, MAX_TITLE),
    description: str(p.description, MAX_TITLE),
    kind,
    how: str(p.how, MAX_HOW), howEs: optStr(p.howEs, MAX_HOW),
    links: cleanLinks(p.links),
  };
}

/**
 * A programme as the set-up screen sends it, cleaned. Returns the problem
 * instead when there is one worth telling the person about. Participant names
 * are not trusted from here — the server fills them in from the allowlist.
 */
export function cleanProgram(month: string, raw: unknown): { program: Omit<IncentiveProgram, 'updatedAt' | 'updatedByName'> } | { problem: string } {
  if (!raw || typeof raw !== 'object') return { problem: 'Nothing to save.' };
  const r = raw as Record<string, unknown>;
  const title = str(r.title, MAX_TITLE);
  if (!title) return { problem: 'Give the month a title.' };

  const rawGoals = Array.isArray(r.goals) ? r.goals : [];
  if (rawGoals.length > MAX_GOALS) return { problem: `A month can have up to ${MAX_GOALS} goals.` };
  const goals: IncentiveGoal[] = [];
  for (const g of rawGoals) {
    const clean = cleanGoal(g);
    if (!clean) return { problem: 'Every goal needs a name.' };
    if (goals.some((x) => x.id === clean.id)) return { problem: 'Two goals have the same id. Reload and try again.' };
    if (clean.kind !== 'check' && clean.target === null && !clean.perPerson) {
      return { problem: `“${clean.title}” needs a target.` };
    }
    goals.push(clean);
  }

  const rawPeople = Array.isArray(r.participants) ? r.participants : [];
  if (rawPeople.length > MAX_PARTICIPANTS) return { problem: `Up to ${MAX_PARTICIPANTS} people can take part.` };
  const participants: IncentiveParticipant[] = [];
  const goalIds = new Set(goals.filter((g) => g.perPerson).map((g) => g.id));
  for (const p of rawPeople) {
    const uid = str((p as IncentiveParticipant)?.uid, 128);
    if (!uid || participants.some((x) => x.uid === uid)) continue;
    const targets: Record<string, number> = {};
    const rawTargets = (p as IncentiveParticipant)?.targets;
    if (rawTargets && typeof rawTargets === 'object') {
      for (const [k, v] of Object.entries(rawTargets)) {
        const n = num(v);
        if (goalIds.has(k) && n !== null) targets[k] = n;
      }
    }
    participants.push({ uid, name: str((p as IncentiveParticipant)?.name, MAX_TITLE), targets });
  }

  return {
    program: {
      month,
      title, titleEs: optStr(r.titleEs, MAX_TITLE),
      intro: str(r.intro, MAX_HOW), introEs: optStr(r.introEs, MAX_HOW),
      currency: r.currency === 'USD' ? 'USD' : 'GTQ',
      goals,
      prize: cleanPrize(r.prize),
      participants,
    },
  };
}

/** A blank month, or one started from the month before with its marks left behind. */
export function emptyProgram(month: string, from?: IncentiveProgram | null): IncentiveProgram {
  return {
    month,
    title: from?.title ?? '',
    titleEs: from?.titleEs,
    intro: from?.intro ?? '',
    introEs: from?.introEs,
    currency: from?.currency ?? 'GTQ',
    // New ids, so nothing recorded against last month's goals reads across.
    goals: (from?.goals ?? []).map((g) => ({ ...g, id: newGoalId() })),
    prize: from?.prize ?? null,
    participants: (from?.participants ?? []).map((p) => ({ ...p, targets: {} })),
    updatedAt: null,
    updatedByName: null,
  };
}

/** Undefined keys removed, because Firestore refuses to store `undefined`. */
export function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
