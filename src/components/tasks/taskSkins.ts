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
  /**
   * Main buttons: Add task, the chosen view. The accent, with the ground's
   * colour for the words — the page is dark under every theme, so a
   * button in the ground colour would disappear into it.
   */
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
    button: 'bg-[#f59e0b] text-[#0b1a33] hover:bg-[#fbbf24]',
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
    button: 'bg-[#c4b5fd] text-[#1a1033] hover:bg-[#ddd6fe]',
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
    button: 'bg-[#e0b84f] text-[#3a0b12] hover:bg-[#ecca6e]',
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
    button: 'bg-[#f9a8d4] text-[#0e2a24] hover:bg-[#fbc4e2]',
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
    button: 'bg-[#67e8f9] text-[#070b1f] hover:bg-[#a5f3fc]',
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
    button: 'bg-[#e7c88a] text-[#08262b] hover:bg-[#f0d9a8]',
    columnTop: 'border-t-[3px] border-t-[#c9a45c]',
    cardHover: 'hover:border-[#c9a45c]',
    addLabel: 'Chart a course',
    missions: 'Bounties',
  },
};

/* ---------------------------------------------------------- the dark room */

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `amount` of white (or of black, when negative) mixed into `hex`, as Tailwind's "r g b" triplet. */
function lift(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const a = Math.abs(amount);
  return rgbOf(hex).map((c) => Math.round(c + (target - c) * a)).join(' ');
}

/**
 * The whole page in the theme's colours. The element gets `ttms-dark-scope`
 * — the app's own dark palette, so every ink, chip and status colour in the
 * cards, the table and the editor is already right for a dark ground — and
 * these variables on top, which tint the neutral surfaces toward the
 * banner's ground: columns, cards, inputs, the hairlines between them.
 *
 * Only the neutrals are retinted. The status families (red overdue, amber
 * today, the sticky-note colours) keep their dark-mode values, so they mean
 * the same thing under every theme.
 *
 * The variable names are the ones tailwind.config.ts writes: `--c-surface`
 * is `bg-white`, `--c-bg-gray-50` is `bg-gray-50`, and so on.
 */
export function pageStyleFor(skin: TaskSkin): Record<string, string> {
  const g = skin.ground;
  const [r, gg, b] = rgbOf(skin.accent);
  return {
    '--c-surface':        lift(g, 0.075),
    '--c-bg-gray-50':     lift(g, 0.035),
    '--c-bg-gray-100':    lift(g, 0.11),
    '--c-bg-gray-200':    lift(g, 0.16),
    '--c-bg-gray-300':    lift(g, 0.23),
    '--c-border-gray-50':  lift(g, 0.06),
    '--c-border-gray-100': lift(g, 0.09),
    '--c-border-gray-200': lift(g, 0.13),
    '--c-border-gray-300': lift(g, 0.19),
    '--c-border-gray-400': lift(g, 0.27),
    // A shade darker than the banner, so the banner reads as a panel on it,
    // with the accent glowing faintly from the top right.
    backgroundColor: `rgb(${lift(g, -0.28).split(' ').join(',')})`,
    backgroundImage: `radial-gradient(ellipse 70% 50% at 100% 0%, rgba(${r},${gg},${b},0.10), transparent 70%)`,
  };
}

export function skinFor(theme: GameTheme | null | undefined): TaskSkin {
  return theme ? TASK_SKINS[theme] : PLAIN_SKIN;
}
