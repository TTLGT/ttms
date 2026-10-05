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
 * - **The working area** is a room in the theme's colours, a few steps
 *   lighter than the banner so the banner reads as the darkest thing on the
 *   page. It takes the accent for the column rules, a card's hover edge and
 *   the main buttons; the theme's display face for the page title and the
 *   column headings; a readable body face of the same mood for everything
 *   else; and a set of status icons drawn in each status's own colour.
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
  /** Which theme this is — picks the column icons. Null for the plain look. */
  id: GameTheme | null;
  /** The banner title. */
  tagline: string;
  /** Display face and size for the banner title. */
  font: string;
  /** The same display face, no size: the page title and the column headings. */
  heading: string;
  /** The readable face for everything else on the page. See themeFonts.ts. */
  body: string;
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
  id: null,
  tagline: '',
  font: '',
  heading: '',
  body: '',
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
    id: 'freight',
    tagline: 'Dispatch board',
    font: 'font-[family-name:var(--font-rajdhani)] uppercase tracking-[0.12em]',
    heading: 'font-[family-name:var(--font-rajdhani)] uppercase tracking-[0.08em]',
    body: 'font-[family-name:var(--font-tt-freight-body)] font-medium',
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
    id: 'wizarding',
    tagline: 'Spellbook',
    font: 'font-[family-name:var(--font-tt-wizard)]',
    heading: 'font-[family-name:var(--font-tt-wizard)]',
    body: 'font-[family-name:var(--font-tt-wizard-body)]',
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
    id: 'empire',
    tagline: 'War council',
    font: 'font-[family-name:var(--font-tt-empire)] tracking-[0.08em]',
    heading: 'font-[family-name:var(--font-tt-empire)] tracking-[0.06em]',
    body: 'font-[family-name:var(--font-tt-empire-body)]',
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
    id: 'fairy',
    tagline: 'Enchanted garden',
    font: 'font-[family-name:var(--font-tt-fairy)] italic text-[1.35em]',
    heading: 'font-[family-name:var(--font-tt-fairy)] italic',
    body: 'font-[family-name:var(--font-tt-fairy-body)]',
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
    id: 'space',
    tagline: 'Mission control',
    font: 'font-[family-name:var(--font-tt-space)] tracking-[0.1em]',
    heading: 'font-[family-name:var(--font-tt-space)] tracking-[0.06em]',
    body: 'font-[family-name:var(--font-tt-space-body)]',
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
    id: 'pirate',
    tagline: 'Captain’s log',
    font: 'font-[family-name:var(--font-tt-pirate)] text-[1.25em] tracking-wide',
    heading: 'font-[family-name:var(--font-tt-pirate)] tracking-wide',
    body: 'font-[family-name:var(--font-tt-pirate-body)]',
    ground: '#08262b',
    accent: '#e7c88a',
    button: 'bg-[#e7c88a] text-[#08262b] hover:bg-[#f0d9a8]',
    columnTop: 'border-t-[3px] border-t-[#c9a45c]',
    cardHover: 'hover:border-[#c9a45c]',
    addLabel: 'Chart a course',
    missions: 'Bounties',
  },
};

/* --------------------------------------------------------------- the room */

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `hex` moved `amount` of the way toward `toward`, as a hex colour. */
function mixHex(hex: string, toward: string, amount: number): string {
  const a = rgbOf(hex);
  const t = rgbOf(toward);
  return '#' + a.map((c, i) => Math.round(c + (t[i] - c) * amount).toString(16).padStart(2, '0')).join('');
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
  // A touch of the accent in the ground, so the room is the theme's colour
  // and not just a grey with the banner's hue.
  const g = mixHex(skin.ground, skin.accent, 0.06);
  const [r, gg, b] = rgbOf(skin.accent);
  // Each step up is a lighter layer: page, then columns (gray-50), then
  // cards and inputs (bg-white), then chips and hovers above those. The page
  // itself sits well above the banner — it was below it once, and the whole
  // screen read as a cave.
  return {
    '--c-bg-gray-50':     lift(g, 0.17),
    '--c-surface':        lift(g, 0.24),
    '--c-bg-gray-100':    lift(g, 0.31),
    '--c-bg-gray-200':    lift(g, 0.36),
    '--c-bg-gray-300':    lift(g, 0.43),
    '--c-border-gray-50':  lift(g, 0.2),
    '--c-border-gray-100': lift(g, 0.24),
    '--c-border-gray-200': lift(g, 0.29),
    '--c-border-gray-300': lift(g, 0.36),
    '--c-border-gray-400': lift(g, 0.45),
    // The quiet inks have to climb with the surfaces, or secondary text
    // (dates, notes, counts) fades into a card this light.
    '--c-text-gray-300':  lift(g, 0.42),
    '--c-text-gray-400':  lift(g, 0.55),
    '--c-text-gray-500':  lift(g, 0.66),
    '--c-text-gray-600':  lift(g, 0.75),
    '--c-text-gray-700':  lift(g, 0.84),
    backgroundColor: `rgb(${lift(g, 0.11).split(' ').join(',')})`,
    backgroundImage: `radial-gradient(ellipse 70% 50% at 100% 0%, rgba(${r},${gg},${b},0.12), transparent 70%)`,
  };
}

export function skinFor(theme: GameTheme | null | undefined): TaskSkin {
  return theme ? TASK_SKINS[theme] : PLAIN_SKIN;
}
