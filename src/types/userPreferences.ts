/*
 * The look-and-feel choices that follow a person from one computer to the
 * next: the colour theme, the chat wallpaper and load-update style, and whether Learn English and the
 * Spanish switch are on.
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

/**
 * How the load updates TTMS posts in a room are drawn for this person — see
 * src/components/chat/SystemMessage.tsx. Three drawings of the same parsed
 * update (src/lib/chatAlertCards.ts); the room itself is the same for all.
 */
export type ChatAlertStyle = 'tickets' | 'cards' | 'timeline';

export const CHAT_ALERT_STYLES: ChatAlertStyle[] = ['tickets', 'cards', 'timeline'];

/** Every key optional: absent means "never chosen", and the browser's own value (or the default) stands. */
export interface UserPreferences {
  theme?: ThemeChoice;
  chatWallpaper?: ChatWallpaperId;
  chatAlertStyle?: ChatAlertStyle;
  learnEnglish?: boolean;
  /** Spanish under the English — see src/context/SpanishContext.tsx. */
  spanish?: boolean;
  /**
   * A time zone the person picked on My profile ("Europe/London"), for the
   * clock change banner and the US time zones section — see
   * src/types/clockChange.ts. **Absent or null means Automatic**: the
   * computer's own zone. Picked rather than detected for a computer set to the
   * wrong zone, or one shared between offices. Public to staff like the rest
   * of this map; which city a colleague works from is not a secret here.
   */
  timeZone?: string | null;
  /** The city they chose it by ("Tuxtla Gutiérrez"), so the banner can name it. */
  timeZoneCity?: string | null;
}

/** Same test as isTimeZoneName() in clockChange.ts, kept here so the route imports nothing else. */
function isZoneName(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  if (!/^[A-Za-z]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
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
  if (CHAT_ALERT_STYLES.includes(body.chatAlertStyle as ChatAlertStyle)) {
    out.chatAlertStyle = body.chatAlertStyle as ChatAlertStyle;
  }
  if (typeof body.learnEnglish === 'boolean') out.learnEnglish = body.learnEnglish;
  if (typeof body.spanish === 'boolean') out.spanish = body.spanish;
  // The zone and its city travel together: null clears both (back to
  // Automatic), and a city is only kept beside a zone the server recognises.
  if (body.timeZone === null) {
    out.timeZone = null;
    out.timeZoneCity = null;
  } else if (isZoneName(body.timeZone)) {
    out.timeZone = body.timeZone;
    const city = typeof body.timeZoneCity === 'string' ? body.timeZoneCity.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    out.timeZoneCity = city || null;
  }
  return out;
}
