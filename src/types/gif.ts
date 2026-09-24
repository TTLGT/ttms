/**
 * GIFs from Klipy — searched from the chat and sent as a message of their own.
 *
 * ## What leaves the building
 *
 * The search words people type go to Klipy, through our own server
 * (GET /api/chat/gifs) so the API key never reaches a browser. No name, email
 * or uid goes with them: Klipy offers a `customer_id` for personalised results
 * and it is deliberately not sent. The pictures themselves are loaded straight
 * from Klipy's servers by whoever is reading the message, the way every chat
 * app shows a GIF.
 *
 * ## Why a message stores the address, not a copy
 *
 * Unlike a sticker, a GIF is not copied into our bucket. It would mean storing
 * and serving every GIF anybody ever sent, for pictures that are Klipy's to
 * host. The trade is that one Klipy later removes stops showing — acceptable
 * for a reaction GIF, and the message's title still says what it was.
 *
 * Results are asked for at Klipy's strictest content filter. It is a
 * workplace, and the filter is the only control over what a search for an
 * innocent word turns up.
 */

/** Klipy's `content_filter`. `high` is the strictest. */
export const GIF_CONTENT_FILTER = 'high';

/** Results per page, per Klipy request. */
export const GIF_PAGE_SIZE = 24;

/** Longest search Klipy is sent. */
export const MAX_GIF_QUERY = 100;

export interface GifFile {
  url: string;
  width: number;
  height: number;
}

/**
 * One GIF, as the picker shows it and as a message carries it. Keep in sync
 * with `gifOk()` in firestore.rules.
 */
export interface GifRef {
  /** Klipy's slug — stable, and what their API names an item by. */
  id: string;
  /** Klipy's title, used as alt text and as the message's summary line. */
  title: string;
  /** The size shown in a message. */
  url: string;
  width: number;
  height: number;
  /** A smaller copy for the picker grid. */
  previewUrl: string;
}

/** One page of results from GET /api/chat/gifs. */
export interface GifPage {
  gifs: GifRef[];
  hasNext: boolean;
}

/**
 * Whether an address is one of Klipy's.
 *
 * The rules check the same thing on every GIF message. Without it a "GIF"
 * could be any address at all, and a picture loaded from a server somebody
 * controls tells that server who read the message and when.
 */
export function isKlipyUrl(url: string): boolean {
  return /^https:\/\/([a-z0-9-]+\.)*klipy\.com\//.test(url);
}
