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
 * **Two sets of rules (2026-11-25, step 7 of the Planner redesign).**
 *
 * - **Gentle**, the default: nothing is ever charged. No XP for an overdue
 *   task, a broken streak or a task closed as Not done, and XP never falls
 *   below the start of the level the person is on — taking back what a
 *   reopened task or an unticked step earned stops there. A broken streak
 *   can be saved by a **streak shield**, earned every SHIELD_EVERY streak days.
 * - **Hard**, chosen on purpose: the DankQuest rules as they always were. An
 *   open task past its due date costs XP each working day it is first seen
 *   overdue, a broken streak costs XP, Not done costs half a task's worth,
 *   and XP lost can take a level with it. No shields. It earns no extra XP —
 *   only its own badges, for unbroken runs (HARD_BADGES).
 *
 * **Switching is fair** (decided 2026-11-24). Gentle ↔ off is immediate.
 * Anything into or out of Hard — including turning the game off while in
 * Hard — takes effect the next working day (`pendingChange`), so a day is
 * never half one and half the other, and nobody can drop out of Hard to dodge
 * the evening's charges. `rulesHistory` is dated: each day is charged by the
 * rules it was played under, so what Hard owes is settled before it is left.
 * Leaving Hard ends the run (badges earned are kept) and Hard can be chosen
 * again only after HARD_COOLDOWN_DAYS.
 *
 * Penalties are applied when the list is read, the same "applied when read"
 * shape as a mute or an order grant — there is no job.
 *
 * Everything here is pure: no Firestore, no clock except the dates passed in.
 * src/lib/taskGameServer.ts reads, calls these, and writes.
 */

import { holidaysInYear } from './holidays';
import { deadlineDay, type PersonalTask, type TaskDifficulty } from './task';

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

/**
 * The level that unlocks the theme's extra on the Today scene — a reefer
 * trailer, a golden broom, black sails (SCENE_THEMES in gameSceneArt.ts).
 * Worked out from the levels reached, never stored: `levelHistory` is kept
 * through a level-down, so an unlock once earned is never taken away, even
 * under Hard.
 */
export const UNLOCK_LEVEL = 5;

export function hasUnlock(state: Pick<GameState, 'xp' | 'levelHistory'>): boolean {
  return levelFor(state.xp).level >= UNLOCK_LEVEL || state.levelHistory.some((h) => h.level >= UNLOCK_LEVEL);
}

/* --------------------------------------------------------------------- XP */

/**
 * What a finished task is worth, by its difficulty — and only by that.
 * Priority used to set it and no longer touches XP at all: urgency is not
 * effort. Penalties below scale from the same table.
 */
export const TASK_XP: Record<TaskDifficulty, number> = {
  trivial: 5, easy: 15, medium: 30, hard: 60, veryHard: 90, epic: 120,
};

/** What the "hard task" missions count: Hard and everything above it. */
export function isHardTask(difficulty: TaskDifficulty): boolean {
  return difficulty === 'hard' || difficulty === 'veryHard' || difficulty === 'epic';
}
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

/*
 * XP for the day around the tasks (step 7 of the Planner redesign,
 * 2026-11-25): planning it, closing it, and a seller's calls, emails and
 * referrals. Each is paid by the server in the same write as the thing that
 * earned it — the pop-up's answer, a tap — and recorded on `day`, so it is
 * paid once a day however many tabs answer. The same under Gentle and Hard:
 * Hard pays nothing extra.
 */

/**
 * Planning the day, once: "Just one thing" a little, the suggested 3 more,
 * the whole-day plan most. Planning more later the same day pays the
 * difference, never the whole amount again.
 */
export const PLAN_XP = { one: 15, planned: 40, full: 60 } as const;
export type PlanKind = keyof typeof PLAN_XP;
/** Closing the day in the pop-up, once. "Not today" pays nothing. */
export const CLOSE_DAY_XP = 30;
/**
 * Each tapped call, email or referral. Capped per day because they are
 * self-reported: past TAP_XP_CAP the taps still count on the targets but
 * stop paying, so the button is never worth more than the work.
 */
export const TAP_XP = 2;
export const TAP_XP_CAP = 40;
/** Every one of the day's targets met, once a day. */
export const ALL_TARGETS_XP = 100;

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
  task: Pick<PersonalTask, 'difficulty' | 'date' | 'suggestionId'> & Partial<Pick<PersonalTask, 'dueDate'>>,
  today: string,
): { xp: number; full: number; daysLate: number } {
  const full = TASK_XP[task.difficulty] + (task.suggestionId ? SUGGESTION_BONUS_XP : 0);
  // Late against the deadline, not the planned day: doing Tuesday's planned
  // work on Wednesday is not late when it is due Friday.
  const due = deadlineDay(task);
  const daysLate = due ? Math.max(0, daysBetween(due, today)) : 0;
  return { xp: daysLate > 0 ? Math.max(1, Math.round(full * lateShare(daysLate))) : full, full, daysLate };
}

/** Per open overdue task, each day it is first seen overdue: 5 XP a day late, capped at what it is worth. */
export function overduePenalty(difficulty: TaskDifficulty, daysOverdue: number): number {
  return Math.min(daysOverdue * 5, TASK_XP[difficulty]);
}

/**
 * A task closed as Not done: half what it was worth. Saying so is better
 * than leaving it to rot overdue — which costs up to its full worth, a day at
 * a time — so it costs less than that, but it is never free.
 */
export function notDonePenalty(difficulty: TaskDifficulty): number {
  return Math.round(TASK_XP[difficulty] / 2);
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

/** The first working day strictly after `date`: when a change into or out of Hard lands. */
export function nextWorkingDay(date: string, offDays: ReadonlySet<string> = NO_DAYS_OFF): string {
  let d = addDays(date, 1);
  for (let i = 0; i < 120 && !isWorkingDay(d, offDays); i++) d = addDays(d, 1);
  return d;
}

/* ------------------------------------------------------------------ rules */

export const GAME_RULES = ['gentle', 'hard'] as const;
export type GameRules = (typeof GAME_RULES)[number];

export function isGameRules(v: unknown): v is GameRules {
  return v === 'gentle' || v === 'hard';
}

export const GAME_RULES_LABEL: Record<GameRules, string> = { gentle: 'Gentle', hard: 'Hard' };

/** What each set of rules means, said plainly before anybody picks one. */
export const GAME_RULES_TEXT: Record<GameRules, string[]> = {
  gentle: [
    'Finishing things earns XP. Nothing ever takes it away for being late, missing a day or closing a task as Not done.',
    'You never drop a level.',
    'Every 5 days of streak earns a streak shield (up to 3). A shield is used by itself to save your streak the next time you miss a working day.',
  ],
  hard: [
    'Every working day a task is overdue costs 5 XP per day late, up to what the task is worth.',
    'Missing a working day breaks your streak and costs 25 XP per day of it, up to 300. No shields.',
    'Closing a task as Not done costs half of what it was worth.',
    'Losing XP can lose you a level.',
    'It pays no extra XP. What it gives is badges for staying in Hard: 1, 4, 10 and 26 weeks without leaving.',
    'Choosing it, or leaving it, takes effect the next working day. After you leave, Hard can be chosen again in 14 days.',
  ],
};

/** After leaving Hard, how long before it can be chosen again. */
export const HARD_COOLDOWN_DAYS = 14;
/** A streak shield is earned every this many streak days, Gentle only. */
export const SHIELD_EVERY = 5;
export const MAX_SHIELDS = 3;

/** Badges for an unbroken run in Hard. Ids are stored: never rename one. */
export const HARD_BADGES: { id: string; weeks: number; label: string }[] = [
  { id: 'hard-1w', weeks: 1, label: 'A week in Hard mode' },
  { id: 'hard-4w', weeks: 4, label: 'A month in Hard mode' },
  { id: 'hard-10w', weeks: 10, label: '10 weeks in Hard mode' },
  { id: 'hard-26w', weeks: 26, label: 'Half a year in Hard mode' },
];

/**
 * Badges for the day's habits, either set of rules. Ids are stored: never
 * rename one. `count` is how many days of that kind it takes.
 */
export const DAY_BADGES: { id: string; kind: 'planned' | 'closed' | 'targets'; count: number; label: string }[] = [
  { id: 'plan-5', kind: 'planned', count: 5, label: '5 days planned' },
  { id: 'plan-20', kind: 'planned', count: 20, label: '20 days planned' },
  { id: 'plan-60', kind: 'planned', count: 60, label: '60 days planned' },
  { id: 'close-5', kind: 'closed', count: 5, label: '5 days closed' },
  { id: 'close-20', kind: 'closed', count: 20, label: '20 days closed' },
  { id: 'targets-1', kind: 'targets', count: 1, label: 'Every target met in a day' },
  { id: 'targets-10', kind: 'targets', count: 10, label: '10 days with every target met' },
];

/** What any badge id is called, Hard or day. Unknown ids are shown as they are. */
export function badgeLabel(id: string): string {
  return HARD_BADGES.find((b) => b.id === id)?.label ?? DAY_BADGES.find((b) => b.id === id)?.label ?? id;
}

/** A change into or out of Hard, waiting for its day. */
export interface PendingRulesChange {
  to: GameRules | 'off';
  /** The working day it takes effect. */
  from: string;
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
  { id: 'd_high1',   title: 'Big fish',         desc: 'Finish a hard task',                       target: 1,  counter: 'high',      xp: 120 },
  { id: 'd_high2',   title: 'Heavy lifting',    desc: 'Finish 2 hard tasks',                      target: 2,  counter: 'high',      xp: 220 },
  { id: 'd_ontime2', title: 'Right on time',    desc: 'Finish 2 tasks on or before their due date', target: 2, counter: 'onTime',   xp: 120 },
  { id: 'd_added2',  title: 'Planner',          desc: 'Add 2 new tasks',                          target: 2,  counter: 'added',     xp: 60 },
  { id: 'd_sugg1',   title: 'Hustle',           desc: 'Finish a suggested broker task',           target: 1,  counter: 'suggested', xp: 100 },
  { id: 'd_sugg3',   title: 'Prospector',       desc: 'Finish 3 suggested broker tasks',          target: 3,  counter: 'suggested', xp: 250 },
];

export const WEEKLY_MISSIONS: MissionDef[] = [
  { id: 'w_done10',   title: 'Busy week',       desc: 'Finish 10 tasks this week',                   target: 10, counter: 'done',       xp: 300 },
  { id: 'w_done25',   title: 'Workhorse',       desc: 'Finish 25 tasks this week',                   target: 25, counter: 'done',       xp: 600 },
  { id: 'w_done50',   title: 'Unstoppable',     desc: 'Finish 50 tasks this week',                   target: 50, counter: 'done',       xp: 1000 },
  { id: 'w_high3',    title: 'Closer',          desc: 'Finish 3 hard tasks this week',               target: 3,  counter: 'high',       xp: 400 },
  { id: 'w_high6',    title: 'Heavy hauler',    desc: 'Finish 6 hard tasks this week',               target: 6,  counter: 'high',       xp: 700 },
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
  /** The rules in force today. Absent on every state before 2026-11-25, which reads as Gentle. */
  rules: GameRules;
  /** A change into or out of Hard, waiting for the next working day. */
  pendingChange: PendingRulesChange | null;
  /** Which rules each day was played under: entries from a date on. Newest last. */
  rulesHistory: { from: string; rules: GameRules | 'off' }[];
  /** The first day of the current run in Hard, or null. */
  hardRunStart: string | null;
  /** Hard can be chosen again from this day (after leaving it), or null. */
  hardAgainFrom: string | null;
  /** Streak shields held (Gentle). */
  shields: number;
  /** Badges earned, kept for good. */
  badges: { id: string; at: string }[];
  /** One office day's XP and the once-a-day payments, for the receipt and the caps. Reset by date. */
  day: GameDay | null;
  /** Days planned in the pop-up, days closed, days with every target met — what DAY_BADGES count. */
  daysPlanned: number;
  daysClosed: number;
  targetDays: number;
}

export interface GameDay {
  date: string;
  /** Net XP that day, everything included: what the day's receipt shows. */
  xp: number;
  /** What planning has paid so far that day (an upgrade pays the difference). */
  planXp: number;
  closed: boolean;
  /** What taps have paid that day, at most TAP_XP_CAP. */
  tapXp: number;
  allTargets: boolean;
}

export const MAX_GAME_LOG = 60;

function freshDay(date: string): GameDay {
  return { date, xp: 0, planXp: 0, closed: false, tapXp: 0, allTargets: false };
}

/** The day record for `date`: the stored one when it is that day's, else an empty one. */
export function dayOf(state: Pick<GameState, 'day'>, date: string): GameDay {
  return state.day?.date === date ? state.day : freshDay(date);
}

export type GameEvent =
  | { kind: 'xp'; amount: number; label: string }
  /** Something worth saying that is not XP: a shield earned or used, a badge, the rules changing. */
  | { kind: 'note'; text: string }
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
    rules: isGameRules(r.rules) ? r.rules : 'gentle',
    pendingChange: cleanPending(r.pendingChange),
    rulesHistory: Array.isArray(r.rulesHistory)
      ? (r.rulesHistory as Record<string, unknown>[])
        .filter((h) => h && typeof h.from === 'string' && (isGameRules(h.rules) || h.rules === 'off'))
        .map((h) => ({ from: h.from as string, rules: h.rules as GameRules | 'off' }))
        .slice(-200)
      : [],
    hardRunStart: str(r.hardRunStart),
    hardAgainFrom: str(r.hardAgainFrom),
    shields: Math.max(0, Math.min(MAX_SHIELDS, num(r.shields))),
    badges: Array.isArray(r.badges)
      ? (r.badges as Record<string, unknown>[])
        .filter((b) => b && typeof b.id === 'string')
        .map((b) => ({ id: b.id as string, at: String(b.at ?? '') }))
      : [],
    day: cleanDay(r.day),
    daysPlanned: num(r.daysPlanned),
    daysClosed: num(r.daysClosed),
    targetDays: num(r.targetDays),
  };
}

function cleanDay(raw: unknown): GameDay | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const date = str(r.date);
  if (!date) return null;
  return {
    date,
    xp: num(r.xp),
    planXp: Math.max(0, num(r.planXp)),
    closed: r.closed === true,
    tapXp: Math.max(0, Math.min(TAP_XP_CAP, num(r.tapXp))),
    allTargets: r.allTargets === true,
  };
}

function cleanPending(raw: unknown): PendingRulesChange | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!(isGameRules(r.to) || r.to === 'off') || typeof r.from !== 'string') return null;
  return { to: r.to as GameRules | 'off', from: r.from };
}

/**
 * Which rules a day was played under. A day before any entry reads as Gentle:
 * the history starts with the first switch into Hard (`applyPendingChange()`
 * writes it), so anything earlier was played under the default. Reading it
 * as "the rules now" instead would charge the last Gentle day by Hard rules
 * on the first morning after somebody chose Hard.
 */
export function rulesOn(state: Pick<GameState, 'rulesHistory'>, date: string): GameRules | 'off' {
  let out: GameRules | 'off' = 'gentle';
  for (const h of state.rulesHistory) if (h.from <= date) out = h.rules;
  return out;
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
    // Gentle never takes anybody below the start of the level they are on.
    const floor = this.state.rules === 'gentle' ? levelFor(before).xp : 0;
    this.state.xp = Math.max(Math.min(floor, before), before + amount);
    const real = this.state.xp - before;
    this.state.log = [...this.state.log, { at: this.now, label, xp: real }].slice(-MAX_GAME_LOG);
    const day = this.ensureDay();
    day.xp += real;
    if (announce && real !== 0) this.events.push({ kind: 'xp', amount: real, label });
  }

  /** Today's record, started fresh on the first change of a day. */
  private ensureDay(): GameDay {
    if (this.state.day?.date !== this.today) this.state.day = freshDay(this.today);
    return this.state.day;
  }

  /** Badges for the day's habits, each once. */
  private checkDayBadges() {
    const s = this.state;
    const counts = { planned: s.daysPlanned, closed: s.daysClosed, targets: s.targetDays };
    for (const b of DAY_BADGES) {
      if (counts[b.kind] >= b.count && !s.badges.some((x) => x.id === b.id)) {
        s.badges = [...s.badges, { id: b.id, at: this.now }];
        this.events.push({ kind: 'note', text: `Badge earned: ${b.label}` });
      }
    }
  }

  /**
   * The day was planned in the pop-up. Pays PLAN_XP once; planning more
   * later the same day pays only the difference, and planning less pays
   * nothing — "Just one thing" after a whole plan is not a step down.
   */
  onPlanned(kind: PlanKind) {
    if (!this.state.enabled) return;
    const day = this.ensureDay();
    const worth = PLAN_XP[kind];
    if (worth <= day.planXp) return;
    if (day.planXp === 0) this.state.daysPlanned++;
    const owed = worth - day.planXp;
    day.planXp = worth;
    this.award(owed, kind === 'one' ? 'Planned one thing' : kind === 'full' ? 'Planned the whole day' : 'Planned the day');
    this.checkDayBadges();
  }

  /** The day was closed in the pop-up. Once a day. */
  onDayClosed() {
    if (!this.state.enabled) return;
    const day = this.ensureDay();
    if (day.closed) return;
    day.closed = true;
    this.state.daysClosed++;
    this.award(CLOSE_DAY_XP, 'Closed the day');
    this.checkDayBadges();
  }

  /**
   * A seller's day moved: `taps` is today's calls + emails + referrals, and
   * `met`/`set` how many targets are met. Taps pay TAP_XP each up to the
   * cap, worked out from the total rather than per tap, so a mis-tap taken
   * back takes its XP with it and nothing can be paid twice. Meeting every
   * target pays once a day and is never taken back: quotes and new clients
   * are counted, and a counted number does not fall back.
   */
  onSalesDay(taps: number, met: number, set: number) {
    if (!this.state.enabled) return;
    const day = this.ensureDay();
    const due = Math.min(TAP_XP_CAP, Math.max(0, taps) * TAP_XP);
    if (due !== day.tapXp) {
      const delta = due - day.tapXp;
      day.tapXp = due;
      this.award(delta, delta > 0 ? 'Calls, emails and referrals' : 'Tap taken back');
    }
    if (set > 0 && met >= set && !day.allTargets) {
      day.allTargets = true;
      this.state.targetDays++;
      this.award(ALL_TARGETS_XP, 'Every target met today');
      this.checkDayBadges();
    }
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
  onNewDay(openTasks: (Pick<PersonalTask, 'kind' | 'status' | 'date' | 'difficulty'> & Partial<Pick<PersonalTask, 'dueDate'>>)[]) {
    const s = this.state;
    if (!s.enabled || s.lastCheckDate === this.today) return;
    const charge = s.lastCheckDate !== null && isWorkingDay(this.today, this.offDays);
    this.ensureSets();

    // The day being judged is the last working day; it is charged by the
    // rules it was played under, whatever is in force from today.
    const judgedDay = prevWorkingDay(this.today, this.offDays);
    // A change whose day has come counts here even though it is applied
    // below: somebody who left Hard on Friday and next looks on Monday must
    // have Friday judged as Gentle, not as the Hard they had already left.
    const p = s.pendingChange;
    const history = p && p.from <= this.today ? [...s.rulesHistory, { from: p.from, rules: p.to }] : s.rulesHistory;
    const hard = rulesOn({ rulesHistory: history }, judgedDay) === 'hard';

    if (charge && s.streak > 0 && s.lastActiveDate && s.lastActiveDate < judgedDay) {
      const lost = s.streak;
      if (hard) {
        s.streak = 0;
        this.award(-streakPenalty(lost), `${lost}-day streak broken`);
      } else if (s.shields > 0) {
        // The gap is covered as if that day had been worked: the streak
        // carries on from it, and grows again with the next finished task.
        s.shields--;
        s.lastActiveDate = judgedDay;
        this.events.push({ kind: 'note', text: `A streak shield saved your ${lost}-day streak (${s.shields} left)` });
      } else {
        s.streak = 0;
      }
    }

    if (charge && hard) {
      let penalty = 0;
      let late = 0;
      for (const t of openTasks) {
        const due = deadlineDay(t);
        if (t.kind !== 'task' || t.status === 'done' || !due || due >= this.today) continue;
        penalty += overduePenalty(t.difficulty, daysBetween(due, this.today));
        late++;
      }
      if (penalty > 0) this.award(-penalty, `${late} overdue task${late === 1 ? '' : 's'}`);
    }

    this.applyPendingChange();
    this.checkHardBadges();
    s.lastCheckDate = this.today;
  }

  /** A change into or out of Hard whose day has come. Runs after yesterday was charged. */
  private applyPendingChange() {
    const s = this.state;
    const p = s.pendingChange;
    if (!p || p.from > this.today) return;
    s.pendingChange = null;
    const wasHard = s.rules === 'hard';
    s.rulesHistory = [...s.rulesHistory, { from: p.from, rules: p.to }].slice(-200);
    if (wasHard && p.to !== 'hard') {
      s.hardRunStart = null;
      s.hardAgainFrom = addDays(this.today, HARD_COOLDOWN_DAYS);
    }
    if (p.to === 'off') {
      s.enabled = false;
      s.rules = 'gentle';
      return;
    }
    s.rules = p.to;
    if (p.to === 'hard' && !wasHard) s.hardRunStart = p.from;
    this.events.push({ kind: 'note', text: `${GAME_RULES_LABEL[p.to]} rules from today` });
  }

  /** Badges for an unbroken run in Hard, each once. */
  private checkHardBadges() {
    const s = this.state;
    if (s.rules !== 'hard' || !s.hardRunStart) return;
    const weeks = Math.floor(daysBetween(s.hardRunStart, this.today) / 7);
    for (const b of HARD_BADGES) {
      if (weeks >= b.weeks && !s.badges.some((x) => x.id === b.id)) {
        s.badges = [...s.badges, { id: b.id, at: this.now }];
        this.events.push({ kind: 'note', text: `Badge earned: ${b.label}` });
      }
    }
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
    task: Pick<PersonalTask, 'title' | 'difficulty' | 'date' | 'suggestionId'> & Partial<Pick<PersonalTask, 'dueDate'>>,
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
      // The counter is still called 'high': it is a stored key in live game
      // state, from when it counted high-priority tasks. It now counts hard ones.
      if (isHardTask(task.difficulty)) this.bump('high');
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
    if (s.rules === 'gentle' && s.streak % SHIELD_EVERY === 0 && s.shields < MAX_SHIELDS) {
      s.shields++;
      this.events.push({ kind: 'note', text: `Streak shield earned (${s.shields} of ${MAX_SHIELDS})` });
    }
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
  onTaskNotDone(task: Pick<PersonalTask, 'title' | 'difficulty'>): number {
    if (!this.state.enabled || this.state.rules !== 'hard') return 0;
    const lost = notDonePenalty(task.difficulty);
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
