import localFont from 'next/font/local';

/**
 * The faces for game themes. Each theme has two: a display face for the
 * banner title, the page title and the column headings, and a body face for
 * everything else on the page — cards, buttons, the filter box, the editor.
 * The display faces are too decorative to read a task in; the body faces were
 * chosen to be readable at 11–14px while still looking like the theme. Kept
 * apart from taskSkins.ts because next/font only runs inside Next.
 *
 * **Served from src/fonts, not next/font/google** (2026-11-04). The Google
 * loader downloads every face at build time, and on Vercel that download
 * failed outright three times ("next/font/google queries have exactly one
 * entry"), with and without the build cache — eleven families meant eleven
 * chances per deploy to break the release. The files are the same latin
 * woff2 Google served; see src/fonts/README.md. Do not switch back.
 *
 * `preload: false`: most people will only ever see one theme, and a preload
 * is a download whether it is used or not. Freight's display face is the
 * root layout's Rajdhani; its body face is Rajdhani again in lighter
 * weights, which the root layout does not load.
 */
const wizard = localFont({ src: '../../fonts/uncial-antiqua-400.woff2', weight: '400', variable: '--font-tt-wizard', preload: false, display: 'swap' });
// One variable file each, covering both weights asked for.
const empire = localFont({ src: '../../fonts/cinzel-variable.woff2', weight: '600 700', variable: '--font-tt-empire', preload: false, display: 'swap' });
const fairy = localFont({ src: '../../fonts/cormorant-garamond-italic-variable.woff2', weight: '600 700', style: 'italic', variable: '--font-tt-fairy', preload: false, display: 'swap' });
const space = localFont({ src: '../../fonts/orbitron-variable.woff2', weight: '600 700', variable: '--font-tt-space', preload: false, display: 'swap' });
const pirate = localFont({ src: '../../fonts/pirata-one-400.woff2', weight: '400', variable: '--font-tt-pirate', preload: false, display: 'swap' });

const freightBody = localFont({
  src: [
    { path: '../../fonts/rajdhani-500.woff2', weight: '500' },
    { path: '../../fonts/rajdhani-600.woff2', weight: '600' },
    { path: '../../fonts/rajdhani-700.woff2', weight: '700' },
  ],
  variable: '--font-tt-freight-body', preload: false, display: 'swap',
});
const wizardBody = localFont({ src: '../../fonts/alegreya-400-900.woff2', weight: '400 900', variable: '--font-tt-wizard-body', preload: false, display: 'swap' });
const empireBody = localFont({ src: '../../fonts/marcellus-400.woff2', weight: '400', variable: '--font-tt-empire-body', preload: false, display: 'swap' });
const fairyBody = localFont({ src: '../../fonts/lora-400-700.woff2', weight: '400 700', variable: '--font-tt-fairy-body', preload: false, display: 'swap' });
const spaceBody = localFont({ src: '../../fonts/exo-2-100-900.woff2', weight: '100 900', variable: '--font-tt-space-body', preload: false, display: 'swap' });
const pirateBody = localFont({
  src: [
    { path: '../../fonts/spectral-400.woff2', weight: '400' },
    { path: '../../fonts/spectral-500.woff2', weight: '500' },
    { path: '../../fonts/spectral-600.woff2', weight: '600' },
    { path: '../../fonts/spectral-700.woff2', weight: '700' },
  ],
  variable: '--font-tt-pirate-body', preload: false, display: 'swap',
});

/** Put on the page's outermost element so everything under it can reach its theme's faces. */
export const THEME_FONT_VARS = [
  wizard, empire, fairy, space, pirate,
  freightBody, wizardBody, empireBody, fairyBody, spaceBody, pirateBody,
].map((f) => f.variable).join(' ');
