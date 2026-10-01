import { Cinzel, Dancing_Script, Orbitron, Pirata_One, Uncial_Antiqua } from 'next/font/google';
import { Anchor, Crown, Flower2, Rocket, Truck, WandSparkles, type LucideIcon } from 'lucide-react';
import type { GameTheme } from '@/types/taskGame';

/**
 * How My tasks looks under each game theme — the theme is the whole page,
 * not just what the levels are called.
 *
 * What a theme may change, and what it may not:
 *
 * - **May:** the ground and its pattern, the heading face, the columns, the
 *   cards, the buttons, the XP bar, and a few words of flavour ("Add a task"
 *   becomes "Chart a course"). That is what makes it feel like the theme.
 * - **May not:** column names, statuses, priorities, dates, or anything that
 *   says what a task *is*. A wizard's "In review" is still In review — the
 *   board has to mean the same thing whatever it is wearing.
 *
 * Colours are only the families tailwind.config.ts maps for dark mode, at
 * the shades it maps, so every theme works in dark and dim without a `dark:`
 * class. The patterns are drawn in a translucent mid-tone, which reads on a
 * light ground and a dark one alike. Gradients are avoided on purpose: the
 * config maps only `white` as a gradient stop, so a tinted gradient would
 * stay light in dark mode.
 *
 * Every class here is a literal string so Tailwind finds it when it scans.
 */

// Heading faces, one per theme. `preload: false` because most people will
// only ever see one of them, and a preload is a download whether used or not.
const wizardFace = Uncial_Antiqua({ weight: '400', subsets: ['latin'], variable: '--font-tt-wizard', preload: false, display: 'swap' });
const empireFace = Cinzel({ weight: ['600', '700'], subsets: ['latin'], variable: '--font-tt-empire', preload: false, display: 'swap' });
const fairyFace = Dancing_Script({ weight: ['600', '700'], subsets: ['latin'], variable: '--font-tt-fairy', preload: false, display: 'swap' });
const spaceFace = Orbitron({ weight: ['600', '700'], subsets: ['latin'], variable: '--font-tt-space', preload: false, display: 'swap' });
const pirateFace = Pirata_One({ weight: '400', subsets: ['latin'], variable: '--font-tt-pirate', preload: false, display: 'swap' });

/** Put on the page's outermost element so every themed heading under it can reach its face. */
export const THEME_FONT_VARS = [wizardFace, empireFace, fairyFace, spaceFace, pirateFace]
  .map((f) => f.variable)
  .join(' ');

export interface TaskSkin {
  /** A second name for the page, beside "My tasks". Empty for the plain look. */
  tagline: string;
  Icon: LucideIcon | null;
  /** Heading face. Body text stays Inter in every theme, for reading. */
  font: string;
  /** Ink for headings. */
  ink: string;
  page: string;
  /** A CSS background-image, or 'none'. */
  pattern: string;
  /** The main buttons: Add, the chosen view. */
  accent: string;
  /** Small filled labels: the mission count, the tagline. */
  soft: string;
  /** A board column: ground, hairline, corners. */
  column: string;
  /** The coloured line along the top of a column. Empty for none. */
  columnTop: string;
  /** A card: ground, hairline, corners. */
  card: string;
  /** XP bar fill. */
  bar: string;
  /** The game bar's box. */
  panel: string;
  /** The words on a column's quick-add button. */
  addLabel: string;
  /** What the missions are called. */
  missions: string;
}

/** A tiling SVG as a CSS background-image. */
function tile(w: number, h: number, body: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** The look with game mode off — exactly what the page was before themes. */
export const PLAIN_SKIN: TaskSkin = {
  tagline: '',
  Icon: null,
  font: '',
  ink: 'text-gray-900',
  page: '',
  pattern: 'none',
  accent: 'bg-brand-600 text-white hover:bg-brand-700',
  soft: 'bg-brand-50 text-brand-700',
  column: 'rounded-xl border-gray-200 bg-gray-50',
  columnTop: '',
  card: 'rounded-lg border-gray-200 bg-white',
  bar: 'bg-brand-500',
  panel: 'rounded-xl border-gray-200 bg-white',
  addLabel: 'Add a task',
  missions: 'Missions',
};

export const TASK_SKINS: Record<GameTheme, TaskSkin> = {
  // Asphalt and lane paint: a dispatch board on the road.
  freight: {
    tagline: 'Dispatch board',
    Icon: Truck,
    font: 'font-[family-name:var(--font-rajdhani)] uppercase tracking-wide',
    ink: 'text-gray-900',
    page: 'bg-gray-100',
    pattern: tile(120, 60,
      `<rect x='0' y='28' width='36' height='4' rx='2' fill='rgba(234,179,8,0.28)'/>` +
      `<rect x='60' y='28' width='36' height='4' rx='2' fill='rgba(234,179,8,0.28)'/>`),
    accent: 'bg-yellow-400 text-black hover:bg-yellow-500', // black, not gray-900: gray inks turn light in dark mode
    soft: 'bg-yellow-100 text-yellow-800',
    column: 'rounded-md border-gray-300 bg-white',
    columnTop: 'border-t-4 border-t-yellow-400',
    card: 'rounded-md border-gray-300 bg-white border-l-4 border-l-yellow-400',
    bar: 'bg-yellow-400',
    panel: 'rounded-md border-gray-300 bg-white border-l-4 border-l-yellow-400',
    addLabel: 'Book a task', // not "Book a load": on a freight desk that reads as booking real freight
    missions: 'Runs',
  },
  // Night-sky violet and small stars: a spellbook.
  wizarding: {
    tagline: 'Spellbook',
    Icon: WandSparkles,
    font: 'font-[family-name:var(--font-tt-wizard)]',
    ink: 'text-violet-900',
    page: 'bg-violet-50',
    pattern: tile(90, 90,
      `<path d='M20 12 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z' fill='rgba(139,92,246,0.22)'/>` +
      `<path d='M66 58 l1.4 4 4 1.4 -4 1.4 -1.4 4 -1.4 -4 -4 -1.4 4 -1.4z' fill='rgba(139,92,246,0.18)'/>` +
      `<circle cx='70' cy='18' r='1.6' fill='rgba(139,92,246,0.3)'/>` +
      `<circle cx='28' cy='70' r='1.2' fill='rgba(139,92,246,0.3)'/>`),
    accent: 'bg-violet-700 text-white hover:bg-violet-800',
    soft: 'bg-violet-100 text-violet-800',
    column: 'rounded-2xl border-violet-200 bg-white/80',
    columnTop: '',
    card: 'rounded-xl border-violet-200 bg-white',
    bar: 'bg-violet-500',
    panel: 'rounded-2xl border-violet-200 bg-white/90',
    addLabel: 'Write a spell',
    missions: 'Quests',
  },
  // Crimson and gold, square-cornered: a war council's table.
  empire: {
    tagline: 'War council',
    Icon: Crown,
    font: 'font-[family-name:var(--font-tt-empire)] tracking-wide',
    ink: 'text-red-900',
    page: 'bg-red-50',
    pattern: tile(48, 48,
      `<path d='M24 4 L44 24 L24 44 L4 24 Z' fill='none' stroke='rgba(245,158,11,0.22)' stroke-width='1.5'/>`),
    accent: 'bg-red-800 text-white hover:bg-red-900',
    soft: 'bg-amber-100 text-red-800',
    column: 'rounded-sm border-amber-300 bg-white/85',
    columnTop: 'border-t-4 border-t-red-700',
    card: 'rounded-sm border-amber-200 bg-white border-t-2 border-t-amber-400',
    bar: 'bg-amber-500',
    panel: 'rounded-sm border-amber-300 bg-white/90 border-t-4 border-t-red-700',
    addLabel: 'Issue a decree',
    missions: 'Decrees',
  },
  // Petals and soft corners: an enchanted garden.
  fairy: {
    tagline: 'Enchanted garden',
    Icon: Flower2,
    font: 'font-[family-name:var(--font-tt-fairy)] text-[1.15em]',
    ink: 'text-pink-900',
    page: 'bg-pink-50',
    pattern: tile(80, 80,
      `<circle cx='14' cy='14' r='3' fill='rgba(236,72,153,0.18)'/>` +
      `<circle cx='54' cy='40' r='2' fill='rgba(16,185,129,0.22)'/>` +
      `<circle cx='30' cy='62' r='2.5' fill='rgba(236,72,153,0.14)'/>` +
      `<path d='M66 10 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1z' fill='rgba(16,185,129,0.25)'/>`),
    accent: 'bg-pink-500 text-white hover:bg-pink-600',
    soft: 'bg-emerald-100 text-emerald-800',
    column: 'rounded-3xl border-pink-200 bg-white/80',
    columnTop: '',
    card: 'rounded-2xl border-emerald-200 bg-white',
    bar: 'bg-emerald-400',
    panel: 'rounded-3xl border-pink-200 bg-white/90',
    addLabel: 'Make a wish',
    missions: 'Wishes',
  },
  // Indigo and cyan, hard edges, a scatter of stars: mission control.
  space: {
    tagline: 'Mission control',
    Icon: Rocket,
    font: 'font-[family-name:var(--font-tt-space)] tracking-wider',
    ink: 'text-indigo-900',
    page: 'bg-indigo-50',
    pattern: tile(100, 100,
      `<circle cx='10' cy='20' r='1.2' fill='rgba(79,70,229,0.4)'/>` +
      `<circle cx='60' cy='8' r='0.9' fill='rgba(79,70,229,0.35)'/>` +
      `<circle cx='82' cy='52' r='1.5' fill='rgba(6,182,212,0.4)'/>` +
      `<circle cx='34' cy='74' r='1' fill='rgba(79,70,229,0.35)'/>` +
      `<circle cx='70' cy='88' r='8' fill='none' stroke='rgba(6,182,212,0.18)' stroke-width='1'/>`),
    accent: 'bg-indigo-700 text-white hover:bg-indigo-800',
    soft: 'bg-cyan-100 text-cyan-800',
    column: 'rounded-none border-cyan-300 bg-white/80',
    columnTop: 'border-t-2 border-t-cyan-400',
    card: 'rounded-none border-indigo-200 bg-white border-l-2 border-l-cyan-400',
    bar: 'bg-cyan-500',
    panel: 'rounded-none border-cyan-300 bg-white/90',
    addLabel: 'Log an objective',
    missions: 'Objectives',
  },
  // Parchment and sea: a captain's log.
  pirate: {
    tagline: 'Captain’s log',
    Icon: Anchor,
    font: 'font-[family-name:var(--font-tt-pirate)] text-[1.15em]',
    ink: 'text-amber-900',
    page: 'bg-amber-50',
    pattern: tile(120, 40,
      `<path d='M0 20 Q15 10 30 20 T60 20 T90 20 T120 20' fill='none' stroke='rgba(20,184,166,0.2)' stroke-width='2'/>`),
    accent: 'bg-teal-800 text-white hover:bg-teal-900',
    soft: 'bg-teal-100 text-teal-800',
    column: 'rounded-sm border-amber-300 bg-orange-50',
    columnTop: '',
    card: 'rounded-sm border-amber-300 bg-amber-50',
    bar: 'bg-teal-600',
    panel: 'rounded-sm border-amber-300 bg-orange-50',
    addLabel: 'Chart a course',
    missions: 'Bounties',
  },
};

export function skinFor(theme: GameTheme | null | undefined): TaskSkin {
  return theme ? TASK_SKINS[theme] : PLAIN_SKIN;
}
