import type { Timestamp } from 'firebase/firestore';

/**
 * Whether a colleague is using TTMS right now, and when they last were.
 *
 * One document per person, `presence/{uid}`, holding a single server-stamped
 * time. Kept out of `users/{uid}` on purpose: that document is closed to the
 * browser so nobody can self-promote, and this one has to be written from the
 * browser every few minutes. Mixing the two would mean either opening the
 * profile to client writes or sending every heartbeat through an API route —
 * a function call per person every five minutes, for a timestamp.
 *
 * **Online is worked out when it is read, never stored.** A browser cannot be
 * relied on to say goodbye — a closed laptop lid, a dropped connection or a
 * crashed tab sends nothing — so there is no "offline" write to wait for. A
 * person is online while their last heartbeat is recent enough, and simply
 * stops being online when it is not. Same shape as a mute or an order access
 * grant, and for the same reason.
 *
 * Keep the document's shape in sync with the `presence` block in
 * firestore.rules, which allows this one key and nothing else.
 */
export interface Presence {
  /** Set by the server (`request.time`), so nobody can claim to be online. */
  lastActiveAt: Timestamp | null;
}

export const PRESENCE_COLLECTION = 'presence';

/**
 * How often an active person's browser says so.
 *
 * Five minutes rather than one, to keep writes down at around thirty staff:
 * roughly 30 people × 9 hours × 12 an hour ≈ 3,200 writes a day, well inside
 * the free 20,000. The price is that "last seen" can be up to five minutes
 * behind what the person actually last did.
 */
export const PRESENCE_HEARTBEAT_MS = 5 * 60_000;

/**
 * How long after a heartbeat somebody still counts as online.
 *
 * The heartbeat interval plus slack. Browsers slow timers down in background
 * tabs, and a request takes a moment to land, so a window of exactly five
 * minutes would flicker people to "last seen" between two beats they sent on
 * time.
 */
export const PRESENCE_ONLINE_WINDOW_MS = PRESENCE_HEARTBEAT_MS + 2 * 60_000;

/** Online now, judged against the reader's clock. */
export function isOnline(presence: Presence | null, now: number = Date.now()): boolean {
  const at = presence?.lastActiveAt?.toMillis?.();
  return typeof at === 'number' && now - at < PRESENCE_ONLINE_WINDOW_MS;
}
