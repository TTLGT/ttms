import type { GameTheme } from '@/types/taskGame';

/**
 * The banner artwork for each game theme: fine line drawings on a deep
 * ground, drawn as SVG so they stay sharp at any width and cost no download.
 *
 * Each is 1200×220 and is laid in with `xMaxYMid slice`, so the detail sits
 * on the right and the left — where the words go — fades to the plain
 * ground colour. The fade is part of each drawing (`fade()`), which is why
 * text over the banner never needs a backdrop of its own.
 *
 * Pure strings, no React and no Next, so the theme preview script can use
 * exactly what the app draws.
 */

const W = 1200;
const H = 220;

function svg(ground: string, body: string): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMaxYMid slice'>${body}${fade(ground)}</svg>`;
}

/** Solid ground on the left, clearing to the art by about two thirds across. */
function fade(ground: string): string {
  return `<defs><linearGradient id='f' x1='0' x2='1' y1='0' y2='0'>` +
    `<stop offset='0' stop-color='${ground}' stop-opacity='1'/>` +
    `<stop offset='0.38' stop-color='${ground}' stop-opacity='0.92'/>` +
    `<stop offset='0.7' stop-color='${ground}' stop-opacity='0'/></linearGradient></defs>` +
    `<rect width='${W}' height='${H}' fill='url(#f)'/>`;
}

/** A field of small stars, placed by a fixed sequence so every render is the same sky. */
function stars(count: number, color: string, seed: number, x0 = 380): string {
  let s = seed;
  const next = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = x0 + next() * (W - x0);
    const y = next() * H;
    const r = 0.5 + next() * 1.3;
    out += `<circle cx='${x.toFixed(1)}' cy='${y.toFixed(1)}' r='${r.toFixed(2)}' fill='${color}' opacity='${(0.25 + next() * 0.6).toFixed(2)}'/>`;
  }
  return out;
}

function grid(color: string, step: number, opacity: number): string {
  let out = `<g stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'>`;
  for (let x = 0; x <= W; x += step) out += `<line x1='${x}' y1='0' x2='${x}' y2='${H}'/>`;
  for (let y = 0; y <= H; y += step) out += `<line x1='0' y1='${y}' x2='${W}' y2='${y}'/>`;
  return `${out}</g>`;
}

/* ------------------------------------------------------------------ freight */

// A lane network: hubs with their city codes, the lanes between them, and
// one live load in amber running to a destination with a radar ring — the
// view from a dispatch desk, not a cartoon truck.
const FREIGHT_GROUND = '#0b1a33';
const hubs: [number, number][] = [[640, 160], [760, 70], [880, 150], [980, 54], [1090, 120], [1160, 44], [592, 204], [1150, 200]];
const hubCodes = ['LRD', 'DAL', 'HOU', 'MEM', 'ATL', 'CHI', 'MTY', 'MIA'];
const lanes: [number, number][] = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 5], [0, 6], [6, 2], [2, 7], [7, 4]];
const arc = ([ax, ay]: [number, number], [bx, by]: [number, number], lift: number) =>
  `M${ax} ${ay} Q${(ax + bx) / 2} ${Math.min(ay, by) - lift} ${bx} ${by}`;

const FREIGHT = svg(FREIGHT_GROUND,
  grid('#ffffff', 44, 0.035) +
  `<g fill='none' stroke='#8fb3ff' stroke-opacity='0.28' stroke-width='1.2' stroke-dasharray='3 5'>` +
  lanes.map(([a, b]) => `<path d='${arc(hubs[a], hubs[b], 26)}'/>`).join('') + `</g>` +
  // The live load: solid, warm, with a glow, ending at a hub.
  `<path d='${arc(hubs[0], hubs[1], 26)} Q${(hubs[1][0] + hubs[3][0]) / 2} ${Math.min(hubs[1][1], hubs[3][1]) - 26} ${hubs[3][0]} ${hubs[3][1]}' fill='none' stroke='#f59e0b' stroke-width='6' stroke-opacity='0.18' stroke-linecap='round'/>` +
  `<path d='${arc(hubs[0], hubs[1], 26)} Q${(hubs[1][0] + hubs[3][0]) / 2} ${Math.min(hubs[1][1], hubs[3][1]) - 26} ${hubs[3][0]} ${hubs[3][1]}' fill='none' stroke='#f59e0b' stroke-width='2' stroke-linecap='round'/>` +
  `<g fill='none' stroke='#f59e0b' transform='translate(${hubs[3][0]} ${hubs[3][1]})'>` +
  `<circle r='18' stroke-opacity='0.35'/><circle r='30' stroke-opacity='0.18'/><circle r='44' stroke-opacity='0.08'/></g>` +
  hubs.map(([x, y], i) =>
    `<circle cx='${x}' cy='${y}' r='9' fill='none' stroke='${i === 3 ? '#f59e0b' : '#8fb3ff'}' stroke-opacity='${i === 3 ? 0.6 : 0.22}'/>` +
    `<circle cx='${x}' cy='${y}' r='3' fill='${i === 3 || i === 0 ? '#f59e0b' : '#dbe6ff'}' fill-opacity='${i === 3 || i === 0 ? 1 : 0.7}'/>` +
    `<text x='${x + 13}' y='${y - 9}' fill='${i === 3 || i === 0 ? '#fbbf24' : '#c7d6f5'}' fill-opacity='${i === 3 || i === 0 ? 0.9 : 0.45}' font-family='ui-monospace,Consolas,monospace' font-size='11' letter-spacing='1'>${hubCodes[i]}</text>`).join(''));

/* ---------------------------------------------------------------- wizarding */

// Constellations around an arcane circle, under a crescent moon.
const WIZARD_GROUND = '#1a1033';
const constellation: [number, number][] = [[700, 150], [760, 110], [820, 128], [870, 80], [930, 96]];
const WIZARDING = svg(WIZARD_GROUND,
  stars(90, '#e9e3ff', 7) +
  `<polyline points='${constellation.map((p) => p.join(',')).join(' ')}' fill='none' stroke='#c4b5fd' stroke-opacity='0.45' stroke-width='1'/>` +
  constellation.map(([x, y]) => `<circle cx='${x}' cy='${y}' r='2.4' fill='#ede9fe'/>`).join('') +
  `<g fill='none' stroke='#a78bfa' stroke-opacity='0.35' transform='translate(1040 112)'>` +
  `<circle r='86'/><circle r='70' stroke-dasharray='2 6'/><circle r='40'/>` +
  `<path d='M0 -70 L60.6 35 L-60.6 35 Z'/><path d='M0 70 L60.6 -35 L-60.6 -35 Z' stroke-opacity='0.22'/>` +
  Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return `<line x1='${(Math.cos(a) * 86).toFixed(1)}' y1='${(Math.sin(a) * 86).toFixed(1)}' x2='${(Math.cos(a) * 94).toFixed(1)}' y2='${(Math.sin(a) * 94).toFixed(1)}'/>`;
  }).join('') + `</g>` +
  `<defs><mask id='m'><rect width='${W}' height='${H}' fill='white'/><circle cx='1142' cy='40' r='22' fill='black'/></mask></defs>` +
  `<circle cx='1130' cy='46' r='24' fill='#fde68a' fill-opacity='0.9' mask='url(#m)'/>`);

/* ------------------------------------------------------------------ empires */

// Gold on crimson: a sunburst medallion and a Greek-key border.
const EMPIRE_GROUND = '#3a0b12';
function meander(y: number): string {
  let d = '';
  for (let x = 380; x < W; x += 28) d += `M${x} ${y + 12} V${y} H${x + 20} V${y + 9} H${x + 8} V${y + 4} H${x + 14} `;
  return `<path d='${d}' fill='none' stroke='#e0b84f' stroke-opacity='0.5' stroke-width='1.4'/>`;
}
const EMPIRE = svg(EMPIRE_GROUND,
  `<g transform='translate(1010 104)' stroke='#e0b84f' fill='none'>` +
  Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r2 = i % 2 ? 120 : 150;
    return `<line x1='${(Math.cos(a) * 64).toFixed(1)}' y1='${(Math.sin(a) * 64).toFixed(1)}' x2='${(Math.cos(a) * r2).toFixed(1)}' y2='${(Math.sin(a) * r2).toFixed(1)}' stroke-opacity='0.16'/>`;
  }).join('') +
  `<circle r='62' stroke-opacity='0.55' stroke-width='1.5'/><circle r='54' stroke-opacity='0.3'/>` +
  // A crown, drawn in five strokes.
  `<path d='M-26 14 L-30 -14 L-14 2 L0 -22 L14 2 L30 -14 L26 14 Z' stroke-opacity='0.85' stroke-width='1.8' stroke-linejoin='round'/>` +
  `<line x1='-26' y1='22' x2='26' y2='22' stroke-opacity='0.85' stroke-width='1.8'/></g>` +
  `<line x1='380' y1='10' x2='${W}' y2='10' stroke='#e0b84f' stroke-opacity='0.35'/>` +
  `<line x1='380' y1='14' x2='${W}' y2='14' stroke='#e0b84f' stroke-opacity='0.2'/>` +
  meander(H - 22));

/* -------------------------------------------------------------------- fairy */

// Night in a wood: vines with leaves, and fireflies glowing among them.
const FAIRY_GROUND = '#0e2a24';
function vine(d: string, leaves: [number, number, number][]): string {
  return `<path d='${d}' fill='none' stroke='#86efac' stroke-opacity='0.35' stroke-width='1.4'/>` +
    leaves.map(([x, y, r]) => `<ellipse cx='${x}' cy='${y}' rx='9' ry='4' transform='rotate(${r} ${x} ${y})' fill='#86efac' fill-opacity='0.25'/>`).join('');
}
const fireflies: [number, number, string][] = [[720, 60, '#fef08a'], [820, 150, '#f9a8d4'], [900, 90, '#fef08a'], [1010, 170, '#fef08a'], [1080, 70, '#f9a8d4'], [1150, 140, '#fef08a'], [960, 30, '#fef08a'], [770, 190, '#f9a8d4']];
const FAIRY = svg(FAIRY_GROUND,
  `<defs><radialGradient id='g'><stop offset='0' stop-color='white' stop-opacity='0.9'/><stop offset='1' stop-color='white' stop-opacity='0'/></radialGradient></defs>` +
  vine('M640 220 C700 150 760 170 800 110 S900 40 960 80 S1080 160 1200 60', [[700, 168, -30], [790, 124, 40], [880, 62, -20], [990, 96, 30], [1100, 120, -40]]) +
  vine('M900 220 C940 180 1000 200 1040 150 S1140 120 1200 160', [[960, 192, 20], [1050, 146, -30], [1140, 138, 25]]) +
  fireflies.map(([x, y, c]) =>
    `<circle cx='${x}' cy='${y}' r='14' fill='${c}' fill-opacity='0.16'/><circle cx='${x}' cy='${y}' r='2.6' fill='${c}'/>`).join('') +
  stars(26, '#fdf2f8', 3, 600));

/* -------------------------------------------------------------------- space */

// A ringed planet, its orbits, and a satellite, in a deep field of stars.
const SPACE_GROUND = '#070b1f';
const SPACE = svg(SPACE_GROUND,
  stars(140, '#e0f2fe', 11) +
  `<defs><radialGradient id='p' cx='0.35' cy='0.35' r='0.75'>` +
  `<stop offset='0' stop-color='#818cf8'/><stop offset='0.6' stop-color='#3730a3'/><stop offset='1' stop-color='#0b1033'/></radialGradient></defs>` +
  `<g transform='translate(1030 112)'>` +
  `<ellipse rx='240' ry='70' fill='none' stroke='#67e8f9' stroke-opacity='0.18' stroke-dasharray='2 6' transform='rotate(-12)'/>` +
  `<ellipse rx='160' ry='46' fill='none' stroke='#67e8f9' stroke-opacity='0.24' transform='rotate(-12)'/>` +
  `<circle r='54' fill='url(#p)'/>` +
  `<ellipse rx='92' ry='18' fill='none' stroke='#a5f3fc' stroke-opacity='0.7' stroke-width='2' transform='rotate(-12)'/>` +
  `<circle cx='-150' cy='40' r='4' fill='#67e8f9'/><circle cx='-150' cy='40' r='10' fill='#67e8f9' fill-opacity='0.2'/></g>`);

/* ------------------------------------------------------------------- pirate */

// A chart: latitude lines, a compass rose, and a dotted course to an X.
const PIRATE_GROUND = '#08262b';
function rose(): string {
  const pts = (r1: number, r2: number, n: number, rot = 0) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const a = rot + (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? r2 : r1;
      return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
    }).join(' ');
  return `<g transform='translate(1060 110)' fill='none' stroke='#e7c88a'>` +
    `<circle r='92' stroke-opacity='0.3'/><circle r='84' stroke-opacity='0.18' stroke-dasharray='1 4'/>` +
    `<polygon points='${pts(70, 16, 4)}' stroke-opacity='0.75' fill='#e7c88a' fill-opacity='0.08'/>` +
    `<polygon points='${pts(46, 12, 4, Math.PI / 4)}' stroke-opacity='0.45'/>` +
    `<text x='0' y='-100' fill='#e7c88a' fill-opacity='0.7' stroke='none' font-size='14' text-anchor='middle' font-family='serif'>N</text></g>`;
}
const PIRATE = svg(PIRATE_GROUND,
  grid('#e7c88a', 55, 0.07) +
  rose() +
  `<path d='M640 180 C720 120 780 190 860 140 S940 70 980 96' fill='none' stroke='#e7c88a' stroke-opacity='0.55' stroke-width='1.6' stroke-dasharray='2 6' stroke-linecap='round'/>` +
  `<g stroke='#f87171' stroke-width='2.2' stroke-linecap='round'><line x1='632' y1='172' x2='648' y2='188'/><line x1='648' y1='172' x2='632' y2='188'/></g>` +
  `<path d='M380 206 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0' fill='none' stroke='#5eead4' stroke-opacity='0.18'/>`);

export const SKIN_ART: Record<GameTheme, { ground: string; art: string }> = {
  freight:   { ground: FREIGHT_GROUND, art: FREIGHT },
  wizarding: { ground: WIZARD_GROUND,  art: WIZARDING },
  empire:    { ground: EMPIRE_GROUND,  art: EMPIRE },
  fairy:     { ground: FAIRY_GROUND,   art: FAIRY },
  space:     { ground: SPACE_GROUND,   art: SPACE },
  pirate:    { ground: PIRATE_GROUND,  art: PIRATE },
};

/** The drawing as a CSS background-image. */
export function artUrl(theme: GameTheme): string {
  return `url("data:image/svg+xml,${encodeURIComponent(SKIN_ART[theme].art)}")`;
}
