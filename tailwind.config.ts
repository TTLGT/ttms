import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

type Scale = Record<string, string>;

const brand: Scale = {
  50:  '#eff6ff',
  100: '#dbeafe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#1d4ed8',
  600: '#1e40af',
  700: '#1e3a8a',
  900: '#0f1f4a',
};

/*
 * Dark mode, done by changing what the colour names mean rather than by
 * adding `dark:` classes to every screen.
 *
 * The app spells its colours out — `bg-white`, `text-gray-700`, `bg-red-50` —
 * around three and a half thousand times across 150 files. Giving each a
 * `dark:` twin would double that and would have to be remembered on every
 * screen written afterwards. Instead, the shades that must change are pointed
 * at CSS variables, and `html.dark` (set by src/lib/theme.ts) redefines those
 * variables. Every screen, including ones not yet written, follows.
 *
 * The trick that makes it work is that Tailwind resolves colours separately
 * per utility. A light shade has two jobs in light mode — `bg-red-50` is a
 * pale ground, `text-red-700` is dark ink on it — and in dark mode those two
 * jobs pull in opposite directions: the ground must go dark and the ink must
 * go light. So backgrounds, text and borders each get their own mapping:
 *
 *   - backgrounds: the pale tints (50–300) become dark tints; the solid
 *     shades a button or a badge is filled with (400 up) do not move, so white
 *     text on `bg-brand-600` stays readable;
 *   - text: the dark inks (500 up) become light ones; the pale inks used on
 *     the dark sidebar do not move;
 *   - borders: the pale hairlines (50–300) become dark ones.
 *
 * `white` changes only as a background (and a ring or gradient stop, which
 * stand in for one). `text-white` is still white — it sits on brand buttons
 * and on the sidebar, which are dark in both modes.
 *
 * Only shades a family already has are mapped. `brand` has no 200 or 800, so
 * `border-brand-200` has never produced a class, and defining one here would
 * quietly recolour the light theme too.
 *
 * Anything not listed resolves to its plain colour exactly as before, so the
 * light theme is unchanged: `:root` holds the same values Tailwind used to
 * write inline.
 */

// The two grounds everything else is measured against.
const DARK_PAGE = '#0e1319';
const DARK_SURFACE = '#161c24';

// Hand-picked rather than computed: grey carries almost all the layout, and
// the steps that separate a card from a row hover from an input need to be
// judged by eye. gray-50 sits *below* the card on purpose — it is the page
// ground and the inset of a table header or an input — while gray-100 and up
// rise above it, as a hover or a chip does.
const GRAY_DARK: Record<'bg' | 'text' | 'border', Scale> = {
  bg:     { 50: DARK_PAGE, 100: '#212933', 200: '#2b3440', 300: '#3a4452' },
  text:   { 200: '#3a4452', 300: '#4f5966', 400: '#6e7781', 500: '#8b95a1',
            600: '#a3adb9', 700: '#c3cbd5', 800: '#d4dbe3', 900: '#e6edf3' },
  border: { 50: '#1a2029', 100: '#222a34', 200: '#2b3440', 300: '#3a4452', 400: '#4f5966' },
};

// Everything else follows one rule, tinted from the family's own 500.
const TINT = {
  bg:     { 50: 0.14, 100: 0.22, 200: 0.32, 300: 0.45 },
  border: { 50: 0.16, 100: 0.24, 200: 0.34, 300: 0.48 },
} as const;
const INK: Record<string, string> = { 500: '400', 600: '400', 700: '300', 800: '200', 900: '100' };

const STATUS_FAMILIES = [
  'red', 'amber', 'green', 'blue', 'yellow', 'purple', 'pink', 'sky', 'orange',
  'emerald', 'cyan', 'violet', 'teal', 'rose', 'lime', 'indigo',
] as const;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function triplet(hex: string): string {
  return rgb(hex).join(' ');
}

function mix(tint: string, ground: string, amount: number): string {
  const a = rgb(tint);
  const b = rgb(ground);
  return '#' + a.map((c, i) => Math.round(c * amount + b[i] * (1 - amount)).toString(16).padStart(2, '0')).join('');
}

// Filled in as the mappings below are built, then emitted by the plugin.
const lightVars: Record<string, string> = {};
const darkVars: Record<string, string> = {};

// A colour that changes with the theme. Written as an rgb triplet so the
// opacity modifier (`bg-white/85`, `bg-brand-500/10`) keeps working.
function themed(name: string, light: string, dark: string): string {
  lightVars[`--c-${name}`] = triplet(light);
  darkVars[`--c-${name}`] = triplet(dark);
  return `rgb(var(--c-${name}) / <alpha-value>)`;
}

type Kind = 'bg' | 'text' | 'border';
const mapped: Record<Kind, Record<string, Scale | string>> = { bg: {}, text: {}, border: {} };

function mapFamily(family: string, light: Scale, dark: Record<Kind, Scale>) {
  for (const kind of ['bg', 'text', 'border'] as Kind[]) {
    const out: Scale = {};
    for (const [shade, darkHex] of Object.entries(dark[kind])) {
      if (light[shade]) out[shade] = themed(`${kind}-${family}-${shade}`, light[shade], darkHex);
    }
    mapped[kind][family] = out;
  }
}

function ruleFor(light: Scale, source: Scale): Record<Kind, Scale> {
  const tint = source[500];
  const bg: Scale = {};
  const border: Scale = {};
  const text: Scale = {};
  for (const [shade, amount] of Object.entries(TINT.bg)) bg[shade] = mix(tint, DARK_SURFACE, amount);
  for (const [shade, amount] of Object.entries(TINT.border)) border[shade] = mix(tint, DARK_SURFACE, amount);
  for (const [shade, lighter] of Object.entries(INK)) if (light[shade]) text[shade] = source[lighter];
  return { bg, text, border };
}

mapFamily('gray', colors.gray, GRAY_DARK);
for (const family of STATUS_FAMILIES) {
  const scale = colors[family] as Scale;
  mapFamily(family, scale, ruleFor(scale, scale));
}
// Brand is Tailwind's blue with a deeper 500–900, so its dark shades are
// taken from blue: a tint of #1d4ed8 on near-black is too dark to read as blue.
mapFamily('brand', brand, ruleFor(brand, colors.blue as Scale));

const surface = themed('surface', '#ffffff', DARK_SURFACE);

const config: Config = {
  // `class` so the switch in src/lib/theme.ts decides, not the operating
  // system alone. Also makes `dark:` available for the odd case the mapping
  // above cannot reach.
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: { brand },
      backgroundColor: { white: surface, ...mapped.bg },
      textColor: mapped.text,
      // DEFAULT is what a bare `border` draws with (preflight reads it), so it
      // has to follow gray-200 into the dark or every unstyled hairline glows.
      borderColor: { DEFAULT: (mapped.border.gray as Scale)[200], ...mapped.border },
      gradientColorStops: { white: surface },
      ringColor: { white: surface },
      ringOffsetColor: { white: surface },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': lightVars, 'html.dark': darkVars });
    }),
  ],
};

export default config;
