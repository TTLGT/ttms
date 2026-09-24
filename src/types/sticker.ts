import type { Timestamp } from 'firebase/firestore';

/**
 * Stickers — a picture sent as a message of its own, the WhatsApp kind.
 *
 * ## Two collections, two owners
 *
 * - `stickers/{id}` is the **company set**: one shared shelf everybody picks
 *   from. Anyone may add to it; the person who added a sticker may take it
 *   off again, and so may anybody holding `chat.stickers.manage` (admins).
 * - `chatLibraries/{uid}` is **one person's own arrangement** of it — their
 *   favourites and their folders. Private to them, and it grants nothing.
 *
 * Keep the collection names in sync with the `match` blocks in firestore.rules
 * and the `stickers/` prefix with storage.rules.
 *
 * ## Taking one off the shelf does not unsend it
 *
 * A message carries its own copy of the sticker (StickerRef) and the picture
 * stays in the bucket, so removing a sticker from the set stops it being
 * offered without blanking every message it was ever sent in. Same principle
 * as an order keeping its own driver's name: a message is what was said on the
 * day. A sticker that should not have been sent at all is taken back message
 * by message, like anything else somebody said — a room admin can do that.
 */

export const STICKERS_COLLECTION       = 'stickers';
export const CHAT_LIBRARIES_COLLECTION = 'chatLibraries';

/** The Storage prefix every sticker lives under. storage.rules names it too. */
export const STICKER_PREFIX = 'stickers/';

/**
 * The biggest file accepted, after resizing. A still sticker is resized to
 * STICKER_EDGE and comes out at tens of kilobytes; this cap is really about
 * animated GIFs, which cannot be resized in the browser without losing the
 * animation and so go up as they are. storage.rules enforces the same number.
 */
export const MAX_STICKER_BYTES = 2 * 1024 * 1024;

/** Longest side of a still sticker once resized — WhatsApp's size. */
export const STICKER_EDGE = 512;

export const MAX_STICKER_NAME = 40;
export const MAX_FOLDER_NAME  = 40;
export const MAX_FOLDERS      = 30;
/** Per list — favourites, or one folder. Checked again by the rules. */
export const MAX_LIBRARY_ITEMS = 500;

/** One sticker on the company shelf. */
export interface Sticker {
  id: string;
  /** What it is found by in the picker's search, and its tooltip. */
  name: string;
  /** Storage path, always under STICKER_PREFIX. */
  path: string;
  contentType: string;
  width: number;
  height: number;
  /** A GIF, kept as uploaded so it still moves. */
  animated: boolean;
  createdByUid: string;
  createdByName: string;
  createdAt: Timestamp | null;
}

/**
 * The copy of a sticker a message carries.
 *
 * The size is on it so the thread can hold the space before the picture
 * arrives — without it every sticker would make the room jump as it loads.
 */
export interface StickerRef {
  id: string;
  path: string;
  name: string;
  width: number;
  height: number;
}

export function stickerRefOf(s: Sticker): StickerRef {
  return { id: s.id, path: s.path, name: s.name, width: s.width, height: s.height };
}

/* ---------------------------------------------------------------- library */

/**
 * An entry in somebody's favourites or folders.
 *
 * A prefixed string rather than a bare sticker id so the same lists can hold
 * GIFs when those arrive (`g:<id>`), without a migration of everything saved
 * before then. Only `s:` exists today.
 */
export type LibraryItem = `s:${string}`;

export function stickerItem(stickerId: string): LibraryItem {
  return `s:${stickerId}`;
}

/** The sticker id inside an item, or null for a kind this build does not know. */
export function stickerIdOf(item: string): string | null {
  return item.startsWith('s:') ? item.slice(2) : null;
}

export interface LibraryFolder {
  /** Local id, so a folder can be renamed without losing what is in it. */
  id: string;
  name: string;
  items: string[];
}

/** chatLibraries/{uid}. Absent until the person first saves something. */
export interface ChatLibrary {
  favorites: string[];
  folders: LibraryFolder[];
}

export const EMPTY_LIBRARY: ChatLibrary = { favorites: [], folders: [] };
