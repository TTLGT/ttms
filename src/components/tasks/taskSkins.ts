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
 * - **The working area** is a room in the theme's colours, in a light, dim
 *   or dark version to match the app's own theme — see roomCss(). It takes the accent for the column rules, a card's hover edge and
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
  /**
   * Sizes for the page title and the column headings, for a display face
   * that reads small at the plain sizes — Fairy's script italic is half the
   * height of the others at 14px. Absent means the plain text-2xl / text-sm.
   */
  pageTitleSize?: string;
  columnTitleSize?: string;
  /** The readable face for everything else on the page. See themeFonts.ts. */
  body: string;
  /** Banner ground, as a hex colour. Matches the artwork's own ground. */
  ground: string;
  /** Highlights: the banner's XP fill and level ring, and the streak card's flame and edge. */
  accent: string;
  /**
   * Main buttons: Add task, the chosen view. The accent, with the ground's
   * colour for the words. A pale accent filled with a deep ink reads on a
   * light room and a dark one alike.
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
  /**
   * What a task's steps are called, one and many — a load's stops, a spell's
   * incantations. Words only: a step is the same thing under every theme.
   */
  step: string;
  steps: string;
  /** What the queue view is called. */
  queue: string;
  /** The heading over the one task to do next. */
  upNext: string;
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
  step: 'step',
  steps: 'steps',
  queue: 'Queue',
  upNext: 'Up next',
};

export const TASK_SKINS: Record<GameTheme, TaskSkin> = {
  freight: {
    themed: true,
    id: 'freight',
    tagline: 'Logistics strategy',
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
    // A load runs stop by stop; a task here does the same.
    step: 'stop',
    steps: 'stops',
    queue: 'Logistics plans',
    upNext: 'Next dispatch',
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
    step: 'incantation',
    steps: 'incantations',
    queue: 'Spell queue',
    upNext: 'Next spell',
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
    step: 'maneuver',
    steps: 'maneuvers',
    queue: 'Battle plan',
    upNext: 'Next campaign',
  },
  fairy: {
    themed: true,
    id: 'fairy',
    tagline: 'Enchanted garden',
    font: 'font-[family-name:var(--font-tt-fairy)] italic text-[1.35em]',
    heading: 'font-[family-name:var(--font-tt-fairy)] italic',
    pageTitleSize: 'text-[2.1rem] leading-tight',
    columnTitleSize: 'text-xl leading-6',
    body: 'font-[family-name:var(--font-tt-fairy-body)]',
    ground: '#0e2a24',
    accent: '#f9a8d4',
    button: 'bg-[#f9a8d4] text-[#0e2a24] hover:bg-[#fbc4e2]',
    columnTop: 'border-t-[3px] border-t-[#ec89b8]',
    cardHover: 'hover:border-[#ec89b8]',
    addLabel: 'Make a wish',
    missions: 'Wishes',
    step: 'petal',
    steps: 'petals',
    queue: 'Flower path',
    upNext: 'Next wish',
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
    step: 'waypoint',
    steps: 'waypoints',
    queue: 'Flight plan',
    upNext: 'Next launch',
  },
  pirate: {
    themed: true,
    id: 'pirate',
    tagline: 'Captain’s log',
    // Pirata One comes in one weight, so the font-bold / font-semibold the
    // titles carry made the browser smear a fake bold over a blackletter
    // that is already heavy. `!font-normal` beats them whatever the class
    // order, and the sizes below make up for the face reading small.
    font: '!font-normal font-[family-name:var(--font-tt-pirate)] text-[1.25em] tracking-wide',
    heading: '!font-normal font-[family-name:var(--font-tt-pirate)] tracking-wide',
    pageTitleSize: 'text-[1.875rem] leading-tight',
    columnTitleSize: 'text-lg leading-6',
    body: 'font-[family-name:var(--font-tt-pirate-body)]',
    ground: '#08262b',
    accent: '#e7c88a',
    button: 'bg-[#e7c88a] text-[#08262b] hover:bg-[#f0d9a8]',
    columnTop: 'border-t-[3px] border-t-[#c9a45c]',
    cardHover: 'hover:border-[#c9a45c]',
    addLabel: 'Chart a course',
    missions: 'Bounties',
    step: 'map mark',
    steps: 'map marks',
    queue: 'Treasure map',
    upNext: 'Next heading',
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

/** White moved `amount` of the way toward `hex`, as a triplet — the light room's version of lift(). */
function wash(hex: string, amount: number): string {
  return rgbOf(mixHex('#ffffff', hex, amount)).join(' ');
}

const asRgb = (triplet: string) => `rgb(${triplet.split(' ').join(',')})`;

/** The class the page puts on the element that roomCss() dresses. */
export const ROOM_CLASS = 'tt-room';

type Shades = Record<string, string>;

/** One room's variables as a CSS declaration block. */
function block(vars: Shades): string {
  return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
}

/**
 * The working area in the theme's colours, in a version for each of the
 * app's own themes — light, dim and dark — returned as CSS for a `<style>`
 * beside the page.
 *
 * It follows the app theme rather than forcing one. The room used to wear
 * the dark palette whatever the app was set to, which put a dark page in the
 * middle of somebody's light app. Now the light theme gets a pale room washed
 * with the banner's hue, dim a slate one, dark the deep one it always had.
 *
 * CSS selectors on `html.dark` / `html.dark.dim` rather than a hook reading
 * the theme: the boot script has set those classes before the first paint,
 * so the right room is there on the first frame, and a theme switched in the
 * sidebar or in another tab carries over with nothing to re-render.
 *
 * Only the neutrals are retinted — the variable names are the ones
 * tailwind.config.ts writes: `--c-surface` is `bg-white`, `--c-bg-gray-50`
 * is `bg-gray-50`, and so on. The status families (red overdue, amber today,
 * the sticky-note colours) keep the app theme's own values, so they mean the
 * same thing under every game theme.
 *
 * The banner is not part of this. It is a dark panel in all three — its
 * artwork is drawn for a dark ground — see TaskGame.tsx.
 *
 * Every value is computed from the skin's own fixed colours, never from
 * anything typed, so building the style text here is safe.
 */
export function roomCss(skin: TaskSkin): string {
  // A touch of the accent in the ground, so the room is the theme's colour
  // and not just a grey with the banner's hue.
  const g = mixHex(skin.ground, skin.accent, 0.06);
  const [r, gg, b] = rgbOf(skin.accent);
  const glow = (alpha: number) =>
    `radial-gradient(ellipse 70% 50% at 100% 0%, rgba(${r},${gg},${b},${alpha}), transparent 70%)`;

  // Light: steps of the ground mixed into white. Columns (gray-50) sit below
  // the cards as in the plain light theme, and the inks are the ground itself
  // nearly at full strength, so body text is the theme's deep colour rather
  // than a neutral black.
  const light: Shades = {
    '--c-bg-gray-50':      wash(g, 0.07),
    '--c-surface':         wash(g, 0.012),
    '--c-bg-gray-100':     wash(g, 0.1),
    '--c-bg-gray-200':     wash(g, 0.15),
    '--c-bg-gray-300':     wash(g, 0.22),
    '--c-border-gray-50':  wash(g, 0.08),
    '--c-border-gray-100': wash(g, 0.11),
    '--c-border-gray-200': wash(g, 0.16),
    '--c-border-gray-300': wash(g, 0.24),
    '--c-border-gray-400': wash(g, 0.34),
    '--c-text-gray-300':   wash(g, 0.32),
    '--c-text-gray-400':   wash(g, 0.46),
    '--c-text-gray-500':   wash(g, 0.6),
    '--c-text-gray-600':   wash(g, 0.7),
    '--c-text-gray-700':   wash(g, 0.8),
    '--c-text-gray-800':   wash(g, 0.88),
    '--c-text-gray-900':   wash(g, 0.94),
    // The accents are pale (lilac, pink, cyan) because they were picked to
    // glow on a dark ground; as words on a light one they vanish. Halfway
    // toward the ground keeps the hue and reaches readable contrast.
    '--tt-accent-ink':     mixHex(skin.accent, skin.ground, 0.55),
    'background-color':    asRgb(wash(g, 0.035)),
    'background-image':    glow(0.1),
  };

  // Dark: each step up is a lighter layer: page, then columns (gray-50), then
  // cards and inputs (bg-white), then chips and hovers above those. The page
  // itself sits well above the banner — it was below it once, and the whole
  // screen read as a cave. The quiet inks climb with the surfaces, or
  // secondary text (dates, notes, counts) fades into a card this light.
  const dark: Shades = {
    '--c-bg-gray-50':      lift(g, 0.17),
    '--c-surface':         lift(g, 0.24),
    '--c-bg-gray-100':     lift(g, 0.31),
    '--c-bg-gray-200':     lift(g, 0.36),
    '--c-bg-gray-300':     lift(g, 0.43),
    '--c-border-gray-50':  lift(g, 0.2),
    '--c-border-gray-100': lift(g, 0.24),
    '--c-border-gray-200': lift(g, 0.29),
    '--c-border-gray-300': lift(g, 0.36),
    '--c-border-gray-400': lift(g, 0.45),
    '--c-text-gray-300':   lift(g, 0.42),
    '--c-text-gray-400':   lift(g, 0.55),
    '--c-text-gray-500':   lift(g, 0.66),
    '--c-text-gray-600':   lift(g, 0.75),
    '--c-text-gray-700':   lift(g, 0.84),
    // The top inks have to be restated here even though dark has values of
    // its own: the light block above sets them on this same element, and
    // without these the headings stayed the light room's deep ink on a dark
    // ground.
    '--c-text-gray-800':   lift(g, 0.9),
    '--c-text-gray-900':   lift(g, 0.94),
    '--tt-accent-ink':     skin.accent,
    'background-color':    asRgb(lift(g, 0.11)),
    'background-image':    glow(0.12),
  };

  // Dim: the dark room from a higher floor, as the app's dim is dark with
  // lifted grounds.
  const dim: Shades = {
    '--c-bg-gray-50':      lift(g, 0.27),
    '--c-surface':         lift(g, 0.34),
    '--c-bg-gray-100':     lift(g, 0.41),
    '--c-bg-gray-200':     lift(g, 0.46),
    '--c-bg-gray-300':     lift(g, 0.53),
    '--c-border-gray-50':  lift(g, 0.3),
    '--c-border-gray-100': lift(g, 0.34),
    '--c-border-gray-200': lift(g, 0.39),
    '--c-border-gray-300': lift(g, 0.46),
    '--c-border-gray-400': lift(g, 0.55),
    '--c-text-gray-300':   lift(g, 0.52),
    '--c-text-gray-400':   lift(g, 0.63),
    '--c-text-gray-500':   lift(g, 0.72),
    '--c-text-gray-600':   lift(g, 0.8),
    '--c-text-gray-700':   lift(g, 0.87),
    // Restated for the same reason as in dark; a touch softer, as dim's are.
    '--c-text-gray-800':   lift(g, 0.9),
    '--c-text-gray-900':   lift(g, 0.93),
    '--tt-accent-ink':     skin.accent,
    'background-color':    asRgb(lift(g, 0.21)),
    'background-image':    glow(0.1),
  };

  // `html.dark.dim` outranks `html.dark`, which outranks the bare class. All
  // three are on the same element, so a variable set in one and missing from
  // another leaks across: every block must name the same variables.
  return `.${ROOM_CLASS}{${block(light)}}`
    + `html.dark .${ROOM_CLASS}{${block(dark)}}`
    + `html.dark.dim .${ROOM_CLASS}{${block(dim)}}`;
}

export function skinFor(theme: GameTheme | null | undefined): TaskSkin {
  return theme ? TASK_SKINS[theme] : PLAIN_SKIN;
}
