import type { GameTheme } from '@/types/taskGame';

/**
 * A hand-drawn picture for every level of every game theme, in the style of
 * the banner artwork in `taskSkinArt.ts`: fine lines, a second colour for
 * the detail, and a soft glow here and there. Entry 0 is level 1, in the same
 * order as `GAME_THEMES[theme].titles`, and each drawing is chosen to fit
 * that level's name — level 2 of Fairy worlds is "Sprout", so it is a sprout.
 *
 * Each entry is the inside of a 48×48 SVG whose root sets `fill='none'`,
 * `stroke='currentColor'` and round line ends (see `LevelArt.tsx`), so the
 * main lines take whatever colour the badge is drawn in — the theme's accent
 * normally, red on a level down — while the detail colours are fixed here,
 * the same way the banner's are.
 *
 * Pure strings, no React and no Next, the same as the banner art, so a
 * preview script can draw exactly what the app draws. They are our own
 * constants, never built from user input, which is what makes
 * `dangerouslySetInnerHTML` safe for them.
 */

/* ------------------------------------------------------------------ helpers */

const f = (n: number) => +n.toFixed(2);

/** A soft round glow, the banner's firefly halo. */
const glow = (x: number, y: number, r: number, c: string, o = 0.16) =>
  `<circle cx='${x}' cy='${y}' r='${r}' fill='${c}' fill-opacity='${f(o * 0.55)}' stroke='none'/>`;

/** A filled dot. */
const dot = (x: number, y: number, r: number, c = 'currentColor') =>
  `<circle cx='${x}' cy='${y}' r='${r}' fill='${c}' stroke='none'/>`;

/** A small four-pointed twinkle, filled. */
const twinkle = (x: number, y: number, s: number, c: string) =>
  `<path d='M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z' fill='${c}' stroke='none'/>`;

/** A line in another colour. */
const line = (d: string, c: string, o = 1, w?: number) =>
  `<path d='${d}' stroke='${c}'${o < 1 ? ` stroke-opacity='${o}'` : ''}${w ? ` stroke-width='${w}'` : ''}/>`;

/** A shape outlined in one colour with a faint fill of the same. */
const shape = (d: string, c = 'currentColor', o = 0.14) =>
  `<path d='${d}' stroke='${c}' fill='${c}' fill-opacity='${o}'/>`;

/** The outline of an n-pointed star as path data. */
function starPath(cx: number, cy: number, outer: number, inner: number, n = 5, turn = 0): string {
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const a = turn + (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? inner : outer;
    return `${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`;
  });
  return `M${pts.join(' L')} Z`;
}

/** The same element repeated round a centre, `n` times. */
const around = (n: number, cx: number, cy: number, el: (deg: number) => string, offset = 0) =>
  Array.from({ length: n }, (_, i) => el(offset + (i * 360) / n)).join('');

/**
 * A laurel wreath open at the top: a stem round each side from the bottom,
 * with leaves along it leaning outward. The right half is the left one
 * mirrored about `cx`.
 */
function laurel(c: string, cx = 24, cy = 24, r = 15, leaves = 6): string {
  let stem = '';
  let leaf = '';
  for (let i = 0; i <= leaves; i++) {
    // From just left of the bottom (100°) round to the upper left (240°);
    // SVG's y runs down, so 90° is straight below the centre.
    const deg = 100 + (i * 140) / leaves;
    const a = (deg * Math.PI) / 180;
    const x = f(cx + Math.cos(a) * r);
    const y = f(cy + Math.sin(a) * r);
    stem += `${i ? 'L' : 'M'}${x} ${y} `;
    if (i === 0) continue;
    const lx = f(cx + Math.cos(a) * (r + 2.6));
    const ly = f(cy + Math.sin(a) * (r + 2.6));
    leaf += `<ellipse cx='${lx}' cy='${ly}' rx='3.6' ry='1.6' transform='rotate(${f(deg + 60)} ${lx} ${ly})'/>`;
  }
  const half = `<path d='${stem}' stroke-width='1.2'/><g fill='${c}' fill-opacity='0.18' stroke-width='1.1'>${leaf}</g>`;
  return `<g stroke='${c}'>${half}<g transform='translate(${cx * 2} 0) scale(-1 1)'>${half}</g></g>`;
}

/* -------------------------------------------------------------------- fairy */

// Night-garden colours from the banner: leaf green and firefly yellow beside
// the pink accent.
const LEAF = '#86efac';
const FLY = '#fef08a';

const FAIRY: string[] = [
  // 1 Dewdrop
  glow(24, 29, 13, FLY, 0.12) +
  `<path d='M24 7 C20 14 13 21 13 29 A11 11 0 0 0 35 29 C35 21 28 14 24 7 Z'/>` +
  line('M18.5 27.5 A6 6 0 0 0 21.5 34.5', LEAF),

  // 2 Sprout
  line('M12 41 Q24 38 36 41', LEAF, 0.6) +
  `<path d='M24 40 V25'/>` +
  shape('M24 28 C22 20 15 17 9 18 C10 25 17 29 24 28 Z', LEAF) +
  shape('M24 24 C25 15 32 11 39 12 C38 20 31 25 24 24 Z', LEAF) +
  line('M24 28 L14 21 M24 24 L34 15', LEAF, 0.5, 1),

  // 3 Pixie
  `<g stroke='${LEAF}' fill='${LEAF}' fill-opacity='0.12'>` +
  `<ellipse cx='15' cy='19' rx='7.5' ry='4' transform='rotate(-35 15 19)'/>` +
  `<ellipse cx='33' cy='19' rx='7.5' ry='4' transform='rotate(35 33 19)'/>` +
  `<ellipse cx='16.5' cy='28' rx='5' ry='2.6' transform='rotate(25 16.5 28)'/>` +
  `<ellipse cx='31.5' cy='28' rx='5' ry='2.6' transform='rotate(-25 31.5 28)'/></g>` +
  `<circle cx='24' cy='13' r='3.5'/>` +
  `<path d='M24 17 C21.5 22 20.5 28 19.5 35 H28.5 C27.5 28 26.5 22 24 17 Z'/>` +
  twinkle(39, 9, 3, FLY) + twinkle(9, 39, 2.4, FLY),

  // 4 Sprite
  glow(24, 24, 10, FLY, 0.2) +
  `<path d='M24 6 Q25.5 22.5 42 24 Q25.5 25.5 24 42 Q22.5 25.5 6 24 Q22.5 22.5 24 6 Z'/>` +
  twinkle(38, 10, 3.5, LEAF) + twinkle(10, 38, 2.8, LEAF) + dot(24, 24, 1.6, FLY),

  // 5 Brownie — an acorn, the woodland larder
  `<path d='M12 22 C12 13 36 13 36 22 Z'/>` +
  line('M17 17 L20.5 22 M23 15.5 L26.5 22 M29 16.5 L32 22', LEAF, 0.7, 1.1) +
  `<path d='M14 22 C14 33 20 40 24 41 C28 40 34 33 34 22'/>` +
  `<path d='M24 15 C24 11 26 9 29 8'/>` +
  line('M19 26 C19 31 21 34 23 36', LEAF, 0.6),

  // 6 Wisp
  glow(30, 15, 10, FLY, 0.2) +
  `<circle cx='30' cy='15' r='4.5'/>` + dot(30, 15, 1.8, FLY) +
  `<path d='M26.5 18.5 C20 23 29 29 22 33 C17 36 19 41 12 42'/>` +
  line('M32 20 C30 26 35 30 31 35', LEAF, 0.6, 1.2),

  // 7 Moth Rider
  `<g stroke='${LEAF}' fill='${LEAF}' fill-opacity='0.1'>` +
  `<path d='M23 19 C15 9 6 12 7 20 C8 26 16 27 23 24 Z'/>` +
  `<path d='M25 19 C33 9 42 12 41 20 C40 26 32 27 25 24 Z'/>` +
  `<path d='M23 26 C17 28 13 34 16 37 C19 39 22 33 23 30 Z'/>` +
  `<path d='M25 26 C31 28 35 34 32 37 C29 39 26 33 25 30 Z'/></g>` +
  `<path d='M24 15 C25.5 20 25.5 32 24 37 C22.5 32 22.5 20 24 15 Z'/>` +
  `<path d='M23 15 C21 10 18 9 16 9 M25 15 C27 10 30 9 32 9'/>` +
  dot(14, 19, 1.6) + dot(34, 19, 1.6),

  // 8 Flower Keeper
  around(5, 24, 18, (a) => `<ellipse cx='24' cy='11' rx='4' ry='6' transform='rotate(${a} 24 18)'/>`) +
  dot(24, 18, 2.6, FLY) +
  line('M24 25 V42', LEAF) +
  shape('M24 36 C28 31 33 31 36 32 C34 36 29 38 24 36 Z', LEAF),

  // 9 Leaf Dancer
  shape('M10 38 C10 22 22 10 38 10 C38 26 26 38 10 38 Z', LEAF, 0.1) +
  `<path d='M10 38 L31 17 M18 30 V23 M18 30 H25 M24 24 V17.5 M24 24 H30.5'/>` +
  line('M38 31 C42 35 40 42 34 41', LEAF, 0.6, 1.2) +
  twinkle(41, 24, 2.6, FLY) + twinkle(8, 14, 2.2, FLY),

  // 10 Glimmerwing
  `<path d='M23 22 C18 10 8 8 7 15 C6 22 14 25 23 25 Z'/>` +
  `<path d='M25 22 C30 10 40 8 41 15 C42 22 34 25 25 25 Z'/>` +
  shape('M23 25 C15 27 12 35 16 38 C20 40 23 32 23 28 Z', LEAF) +
  shape('M25 25 C33 27 36 35 32 38 C28 40 25 32 25 28 Z', LEAF) +
  `<path d='M24 18 V37'/>` +
  dot(13, 15, 1.4, FLY) + dot(35, 15, 1.4, FLY) +
  twinkle(24, 8, 3, FLY) + twinkle(8, 33, 2.2, FLY) + twinkle(40, 33, 2.2, FLY),

  // 11 Moonpetal
  glow(22, 26, 14, FLY, 0.1) +
  `<path d='M27 7 A17 17 0 1 0 41 33 A13 13 0 1 1 27 7 Z'/>` +
  shape('M30 38 C29 33 32 29 36 29 C37 34 34 38 30 38 Z', LEAF) +
  twinkle(36, 13, 3, FLY) + twinkle(42, 21, 2, FLY),

  // 12 Brook Nymph — reeds at the water's edge
  line('M14 31 V13 M34 31 V17', LEAF) +
  line('M14 31 C17 24 21 20 24 16 M34 31 C31 26 28 23 26 22', LEAF, 0.6, 1.2) +
  `<rect x='12.4' y='9' width='3.2' height='9' rx='1.6' fill='currentColor' fill-opacity='0.2'/>` +
  `<rect x='32.4' y='13' width='3.2' height='8' rx='1.6' fill='currentColor' fill-opacity='0.2'/>` +
  `<path d='M5 33 Q11 29.5 17 33 T29 33 T41 33'/>` +
  line('M7 39 Q13 35.5 19 39 T31 39 T43 39', LEAF, 0.7),

  // 13 Wood Nymph — a wreath of leaves
  Array.from({ length: 9 }, (_, i) => {
    const deg = 135 + i * 33.75;
    const r = (deg * Math.PI) / 180;
    const x = f(24 + Math.cos(r) * 13);
    const y = f(22 + Math.sin(r) * 13);
    return `<ellipse cx='${x}' cy='${y}' rx='4.2' ry='2' transform='rotate(${f(deg + 90)} ${x} ${y})' stroke='${LEAF}' fill='${LEAF}' fill-opacity='0.15'/>`;
  }).join('') +
  dot(13, 15, 2) + dot(24, 9, 2.2) + dot(35, 15, 2) +
  `<path d='M19 34 L24 31 L29 34 M21 33 L17 42 M27 33 L31 42'/>`,

  // 14 Dryad
  `<path d='M14 28 C8 28 7 20 12 18 C11 11 19 8 23 11 C26 6 35 8 35 14 C41 15 42 24 36 27 C34 31 28 31 26 28 C23 31 17 31 14 28 Z'/>` +
  line('M22 29 V40 M26 29 V40 M22 34 L18 31 M26 33 L30 30', LEAF) +
  line('M17 42 Q21 41 22 39 M31 42 Q27 41 26 39', LEAF, 0.7) +
  dot(18, 19, 1.3, FLY) + dot(29, 15, 1.3, FLY) + dot(33, 22, 1.3, FLY),

  // 15 Toadstool Warden
  `<path d='M8 26 C8 13 40 13 40 26 Z'/>` +
  line('M18 26 C18 33 17 38 16 41 H32 C31 38 30 33 30 26', LEAF) +
  dot(16, 21, 2, FLY) + dot(25, 18, 2.4, FLY) + dot(33, 22, 1.8, FLY) +
  line('M10 42 H38', LEAF, 0.5),

  // 16 Glade Guardian
  `<path d='M24 6 L38 11 V23 C38 32 31 38 24 42 C17 38 10 32 10 23 V11 Z'/>` +
  shape('M24 33 C17 27 18 18 24 13 C30 18 31 27 24 33 Z', LEAF) +
  line('M24 15 V35', LEAF),

  // 17 Starlight Weaver
  glow(24, 19, 11, FLY, 0.15) +
  `<path d='${starPath(24, 19, 10, 4.2)}'/>` +
  line('M24 29 C24 35 18 37 16 34 C14 30 20 29 22 33 C24 38 30 42 37 40', LEAF, 0.8, 1.2) +
  dot(9, 12, 1.2, FLY) + dot(39, 10, 1.4, FLY) + dot(40, 26, 1, FLY),

  // 18 Fae Knight
  `<path d='M24 5 L27 9 V30 H21 V9 Z'/>` +
  line('M24 10 V28', LEAF, 0.5, 1) +
  shape('M21 30 C16 28 12 30 10 33 C15 34 19 33 21 31 Z', LEAF) +
  shape('M27 30 C32 28 36 30 38 33 C33 34 29 33 27 31 Z', LEAF) +
  `<path d='M24 31 V39'/>` + dot(24, 41.5, 2, FLY),

  // 19 Court Fae
  glow(24, 22, 14, FLY, 0.1) +
  `<path d='M13 18 L19 10 H29 L35 18 L24 40 Z'/>` +
  line('M13 18 H35 M19 10 L21.5 18 L24 40 L26.5 18 L29 10 M21.5 18 L24 10 L26.5 18', LEAF, 0.7, 1.1) +
  twinkle(38, 8, 3, FLY) + twinkle(9, 31, 2.2, FLY),

  // 20 Seelie Noble — a fairy castle
  `<path d='M12 42 V18 H19 V42 M29 42 V18 H36 V42 M19 42 V25 H29 V42 M8 42 H40'/>` +
  `<path d='M11 18 L15.5 8 L20 18 M28 18 L32.5 8 L37 18'/>` +
  line('M15.5 8 V4 L19 5.5 L15.5 7 M32.5 8 V4 L36 5.5 L32.5 7', LEAF) +
  line('M19 25 L21.5 22.5 L24 25 L26.5 22.5 L29 25', LEAF, 0.7) +
  line('M22 42 V37.5 A2 2 0 0 1 26 37.5 V42', LEAF) +
  dot(15.5, 24, 1.2, FLY) + dot(32.5, 24, 1.2, FLY),

  // 21 Wish Granter
  `<path d='M9 41 L27 23'/>` +
  glow(32, 17, 10, FLY, 0.2) +
  `<path d='${starPath(32, 17, 7.5, 3.2)}' fill='${FLY}' fill-opacity='0.25'/>` +
  line('M11 31 C13 24 18 20 23 19', LEAF, 0.6, 1.2) +
  twinkle(17, 13, 2.6, FLY) + twinkle(40, 31, 2.2, FLY) + twinkle(25, 7, 1.8, FLY),

  // 22 Rainbow Keeper
  `<path d='M8 34 A16 16 0 0 1 40 34'/>` +
  line('M12 34 A12 12 0 0 1 36 34', LEAF) +
  line('M16 34 A8 8 0 0 1 32 34', FLY) +
  `<path d='M3 37 C3 33 8 32 9.5 34 C11 31 16 32 15 37 Z M33 37 C32 32 37 31 38.5 34 C40 32 45 33 45 37 Z' fill='currentColor' fill-opacity='0.12'/>`,

  // 23 Dream Weaver
  `<path d='M12 36 C6 36 6 28 12 28 C12 21 22 19 25 24 C28 20 36 21 36 28 C42 28 42 36 36 36 Z'/>` +
  `<path d='M33 5 A7 7 0 1 0 42 15 A5.5 5.5 0 1 1 33 5 Z' stroke='${FLY}' fill='${FLY}' fill-opacity='0.25'/>` +
  twinkle(12, 13, 2.6, LEAF) + twinkle(21, 7, 2, LEAF) + dot(25, 15, 1, FLY),

  // 24 Fae Enchanter — a lotus
  line('M8 37 Q24 33 40 37', LEAF, 0.6) +
  line('M22 33 C14 34 9 31 7 28 C13 27 18 29 22 33 M26 33 C34 34 39 31 41 28 C35 27 30 29 26 33', LEAF, 0.6) +
  shape('M24 33 C17 32 13 26 12 21 C18 22 22 26 24 33 Z', LEAF) +
  shape('M24 33 C31 32 35 26 36 21 C30 22 26 26 24 33 Z', LEAF) +
  `<path d='M24 33 C19 27 20 18 24 13 C28 18 29 27 24 33 Z' fill='currentColor' fill-opacity='0.12'/>` +
  twinkle(24, 6, 2.6, FLY),

  // 25 Fae Monarch
  `<path d='M10 34 L8 16 L17 24 L24 12 L31 24 L40 16 L38 34 Z'/>` +
  `<path d='M10 39 H38'/>` +
  dot(8, 15, 2, FLY) + dot(24, 11, 2.3, FLY) + dot(40, 15, 2, FLY) +
  dot(17, 30, 1.4, LEAF) + dot(24, 30, 1.6, LEAF) + dot(31, 30, 1.4, LEAF),

  // 26 Ruler of the Summer Court
  glow(24, 24, 12, FLY, 0.18) +
  `<circle cx='24' cy='24' r='7'/>` +
  around(8, 24, 24, (a) => `<path d='M24 14.5 C22.3 12 22.3 9 24 5.5 C25.7 9 25.7 12 24 14.5 Z' stroke='${LEAF}' fill='${LEAF}' fill-opacity='0.14' transform='rotate(${a} 24 24)'/>`) +
  around(8, 24, 24, (a) => `<circle cx='24' cy='10' r='1' fill='${FLY}' stroke='none' transform='rotate(${a} 24 24)'/>`, 22.5),

  // 27 Ruler of the Winter Court
  around(3, 24, 24, (a) => `<path d='M24 6 V42' transform='rotate(${a} 24 24)'/>`) +
  around(6, 24, 24, (a) => `<path d='M24 12 L20.5 8.5 M24 12 L27.5 8.5 M24 18 L19.5 13.5 M24 18 L28.5 13.5' stroke='${LEAF}' stroke-width='1.2' transform='rotate(${a} 24 24)'/>`) +
  dot(24, 24, 2.4, FLY),

  // 28 Ancient Fae — the oldest tree in the wood
  `<path d='M24 5 L33 17 H28 L36 27 H30 L39 37 H9 L18 27 H12 L20 17 H15 Z'/>` +
  line('M22 37 V41 M26 37 V41', LEAF) +
  line('M22 41 C20 42.5 17 42.5 13 43.5 M26 41 C28 42.5 31 42.5 35 43.5 M24 41 V44', LEAF, 0.7) +
  dot(20, 24, 1.2, FLY) + dot(28, 31, 1.2, FLY) + dot(24, 14, 1.2, FLY),

  // 29 Spirit of the Wild Wood — a stag
  `<path d='M20 22 C20 30 22 36 24 40 C26 36 28 30 28 22 C28 19 20 19 20 22 Z'/>` +
  `<path d='M20 23 C16 22 14 20 13 18 C16 18 19 19 20 21 M28 23 C32 22 34 20 35 18 C32 18 29 19 28 21'/>` +
  line('M21.5 19.5 C17 14 14 10 13 4 M16 12 L9 10 M14 8 L9.5 4.5 M27 19.5 C31 14 34 10 35 4 M32 12 L39 10 M34 8 L38.5 4.5', LEAF) +
  dot(22, 26, 1.1, FLY) + dot(26, 26, 1.1, FLY) + dot(24, 38, 1.3),

  // 30 Eternal Fae
  glow(24, 24, 13, FLY, 0.14) +
  shape('M16 24 C10 13 3 13 2.5 20 C2 27 10 30 16 27 Z', LEAF, 0.1) +
  shape('M32 24 C38 13 45 13 45.5 20 C46 27 38 30 32 27 Z', LEAF, 0.1) +
  `<circle cx='24' cy='24' r='8'/>` +
  `<circle cx='24' cy='24' r='13' stroke-dasharray='0.5 3.5' stroke-opacity='0.7'/>` +
  `<path d='M26 18.5 A6 6 0 1 0 28.5 28.5 A4.5 4.5 0 1 1 26 18.5 Z' fill='${FLY}' fill-opacity='0.3' stroke='${FLY}'/>` +
  twinkle(24, 5, 2.6, FLY),
];

/* ------------------------------------------------------------------ freight */

// The dispatch desk's colours: lane blue and a pale hub white beside the amber.
const LANE = '#8fb3ff';
const HUB = '#dbe6ff';

const FREIGHT: string[] = [
  // 1 Trainee — a notepad and pencil
  `<path d='M10 10 H30 V42 H10 Z'/>` +
  line('M15 7 V12 M20 7 V12 M25 7 V12', LANE) +
  line('M14 19 H26 M14 25 H26 M14 31 H21', LANE, 0.7, 1.2) +
  `<path d='M36 13 L40 17 L28 37 L23 39 L24 33 Z M24 33 L28 37'/>`,

  // 2 Rate Checker — a calculator
  `<rect x='12' y='6' width='24' height='36' rx='3'/>` +
  `<rect x='16' y='10' width='16' height='8' rx='1' stroke='${LANE}'/>` +
  line('M28 14 H29', HUB, 1, 1.4) +
  [24, 30, 36].map((y) => [18, 24, 30].map((x) => dot(x, y, 1.5, y === 36 && x === 30 ? 'currentColor' : LANE)).join('')).join(''),

  // 3 Load Poster — a clipboard with a load on it
  `<rect x='11' y='9' width='26' height='33' rx='2.5'/>` +
  `<path d='M18 11 V6.5 H30 V11 Z'/>` +
  line('M18 22 L24 19 L30 22 V30 L24 33 L18 30 Z M18 22 L24 25 L30 22 M24 25 V33', LANE),

  // 4 Lane Scout — a folded map with a lane drawn on it
  `<path d='M6 12 L17 8 L31 12 L42 8 V36 L31 40 L17 36 L6 40 Z'/>` +
  line('M17 8 V36 M31 12 V40', LANE, 0.6) +
  `<path d='M10 32 C16 26 22 31 26 23 S34 16 38 15' stroke-dasharray='2 3' stroke-width='1.3'/>` +
  dot(10, 32, 1.8) + dot(38, 15, 2.2, HUB),

  // 5 Cold Caller — a handset, ringing
  `<path d='M14 8 H19 L22 16 L18 19 C20 25 23 28 29 30 L32 26 L40 29 V34 C40 37 37 40 34 40 C20 39 9 28 8 14 C8 11 11 8 14 8 Z'/>` +
  line('M28 8 A12 12 0 0 1 40 20 M28 14 A6 6 0 0 1 34 20', LANE),

  // 6 Quote Slinger — a receipt with a total
  `<path d='M12 6 H36 V42 L33 40 L30 42 L27 40 L24 42 L21 40 L18 42 L15 40 L12 42 Z'/>` +
  line('M17 13 H31 M17 19 H27 M17 25 H29', LANE, 0.7, 1.2) +
  `<path d='M17 32 H31 M17 35 H31' stroke-width='1.3'/>`,

  // 7 Junior Broker — a briefcase
  `<rect x='7' y='15' width='34' height='24' rx='3'/>` +
  `<path d='M18 15 V11 C18 10 19 9 20 9 H28 C29 9 30 10 30 11 V15'/>` +
  line('M7 25 H41', LANE, 0.7) +
  `<rect x='21' y='22.5' width='6' height='5' rx='1' stroke='${HUB}'/>`,

  // 8 Carrier Wrangler — a tractor-trailer
  `<rect x='4' y='12' width='26' height='19' rx='1.5'/>` +
  `<path d='M30 17 H37 L43 24 V31 H30 Z'/>` +
  line('M32 19.5 H36.3 L40 24 H32 Z', LANE) +
  `<circle cx='11' cy='33.5' r='3.5'/><circle cx='22' cy='33.5' r='3.5'/><circle cx='37' cy='33.5' r='3.5'/>` +
  line('M2 40 H46', LANE, 0.4, 1) + line('M8 18 H24 M8 23 H20', LANE, 0.5, 1.1),

  // 9 Deal Closer — a signed contract with its seal
  `<path d='M11 6 H29 L35 12 V42 H11 Z M29 6 V12 H35'/>` +
  line('M15 14 H24 M15 19 H30 M15 24 H30', LANE, 0.7, 1.2) +
  `<path d='M15 33 C17 29 19 36 21 31 S24 34 26 32'/>` +
  `<circle cx='32' cy='36' r='6' stroke='${LANE}' fill='${LANE}' fill-opacity='0.12'/>` +
  `<path d='M29.5 36 L31.5 38 L35 34'/>`,

  // 10 Lane Hunter — a lane run to a target
  line('M6 41 C14 31 10 23 20 21 S28 16 29 14', LANE, 0.8, 1.3).replace('/>', ` stroke-dasharray='2 3'/>`) +
  dot(6, 41, 2) +
  `<circle cx='34' cy='12' r='7'/><circle cx='34' cy='12' r='2.6'/>` +
  `<path d='M34 2 V5 M34 19 V22 M24 12 H27 M41 12 H44'/>`,

  // 11 Freight Broker — a box, taped
  `<path d='M24 6 L40 14 V34 L24 42 L8 34 V14 Z M8 14 L24 22 L40 14 M24 22 V42'/>` +
  line('M16 10 L32 18 V24', LANE),

  // 12 Senior Broker — a shipping container
  `<path d='M5 15 H35 V37 H5 Z M35 15 L42 10 V32 L35 37 M5 15 L12 10 H42'/>` +
  line('M10 18 V34 M15 18 V34 M20 18 V34 M25 18 V34 M30 18 V34', LANE, 0.7, 1.1),

  // 13 Capacity Finder — a warehouse
  `<path d='M5 20 L24 9 L43 20 V42 H5 Z'/>` +
  line('M12 42 V26 H22 V42 M26 42 V26 H36 V42 M12 30 H22 M12 34 H22 M26 30 H36 M26 34 H36', LANE, 0.8, 1.2) +
  dot(24, 17, 1.6, HUB),

  // 14 Book Builder — an open book of business
  `<path d='M24 12 C19 8 11 8 6 10 V38 C11 36 19 36 24 40 C29 36 37 36 42 38 V10 C37 8 29 8 24 12 Z M24 12 V40'/>` +
  line('M10 16 C14 15 18 15 21 17 M10 22 C14 21 18 21 21 23 M10 28 C14 27 18 27 21 29 M38 16 C34 15 30 15 27 17 M38 22 C34 21 30 21 27 23 M38 28 C34 27 30 27 27 29', LANE, 0.6, 1.1),

  // 15 Lane Master — a road and its marker
  `<path d='M5 42 L17 6 M29 42 L21 6'/>` +
  line('M17 42 L19 6', LANE, 0.8, 1.3).replace('/>', ` stroke-dasharray='3 4'/>`) +
  `<path d='M39 22 V42 M32 13 H43 L46 17.5 L43 22 H32 Z'/>` + dot(37, 17.5, 1.5, LANE),

  // 16 Account Executive — an office tower
  `<path d='M13 42 V6 H35 V42 M6 42 H42 M21 42 V36 H27 V42'/>` +
  [11, 17, 23, 29].map((y) => line(`M17 ${y} H20 M22.5 ${y} H25.5 M28 ${y} H31`, LANE, 0.8, 1.4)).join(''),

  // 17 Logistics Strategist — a chess knight
  `<path d='M17 40 C17 34 20 30 23 27 C19 27 15 28 13 25 L18 16 C19 12 22 10 26 9 L27 6 L29 9 C34 11 36 18 34 26 C33 31 32 35 32 40'/>` +
  `<path d='M13 42 H36'/>` + dot(25, 15, 1.4, LANE) + line('M29 14 C31 18 31 22 30 26', LANE, 0.6, 1.1),

  // 18 Network Builder — hubs and the lanes between them
  line('M24 10 L10 22 M24 10 L38 22 M10 22 L16 38 M38 22 L32 38 M16 38 L32 38 M24 25 L10 22 M24 25 L38 22 M24 25 L16 38 M24 25 L32 38 M24 10 V25', LANE, 0.55, 1.1) +
  [[24, 10], [10, 22], [38, 22], [16, 38], [32, 38]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='3' fill='currentColor' fill-opacity='0.2'/>`).join('') +
  glow(24, 25, 6, HUB, 0.3) + dot(24, 25, 2.4, HUB),

  // 19 Freight Ace — a medal
  line('M14 5 L21 21 M34 5 L27 21 M20 5 L24 14 L28 5', LANE) +
  `<circle cx='24' cy='30' r='10'/>` +
  `<path d='${starPath(24, 30, 5.5, 2.3)}' stroke='${HUB}'/>`,

  // 20 Top Producer — a trophy
  `<path d='M15 8 H33 V18 C33 24 29 28 24 28 C19 28 15 24 15 18 Z'/>` +
  `<path d='M15 11 H10 C10 17 12 20 15 20 M33 11 H38 C38 17 36 20 33 20 M24 28 V34 M17 41 H31 L29 34 H19 Z'/>` +
  `<path d='${starPath(24, 17, 4.5, 1.9)}' stroke='${LANE}'/>`,

  // 21 Desk Captain — a ship's wheel at the helm of the desk
  around(8, 24, 24, (a) => `<path d='M24 20.5 V7' stroke='${LANE}' transform='rotate(${a} 24 24)'/><circle cx='24' cy='5.5' r='1.6' fill='currentColor' stroke='none' transform='rotate(${a} 24 24)'/>`) +
  `<circle cx='24' cy='24' r='11'/><circle cx='24' cy='24' r='3.5'/>`,

  // 22 Brokerage Boss — the head office
  `<path d='M6 16 L24 6 L42 16 Z M8 19 H40 M8 36 H40 M5 40 H43'/>` +
  line('M11 21 V34 M19 21 V34 M29 21 V34 M37 21 V34', LANE) + dot(24, 12.5, 1.5, HUB),

  // 23 Supply Chain Sage — two links of a chain
  `<rect x='5' y='18' width='22' height='12' rx='6' transform='rotate(-45 16 24)'/>` +
  `<rect x='21' y='18' width='22' height='12' rx='6' transform='rotate(-45 32 24)' stroke='${LANE}'/>`,

  // 24 Freight Tycoon — stacked coins
  `<ellipse cx='19' cy='14' rx='11' ry='4'/>` +
  `<path d='M8 14 V34 A11 4 0 0 0 30 34 V14'/>` +
  line('M8 20.5 A11 4 0 0 0 30 20.5 M8 27 A11 4 0 0 0 30 27', LANE, 0.8) +
  `<circle cx='36' cy='35' r='7'/>` + `<circle cx='36' cy='35' r='4' stroke='${HUB}' stroke-width='1.1'/>`,

  // 25 Logistics Titan — a factory
  `<path d='M5 42 V22 L15 28 V22 L25 28 V22 L35 28 V10 H42 V42 Z'/>` +
  line('M10 35 H14 M20 35 H24 M30 35 H34', LANE, 1, 1.6) +
  line('M38.5 7 C36.5 4 39.5 2 41.5 3', HUB, 0.6, 1.2),

  // 26 Road Baron — a locomotive, head on
  `<rect x='12' y='5' width='24' height='29' rx='5'/>` +
  `<rect x='16' y='9' width='16' height='9' rx='1.5' stroke='${LANE}'/>` +
  dot(18, 27, 1.8, HUB) + dot(30, 27, 1.8, HUB) +
  `<path d='M17 34 L11 43 M31 34 L37 43'/>` + line('M14 38.5 H34 M12 43 H36', LANE, 0.6, 1.2),

  // 27 Lane Legend — a plane
  `<path d='M24 5 C26 5 27 8 27 11 V19 L41 27 V31 L27 26.5 V35 L32 39 V42 L24 40 L16 42 V39 L21 35 V26.5 L7 31 V27 L21 19 V11 C21 8 22 5 24 5 Z'/>` +
  line('M24 9 V15', LANE, 0.8, 1.2),

  // 28 Freight Mogul — a top hat
  `<path d='M5 36 C10 40 38 40 43 36'/>` +
  `<path d='M13 37.5 V12 C13 8.5 35 8.5 35 12 V37.5'/>` +
  `<path d='M13 28 C18 30.5 30 30.5 35 28 V33 C30 35.5 18 35.5 13 33 Z' stroke='${LANE}' fill='${LANE}' fill-opacity='0.2'/>`,

  // 29 Coast-to-Coast Icon — the country crossed on a globe
  `<circle cx='24' cy='24' r='17'/>` +
  line('M7 24 H41 M10 15 H38 M10 33 H38', LANE, 0.5, 1.1) +
  `<ellipse cx='24' cy='24' rx='7' ry='17' stroke='${LANE}' stroke-opacity='0.5' stroke-width='1.1'/>` +
  `<path d='M10 29 Q22 8 38 19' stroke-width='1.8'/>` + dot(10, 29, 2.2) + dot(38, 19, 2.2, HUB),

  // 30 Freight Hall of Famer — a star in a laurel
  laurel(LANE, 24, 23, 15) +
  glow(24, 21, 10, HUB, 0.25) +
  `<path d='${starPath(24, 21, 10, 4.4)}'/>` +
  `<path d='M18 38 L24 42 L30 38'/>`,
];

/* ---------------------------------------------------------------- wizarding */

// The arcane circle's violet, the moon's gold and starlight.
const ARCANE = '#a78bfa';
const MOON = '#fde68a';
const STAR = '#ede9fe';

const WIZARDING: string[] = [
  // 1 Curious Novice — a first spellbook
  `<path d='M12 7 H35 V41 H12 C10 41 9 40 9 38 V10 C9 8 10 7 12 7 Z M14 7 V41'/>` +
  `<path d='${starPath(25, 20, 5, 2.1)}' stroke='${ARCANE}'/>` +
  line('M20 31 H30', ARCANE, 0.6, 1.1) + twinkle(39, 8, 2.6, MOON),

  // 2 Apprentice — a scroll
  `<rect x='8' y='7' width='32' height='6' rx='3'/><rect x='8' y='35' width='32' height='6' rx='3'/>` +
  `<path d='M11 13 V35 M37 13 V35'/>` +
  line('M16 19 H32 M16 24 H32 M16 29 H26', ARCANE, 0.8, 1.2),

  // 3 Spell Student — a pointed hat
  `<path d='M13 36 L25 6 L35 36'/>` +
  `<path d='M6 37 C12 41.5 36 41.5 42 37 C36 33.5 12 33.5 6 37 Z'/>` +
  line('M15 31 C20 33 28 33 33 31', ARCANE, 1, 1.8) +
  dot(23, 18, 1.2, MOON) + dot(28, 24, 1, MOON) + twinkle(25, 6, 2.4, MOON),

  // 4 Potion Brewer — a conical flask
  `<path d='M19 6 H29 M21 6 V18 L10 38 C9 40 10 42 13 42 H35 C38 42 39 40 38 38 L27 18 V6'/>` +
  `<path d='M14 31 C18 29 22 33 26 31 S32 29 34.5 31 L37 36.5 C37.5 38 37 39 35 39 H13 C11 39 10.5 38 11 36.5 Z' stroke='${ARCANE}' fill='${ARCANE}' fill-opacity='0.2'/>` +
  `<circle cx='22' cy='25' r='1.6' stroke='${MOON}'/><circle cx='26' cy='20' r='1.1' stroke='${MOON}'/>`,

  // 5 Charm Caster — a charm on its chain
  line('M14 5 L24 16 L34 5', ARCANE) +
  `<circle cx='24' cy='27' r='10'/><circle cx='24' cy='27' r='6.5' stroke='${ARCANE}' stroke-opacity='0.6'/>` +
  twinkle(24, 27, 4, MOON) + twinkle(39, 22, 2.2, STAR) + twinkle(9, 34, 2, STAR),

  // 6 Rune Reader — three rune stones
  `<rect x='5' y='15' width='13' height='19' rx='5' transform='rotate(-10 11.5 24.5)'/>` +
  `<rect x='18' y='9' width='13' height='21' rx='5'/>` +
  `<rect x='30' y='19' width='13' height='19' rx='5' transform='rotate(10 36.5 28.5)'/>` +
  line('M11 19 V29 M11 21.5 L15 19 M11 25 L15 22.5 M24.5 13 V26 M21.5 16 L27.5 22 M27.5 16 L21.5 22 M36 24 V34 M36 24 L39.5 27.5 L36 31', ARCANE, 1, 1.3),

  // 7 Hedge Mage — a staff grown over with leaves
  `<path d='M30 8 L16 43'/>` +
  `<path d='M30 8 C33 4 38 7 35.5 11 C33.5 14 30 11.5 32 9.5'/>` +
  [[27, 16, -30], [23.5, 25, 40], [20, 33, -30]].map(([x, y, r]) =>
    `<ellipse cx='${x + (r > 0 ? 3.5 : -3.5)}' cy='${y}' rx='3.6' ry='1.7' transform='rotate(${r} ${x + (r > 0 ? 3.5 : -3.5)} ${y})' stroke='${ARCANE}' fill='${ARCANE}' fill-opacity='0.2'/>`).join('') +
  glow(31, 8, 7, MOON, 0.25),

  // 8 Enchanter — a wand, lit
  `<path d='M9 40 L31 18' stroke-width='2.6'/>` +
  `<path d='M9 40 L13 36' stroke='${ARCANE}' stroke-width='2.6'/>` +
  glow(33, 15, 8, MOON, 0.3) + dot(33, 15, 2, MOON) +
  line('M37 9 L39.5 6.5 M38 16 H41.5 M31 9.5 V6 M39 21 L41 23', MOON, 1, 1.3),

  // 9 Illusionist — an eye with a spiral for a pupil
  `<path d='M4 24 C11 13 37 13 44 24 C37 35 11 35 4 24 Z'/>` +
  `<circle cx='24' cy='24' r='8' stroke='${ARCANE}'/>` +
  `<path d='M24 24 m0 -1 a1.2 1.2 0 1 1 -1.2 1.2 a2.6 2.6 0 0 1 2.6 -2.6 a4 4 0 0 1 4 4 a5 5 0 0 1 -5 5' stroke-width='1.2'/>`,

  // 10 Conjurer — a summoning circle
  `<circle cx='24' cy='24' r='17'/>` +
  `<circle cx='24' cy='24' r='13' stroke='${ARCANE}' stroke-opacity='0.5' stroke-dasharray='1 3'/>` +
  (() => {
    const p = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      return `${f(24 + Math.cos(a) * 13)} ${f(24 + Math.sin(a) * 13)}`;
    });
    return `<path d='M${p.join(' L')} Z' stroke='${ARCANE}'/>`;
  })() + dot(24, 24, 1.6, MOON),

  // 11 Alchemist — a round flask, bubbling
  `<path d='M19 6 H29 M21 6 V17 A12 12 0 1 0 27 17 V6'/>` +
  `<path d='M12.6 31 C16 29 20 33 24 31 S31 29 35.4 31 A12 12 0 0 1 12.6 31 Z' stroke='${ARCANE}' fill='${ARCANE}' fill-opacity='0.2'/>` +
  `<circle cx='20' cy='25' r='1.5' stroke='${MOON}'/><circle cx='27' cy='22' r='2' stroke='${MOON}'/><circle cx='24' cy='12' r='1' stroke='${MOON}'/>`,

  // 12 Sorcerer — a flame
  `<path d='M24 42 C15 42 11 35 13 28 C15 22 20 20 19 12 C25 15 28 20 27 26 C29 24 30 22 30 19 C35 24 37 30 35 35 C33 40 29 42 24 42 Z'/>` +
  `<path d='M24 40 C20 40 18 36 20 33 C22 30 24 30 23 26 C27 29 29 33 28 36 C27 39 26 40 24 40 Z' stroke='${MOON}' fill='${MOON}' fill-opacity='0.2'/>`,

  // 13 Spellbinder — a grimoire, clasped shut
  `<path d='M10 7 H34 V41 H10 Z M13 7 V41'/>` +
  line('M30 20 H38 V28 H30', ARCANE) +
  `<circle cx='34' cy='23' r='1.4' fill='${MOON}' stroke='none'/>` + line('M34 24.5 V26', MOON, 1, 1.2) +
  `<path d='${starPath(21.5, 24, 5.5, 2.2)}' stroke='${ARCANE}' stroke-opacity='0.8'/>`,

  // 14 Battle Mage — crossed blades
  `<path d='M10 7 L30 27 M38 7 L18 27' stroke-width='2'/>` +
  line('M26 31 L34 23 M14 23 L22 31', ARCANE, 1, 2) +
  `<path d='M30 27 L37 34 M18 27 L11 34'/>` + dot(38.5, 35.5, 2, MOON) + dot(9.5, 35.5, 2, MOON),

  // 15 Elementalist — lightning in a ring of the four elements
  `<circle cx='24' cy='24' r='18' stroke='${ARCANE}' stroke-opacity='0.4' stroke-dasharray='2 4'/>` +
  `<path d='M27 6 L15 26 H23 L20 42 L33 21 H25 Z' fill='currentColor' fill-opacity='0.12'/>` +
  dot(24, 6, 1.6, MOON) + dot(42, 24, 1.6, ARCANE) + dot(24, 42, 1.6, STAR) + dot(6, 24, 1.6, MOON),

  // 16 Seer — a crystal ball
  glow(24, 20, 13, ARCANE, 0.25) +
  `<circle cx='24' cy='20' r='13'/>` +
  `<path d='M14 34 L11 42 H37 L34 34 Z'/>` +
  line('M17 20 C19 14 27 14 29 19', STAR, 0.8, 1.2) + twinkle(28, 25, 2.4, MOON) + dot(19, 26, 1, MOON),

  // 17 Oracle — moon and star
  glow(20, 26, 13, MOON, 0.15) +
  `<path d='M24 7 A17 17 0 1 0 41 30 A13 13 0 1 1 24 7 Z'/>` +
  `<path d='${starPath(35, 14, 6, 2.5)}' stroke='${MOON}' fill='${MOON}' fill-opacity='0.25'/>` +
  dot(40, 24, 1, STAR) + dot(30, 6, 1, STAR),

  // 18 Warlock — a skull
  `<path d='M24 6 C14 6 9 13 9 21 C9 27 12 30 15 31 V37 H33 V31 C36 30 39 27 39 21 C39 13 34 6 24 6 Z'/>` +
  `<circle cx='18' cy='21' r='3.5' stroke='${ARCANE}' fill='${ARCANE}' fill-opacity='0.25'/>` +
  `<circle cx='30' cy='21' r='3.5' stroke='${ARCANE}' fill='${ARCANE}' fill-opacity='0.25'/>` +
  `<path d='M24 25.5 L22 29 H26 Z M20 37 V33 M24 37 V33 M28 37 V33'/>`,

  // 19 High Wizard — the tower
  `<path d='M17 42 V18 H31 V42 M12 42 H36 M15 18 L24 4 L33 18 Z'/>` +
  line('M21.5 28 V24.5 A2.5 2.5 0 0 1 26.5 24.5 V28 Z M21.5 42 V36 A2.5 2.5 0 0 1 26.5 36 V42', ARCANE) +
  dot(24, 26, 1.1, MOON) + twinkle(39, 9, 2.4, STAR) + twinkle(8, 14, 2, STAR),

  // 20 Archmage — a staff with a crystal
  `<path d='M24 19 V44'/>` +
  glow(24, 11, 9, ARCANE, 0.3) +
  `<path d='M24 4 L29 11 L24 18 L19 11 Z' stroke='${ARCANE}' fill='${ARCANE}' fill-opacity='0.25'/>` +
  `<path d='M19.5 16 C16.5 13 16.5 8 19 6.5 M28.5 16 C31.5 13 31.5 8 29 6.5'/>` +
  twinkle(10, 12, 2.4, MOON) + twinkle(38, 10, 2.2, MOON) + line('M21 30 H27', ARCANE, 0.7, 1.2),

  // 21 Master of Runes — the arcane circle
  `<circle cx='24' cy='24' r='17'/>` +
  `<circle cx='24' cy='24' r='12.5' stroke='${ARCANE}' stroke-dasharray='1.5 3.5'/>` +
  `<path d='M24 12.5 L34.8 30.25 H13.2 Z' stroke='${ARCANE}'/>` +
  around(12, 24, 24, (a) => `<path d='M24 7 V4.5' stroke-width='1.2' transform='rotate(${a} 24 24)'/>`) +
  dot(24, 25, 1.6, MOON),

  // 22 Keeper of the Tower — an old key
  `<circle cx='15' cy='15' r='8'/>` +
  around(4, 15, 15, (a) => `<circle cx='15' cy='12' r='2.2' stroke='${ARCANE}' stroke-width='1.1' transform='rotate(${a} 15 15)'/>`) +
  `<path d='M20.7 20.7 L41 41 M34 34 L37.5 30.5 M38 38 L41.5 34.5'/>`,

  // 23 Grand Sorcerer — a whirlwind
  `<path d='M7 9 C15 6 33 6 41 9 M10 16 C17 13.5 31 13.5 36 16 M14 23 C19 21 28 21 32 23 M18 30 C21 28.5 26 28.5 28 30 M21 36 C22.5 35 24.5 35 25.5 36 M23 41 V42'/>` +
  line('M41 9 C33 12 15 12 10 16 M36 16 C30 19 18 19 14 23 M32 23 C27 26 21 26 18 30 M28 30 C25.5 32.5 22.5 33 21 36', ARCANE, 0.7, 1.2),

  // 24 Chronomancer — an hourglass
  `<path d='M12 6 H36 M12 42 H36 M15 6 C15 16 22 20 22 24 C22 28 15 32 15 42 M33 6 C33 16 26 20 26 24 C26 28 33 32 33 42'/>` +
  `<path d='M18.5 12 H29.5 L24 20 Z' fill='${MOON}' fill-opacity='0.35' stroke='${MOON}'/>` +
  `<path d='M17 41 C19 36 29 36 31 41 Z' fill='${MOON}' fill-opacity='0.35' stroke='${MOON}'/>` +
  line('M24 22 V35', MOON, 0.7, 1),

  // 25 Starcaller — an eight-pointed star
  glow(24, 24, 12, STAR, 0.25) +
  `<path d='${starPath(24, 24, 18, 5, 4)}'/>` +
  `<path d='${starPath(24, 24, 11, 4, 4, Math.PI / 4)}' stroke='${ARCANE}'/>` + dot(24, 24, 1.8, MOON),

  // 26 Sage of Ages — infinity
  `<path d='M24 24 C20 18 9 16 9 24 C9 32 20 30 24 24 C28 18 39 16 39 24 C39 32 28 30 24 24 Z'/>` +
  line('M24 24 C21 20 13 19 13 24 C13 29 21 28 24 24', ARCANE, 0.5, 1.1) +
  twinkle(24, 10, 2.8, MOON) + twinkle(15, 38, 2, STAR) + twinkle(33, 38, 2, STAR),

  // 27 Arch-Sorcerer — orbits round a burning core
  around(3, 24, 24, (a) => `<ellipse cx='24' cy='24' rx='18' ry='6.5' stroke='${ARCANE}' transform='rotate(${a + 30} 24 24)'/>`) +
  glow(24, 24, 7, MOON, 0.4) + `<circle cx='24' cy='24' r='3.6'/>` + dot(24, 24, 1.6, MOON),

  // 28 Mage Lord — a crown crested by a crescent
  `<path d='M9 36 L7 18 L16 26 L24 15 L32 26 L41 18 L39 36 Z M9 40 H39'/>` +
  `<path d='M22 4 A6 6 0 1 0 29 11 A4.6 4.6 0 1 1 22 4 Z' stroke='${MOON}' fill='${MOON}' fill-opacity='0.3'/>` +
  dot(17, 32, 1.4, ARCANE) + dot(24, 31, 1.7, ARCANE) + dot(31, 32, 1.4, ARCANE),

  // 29 Wizard Eternal — the sun holding the moon
  glow(24, 24, 12, MOON, 0.2) +
  `<circle cx='24' cy='24' r='9'/>` +
  around(12, 24, 24, (a) => `<path d='M24 ${a % 60 === 0 ? 4 : 7} V11' transform='rotate(${a} 24 24)'/>`) +
  `<path d='M26 18.5 A6 6 0 1 0 29 28 A4.5 4.5 0 1 1 26 18.5 Z' stroke='${ARCANE}' fill='${ARCANE}' fill-opacity='0.3'/>`,

  // 30 Supreme Archmage — a crystal over an open book, alight
  `<path d='M24 34 C19 31 11 31 6 33 V43 C11 41 19 41 24 44 C29 41 37 41 42 43 V33 C37 31 29 31 24 34 Z M24 34 V44'/>` +
  glow(24, 16, 11, ARCANE, 0.35) +
  `<path d='M24 5 L30 15 L24 26 L18 15 Z' stroke='${ARCANE}' fill='${ARCANE}' fill-opacity='0.25'/>` +
  line('M18 15 H30 M24 5 V26', ARCANE, 0.6, 1) +
  line('M11 10 L14 13 M37 10 L34 13 M8 20 H12 M40 20 H36', MOON, 1, 1.3),
];

/* ------------------------------------------------------------------ empires */

// Gold on crimson, as on the banner: a pale gold for the detail and a ruby
// for the few stones.
const PALE = '#f5deb3';
const RUBY = '#fb7185';

/** A plain crown, the banner's five-stroke one, scaled into a box. */
const crownPath = (x: number, y: number, w: number, h: number) => {
  const X = (t: number) => f(x + t * w);
  const Y = (t: number) => f(y + t * h);
  return `M${X(0.06)} ${Y(1)} L${X(0)} ${Y(0.18)} L${X(0.27)} ${Y(0.55)} L${X(0.5)} ${Y(0)} L${X(0.73)} ${Y(0.55)} L${X(1)} ${Y(0.18)} L${X(0.94)} ${Y(1)} Z`;
};

const EMPIRE: string[] = [
  // 1 Peasant — a stalk of wheat
  `<path d='M24 43 V10'/>` +
  [14, 20, 26].map((y) =>
    `<ellipse cx='20.5' cy='${y}' rx='2' ry='4' transform='rotate(-35 20.5 ${y})' stroke='${PALE}' fill='${PALE}' fill-opacity='0.2'/>` +
    `<ellipse cx='27.5' cy='${y}' rx='2' ry='4' transform='rotate(35 27.5 ${y})' stroke='${PALE}' fill='${PALE}' fill-opacity='0.2'/>`).join('') +
  `<ellipse cx='24' cy='8' rx='2' ry='4' stroke='${PALE}'/>` +
  `<path d='M24 36 C28 33 32 33 36 30'/>`,

  // 2 Villager — a cottage
  `<path d='M7 22 L24 9 L41 22 M11 19 V41 H37 V19 M31 13.5 V8 H35 V17'/>` +
  line('M20 41 V32 H28 V41', PALE) +
  `<rect x='14' y='24' width='6' height='5' stroke='${PALE}'/>` + line('M17 24 V29 M14 26.5 H20', PALE, 0.7, 1),

  // 3 Squire — a plain shield
  `<path d='M24 6 L38 11 V23 C38 32 31 38 24 42 C17 38 10 32 10 23 V11 Z'/>` +
  line('M12 21 L24 29 L36 21 M12 26 L24 34 L36 26', PALE),

  // 4 Soldier — spear and round shield
  `<path d='M37 12 V44'/>` + `<path d='M37 3 L40.5 12 H33.5 Z' fill='currentColor' fill-opacity='0.2'/>` +
  `<circle cx='19' cy='27' r='12'/>` + `<circle cx='19' cy='27' r='8' stroke='${PALE}' stroke-opacity='0.7'/>` + dot(19, 27, 2.2, PALE),

  // 5 Knight — a great helm with a plume
  `<path d='M14 41 V22 C14 13 19 8 24 8 C29 8 34 13 34 22 V41 Z'/>` +
  line('M17 22 H31 M17 26.5 H31', PALE, 1, 1.8) +
  line('M24 8 C26 3.5 32 2.5 37 5 C32 5.5 28.5 7 26.5 10', RUBY) +
  line('M24 30 V38 M20 33 V37 M28 33 V37', PALE, 0.6, 1.1),

  // 6 Captain — a company banner
  `<path d='M11 5 V44'/>` +
  `<path d='M11 8 H37 L31.5 15.5 L37 23 H11' fill='currentColor' fill-opacity='0.12'/>` +
  `<path d='${starPath(21, 15.5, 4, 1.7)}' stroke='${PALE}'/>` + dot(11, 4, 1.6),

  // 7 Baron — the keys to the manor
  `<circle cx='14' cy='14' r='7'/>` + `<circle cx='14' cy='14' r='3' stroke='${PALE}'/>` +
  `<path d='M19 19 L39 39 M33 33 L37 29 M37 37 L41 33'/>`,

  // 8 Viscount — a sealed letter patent
  `<rect x='8' y='7' width='32' height='6' rx='3'/><rect x='8' y='35' width='32' height='6' rx='3'/>` +
  `<path d='M11 13 V35 M37 13 V35'/>` +
  line('M16 18 H32 M16 22.5 H32 M16 27 H25', PALE, 0.7, 1.2) +
  `<circle cx='31' cy='30' r='4.5' stroke='${RUBY}' fill='${RUBY}' fill-opacity='0.25'/>`,

  // 9 Count — the counting-house purse
  `<path d='M17 14 L14 8 H34 L31 14 C38 18 41 26 40 32 C39 39 33 42 24 42 C15 42 9 39 8 32 C7 26 10 18 17 14 Z'/>` +
  line('M17 14 H31', PALE, 1, 2) +
  `<circle cx='24' cy='30' r='5.5' stroke='${PALE}'/>` + line('M24 27.5 V32.5', PALE, 1, 1.2),

  // 10 Marquis — the border wall and its gate
  `<path d='M6 42 V20 H11 V15 H16 V20 H21 V15 H27 V20 H32 V15 H37 V20 H42 V42'/>` +
  line('M18 42 V32 A6 6 0 0 1 30 32 V42 M21 28 V42 M24 26 V42 M27 28 V42 M18 34 H30 M18 38 H30', PALE, 0.8, 1.1),

  // 11 Duke — a castle and its keep
  `<path d='M6 42 V20 H14 V42 M34 42 V20 H42 V42 M14 42 V26 H34 V42 M18 26 V12 H30 V26 M4 42 H44'/>` +
  `<path d='M6 20 V17 H8 V20 M10 20 V17 H12 V20 M36 20 V17 H38 V20 M40 20 V17 H42 V20 M18 12 V9 H20.5 V12 M22.8 12 V9 H25.2 V12 M27.5 12 V9 H30 V12' stroke-width='1.2'/>` +
  line('M21 42 V36 A3 3 0 0 1 27 36 V42', PALE) + line('M24 9 V3 L28 4.5 L24 6', RUBY),

  // 12 Royal Heir — a coronet
  `<path d='M8 36 C16 32 32 32 40 36 M9.5 34.5 L13 25 L18.5 31 L24 19 L29.5 31 L35 25 L38.5 34.5'/>` +
  dot(13, 24, 1.8, PALE) + dot(24, 18, 2.2, RUBY) + dot(35, 24, 1.8, PALE) +
  `<path d='M10 40 C17 37 31 37 38 40' stroke='${PALE}' stroke-opacity='0.6'/>`,

  // 13 Governor — the domed seat of government
  `<path d='M10 42 V28 H38 V42 M6 42 H42 M13 28 C13 17 35 17 35 28 M24 19.5 V12'/>` +
  line('M15 31 V40 M21 31 V40 M27 31 V40 M33 31 V40', PALE) +
  line('M24 12 V6 L28 7.5 L24 9', RUBY) + line('M18 24 H30', PALE, 0.5, 1),

  // 14 Consul — the scales
  `<path d='M24 8 V40 M10 14 H38 M16 42 H32'/>` + dot(24, 7, 1.6) +
  line('M10 14 L6 26 M10 14 L14 26 M38 14 L34 26 M38 14 L42 26', PALE, 0.8, 1.1) +
  `<path d='M5 26 C5 31 15 31 15 26 Z M33 26 C33 31 43 31 43 26 Z' stroke='${PALE}' fill='${PALE}' fill-opacity='0.15'/>`,

  // 15 General — the star and chevrons of rank
  `<path d='${starPath(24, 14, 9, 3.8)}' fill='currentColor' fill-opacity='0.2'/>` +
  line('M11 28 L24 34 L37 28 M11 35 L24 41 L37 35', PALE, 1, 2),

  // 16 Warlord — a double axe
  `<path d='M24 5 V44'/>` +
  `<path d='M24 12 C16 8 9 12 8 20 C9 28 16 32 24 28 M24 12 C32 8 39 12 40 20 C39 28 32 32 24 28'/>` +
  line('M11 14 C9 17 9 23 11 26 M37 14 C39 17 39 23 37 26', PALE, 0.8, 1.2),

  // 17 Chancellor — the great seal
  `<path d='M20 5 H28 V13 C28 15 31 16 33 17 H15 C17 16 20 15 20 13 Z M10 17 H38 V25 H10 Z'/>` +
  `<circle cx='24' cy='35' r='7' stroke='${RUBY}' fill='${RUBY}' fill-opacity='0.2'/>` +
  `<path d='${crownPath(20, 31.5, 8, 6)}' stroke='${PALE}' stroke-width='1.1'/>`,

  // 18 Viceroy — a sceptre
  `<path d='M24 15 V44 M24 2 V5 M22 3.5 H26'/>` + `<circle cx='24' cy='10' r='5'/>` +
  line('M20.5 20 H27.5 M21.5 38 H26.5', PALE, 1, 1.8) + dot(24, 10, 1.8, RUBY),

  // 19 Archduke — crossed pennants
  `<path d='M10 44 L32 6 M38 44 L16 6'/>` +
  `<path d='M30 9.5 L42 13 L33.5 20 Z' fill='currentColor' fill-opacity='0.15'/>` +
  `<path d='M18 9.5 L6 13 L14.5 20 Z' stroke='${PALE}' fill='${PALE}' fill-opacity='0.15'/>`,

  // 20 Grand Duke — the medal of the order in its laurel
  laurel(PALE, 24, 24, 15) +
  `<circle cx='24' cy='22' r='8'/>` + `<path d='${starPath(24, 22, 4.5, 1.9)}' stroke='${RUBY}'/>`,

  // 21 Monarch — the crown
  `<path d='${crownPath(9, 12, 30, 22)}'/>` + `<path d='M9 40 H39'/>` +
  dot(9, 15, 1.8, PALE) + dot(24, 11, 2.2, PALE) + dot(39, 15, 1.8, PALE) + dot(24, 28, 2, RUBY),

  // 22 High Monarch — the throne
  `<path d='M15 26 V9 C15 6 19 4 24 4 C29 4 33 6 33 9 V26 M11 26 H37 V31 H11 Z M13 31 V42 M35 31 V42 M11 26 V20 M37 26 V20'/>` +
  `<path d='${crownPath(19, 11, 10, 7)}' stroke='${PALE}' stroke-width='1.2'/>` +
  `<path d='M15 26 C18 23 30 23 33 26' stroke='${RUBY}' fill='${RUBY}' fill-opacity='0.25'/>`,

  // 23 Conqueror — the flag on the summit
  `<path d='M4 40 L18 18 L24 26 L30 16 L44 40 Z'/>` +
  line('M14 24.3 L18 18 L22 23 M27 20.5 L30 16 L33.5 21.5', PALE) +
  `<path d='M30 16 V5'/>` + `<path d='M30 5 L37.5 7.5 L30 10' stroke='${RUBY}' fill='${RUBY}' fill-opacity='0.25'/>`,

  // 24 Imperator — the legion's standard
  `<path d='M24 15 V44 M15 18 H33'/>` +
  `<circle cx='24' cy='9' r='5'/>` + `<circle cx='24' cy='9' r='2' stroke='${PALE}'/>` +
  `<path d='M16 18 V30 H32 V18' fill='currentColor' fill-opacity='0.12'/>` +
  line('M18 30 V33 M22 30 V33 M26 30 V33 M30 30 V33', PALE, 0.8, 1.1) +
  `<circle cx='24' cy='37.5' r='2.3' stroke='${PALE}'/>` + line('M20 24 H28', PALE, 0.7, 1.2),

  // 25 Ruler of Empires — the orb and cross
  `<circle cx='24' cy='29' r='13'/>` +
  line('M11 29 H37 M24 16 V42', PALE, 0.8) +
  `<path d='M24 16 V4 M19.5 8.5 H28.5'/>` + dot(17, 22, 1.4, RUBY) + dot(31, 36, 1.4, RUBY),

  // 26 Sovereign — the sunburst medallion
  around(16, 24, 24, (a) => `<path d='M24 ${a % 45 === 0 ? 3 : 7} V12' stroke='${PALE}' stroke-opacity='${a % 45 === 0 ? 0.9 : 0.5}' transform='rotate(${a} 24 24)'/>`) +
  `<circle cx='24' cy='24' r='10'/>` + `<path d='${crownPath(18.5, 19.5, 11, 8)}' stroke-width='1.3'/>`,

  // 27 Overlord — the eye that sees the realm
  around(9, 24, 26, (a) => `<path d='M24 13 V8' stroke='${PALE}' stroke-opacity='0.7' transform='rotate(${a} 24 26)'/>`, -80) +
  `<path d='M5 27 C12 16 36 16 43 27 C36 38 12 38 5 27 Z'/>` +
  `<circle cx='24' cy='27' r='6.5' stroke='${PALE}'/>` + dot(24, 27, 2.6, RUBY),

  // 28 World Ruler — the world in a laurel
  laurel(PALE, 24, 24, 16) +
  `<circle cx='24' cy='23' r='11'/>` +
  `<ellipse cx='24' cy='23' rx='4.5' ry='11' stroke='${PALE}' stroke-opacity='0.6' stroke-width='1.1'/>` +
  line('M13 23 H35 M15 17 H33 M15 29 H33', PALE, 0.5, 1.1),

  // 29 Dynasty Founder — the family tree
  line('M24 42 V30 M24 30 L14 20 M24 30 L34 20 M14 20 L9 10 M14 20 L19 10 M34 20 L29 10 M34 20 L39 10', PALE, 0.7, 1.2) +
  [[24, 30], [14, 20], [34, 20], [9, 9], [19, 9], [29, 9], [39, 9]].map(([x, y], i) =>
    `<circle cx='${x}' cy='${y}' r='${i ? 2.6 : 3.4}' fill='currentColor' fill-opacity='0.2'/>`).join('') +
  `<path d='${crownPath(19.5, 38.5, 9, 5)}' stroke='${RUBY}' stroke-width='1.1'/>`,

  // 30 Eternal Emperor — crown, laurel and star
  laurel(PALE, 24, 27, 15) +
  `<path d='${crownPath(13, 21, 22, 15)}'/>` + `<path d='M14 40 H34'/>` +
  glow(24, 10, 6, PALE, 0.3) + `<path d='${starPath(24, 10, 6, 2.5)}' stroke='${RUBY}' fill='${RUBY}' fill-opacity='0.25'/>`,
];

/* -------------------------------------------------------------------- space */

// The banner's planet indigo and starlight beside the cyan.
const INDIGO = '#818cf8';
const LIGHT = '#e0f2fe';

const SPACE: string[] = [
  // 1 Cadet — the academy cap
  `<path d='M4 18 L24 10 L44 18 L24 26 Z M12 21.5 V30 C16 34 32 34 36 30 V21.5'/>` +
  line('M40 19.5 V29', INDIGO) + dot(40, 30.5, 1.8, INDIGO) + twinkle(24, 18, 2.4, LIGHT),

  // 2 Ensign — a mission patch
  `<circle cx='24' cy='24' r='16'/>` +
  `<circle cx='24' cy='24' r='12' stroke='${INDIGO}' stroke-dasharray='1.5 3'/>` +
  `<path d='${starPath(24, 24, 6, 2.5)}' fill='currentColor' fill-opacity='0.2'/>`,

  // 3 Pilot — wings
  line('M19 21 C14 17 7 17 3 19 C8 21 12 23 19 25 M19 25 C14 25 9 26 6 28 C10 29 14 29 19 28.5 M43 19 C40 17 34 17 29 21 M29 25 C36 23 40 21 45 19 M29 25 C34 25 39 26 42 28 C38 29 34 29 29 28.5', INDIGO, 1, 1.3) +
  `<circle cx='24' cy='24' r='5.5'/>` + `<path d='${starPath(24, 24, 3, 1.2)}' fill='currentColor' stroke='none'/>`,

  // 4 Navigator — a star chart
  line('M8 34 L16 22 L26 26 L32 12 L41 16 M26 26 L36 36', INDIGO, 0.7, 1.1) +
  [[8, 34], [16, 22], [26, 26], [32, 12], [41, 16], [36, 36]].map(([x, y], i) => i === 3 ? twinkle(x, y, 3.5, LIGHT) : dot(x, y, 2)).join('') +
  `<path d='M4 42 H44' stroke-dasharray='1 3' stroke-opacity='0.5'/>`,

  // 5 Engineer — a gear and a wrench
  around(8, 20, 20, (a) => `<rect x='18' y='6.5' width='4' height='4' rx='0.6' transform='rotate(${a} 20 20)'/>`) +
  `<circle cx='20' cy='20' r='10'/><circle cx='20' cy='20' r='4' stroke='${INDIGO}'/>` +
  `<path d='M28 28 L38 38 M36 42 A4.5 4.5 0 0 0 42 36 L39.5 38.5 L36.5 38.5 V35.5 L39 33 A4.5 4.5 0 0 0 33 39 Z' stroke='${INDIGO}'/>`,

  // 6 Lieutenant — two bars
  `<rect x='12' y='18' width='9' height='22' rx='2' fill='currentColor' fill-opacity='0.15'/>` +
  `<rect x='27' y='18' width='9' height='22' rx='2' fill='currentColor' fill-opacity='0.15'/>` +
  `<path d='${starPath(24, 9, 4.5, 1.9)}' stroke='${INDIGO}'/>`,

  // 7 Science Officer — a microscope
  `<rect x='18' y='5' width='7' height='19' rx='1.5' transform='rotate(-25 21.5 14.5)'/>` +
  `<path d='M12 33 H30 M8 42 H38 M30 18 C39 22 39 34 31 38 L26 42'/>` +
  line('M19 26 L22 30', INDIGO, 1, 2) + dot(21, 33, 1.4, LIGHT),

  // 8 Commander — the comms mast
  `<path d='M24 18 L16 42 M24 18 L32 42 M18.6 34 H29.4 M20.6 28 H27.4'/>` + dot(24, 16, 2.4) +
  line('M16 10 A11 11 0 0 0 16 22 M32 10 A11 11 0 0 1 32 22 M11 6 A17 17 0 0 0 11 26 M37 6 A17 17 0 0 1 37 26', INDIGO, 0.8, 1.2),

  // 9 Starship Captain — a rocket
  `<path d='M24 4 C31 10 33 20 31 32 H17 C15 20 17 10 24 4 Z'/>` +
  `<circle cx='24' cy='17' r='3.5' stroke='${INDIGO}'/>` +
  `<path d='M17 25 L11 34 L17 33 M31 25 L37 34 L31 33'/>` +
  `<path d='M20 34 C20 39 24 41 24 44 C24 41 28 39 28 34' stroke='${INDIGO}' fill='${INDIGO}' fill-opacity='0.2'/>`,

  // 10 Squadron Leader — three ships in formation
  `<path d='M24 5 L31 21 L24 17.5 L17 21 Z' fill='currentColor' fill-opacity='0.15'/>` +
  `<path d='M11 22 L16 34 L11 31.5 L6 34 Z M37 22 L42 34 L37 31.5 L32 34 Z' stroke='${INDIGO}' fill='${INDIGO}' fill-opacity='0.12'/>` +
  line('M24 21 V27 M11 35 V39 M37 35 V39', LIGHT, 0.5, 1.1),

  // 11 Fleet Captain — a satellite
  `<rect x='19' y='19' width='10' height='10' rx='1' transform='rotate(45 24 24)'/>` +
  `<path d='M8 8 L17 17 L13 21 L4 12 Z M40 40 L31 31 L35 27 L44 36 Z' stroke='${INDIGO}' fill='${INDIGO}' fill-opacity='0.15'/>` +
  line('M6 14 L12 8 M38 34 L42 30 M10 16 L16 10 M36 38 L40 34', INDIGO, 0.6, 1) +
  `<path d='M27.5 20.5 L33 15 M31 11 A6 6 0 0 1 37 17'/>`,

  // 12 Commodore — a hexagonal rank badge
  `<path d='M24 5 L40 14 V34 L24 43 L8 34 V14 Z'/>` +
  `<path d='${starPath(18, 24, 4.5, 1.9)} ${starPath(30, 24, 4.5, 1.9)}' stroke='${INDIGO}' fill='${INDIGO}' fill-opacity='0.2'/>`,

  // 13 Star Ranger — a telescope
  `<path d='M8 29 L33 14 L36 19 L11 34 Z M33 14 L36 12 L39 17 L36 19'/>` +
  line('M22 26 L16 42 M22 26 L28 42 M22 26 V40', INDIGO) +
  twinkle(41, 6, 2.6, LIGHT) + dot(32, 6, 1, LIGHT) + dot(44, 13, 1, LIGHT),

  // 14 Deep-Space Explorer — a world and its moon on an orbit
  `<ellipse cx='24' cy='24' rx='19' ry='9' stroke='${INDIGO}' transform='rotate(-20 24 24)'/>` +
  `<circle cx='24' cy='24' r='7' fill='currentColor' fill-opacity='0.12'/>` + dot(41, 18, 2.4, LIGHT) +
  dot(8, 8, 1, LIGHT) + dot(40, 40, 1, LIGHT) + dot(12, 40, 0.8, LIGHT),

  // 15 Rear Admiral — shield and one star
  `<path d='M24 6 L38 11 V23 C38 32 31 38 24 42 C17 38 10 32 10 23 V11 Z'/>` +
  `<path d='${starPath(24, 22, 7, 2.9)}' stroke='${INDIGO}' fill='${INDIGO}' fill-opacity='0.2'/>`,

  // 16 Vice Admiral — shield, two stars and a bar
  `<path d='M24 6 L38 11 V23 C38 32 31 38 24 42 C17 38 10 32 10 23 V11 Z'/>` +
  `<path d='${starPath(19, 19, 4.5, 1.9)} ${starPath(29, 19, 4.5, 1.9)}' stroke='${INDIGO}' fill='${INDIGO}' fill-opacity='0.2'/>` +
  line('M16 29 H32', LIGHT, 1, 2),

  // 17 Admiral — three stars over a laurel
  laurel(INDIGO, 24, 22, 15) +
  `<path d='${starPath(16, 21, 4, 1.7)} ${starPath(24, 16, 5, 2.1)} ${starPath(32, 21, 4, 1.7)}' fill='currentColor' fill-opacity='0.2'/>`,

  // 18 Fleet Admiral — five stars in a ring
  `<circle cx='24' cy='24' r='5' stroke='${INDIGO}'/>` +
  around(5, 24, 24, (a) => `<path d='${starPath(24, 11, 4.5, 1.9)}' fill='currentColor' fill-opacity='0.2' transform='rotate(${a} 24 24)'/>`),

  // 19 Star Marshal — a targeting reticle
  `<circle cx='24' cy='24' r='16'/>` +
  `<circle cx='24' cy='24' r='9' stroke='${INDIGO}'/>` +
  `<path d='M24 3 V11 M24 37 V45 M3 24 H11 M37 24 H45'/>` + twinkle(24, 24, 3.6, LIGHT),

  // 20 Galaxy Warden — a spiral galaxy
  glow(24, 24, 8, LIGHT, 0.4) +
  `<path d='M24 24 C24 18 32 16 36 22 C40 30 30 38 22 36 C12 34 8 24 14 16'/>` +
  `<path d='M24 24 C24 30 16 32 12 26 C8 18 18 10 26 12 C36 14 40 24 34 32' stroke='${INDIGO}'/>` +
  dot(24, 24, 2, LIGHT),

  // 21 Nebula Walker — a nebula
  `<path d='M8 30 C4 24 10 17 16 20 C17 12 28 10 31 17 C38 14 45 21 40 28 C44 34 36 40 30 36 C26 41 16 41 14 35 C9 37 5 34 8 30 Z' stroke='${INDIGO}' fill='${INDIGO}' fill-opacity='0.12'/>` +
  `<path d='M15 28 C15 23 22 21 25 25 C28 22 34 24 33 29 C31 33 26 32 24 30 C21 33 15 32 15 28 Z'/>` +
  twinkle(24, 27, 3, LIGHT) + dot(37, 9, 1, LIGHT) + dot(8, 12, 1, LIGHT),

  // 22 Star Forger — a hammer striking a star
  `<rect x='5' y='10' width='20' height='9' rx='1.5' transform='rotate(-35 15 14.5)'/>` +
  `<path d='M18 18.5 L32 38'/>` +
  glow(33, 13, 8, LIGHT, 0.3) + `<path d='${starPath(33, 13, 6, 2.5)}' stroke='${INDIGO}'/>` +
  line('M40 5 L42 3 M42 15 H45 M37 22 L39 24', LIGHT, 1, 1.2),

  // 23 Planet Builder — a ringed planet
  `<circle cx='24' cy='24' r='10'/>` +
  `<path d='M14.6 27.4 C6 31 3 34 5 36 C9 39 25 34 34 28 C42 23 46 16 43 14 C41 12 37 13 33.5 15' stroke='${INDIGO}'/>` +
  line('M16 20 C20 18 28 18 32 20', LIGHT, 0.4, 1) + dot(9, 10, 1, LIGHT) + dot(40, 38, 1.2, LIGHT),

  // 24 Star System Ruler — a sun and its planets
  glow(24, 24, 8, LIGHT, 0.4) + `<circle cx='24' cy='24' r='4.5'/>` +
  `<circle cx='24' cy='24' r='11' stroke='${INDIGO}' stroke-dasharray='2 3'/>` +
  `<circle cx='24' cy='24' r='18' stroke='${INDIGO}' stroke-opacity='0.6' stroke-dasharray='2 3'/>` +
  `<circle cx='32' cy='16.5' r='2.2' fill='currentColor' stroke='none'/>` + `<circle cx='10' cy='35' r='3' fill='currentColor' fill-opacity='0.3'/>`,

  // 25 Galactic Envoy — a dish, transmitting
  `<path d='M7 18 C7 30 16 39 28 39 Z'/>` +
  `<path d='M17.5 28.5 L27 19 M14 44 H30 M20 44 L22 36'/>` + dot(27.5, 18.5, 1.8) +
  line('M31 14 A7 7 0 0 1 33 21 M34 9 A13 13 0 0 1 38 22 M37 4 A19 19 0 0 1 43 23', INDIGO, 0.85, 1.2),

  // 26 Galactic Chancellor — a ring station
  `<ellipse cx='24' cy='24' rx='19' ry='8'/>` +
  `<ellipse cx='24' cy='24' rx='13' ry='4.5' stroke='${INDIGO}'/>` +
  line('M5 24 H11 M37 24 H43 M24 16 V19.5 M24 28.5 V32', INDIGO) +
  `<circle cx='24' cy='24' r='2.5' fill='currentColor' fill-opacity='0.3'/>` + `<path d='M24 21.5 V8'/>` + dot(24, 7, 1.5, LIGHT),

  // 27 Cosmic Voyager — a flying saucer
  `<ellipse cx='24' cy='27' rx='19' ry='6'/>` +
  `<path d='M14 25 C14 14 34 14 34 25' stroke='${INDIGO}' fill='${INDIGO}' fill-opacity='0.15'/>` +
  dot(14, 28, 1.3, LIGHT) + dot(24, 29.5, 1.3, LIGHT) + dot(34, 28, 1.3, LIGHT) +
  line('M18 34 L14 43 M30 34 L34 43 M24 35 V44', LIGHT, 0.35, 1.1),

  // 28 Starborn — a star, with its sparks
  glow(24, 24, 12, LIGHT, 0.3) +
  `<path d='${starPath(24, 24, 15, 6.5)}'/>` +
  twinkle(40, 9, 3, INDIGO) + twinkle(8, 10, 2.4, INDIGO) + twinkle(41, 38, 2.2, INDIGO) + twinkle(7, 37, 2.6, INDIGO),

  // 29 Cosmic Legend — a trophy held in an orbit
  `<path d='M16 10 H32 V18 C32 23 28.5 26 24 26 C19.5 26 16 23 16 18 Z M24 26 V31 M18 37 H30 L28.5 31 H19.5 Z'/>` +
  `<ellipse cx='24' cy='20' rx='20' ry='6' stroke='${INDIGO}' transform='rotate(-15 24 20)' stroke-dasharray='30 4'/>` +
  `<path d='${starPath(24, 17, 3.5, 1.5)}' fill='${LIGHT}' stroke='none'/>`,

  // 30 Master of the Universe — the galaxy in its ring
  `<circle cx='24' cy='24' r='18'/>` +
  around(12, 24, 24, (a) => `<circle cx='24' cy='2.5' r='1' fill='${LIGHT}' stroke='none' transform='rotate(${a} 24 24)'/>`) +
  `<path d='M24 24 C24 19 30.5 17.5 33.5 22 C36.5 28 29 34 22.5 32.5 C14.5 31 11.5 23 16 17' stroke='${INDIGO}' stroke-width='1.3'/>` +
  `<path d='M24 24 C24 29 17.5 30.5 14.5 26 C11.5 20 19 14 25.5 15.5 C33.5 17 36.5 25 32 31' stroke='${INDIGO}' stroke-width='1.3' stroke-opacity='0.7'/>` +
  glow(24, 24, 7, LIGHT, 0.4) + twinkle(24, 24, 4, LIGHT),
];

/* ------------------------------------------------------------------- pirate */

// The chart's sea teal and the red of the X that marks the spot.
const SEA = '#5eead4';
const MARK = '#f87171';

const PIRATE: string[] = [
  // 1 Deckhand — an anchor
  `<circle cx='24' cy='8.5' r='3.5'/>` +
  `<path d='M24 12 V40 M17 17 H31 M10 30 C11 37 17 41 24 41 C31 41 37 37 38 30 M10 30 L8 34.5 M10 30 L14.5 32 M38 30 L40 34.5 M38 30 L33.5 32'/>` +
  line('M27.5 8.5 C34 10 34 16 30 20', SEA, 0.7, 1.2),

  // 2 Powder Monkey — a bomb, lit
  `<circle cx='21' cy='29' r='13'/>` +
  `<rect x='26.5' y='12' width='7' height='6' rx='1' transform='rotate(40 30 15)'/>` +
  line('M33 12 C35 8 38 8 40 6', SEA) + twinkle(41.5, 5, 3.4, MARK) +
  line('M13 24 A9 9 0 0 1 18 19', SEA, 0.6, 1.2),

  // 3 Swabbie — mop and bucket
  `<path d='M23 4 L14 28'/>` +
  line('M14 28 L8 40 M14 28 L11 41 M14 28 L14.5 42 M14 28 L18 41', SEA) +
  `<path d='M26 28 H42 L40 42 H28 Z'/>` + line('M26 28 C26 20 42 20 42 28', SEA, 0.8, 1.2) +
  line('M28 33 H40', SEA, 0.5, 1),

  // 4 Lookout — the crow's nest
  `<path d='M24 4 V44 M13 18 H35 L32.5 27 H15.5 Z M17 32 L24 27 L31 32'/>` +
  line('M18 18 V27 M22 18 V27 M26 18 V27 M30 18 V27', SEA, 0.7, 1.1) +
  `<path d='M24 4 L32 6.5 L24 9' stroke='${MARK}' fill='${MARK}' fill-opacity='0.25'/>` +
  line('M10 40 L24 30 L38 40', SEA, 0.5, 1),

  // 5 Rigger — a coil of rope
  `<circle cx='22' cy='24' r='15'/>` +
  `<circle cx='22' cy='24' r='10.5' stroke='${SEA}'/>` +
  `<circle cx='22' cy='24' r='6'/>` + `<circle cx='22' cy='24' r='2' stroke='${SEA}'/>` +
  `<path d='M37 24 C40 30 44 31 45 36 C46 40 42 43 39 41'/>`,

  // 6 Gunner — a cannon
  `<path d='M8 25 L36 14 C38 13.5 40 15 40 17 L41 20 C41.5 22 40 23.5 38 24 L10 32 C8 32.5 6.5 31 6 29.5 L5.5 28 C5 26.5 6.5 25.5 8 25 Z'/>` +
  line('M35 14.5 L39 24 M14 23 L16.5 30', SEA, 0.8, 1.2) +
  `<circle cx='18' cy='35' r='7'/>` + line('M18 28 V42 M11 35 H25 M13 30 L23 40 M23 30 L13 40', SEA, 0.6, 1) +
  dot(43, 9, 1.5, MARK) + dot(46, 13, 1, MARK),

  // 7 Boatswain — the bosun's pipe on its chain
  `<path d='M5 20 H29 C33 20 35 23 37 25'/>` + `<path d='M5 24 H29 C31 24 32 25 33 27'/>` +
  `<path d='M5 20 V24'/>` + `<circle cx='37.5' cy='30' r='5'/>` +
  line('M18 24 C18 34 24 40 32 42 C36 43 40 41 41 38', SEA, 0.8, 1.2).replace('/>', ` stroke-dasharray='1.5 2'/>`),

  // 8 Helmsman — the wheel
  around(8, 24, 24, (a) => `<path d='M24 20.5 V7' stroke='${SEA}' transform='rotate(${a + 22.5} 24 24)'/><path d='M24 7 V3' stroke-width='2.4' transform='rotate(${a + 22.5} 24 24)'/>`) +
  `<circle cx='24' cy='24' r='12'/><circle cx='24' cy='24' r='9.5' stroke-opacity='0.5'/><circle cx='24' cy='24' r='3.5'/>`,

  // 9 Navigator — the compass rose
  `<circle cx='24' cy='24' r='18' stroke-opacity='0.5'/>` +
  `<path d='${starPath(24, 24, 17, 3.6, 4)}' fill='currentColor' fill-opacity='0.12'/>` +
  `<path d='${starPath(24, 24, 11, 3, 4, Math.PI / 4)}' stroke='${SEA}'/>` +
  `<path d='M24 7 L26 13 H22 Z' fill='${MARK}' stroke='none'/>`,

  // 10 Quartermaster — the share-out of the coins
  `<ellipse cx='16' cy='36' rx='10' ry='3.5'/><path d='M6 36 V32 M26 36 V32'/><ellipse cx='16' cy='32' rx='10' ry='3.5'/>` +
  `<path d='M6 32 V28 M26 32 V28'/><ellipse cx='16' cy='28' rx='10' ry='3.5'/>` +
  `<circle cx='34' cy='20' r='8'/>` + `<circle cx='34' cy='20' r='5' stroke='${SEA}' stroke-width='1.1'/>` +
  `<circle cx='37' cy='38' r='5.5' stroke='${SEA}'/>`,

  // 11 First Mate — a cutlass
  `<path d='M12 36 C22 30 31 19 37 5 C39 14 33 25 15 39 Z'/>` +
  line('M8 33 C9 40 13 43 19 41', SEA, 1, 1.6) + `<path d='M12 36 L5 43'/>` + dot(4.5, 43.5, 1.8, MARK),

  // 12 Captain — the tricorne
  `<path d='M4 27 C10 23 14 27 24 19 C34 27 38 23 44 27 C40 35 8 35 4 27 Z'/>` +
  `<path d='M13 24.5 C13 14 35 14 35 24.5'/>` +
  `<circle cx='24' cy='25' r='3.2' stroke='${SEA}'/>` + line('M19 31 L29 27 M19 27 L29 31', SEA, 1, 1.2),

  // 13 Privateer — a letter of marque
  `<path d='M11 7 H35 V41 H11 Z'/>` +
  line('M15 13 H31 M15 18 H31 M15 23 H27', SEA, 0.7, 1.2) +
  `<circle cx='29' cy='33' r='5' stroke='${MARK}' fill='${MARK}' fill-opacity='0.25'/>` +
  line('M27 37.5 L25 44 M31 37.5 L33 44', MARK, 0.8, 1.3),

  // 14 Corsair — crossed cutlasses
  `<path d='M8 8 C16 12 26 20 34 34 M40 8 C32 12 22 20 14 34'/>` +
  line('M28 38 L38 30 M10 30 L20 38', SEA, 1, 1.8) + `<path d='M33.5 35.5 L39 41 M14.5 35.5 L9 41'/>`,

  // 15 Buccaneer — skull and crossbones
  `<path d='M24 6 C16 6 12 11 12 18 C12 22 14 25 17 26 V31 H31 V26 C34 25 36 22 36 18 C36 11 32 6 24 6 Z'/>` +
  dot(19.5, 18, 2.6, SEA) + dot(28.5, 18, 2.6, SEA) + `<path d='M22 31 V28 M26 31 V28'/>` +
  line('M8 34 L40 44 M40 34 L8 44', SEA, 1, 2),

  // 16 Sea Raider — a grappling hook
  `<circle cx='24' cy='6' r='2.8'/>` +
  `<path d='M24 9 V38 M24 30 C24 38 14 38 12 30 M24 30 C24 38 34 38 36 30 M12 30 L10 33 M36 30 L38 33 M24 38 V42'/>` +
  line('M21.5 4.5 C14 6 16 12 9 13 C4 14 4 20 7 22', SEA, 0.8, 1.2),

  // 17 Commodore — a medal with an anchor
  line('M14 5 L21 20 M34 5 L27 20 M20 5 L24 13 L28 5', SEA) +
  `<circle cx='24' cy='30' r='11'/>` +
  `<path d='M24 24 V36 M20.5 26.5 H27.5 M18.5 32 C19.5 36 28.5 36 29.5 32' stroke-width='1.3'/>`,

  // 18 Fleet Captain — under sail
  `<path d='M5 32 H43 L37 40 H11 Z M24 32 V5'/>` +
  `<path d='M24 7 L38 28 H24' fill='currentColor' fill-opacity='0.12'/>` +
  `<path d='M22 10 L10 28 H22' stroke='${SEA}' fill='${SEA}' fill-opacity='0.12'/>` +
  `<path d='M24 5 L30 7 L24 9' stroke='${MARK}'/>` + line('M3 44 Q8 41 13 44 T23 44 T33 44 T43 44', SEA, 0.5, 1.1),

  // 19 Sea Wolf — a fin under the moon
  `<path d='M12 34 C18 30 22 18 30 10 C30 20 32 28 36 34'/>` +
  line('M4 35 Q9 31.5 14 35 T24 35 T34 35 T44 35 M4 41 Q9 37.5 14 41 T24 41 T34 41 T44 41', SEA, 0.8) +
  `<path d='M39 4 A5.5 5.5 0 1 0 44 12 A4.3 4.3 0 1 1 39 4 Z' fill='currentColor' fill-opacity='0.25'/>`,

  // 20 Terror of the Seas — the great wave
  `<path d='M4 40 C10 40 12 32 14 26 C17 16 28 11 34 14 C38 16.5 37.5 23 33 23 C30 23 28.5 20 30.5 18'/>` +
  line('M14 26 C17 21 22 18 27 18 M10 36 C14 34 16 30 18 27', SEA, 0.7, 1.2) +
  line('M4 44 Q11 40 18 44 T32 44 T46 44 M26 40 C30 36 36 34 44 36', SEA) +
  dot(38, 10, 1.1, SEA) + dot(41, 15, 0.9, SEA),

  // 21 Treasure Hunter — the map
  `<path d='M7 9 C12 7 14 11 19 9 C24 7 28 11 33 9 C37 7.5 40 9 41 10 V39 C40 38 37 36.5 33 38 C28 40 24 36 19 38 C14 40 12 36 7 38 Z'/>` +
  line('M12 32 C16 26 20 31 24 25 S30 18 32 17', SEA, 0.8, 1.3).replace('/>', ` stroke-dasharray='1.5 2.5'/>`) +
  line('M32 13 L37 18 M37 13 L32 18', MARK, 1, 2),

  // 22 Admiral of the Black Flag — the Jolly Roger
  `<path d='M9 4 V44'/>` +
  `<path d='M9 7 C17 4 23 11 31 8 C35 7 38 7 41 8 V27 C38 26 35 26 31 27 C23 30 17 23 9 26' fill='currentColor' fill-opacity='0.12'/>` +
  `<circle cx='24' cy='15' r='4' stroke='${SEA}'/>` + line('M19 22 L29 18 M19 18 L29 22', SEA, 1, 1.2),

  // 23 Scourge of the Seven Seas — a burning shot
  `<circle cx='30' cy='30' r='9'/>` +
  `<path d='M23 24.5 C18 21 15 15 8 10 C10 16 9.5 20 12 24 C9 24 6.5 23 4 24 C8 29 12 33 21.5 35' stroke='${MARK}' fill='${MARK}' fill-opacity='0.15'/>` +
  line('M21 28 C17 27 14 24 12 21', '#fde68a', 0.8, 1.2) +
  line('M26 27 A5 5 0 0 1 31 24', SEA, 0.7, 1.2),

  // 24 Pirate Chief — a crown with crossbones
  `<path d='${crownPath(9, 10, 30, 22)}'/>` + `<path d='M9 38 H39'/>` +
  line('M18 24 L30 30 M30 24 L18 30', SEA, 1, 1.6) + dot(24, 9, 2, MARK),

  // 25 Sea Legend — a mermaid's tail
  `<path d='M24 5 C19 15 19 24 23 31 C19 35 13 37 8 35 C12 40 19 42 24 37 C29 42 36 40 40 35 C35 37 29 35 25 31 C29 24 29 15 24 5 Z'/>` +
  line('M21 14 Q24 16.5 27 14 M20.5 19 Q24 21.5 27.5 19 M21 24 Q24 26.5 27 24', SEA, 0.8, 1.1),

  // 26 Kraken Tamer — a tentacle
  `<path d='M10 43 C10 31 20 29 22 21 C24 13 18 9 14 13 C11 16 14 20 17 18' stroke-width='2.2'/>` +
  [[12.5, 36], [15, 31], [19, 27.5], [22, 23], [21.5, 16]].map(([x, y]) => `<circle cx='${x + 2.5}' cy='${y}' r='1.1' stroke='${SEA}' stroke-width='1'/>`).join('') +
  `<path d='M30 43 C30 36 38 34 39 28 C40 24 36 22 34 25' stroke='${SEA}' stroke-width='1.6'/>`,

  // 27 Storm Caller — the storm
  `<path d='M12 26 C6 26 6 18 12 18 C12 11 22 9 25 14 C28 10 36 11 36 18 C42 18 42 26 36 26 Z'/>` +
  `<path d='M26 26 L20 35 H26 L22 44' stroke='${MARK}' stroke-width='1.8'/>` +
  line('M12 31 L10 36 M16 31 L14 36 M33 31 L31 36 M37 31 L35 36', SEA, 0.8, 1.2),

  // 28 Ghost Ship Captain — the ghost ship, sails in rags
  `<path d='M5 33 H43 L37 41 H11 Z M17 33 V8 M31 33 V12'/>` +
  `<path d='M17 10 H28 L27 16 L29 19 L26 21 L28 28 H17 M31 14 H40 L39 19 L41 24 L38 29 H31' stroke='${SEA}' stroke-opacity='0.8' stroke-dasharray='3 1.5' fill='${SEA}' fill-opacity='0.08'/>` +
  dot(24, 38, 1, SEA) + dot(30, 38, 1, SEA) +
  line('M3 45 Q8 42 13 45 T23 45 T33 45 T43 45', SEA, 0.4, 1),

  // 29 Keeper of the Lost Gold — the chest
  `<path d='M8 22 H40 V40 H8 Z M8 22 C8 12 40 12 40 22'/>` +
  line('M16 15 V40 M32 15 V40', SEA) +
  `<rect x='21' y='20' width='6' height='7' rx='1'/>` + dot(24, 23.5, 1, MARK) +
  glow(24, 12, 9, '#fde68a', 0.3) + dot(19, 11, 1.4, '#fde68a') + dot(28, 9, 1.4, '#fde68a') + dot(24, 6, 1.1, '#fde68a'),

  // 30 Pirate Legend — skull over crossed blades, starred
  `<path d='M7 42 C14 34 26 24 40 8 M41 42 C34 34 22 24 8 8' stroke='${SEA}'/>` +
  `<path d='M24 12 C16 12 12 17 12 24 C12 28 14 31 17 32 V37 H31 V32 C34 31 36 28 36 24 C36 17 32 12 24 12 Z' fill='currentColor' fill-opacity='0.1'/>` +
  dot(19.5, 24, 2.6, MARK) + dot(28.5, 24, 2.6, MARK) + `<path d='M22 37 V34 M26 37 V34'/>` +
  `<path d='${starPath(24, 5.5, 4, 1.7)}' fill='currentColor' fill-opacity='0.3'/>`,
];

/* ------------------------------------------------------------------- export */

export const LEVEL_ART: Record<GameTheme, readonly string[]> = {
  freight: FREIGHT,
  wizarding: WIZARDING,
  empire: EMPIRE,
  fairy: FAIRY,
  space: SPACE,
  pirate: PIRATE,
};
