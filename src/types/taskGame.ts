/**
 * Game mode for My tasks: XP, levels, a working-day streak, and daily and
 * weekly missions — the DankQuest rules, brought across for a freight desk.
 *
 * **It is the person's own and nobody else's.** The state lives on
 * `personalTasks/{uid}.game`, read and written only through /api/me/tasks
 * like the list itself, and nothing ranks, reports on or compares it. A
 * leaderboard would make a private notepad into a measure of work, which the
 * list deliberately is not — see src/types/task.ts.
 *
 * Off until the person turns it on. Turned off, the state is kept and nothing
 * moves: no penalties accrue while it is off, and turning it back on starts
 * counting from that day rather than charging for the gap.
 *
 * **Penalties are real, as in DankQuest:** an open task past its due date
 * costs XP each working day it is first seen overdue, a broken streak costs
 * XP, closing a task as Not done costs half its worth, reopening a finished
 * task takes back what it earned, and XP lost can
 * take a level with it. They are applied when the list is read, the same
 * "applied when read" shape as a mute or an order grant — there is no job.
 *
 * Everything here is pure: no Firestore, no clock except the dates passed in.
 * src/lib/taskGameServer.ts reads, calls these, and writes.
 */

import { holidaysInYear } from './holidays';
import { deadlineDay, type PersonalTask, type TaskPriority } from './task';

/* ------------------------------------------------------------------ levels */

export interface GameLevel {
  level: number;
  /** XP needed to reach it. */
  xp: number;
  /** A typographic mark, not an emoji — no emoji in UI chrome. */
  icon: string;
  /** 1–6: which colour the mark is drawn in. */
  tier: number;
}

/** DankQuest's thirty steps and marks. The names come from the person's theme. */
export const GAME_LEVELS: GameLevel[] = [
  { level: 1, xp: 0, icon: '◌', tier: 1 },
  { level: 2, xp: 300, icon: '○', tier: 1 },
  { level: 3, xp: 800, icon: '◎', tier: 1 },
  { level: 4, xp: 1600, icon: '◆', tier: 1 },
  { level: 5, xp: 2800, icon: '★', tier: 1 },
  { level: 6, xp: 4500, icon: '✦', tier: 2 },
  { level: 7, xp: 7000, icon: '✪', tier: 2 },
  { level: 8, xp: 10500, icon: '✸', tier: 2 },
  { level: 9, xp: 15000, icon: '♛', tier: 2 },
  { level: 10, xp: 21000, icon: '♕', tier: 2 },
  { level: 11, xp: 29000, icon: '♚', tier: 3 },
  { level: 12, xp: 39000, icon: '♔', tier: 3 },
  { level: 13, xp: 51000, icon: '❋', tier: 3 },
  { level: 14, xp: 65000, icon: '✱', tier: 3 },
  { level: 15, xp: 82000, icon: '✳', tier: 3 },
  { level: 16, xp: 100000, icon: '✴', tier: 4 },
  { level: 17, xp: 120000, icon: '✶', tier: 4 },
  { level: 18, xp: 142000, icon: '✤', tier: 4 },
  { level: 19, xp: 166000, icon: '✻', tier: 4 },
  { level: 20, xp: 192000, icon: '✽', tier: 4 },
  { level: 21, xp: 220000, icon: '∞', tier: 5 },
  { level: 22, xp: 250000, icon: '⊕', tier: 5 },
  { level: 23, xp: 282000, icon: 'Δ', tier: 5 },
  { level: 24, xp: 316000, icon: 'Ω', tier: 5 },
  { level: 25, xp: 352000, icon: 'Ψ', tier: 5 },
  { level: 26, xp: 390000, icon: 'Λ', tier: 6 },
  { level: 27, xp: 430000, icon: 'Φ', tier: 6 },
  { level: 28, xp: 472000, icon: 'Σ', tier: 6 },
  { level: 29, xp: 516000, icon: '∇', tier: 6 },
  { level: 30, xp: 562000, icon: '◈', tier: 6 },
];

/**
 * What the levels are called. Freight is the default because this is a
 * freight desk; the others are for anybody who would rather be a wizard.
 * A theme changes the words and nothing else — the XP for each level is the
 * same in all of them, so switching never moves anybody up or down.
 */
export const GAME_THEMES = {
  freight: {
    label: 'Freight brokerage',
    titles: [
      'Trainee', 'Rate Checker', 'Load Poster', 'Lane Scout', 'Cold Caller',
      'Quote Slinger', 'Junior Broker', 'Carrier Wrangler', 'Deal Closer', 'Lane Hunter',
      'Freight Broker', 'Senior Broker', 'Capacity Finder', 'Book Builder', 'Lane Master',
      'Account Executive', 'Logistics Strategist', 'Network Builder', 'Freight Ace', 'Top Producer',
      'Desk Captain', 'Brokerage Boss', 'Supply Chain Sage', 'Freight Tycoon', 'Logistics Titan',
      'Road Baron', 'Lane Legend', 'Freight Mogul', 'Coast-to-Coast Icon', 'Freight Hall of Famer',
    ],
  },
  wizarding: {
    label: 'Wizarding',
    titles: [
      'Curious Novice', 'Apprentice', 'Spell Student', 'Potion Brewer', 'Charm Caster',
      'Rune Reader', 'Hedge Mage', 'Enchanter', 'Illusionist', 'Conjurer',
      'Alchemist', 'Sorcerer', 'Spellbinder', 'Battle Mage', 'Elementalist',
      'Seer', 'Oracle', 'Warlock', 'High Wizard', 'Archmage',
      'Master of Runes', 'Keeper of the Tower', 'Grand Sorcerer', 'Chronomancer', 'Starcaller',
      'Sage of Ages', 'Arch-Sorcerer', 'Mage Lord', 'Wizard Eternal', 'Supreme Archmage',
    ],
  },
  empire: {
    label: 'Empires',
    titles: [
      'Peasant', 'Villager', 'Squire', 'Soldier', 'Knight',
      'Captain', 'Baron', 'Viscount', 'Count', 'Marquis',
      'Duke', 'Royal Heir', 'Governor', 'Consul', 'General',
      'Warlord', 'Chancellor', 'Viceroy', 'Archduke', 'Grand Duke',
      'Monarch', 'High Monarch', 'Conqueror', 'Imperator', 'Ruler of Empires',
      'Sovereign', 'Overlord', 'World Ruler', 'Dynasty Founder', 'Eternal Emperor',
    ],
  },
  fairy: {
    label: 'Fairy worlds',
    titles: [
      'Dewdrop', 'Sprout', 'Pixie', 'Sprite', 'Brownie',
      'Wisp', 'Moth Rider', 'Flower Keeper', 'Leaf Dancer', 'Glimmerwing',
      'Moonpetal', 'Brook Nymph', 'Wood Nymph', 'Dryad', 'Toadstool Warden',
      'Glade Guardian', 'Starlight Weaver', 'Fae Knight', 'Court Fae', 'Seelie Noble',
      'Wish Granter', 'Rainbow Keeper', 'Dream Weaver', 'Fae Enchanter', 'Fae Monarch',
      'Ruler of the Summer Court', 'Ruler of the Winter Court', 'Ancient Fae', 'Spirit of the Wild Wood', 'Eternal Fae',
    ],
  },
  space: {
    label: 'Outer space',
    titles: [
      'Cadet', 'Ensign', 'Pilot', 'Navigator', 'Engineer',
      'Lieutenant', 'Science Officer', 'Commander', 'Starship Captain', 'Squadron Leader',
      'Fleet Captain', 'Commodore', 'Star Ranger', 'Deep-Space Explorer', 'Rear Admiral',
      'Vice Admiral', 'Admiral', 'Fleet Admiral', 'Star Marshal', 'Galaxy Warden',
      'Nebula Walker', 'Star Forger', 'Planet Builder', 'Star System Ruler', 'Galactic Envoy',
      'Galactic Chancellor', 'Cosmic Voyager', 'Starborn', 'Cosmic Legend', 'Master of the Universe',
    ],
  },
  pirate: {
    label: 'Pirates',
    titles: [
      'Deckhand', 'Powder Monkey', 'Swabbie', 'Lookout', 'Rigger',
      'Gunner', 'Boatswain', 'Helmsman', 'Navigator', 'Quartermaster',
      'First Mate', 'Captain', 'Privateer', 'Corsair', 'Buccaneer',
      'Sea Raider', 'Commodore', 'Fleet Captain', 'Sea Wolf', 'Terror of the Seas',
      'Treasure Hunter', 'Admiral of the Black Flag', 'Scourge of the Seven Seas', 'Pirate Chief', 'Sea Legend',
      'Kraken Tamer', 'Storm Caller', 'Ghost Ship Captain', 'Keeper of the Lost Gold', 'Pirate Legend',
    ],
  },
} as const satisfies Record<string, { label: string; titles: readonly string[] }>;

export type GameTheme = keyof typeof GAME_THEMES;
export const DEFAULT_GAME_THEME: GameTheme = 'freight';

export function isGameTheme(v: unknown): v is GameTheme {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(GAME_THEMES, v);
}

export function levelTitle(level: number, theme: GameTheme): string {
  return GAME_THEMES[theme].titles[level - 1] ?? GAME_THEMES[theme].titles[29];
}

export function levelFor(xp: number): GameLevel {
  let out = GAME_LEVELS[0];
  for (const l of GAME_LEVELS) {
    if (xp >= l.xp) out = l;
    else break;
  }
  return out;
}

export function nextLevelAfter(xp: number): GameLevel | null {
  const cur = levelFor(xp);
  return GAME_LEVELS.find((l) => l.xp > cur.xp) ?? null;
}

/** 0–100: how far through the current level. */
export function levelProgress(xp: number): number {
  const cur = levelFor(xp);
  const next = nextLevelAfter(xp);
  if (!next) return 100;
  return Math.min(100, Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100));
}

/* --------------------------------------------------------------------- XP */

/** What a finished task is worth, by priority — a task's "difficulty" here. */
export const TASK_XP: Record<TaskPriority, number> = { low: 15, normal: 30, high: 60 };
/** On top, for finishing one of the suggested broker tasks. */
export const SUGGESTION_BONUS_XP = 15;
/** The first task finished on a day, for keeping the streak going. */
export const STREAK_DAY_XP = 50;
/**
 * One step of a task ticked off. Small on purpose: the task itself still pays
 * its full XP when it is finished, so a task cut into twenty steps is worth a
 * little more for the effort of planning it, not twenty times more.
 */
export const STEP_XP = 5;

/** DankQuest's late scale: three days late keeps 75%, a week 50%, after that 25%. */
export function lateShare(daysLate: number): number {
  if (daysLate <= 0) return 1;
  return daysLate <= 3 ? 0.75 : daysLate <= 7 ? 0.5 : 0.25;
}

/**
 * What finishing `task` on `today` is worth, before the streak's daily bonus
 * — the single definition. onTaskDone() pays it, and the cards show it as
 * "+30 XP" beforehand, so the number on a card is the number that lands.
 */
export function taskXp(
  task: Pick<PersonalTask, 'priority' | 'date' | 'suggestionId'> & Partial<Pick<PersonalTask, 'dueDate'>>,
  today: string,
): { xp: number; full: number; daysLate: number } {
  const full = TASK_XP[task.priority] + (task.suggestionId ? SUGGESTION_BONUS_XP : 0);
  // Late against the deadline, not the planned day: doing Tuesday's planned
  // work on Wednesday is not late when it is due Friday.
  const due = deadlineDay(task);
  const daysLate = due ? Math.max(0, daysBetween(due, today)) : 0;
  return { xp: daysLate > 0 ? Math.max(1, Math.round(full * lateShare(daysLate))) : full, full, daysLate };
}

/** Per open overdue task, each day it is first seen overdue: 5 XP a day late, capped at what it is worth. */
export function overduePenalty(priority: TaskPriority, daysOverdue: number): number {
  return Math.min(daysOverdue * 5, TASK_XP[priority]);
}

/**
 * A task closed as Not done: half what it was worth. Saying so is better
 * than leaving it to rot overdue — which costs up to its full worth, a day at
 * a time — so it costs less than that, but it is never free.
 */
export function notDonePenalty(priority: TaskPriority): number {
  return Math.round(TASK_XP[priority] / 2);
}

/** A broken streak: 25 XP a day of it, at most 300. */
export function streakPenalty(streak: number): number {
  return Math.min(streak * 25, 300);
}

/* ---------------------------------------------------------- working days */

/**
 * Days that count for the streak: Monday to Friday, less Guatemala's public
 * holidays, less the person's own time off. On any other day the streak is
 * frozen — finishing a task still counts, but not finishing one breaks
 * nothing, and no overdue penalty is charged.
 *
 * The holidays are the built-in list (src/types/holidays.ts), not HR's moved
 * ones — those live in Firestore, and reading them on every tick of a task is
 * not worth a streak that is a day out once a year.
 *
 * `offDays` is the person's time off, worked out by the server from their
 * time-off requests — see `offDaysFor()` in src/lib/taskGameServer.ts.
 */
const holidayCache = new Map<number, Set<string>>();

function gtHolidays(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(holidaysInYear(year).filter((h) => h.country === 'GT').map((h) => h.date));
    holidayCache.set(year, set);
  }
  return set;
}

function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

const NO_DAYS_OFF: ReadonlySet<string> = new Set();

export function isWorkingDay(date: string, offDays: ReadonlySet<string> = NO_DAYS_OFF): boolean {
  const dow = toDate(date).getUTCDay();
  return dow !== 0 && dow !== 6 && !gtHolidays(Number(date.slice(0, 4))).has(date) && !offDays.has(date);
}

/**
 * The last working day strictly before `date`. Looks back far enough to step
 * over the longest time-off request there can be (MAX_TIME_OFF_DAYS, 90) and
 * the weekends either side of it.
 */
export function prevWorkingDay(date: string, offDays: ReadonlySet<string> = NO_DAYS_OFF): string {
  let d = addDays(date, -1);
  for (let i = 0; i < 120 && !isWorkingDay(d, offDays); i++) d = addDays(d, -1);
  return d;
}

/** Monday of the week `date` falls in. */
export function weekStartOf(date: string): string {
  const dow = toDate(date).getUTCDay();
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/* --------------------------------------------------------------- missions */

export type MissionCounter = 'done' | 'high' | 'onTime' | 'added' | 'suggested' | 'activeDays';

export interface MissionDef {
  id: string;
  title: string;
  desc: string;
  target: number;
  counter: MissionCounter;
  xp: number;
}

export const DAILY_MISSIONS: MissionDef[] = [
  { id: 'd_done1',   title: 'First of the day', desc: 'Finish 1 task today',                      target: 1,  counter: 'done',      xp: 50 },
  { id: 'd_done3',   title: 'Momentum',         desc: 'Finish 3 tasks today',                     target: 3,  counter: 'done',      xp: 100 },
  { id: 'd_done5',   title: 'On a roll',        desc: 'Finish 5 tasks today',                     target: 5,  counter: 'done',      xp: 200 },
  { id: 'd_done10',  title: 'Clean desk',       desc: 'Finish 10 tasks today',                    target: 10, counter: 'done',      xp: 350 },
  { id: 'd_high1',   title: 'Big fish',         desc: 'Finish a high-priority task',              target: 1,  counter: 'high',      xp: 120 },
  { id: 'd_high2',   title: 'Heavy lifting',    desc: 'Finish 2 high-priority tasks',             target: 2,  counter: 'high',      xp: 220 },
  { id: 'd_ontime2', title: 'Right on time',    desc: 'Finish 2 tasks on or before their due date', target: 2, counter: 'onTime',   xp: 120 },
  { id: 'd_added2',  title: 'Planner',          desc: 'Add 2 new tasks',                          target: 2,  counter: 'added',     xp: 60 },
  { id: 'd_sugg1',   title: 'Hustle',           desc: 'Finish a suggested broker task',           target: 1,  counter: 'suggested', xp: 100 },
  { id: 'd_sugg3',   title: 'Prospector',       desc: 'Finish 3 suggested broker tasks',          target: 3,  counter: 'suggested', xp: 250 },
];

export const WEEKLY_MISSIONS: MissionDef[] = [
  { id: 'w_done10',   title: 'Busy week',       desc: 'Finish 10 tasks this week',                   target: 10, counter: 'done',       xp: 300 },
  { id: 'w_done25',   title: 'Workhorse',       desc: 'Finish 25 tasks this week',                   target: 25, counter: 'done',       xp: 600 },
  { id: 'w_done50',   title: 'Unstoppable',     desc: 'Finish 50 tasks this week',                   target: 50, counter: 'done',       xp: 1000 },
  { id: 'w_high3',    title: 'Closer',          desc: 'Finish 3 high-priority tasks this week',      target: 3,  counter: 'high',       xp: 400 },
  { id: 'w_high6',    title: 'Heavy hauler',    desc: 'Finish 6 high-priority tasks this week',      target: 6,  counter: 'high',       xp: 700 },
  { id: 'w_ontime5',  title: 'Punctual',        desc: 'Finish 5 tasks on or before their due date',  target: 5,  counter: 'onTime',     xp: 350 },
  { id: 'w_ontime10', title: 'Like clockwork',  desc: 'Finish 10 tasks on or before their due date', target: 10, counter: 'onTime',     xp: 600 },
  { id: 'w_added5',   title: 'Pipeline',        desc: 'Add 5 new tasks this week',                   target: 5,  counter: 'added',      xp: 200 },
  { id: 'w_sugg5',    title: 'Rainmaker',       desc: 'Finish 5 suggested broker tasks this week',   target: 5,  counter: 'suggested',  xp: 450 },
  { id: 'w_active3',  title: 'Steady',          desc: 'Finish a task on 3 working days this week',   target: 3,  counter: 'activeDays', xp: 300 },
  { id: 'w_active5',  title: 'Perfect week',    desc: 'Finish a task on all 5 weekdays',             target: 5,  counter: 'activeDays', xp: 750 },
];

const MISSION_BY_ID = new Map([...DAILY_MISSIONS, ...WEEKLY_MISSIONS].map((m) => [m.id, m]));

export function missionDef(id: string): MissionDef | null {
  return MISSION_BY_ID.get(id) ?? null;
}

/** Only the id and the count are stored, so changing a mission's wording reaches everybody's. */
export interface MissionProgress {
  id: string;
  progress: number;
  done: boolean;
}

export interface MissionSet {
  /** The day (daily) or the Monday (weekly) it belongs to. */
  key: string;
  missions: MissionProgress[];
  /** Every id handed out this period, so a finished mission is never dealt again. */
  used: string[];
  counts: Record<MissionCounter, number>;
  /** Weekly only: the working days a task was finished on. */
  activeDates: string[];
}

const ZERO_COUNTS: Record<MissionCounter, number> = {
  done: 0, high: 0, onTime: 0, added: 0, suggested: 0, activeDays: 0,
};

/* ----------------------------------------------------------------- state */

export interface GameLogEntry {
  at: string;
  label: string;
  xp: number;
}

export interface GameState {
  enabled: boolean;
  theme: GameTheme;
  xp: number;
  streak: number;
  longestStreak: number;
  /** Office date a task was last finished on. */
  lastActiveDate: string | null;
  /** Office date the day's penalties and new missions were last worked out. */
  lastCheckDate: string | null;
  daily: MissionSet | null;
  weekly: MissionSet | null;
  tasksDone: number;
  missionsDone: number;
  /** When each level was first reached. Kept through a level-down. */
  levelHistory: { level: number; at: string }[];
  /** The latest XP changes, newest last. */
  log: GameLogEntry[];
}

export const MAX_GAME_LOG = 60;

export type GameEvent =
  | { kind: 'xp'; amount: number; label: string }
  | { kind: 'level'; level: number; up: boolean }
  | { kind: 'mission'; title: string; weekly: boolean; xp: number };

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown) => (typeof v === 'string' ? v : null);

function cleanSet(raw: unknown): MissionSet | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const key = str(r.key);
  if (!key) return null;
  const counts = { ...ZERO_COUNTS };
  const rc = (r.counts && typeof r.counts === 'object' ? r.counts : {}) as Record<string, unknown>;
  for (const k of Object.keys(ZERO_COUNTS) as MissionCounter[]) counts[k] = num(rc[k]);
  return {
    key,
    missions: Array.isArray(r.missions)
      ? (r.missions as Record<string, unknown>[])
        .filter((m) => m && missionDef(String(m.id)))
        .map((m) => ({ id: String(m.id), progress: num(m.progress), done: m.done === true }))
      : [],
    used: Array.isArray(r.used) ? (r.used as unknown[]).filter((v): v is string => typeof v === 'string') : [],
    counts,
    activeDates: Array.isArray(r.activeDates)
      ? (r.activeDates as unknown[]).filter((v): v is string => typeof v === 'string')
      : [],
  };
}

/** The stored document, with every field defaulted. Absent means never turned on. */
export function cleanGameState(raw: unknown): GameState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    theme: isGameTheme(r.theme) ? r.theme : DEFAULT_GAME_THEME,
    xp: Math.max(0, num(r.xp)),
    streak: num(r.streak),
    longestStreak: num(r.longestStreak),
    lastActiveDate: str(r.lastActiveDate),
    lastCheckDate: str(r.lastCheckDate),
    daily: cleanSet(r.daily),
    weekly: cleanSet(r.weekly),
    tasksDone: num(r.tasksDone),
    missionsDone: num(r.missionsDone),
    levelHistory: Array.isArray(r.levelHistory)
      ? (r.levelHistory as Record<string, unknown>[])
        .filter((h) => h && typeof h.level === 'number')
        .map((h) => ({ level: h.level as number, at: String(h.at ?? '') }))
      : [],
    log: Array.isArray(r.log)
      ? (r.log as Record<string, unknown>[])
        .filter((e) => e && typeof e.label === 'string')
        .map((e) => ({ at: String(e.at ?? ''), label: e.label as string, xp: num(e.xp) }))
        .slice(-MAX_GAME_LOG)
      : [],
  };
}

/* ------------------------------------------------------------- the engine */

/**
 * One change to a person's game, worked on a copy. Call the `on…` methods,
 * then `finish()` for the new state and everything to tell the person —
 * including any level crossed, which is worked out once at the end so a
 * mission that tips somebody over shows one "Level up", not two.
 */
export class GameTurn {
  readonly state: GameState;
  readonly events: GameEvent[] = [];
  private readonly levelBefore: number;

  /**
   * `offDays` is the person's time off; leave it out only where the streak
   * cannot move (adding a task). Without it a vacation reads as missed days.
   */
  constructor(
    state: GameState,
    private readonly today: string,
    private readonly now: string,
    private readonly offDays: ReadonlySet<string> = NO_DAYS_OFF,
  ) {
    this.state = structuredClone(state);
    this.levelBefore = levelFor(state.xp).level;
  }

  /** `announce` false when another event already says it — a mission's own toast carries its XP. */
  private award(amount: number, label: string, announce = true) {
    if (amount === 0) return;
    const before = this.state.xp;
    this.state.xp = Math.max(0, before + amount);
    const real = this.state.xp - before;
    this.state.log = [...this.state.log, { at: this.now, label, xp: real }].slice(-MAX_GAME_LOG);
    if (announce) this.events.push({ kind: 'xp', amount: real, label });
  }

  private deal(pool: MissionDef[], set: MissionSet, n: number) {
    const open = pool.filter((m) => !set.used.includes(m.id));
    for (let i = 0; i < n && open.length > 0; i++) {
      const m = open.splice(Math.floor(Math.random() * open.length), 1)[0];
      set.used.push(m.id);
      set.missions.push({ id: m.id, progress: Math.min(m.target, set.counts[m.counter]), done: false });
    }
  }

  /** A new day's and a new week's missions, when the stored ones are for an earlier one. */
  private ensureSets() {
    const s = this.state;
    if (s.daily?.key !== this.today) {
      s.daily = { key: this.today, missions: [], used: [], counts: { ...ZERO_COUNTS }, activeDates: [] };
      this.deal(DAILY_MISSIONS, s.daily, 3);
    }
    const week = weekStartOf(this.today);
    if (s.weekly?.key !== week) {
      s.weekly = { key: week, missions: [], used: [], counts: { ...ZERO_COUNTS }, activeDates: [] };
      this.deal(WEEKLY_MISSIONS, s.weekly, 3);
    }
  }

  /**
   * Bring the counts up to date and pay out anything they finished. A paid
   * mission is replaced from the same pool, DankQuest-style, so there is
   * always something left to go for until the pool runs dry.
   */
  private settle(set: MissionSet, pool: MissionDef[], weekly: boolean) {
    for (let pass = 0; pass < pool.length; pass++) {
      let paid = 0;
      for (const m of set.missions) {
        const def = missionDef(m.id);
        if (!def || m.done) continue;
        m.progress = Math.min(def.target, set.counts[def.counter]);
        if (m.progress >= def.target) {
          m.done = true;
          paid++;
          this.state.missionsDone++;
          this.events.push({ kind: 'mission', title: def.title, weekly, xp: def.xp });
          this.award(def.xp, `${weekly ? 'Weekly' : 'Daily'} mission: ${def.title}`, false);
        }
      }
      if (paid === 0) return;
      this.deal(pool, set, paid);
    }
  }

  private bump(counter: MissionCounter, by = 1) {
    this.state.daily!.counts[counter] += by;
    this.state.weekly!.counts[counter] += by;
  }

  private settleAll() {
    this.settle(this.state.daily!, DAILY_MISSIONS, false);
    this.settle(this.state.weekly!, WEEKLY_MISSIONS, true);
  }

  /**
   * The first look of a day: a broken streak and overdue tasks are charged,
   * and the new missions dealt. Once per office day; a second call that day
   * does nothing.
   *
   * Nothing is charged on the first day after game mode is switched on, or
   * on a weekend, a holiday or a day the person has off — a page opened on a
   * day off is not a day late.
   */
  onNewDay(openTasks: (Pick<PersonalTask, 'kind' | 'status' | 'date' | 'priority'> & Partial<Pick<PersonalTask, 'dueDate'>>)[]) {
    const s = this.state;
    if (!s.enabled || s.lastCheckDate === this.today) return;
    const charge = s.lastCheckDate !== null && isWorkingDay(this.today, this.offDays);
    this.ensureSets();

    if (charge && s.streak > 0 && s.lastActiveDate && s.lastActiveDate < prevWorkingDay(this.today, this.offDays)) {
      const lost = s.streak;
      s.streak = 0;
      this.award(-streakPenalty(lost), `${lost}-day streak broken`);
    }

    if (charge) {
      let penalty = 0;
      let late = 0;
      for (const t of openTasks) {
        const due = deadlineDay(t);
        if (t.kind !== 'task' || t.status === 'done' || !due || due >= this.today) continue;
        penalty += overduePenalty(t.priority, daysBetween(due, this.today));
        late++;
      }
      if (penalty > 0) this.award(-penalty, `${late} overdue task${late === 1 ? '' : 's'}`);
    }

    s.lastCheckDate = this.today;
  }

  /**
   * A task went to Done. Returns the XP the task itself earned, which the
   * caller stores on the task so reopening it can take back exactly that.
   *
   * `firstTime` is false when it has been finished before and reopened:
   * the XP is paid again (it was taken back), but the mission counts are
   * not, or ticking one task on and off would finish every mission.
   */
  onTaskDone(
    task: Pick<PersonalTask, 'title' | 'priority' | 'date' | 'suggestionId'> & Partial<Pick<PersonalTask, 'dueDate'>>,
    firstTime: boolean,
  ): number {
    const s = this.state;
    if (!s.enabled) return 0;
    this.ensureSets();

    const { xp: earned, daysLate } = taskXp(task, this.today);
    const note = daysLate > 0 ? ` (${daysLate} day${daysLate === 1 ? '' : 's'} late)` : '';
    this.award(earned, `Finished "${task.title}"${note}`);

    this.markActive();

    if (firstTime) {
      s.tasksDone++;
      this.bump('done');
      if (task.priority === 'high') this.bump('high');
      if (deadlineDay(task) && daysLate <= 0) this.bump('onTime');
      if (task.suggestionId) this.bump('suggested');
      const week = this.state.weekly!;
      if (isWorkingDay(this.today, this.offDays) && !week.activeDates.includes(this.today)) {
        week.activeDates.push(this.today);
        week.counts.activeDays = week.activeDates.length;
      }
      this.settleAll();
    }
    return earned;
  }

  /**
   * Something was finished today: the first time on any day grows the streak
   * and pays its bonus. A finished task and a ticked step both count, so a
   * long task worked through a step a day keeps the streak alive.
   */
  private markActive() {
    const s = this.state;
    if (s.lastActiveDate === this.today) return;
    s.streak = s.lastActiveDate && s.lastActiveDate >= prevWorkingDay(this.today, this.offDays) ? s.streak + 1 : 1;
    s.longestStreak = Math.max(s.longestStreak, s.streak);
    s.lastActiveDate = this.today;
    this.award(STREAK_DAY_XP, `Streak: day ${s.streak}`);
  }

  /**
   * A step was ticked. Returns the XP it earned, which the caller stores on
   * the step so unticking takes back exactly that — the same shape as a task.
   * Steps count for no mission: missions are about finishing tasks, and a
   * step-count mission would reward cutting work into slivers.
   */
  onStepDone(title: string): number {
    if (!this.state.enabled) return 0;
    this.ensureSets();
    this.award(STEP_XP, `Step: "${title}"`);
    this.markActive();
    return STEP_XP;
  }

  onStepUndone(title: string, earned: number) {
    if (!this.state.enabled || earned <= 0) return;
    this.award(-earned, `Unticked "${title}"`);
  }

  /**
   * A task was closed as Not done. Returns what it cost, which the caller
   * stores on the task (`xpLost`) so changing its mind gives back exactly that.
   */
  onTaskNotDone(task: Pick<PersonalTask, 'title' | 'priority'>): number {
    if (!this.state.enabled) return 0;
    const lost = notDonePenalty(task.priority);
    this.award(-lost, `Not done: "${task.title}"`);
    return lost;
  }

  /** A task marked Not done was reopened or marked Done after all: its penalty is given back. */
  onNotDoneWithdrawn(title: string, lost: number) {
    if (!this.state.enabled || lost <= 0) return;
    this.award(lost, `No longer "not done": "${title}"`);
  }

  /** A finished task was reopened: what it earned is taken back. */
  onTaskReopened(title: string, earned: number) {
    if (!this.state.enabled || earned <= 0) return;
    this.award(-earned, `Reopened "${title}"`);
  }

  onTaskAdded() {
    if (!this.state.enabled) return;
    this.ensureSets();
    this.bump('added');
    this.settleAll();
  }

  finish(): { state: GameState; events: GameEvent[] } {
    const after = levelFor(this.state.xp).level;
    if (after > this.levelBefore) {
      for (let lv = this.levelBefore + 1; lv <= after; lv++) {
        if (!this.state.levelHistory.some((h) => h.level === lv)) {
          this.state.levelHistory.push({ level: lv, at: this.now });
        }
      }
      this.events.push({ kind: 'level', level: after, up: true });
    } else if (after < this.levelBefore) {
      this.events.push({ kind: 'level', level: after, up: false });
    }
    return { state: this.state, events: this.events };
  }
}
