/**
 * Build public/chat-wallpaper.svg — the doodle pattern behind chat messages.
 *
 * Why this exists: the chat ground is meant to read the way WhatsApp's does, a
 * faint scatter of line drawings the eye stops seeing after a minute, except
 * that the drawings are ours — trucks, containers, pallets, a BOL clipboard.
 * Drawing thirty icons by hand would be a week of fiddling; lucide-react is
 * already a dependency, its icons are the same line weight as the rest of the
 * app, and its licence (ISC) allows exactly this. So this reads their path
 * data out of the package and scatters them over one square tile.
 *
 * The tile is drawn in solid black on purpose. It is used as a CSS mask, not
 * as a picture (see `.chat-wallpaper` in globals.css), so only its shape
 * matters — the colour comes from a CSS variable, which is what lets the same
 * file serve the light and dark themes.
 *
 * The layout is seeded, not random, so re-running it gives the same file and
 * a diff shows only a deliberate change.
 *
 * Writes one local file. Touches no Firestore, no Storage, nothing remote.
 *
 *   node scripts/build-chat-wallpaper.mjs
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ICON_DIR = path.join(ROOT, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons');
const OUT = path.join(ROOT, 'public', 'chat-wallpaper.svg');

// Freight and the work around it. Nothing generic (no hearts, no stars): the
// point of drawing our own is that it looks like a brokerage, not a phone.
const ICONS = [
  'truck', 'container', 'forklift', 'ship', 'plane', 'warehouse',
  'map-pin', 'route', 'clipboard-list', 'fuel', 'anchor', 'boxes',
  'package', 'package-open', 'globe', 'navigation', 'weight', 'scan-barcode',
  'traffic-cone', 'train-front', 'compass', 'signpost', 'handshake', 'headset',
  'file-pen-line', 'calendar-clock', 'dollar-sign', 'package-2', 'map', 'milestone',
];

// The vehicles and the freight itself come round more often than the rest, so
// the pattern reads as trucking at a glance rather than as office supplies.
const DECK = [...ICONS, 'truck', 'truck', 'container', 'forklift', 'ship', 'plane', 'package'];

// Scattered rather than gridded. A grid, even a jittered one, shows as rows
// across a wide screen, and rows are what make a pattern stop being
// background. So drawings are dropped at random wherever they do not crowd a
// neighbour, at a mix of sizes, the way WhatsApp's are.
//
// The tile is 480px. Distances are measured round the wrap, and a drawing near
// an edge is drawn again on the far side, so where the tile repeats the two
// halves meet instead of being cut off.
const TILE = 480;
const MIN_SCALE = 1.25; // lucide icons are 24 units, so ~30px across…
const MAX_SCALE = 1.9;  // …to ~46px
const GAP = 14;         // clear space between two drawings, in px
const STROKE = 1.5;     // on screen, whatever the drawing's size

// mulberry32 — a small seeded generator, so the file is reproducible.
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20260924);
const between = (lo, hi) => lo + random() * (hi - lo);

async function iconNode(name) {
  const mod = await import(pathToFileURL(path.join(ICON_DIR, `${name}.mjs`)).href);
  if (!mod.__iconNode) throw new Error(`lucide-react no longer exports path data for ${name}`);
  return mod.__iconNode;
}

function element([tag, attrs]) {
  const body = Object.entries(attrs)
    .filter(([k]) => k !== 'key')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<${tag} ${body}/>`;
}

const nodes = Object.fromEntries(
  await Promise.all(ICONS.map(async (name) => [name, await iconNode(name)])),
);

// Every placed drawing: its centre, how large, how far it reaches.
const placed = [];
const wrapGap = (d) => Math.min(Math.abs(d), TILE - Math.abs(d));
for (let attempt = 0; attempt < 40000; attempt++) {
  const scale = between(MIN_SCALE, MAX_SCALE);
  // Half the diagonal would be 17 × scale, but no icon reaches its corners;
  // 14 is what they actually cover once turned.
  const reach = 14 * scale;
  const x = random() * TILE;
  const y = random() * TILE;
  const crowded = placed.some(
    (p) => Math.hypot(wrapGap(p.x - x), wrapGap(p.y - y)) < p.reach + reach + GAP,
  );
  if (!crowded) placed.push({ x, y, scale, reach });
}

// Dealt from a shuffled deck, reshuffled each time it runs out, so every icon
// appears about as often as every other and none of them clusters.
let deck = [];
const nextIcon = () => {
  if (deck.length === 0) {
    deck = [...DECK];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck.pop();
};

const groups = [];
for (const p of placed) {
  const name = nextIcon();
  const turn = Math.round(between(-30, 30));
  const half = (12 * p.scale).toFixed(1);
  const body = nodes[name].map(element).join('');
  for (const dx of [-TILE, 0, TILE]) {
    for (const dy of [-TILE, 0, TILE]) {
      const cx = p.x + dx;
      const cy = p.y + dy;
      // Only the copies that actually show inside the tile.
      if (cx + p.reach < 0 || cx - p.reach > TILE || cy + p.reach < 0 || cy - p.reach > TILE) continue;
      groups.push(
        `<g transform="translate(${(cx - 12 * p.scale).toFixed(1)} ${(cy - 12 * p.scale).toFixed(1)}) `
        + `rotate(${turn} ${half} ${half}) scale(${p.scale.toFixed(2)})" `
        + `stroke-width="${(STROKE / p.scale).toFixed(2)}">${body}</g>`,
      );
    }
  }
}

const svg = [
  `<!-- Generated by scripts/build-chat-wallpaper.mjs from lucide icons (ISC). Do not edit by hand. -->`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">`,
  `<g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">`,
  ...groups,
  '</g>',
  '</svg>',
  '',
].join('\n');

fs.writeFileSync(OUT, svg);
console.log(`Wrote ${path.relative(ROOT, OUT)} — ${placed.length} drawings, ${(svg.length / 1024).toFixed(1)} KB`);
