/*
 * The look-and-feel choices that follow a person from one computer to the
 * next: the colour theme, the chat wallpaper, and whether Learn English is on.
 *
 * They used to live in localStorage alone, on the argument that they are about
 * a screen rather than a person. In practice people found them forgotten the
 * next morning — a browser that clears site data on close, a second computer,
 * a new laptop — and asked for the app to remember. "Match this computer" is
 * still there for anybody who does want the theme to differ by machine.
 *
 * Stored as `users/{uid}.preferences`, which is readable by every signed-in
 * user. That is acceptable for these and would not be for much else: which
 * wallpaper a colleague chose tells nobody anything. **Anything added here is
 * public to staff** — keep it to cosmetic choices, and never put anything
 * access-shaped or HR-shaped in this map.
 *
 * localStorage is still written too, and is what the page reads first: the
 * boot script in <head> runs before any sign-in, so it is the only thing that
 * can paint the right colours on the first frame. The account copy is what
 * refills it on a browser that lost it. See PreferenceSync.
 *
 * No module-level Firestore or React here: the API route imports this to
 * validate a body, and the browser imports it for the lists.
 */

export type ThemeChoice = 'light' | 'dim' | 'dark' | 'system';

export const THEME_CHOICES: ThemeChoice[] = ['light', 'dim', 'dark', 'system'];

export type ChatWallpaperId = 'freight' | 'highway' | 'harbour' | 'warehouse' | 'dots' | 'plain';

export const CHAT_WALLPAPER_IDS: ChatWallpaperId[] = ['freight', 'highway', 'harbour', 'warehouse', 'dots', 'plain'];

/** Every key optional: absent means "never chosen", and the browser's own value (or the default) stands. */
export interface UserPreferences {
  theme?: ThemeChoice;
  chatWallpaper?: ChatWallpaperId;
  learnEnglish?: boolean;
}

/**
 * The only definition of what may be saved. Unknown keys are dropped and a
 * known key with a value this build does not recognise is dropped with it,
 * so the route can never be used to park arbitrary data on a profile that
 * every staff member can read.
 */
export function cleanPreferences(input: unknown): UserPreferences {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: UserPreferences = {};
  if (THEME_CHOICES.includes(body.theme as ThemeChoice)) out.theme = body.theme as ThemeChoice;
  if (CHAT_WALLPAPER_IDS.includes(body.chatWallpaper as ChatWallpaperId)) {
    out.chatWallpaper = body.chatWallpaper as ChatWallpaperId;
  }
  if (typeof body.learnEnglish === 'boolean') out.learnEnglish = body.learnEnglish;
  return out;
}
