import type { GameTheme } from '@/types/taskGame';

/**
 * How My tasks looks under each game theme.
 *
 * The theme lives in two places and is restrained in both, the way a
 * product's own themes are rather than a party's:
 *
 * - **The banner** at the top of the page carries it fully — a deep ground,
 *   fine line artwork (taskSkinArt.ts), the theme's display face, and the
 *   level, XP and streak drawn in its accent. The banner's colours are fixed
 *   hex values, deliberately the same in light and dark mode: it is a dark
 *   panel in both.
 * - **The working area** takes one accent and nothing else: a rule along the
 *   top of each column, the hover edge of a card, the main buttons. The page
 *   ground, the cards and every word on them stay as they always are, so a
 *   wizard's board is as quick to read as anybody's.
 *
 * What a theme may never change: column names, statuses, priorities, dates —
 * anything that says what a task *is*.
 *
 * Every class here is a literal string so Tailwind finds it when it scans.
 * The hex classes (`bg-[#…]`) are not mapped for dark mode on purpose; each
 * is a solid accent with white text on it, which reads the same in both.
 */
export interface TaskSkin {
  /** False for the plain look with game mode off: no banner, brand colours. */
  themed: boolean;
  /** The banner title. */
  tagline: string;
  /** Display face for the banner title only. */
  font: string;
  /** Banner ground, as a hex colour. Matches the artwork's own ground. */
  ground: string;
  /** Highlights on the banner: XP fill, the level ring, the streak flame. */
  accent: string;
  /** Main buttons in the working area: Add task, the chosen view. */
  button: string;
  /** The rule along the top of a board column. */
  columnTop: string;
  /** A card's edge on hover. */
  cardHover: string;
  /** The words on a column's quick-add button. */
  addLabel: string;
  /** What the missions are called. */
  missions: string;
}

export const PLAIN_SKIN: TaskSkin = {
  themed: false,
  tagline: '',
  font: '',
  ground: '#1e3a8a',
  accent: '#60a5fa',
  button: 'bg-brand-600 text-white hover:bg-brand-700',
  columnTop: '',
  cardHover: 'hover:border-gray-300',
  addLabel: 'Add a task',
  missions: 'Missions',
};

export const TASK_SKINS: Record<GameTheme, TaskSkin> = {
  freight: {
    themed: true,
    tagline: 'Dispatch board',
    font: 'font-[family-name:var(--font-rajdhani)] uppercase tracking-[0.12em]',
    ground: '#0b1a33',
    accent: '#f59e0b',
    button: 'bg-[#0b1a33] text-white hover:bg-[#13274a]',
    columnTop: 'border-t-[3px] border-t-[#f59e0b]',
    cardHover: 'hover:border-[#f59e0b]',
    // Not "Book a load": on a freight desk that reads as booking real freight.
    addLabel: 'Book a task',
    missions: 'Runs',
  },
  wizarding: {
    themed: true,
    tagline: 'Spellbook',
    font: 'font-[family-name:var(--font-tt-wizard)]',
    ground: '#1a1033',
    accent: '#c4b5fd',
    button: 'bg-[#5b3fc4] text-white hover:bg-[#4c33a8]',
    columnTop: 'border-t-[3px] border-t-[#8b5cf6]',
    cardHover: 'hover:border-[#8b5cf6]',
    addLabel: 'Write a spell',
    missions: 'Quests',
  },
  empire: {
    themed: true,
    tagline: 'War council',
    font: 'font-[family-name:var(--font-tt-empire)] tracking-[0.08em]',
    ground: '#3a0b12',
    accent: '#e0b84f',
    button: 'bg-[#7f1d2d] text-white hover:bg-[#6a1726]',
    columnTop: 'border-t-[3px] border-t-[#c9a23f]',
    cardHover: 'hover:border-[#c9a23f]',
    addLabel: 'Issue a decree',
    missions: 'Decrees',
  },
  fairy: {
    themed: true,
    tagline: 'Enchanted garden',
    font: 'font-[family-name:var(--font-tt-fairy)] italic text-[1.35em]',
    ground: '#0e2a24',
    accent: '#f9a8d4',
    button: 'bg-[#1f6b55] text-white hover:bg-[#195a47]',
    columnTop: 'border-t-[3px] border-t-[#ec89b8]',
    cardHover: 'hover:border-[#ec89b8]',
    addLabel: 'Make a wish',
    missions: 'Wishes',
  },
  space: {
    themed: true,
    tagline: 'Mission control',
    font: 'font-[family-name:var(--font-tt-space)] tracking-[0.1em]',
    ground: '#070b1f',
    accent: '#67e8f9',
    button: 'bg-[#3730a3] text-white hover:bg-[#2e2890]',
    columnTop: 'border-t-[3px] border-t-[#22d3ee]',
    cardHover: 'hover:border-[#22d3ee]',
    addLabel: 'Log an objective',
    missions: 'Objectives',
  },
  pirate: {
    themed: true,
    tagline: 'Captain’s log',
    font: 'font-[family-name:var(--font-tt-pirate)] text-[1.25em] tracking-wide',
    ground: '#08262b',
    accent: '#e7c88a',
    button: 'bg-[#0f5c5c] text-white hover:bg-[#0c4c4c]',
    columnTop: 'border-t-[3px] border-t-[#c9a45c]',
    cardHover: 'hover:border-[#c9a45c]',
    addLabel: 'Chart a course',
    missions: 'Bounties',
  },
};

export function skinFor(theme: GameTheme | null | undefined): TaskSkin {
  return theme ? TASK_SKINS[theme] : PLAIN_SKIN;
}
