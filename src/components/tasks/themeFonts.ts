import { Cinzel, Cormorant_Garamond, Orbitron, Pirata_One, Uncial_Antiqua } from 'next/font/google';

/**
 * The display faces for game themes, used for the banner title and nowhere
 * else — everything a person reads to work stays in Inter. Kept apart from
 * taskSkins.ts because next/font only runs inside Next, and the theme
 * preview script needs the skins without it.
 *
 * `preload: false`: most people will only ever see one of these, and a
 * preload is a download whether it is used or not. Freight uses Rajdhani,
 * which the root layout already loads.
 */
const wizard = Uncial_Antiqua({ weight: '400', subsets: ['latin'], variable: '--font-tt-wizard', preload: false, display: 'swap' });
const empire = Cinzel({ weight: ['600', '700'], subsets: ['latin'], variable: '--font-tt-empire', preload: false, display: 'swap' });
const fairy = Cormorant_Garamond({ weight: ['600', '700'], style: ['italic'], subsets: ['latin'], variable: '--font-tt-fairy', preload: false, display: 'swap' });
const space = Orbitron({ weight: ['600', '700'], subsets: ['latin'], variable: '--font-tt-space', preload: false, display: 'swap' });
const pirate = Pirata_One({ weight: '400', subsets: ['latin'], variable: '--font-tt-pirate', preload: false, display: 'swap' });

/** Put on the page's outermost element so every themed title under it can reach its face. */
export const THEME_FONT_VARS = [wizard, empire, fairy, space, pirate].map((f) => f.variable).join(' ');
