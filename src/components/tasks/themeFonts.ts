import {
  Alegreya, Cinzel, Cormorant_Garamond, Exo_2, Lora, Marcellus, Orbitron, Pirata_One, Rajdhani, Spectral, Uncial_Antiqua,
} from 'next/font/google';

/**
 * The faces for game themes. Each theme has two: a display face for the
 * banner title, the page title and the column headings, and a body face for
 * everything else on the page — cards, buttons, the filter box, the editor.
 * The display faces are too decorative to read a task in; the body faces were
 * chosen to be readable at 11–14px while still looking like the theme. Kept
 * apart from taskSkins.ts because next/font only runs inside Next.
 *
 * `preload: false`: most people will only ever see one theme, and a preload
 * is a download whether it is used or not. Freight's display face is the
 * root layout's Rajdhani; its body face is Rajdhani again in lighter
 * weights, which the root layout does not load.
 */
const wizard = Uncial_Antiqua({ weight: '400', subsets: ['latin'], variable: '--font-tt-wizard', preload: false, display: 'swap' });
const empire = Cinzel({ weight: ['600', '700'], subsets: ['latin'], variable: '--font-tt-empire', preload: false, display: 'swap' });
const fairy = Cormorant_Garamond({ weight: ['600', '700'], style: ['italic'], subsets: ['latin'], variable: '--font-tt-fairy', preload: false, display: 'swap' });
const space = Orbitron({ weight: ['600', '700'], subsets: ['latin'], variable: '--font-tt-space', preload: false, display: 'swap' });
const pirate = Pirata_One({ weight: '400', subsets: ['latin'], variable: '--font-tt-pirate', preload: false, display: 'swap' });

const freightBody = Rajdhani({ weight: ['500', '600', '700'], subsets: ['latin'], variable: '--font-tt-freight-body', preload: false, display: 'swap' });
const wizardBody = Alegreya({ subsets: ['latin'], variable: '--font-tt-wizard-body', preload: false, display: 'swap' });
const empireBody = Marcellus({ weight: '400', subsets: ['latin'], variable: '--font-tt-empire-body', preload: false, display: 'swap' });
const fairyBody = Lora({ subsets: ['latin'], variable: '--font-tt-fairy-body', preload: false, display: 'swap' });
const spaceBody = Exo_2({ subsets: ['latin'], variable: '--font-tt-space-body', preload: false, display: 'swap' });
const pirateBody = Spectral({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-tt-pirate-body', preload: false, display: 'swap' });

/** Put on the page's outermost element so everything under it can reach its theme's faces. */
export const THEME_FONT_VARS = [
  wizard, empire, fairy, space, pirate,
  freightBody, wizardBody, empireBody, fairyBody, spaceBody, pirateBody,
].map((f) => f.variable).join(' ');
