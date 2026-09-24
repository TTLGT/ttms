'use client';

/**
 * The full emoji set, for the chat pickers.
 *
 * The list is src/lib/data/emoji.json, built from `emojibase-data` by
 * scripts/build-emoji-data.js. It is loaded with a dynamic import, so its
 * ~170 KB is fetched the first time somebody opens a picker rather than with
 * every chat page.
 *
 * ## Why some emoji are hidden
 *
 * An emoji is a character, and the computer reading it draws it with whatever
 * emoji font it has. Unicode adds new ones every year; an older Windows 10
 * machine — which is what most of this office runs — has a font that stops at
 * about 2019 and draws anything newer as an empty box. A picker that offers a
 * box is worse than one that does not offer it, so the first open checks, on
 * this machine, which release its font reaches and hides everything after.
 *
 * That check is about the picker only. A colleague on a newer machine can
 * still send one this machine cannot draw, and it arrives as a box. Nothing
 * short of shipping our own emoji images fixes that, and it is the same in
 * every chat app that uses the system font.
 */

export interface EmojiRow {
  /** The emoji itself. */
  e: string;
  /** Its Unicode name, "grinning face". */
  n: string;
  /** Extra search words, space-separated. */
  t: string;
  /** The Emoji release it arrived in — what the support check compares. */
  v: number;
  /** The five skin tones, light to dark, where it has them. */
  s?: string[];
}

export interface EmojiGroup {
  label: string;
  emoji: EmojiRow[];
}

let loading: Promise<EmojiGroup[]> | null = null;

/** Every emoji this machine can draw, in picker order. Loaded once per page. */
export function loadEmoji(): Promise<EmojiGroup[]> {
  loading ??= import('./data/emoji.json')
    .then((mod) => {
      const groups = (mod.default as unknown as { groups: EmojiGroup[] }).groups;
      const ceiling = supportedVersion(groups);
      const flags = drawsFlags();
      return groups.map((g) => ({
        label: g.label,
        emoji: g.emoji.filter((row) => row.v <= ceiling && (flags || !isFlagSequence(row.e))),
      }));
    })
    .catch((e) => {
      // Let the next open try again rather than remembering the failure — a
      // dropped connection should not leave the picker empty until reload.
      loading = null;
      throw e;
    });
  return loading;
}

/* ------------------------------------------------------------ font support */

const FONT = '20px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

/**
 * Whether this machine draws `glyph` as one coloured emoji.
 *
 * Two ways it fails, and both are checked. A character the font lacks comes
 * out as a grey box — no colour in it. A joined sequence the font lacks
 * (🙂‍↕️ is 🙂 + joiner + ↕️) comes out as its parts side by side — colour, but
 * twice as wide as one emoji.
 */
function drawsAsOne(ctx: CanvasRenderingContext2D, glyph: string, oneWide: number): boolean {
  ctx.clearRect(0, 0, 40, 40);
  ctx.fillText(glyph, 2, 2);
  if (ctx.measureText(glyph).width > oneWide * 1.4) return false;
  const px = ctx.getImageData(0, 0, 40, 40).data;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a > 0 && (Math.abs(r - g) > 30 || Math.abs(g - b) > 30 || Math.abs(r - b) > 30)) return true;
  }
  return false;
}

function probeContext(): { ctx: CanvasRenderingContext2D; oneWide: number } | null {
  try {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.canvas.width = ctx.canvas.height = 40;
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    return { ctx, oneWide: ctx.measureText('😀').width };
  } catch {
    return null;
  }
}

/**
 * The newest Emoji release this machine's font draws.
 *
 * Tested with the first emoji of each release found in the data itself, so a
 * new Unicode year needs no change here — only a re-run of the build script.
 * Releases up to 5.0 (2017) are drawn by every system still in use, and are
 * assumed rather than tested; if the probe cannot run at all (no canvas), the
 * answer is everything, which is what every picker did before this check.
 */
function supportedVersion(groups: EmojiGroup[]): number {
  const probe = probeContext();
  if (!probe) return Infinity;

  const firstOf = new Map<number, string>();
  for (const g of groups) {
    for (const row of g.emoji) {
      if (row.v > 5 && !firstOf.has(row.v) && !isFlagSequence(row.e)) firstOf.set(row.v, row.e);
    }
  }

  let ceiling = 5;
  for (const v of [...firstOf.keys()].sort((a, b) => a - b)) {
    if (!drawsAsOne(probe.ctx, firstOf.get(v)!, probe.oneWide)) break;
    ceiling = v;
  }
  return ceiling;
}

/**
 * Country and region flags are a case of their own: Windows has never drawn
 * them, at any version, and shows the two letters ("US") instead. The rest of
 * the Flags tab — 🏁, 🚩 — is ordinary emoji and is kept either way.
 */
function drawsFlags(): boolean {
  const probe = probeContext();
  return probe ? drawsAsOne(probe.ctx, '🇺🇸', probe.oneWide) : true;
}

/** A regional-indicator pair (🇺🇸) or a tag sequence (🏴󠁧󠁢󠁳󠁣󠁴󠁿). */
function isFlagSequence(glyph: string): boolean {
  const first = glyph.codePointAt(0) ?? 0;
  if (first >= 0x1f1e6 && first <= 0x1f1ff) return true;
  return Array.from(glyph).some((c) => {
    const cp = c.codePointAt(0)!;
    return cp >= 0xe0020 && cp <= 0xe007f;
  });
}

/* ------------------------------------------------------------ preferences */

/*
 * Recent picks and skin tone are one person's habits on one machine, so they
 * live in the browser, not in Firestore — a write per emoji chosen would cost
 * more than the convenience is worth. Every access is guarded: a private
 * window or blocked site data makes storage throw, and the picker must work
 * regardless.
 */

const RECENT_KEY = 'ttms.emoji.recent';
const TONE_KEY   = 'ttms.emoji.tone';
const MAX_RECENT = 24;

export function recentEmoji(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(glyph: string): void {
  try {
    const next = [glyph, ...recentEmoji().filter((g) => g !== glyph)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not remembered. The pick itself has already happened.
  }
}

/** 0 is the default yellow; 1–5 are light to dark. */
export function skinTone(): number {
  try {
    const n = Number(localStorage.getItem(TONE_KEY));
    return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
  } catch {
    return 0;
  }
}

export function setSkinTone(tone: number): void {
  try {
    localStorage.setItem(TONE_KEY, String(tone));
  } catch {
    // Applies for this open only.
  }
}

/** The emoji as it should be offered, in this person's tone where it has one. */
export function withTone(row: EmojiRow, tone: number): string {
  return tone > 0 && row.s ? row.s[tone - 1] : row.e;
}

/** Search on the name and the tag words; every word typed must match. */
export function matchesSearch(row: EmojiRow, words: string[]): boolean {
  const hay = `${row.n} ${row.t}`;
  return words.every((w) => hay.includes(w));
}
