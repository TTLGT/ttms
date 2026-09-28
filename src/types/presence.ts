import type { Timestamp } from 'firebase/firestore';

/**
 * Whether a colleague is using TTMS right now, and when they last were.
 *
 * One document per person, `presence/{uid}`, readable by every staff member —
 * that is what it is for. Kept out of `users/{uid}` so the profile stays
 * closed to writes from the browser.
 *
 * **Written only by the server**, from `POST /api/attendance/beat` and the
 * clock and status routes. It used to be written from the browser; it moved
 * when attendance arrived because the same five-minute heartbeat now also
 * feeds the day's attendance record, and the server is the only place that
 * can see the network and device a request came from.
 *
 * **Online is worked out when it is read, never stored.** A browser cannot be
 * relied on to say goodbye, so there is no "offline" write to wait for. Same
 * shape as a mute or an order access grant, for the same reason.
 *
 * **Nothing from attendance goes in here.** Clock-in times, lateness and
 * absences are HR's; this document says only what a colleague would see by
 * looking across the office. Somebody who hides their last seen (their
 * profile page) has the two times removed and none written after, and keeps
 * only the status they chose to show.
 */
export interface Presence {
  /** The last heartbeat during which they clicked, typed or scrolled. */
  lastActiveAt?: Timestamp | null;
  /** The last heartbeat of any kind — TTMS open, possibly untouched. */
  lastBeatAt?: Timestamp | null;
  /** What they said they are doing. Absent means available. */
  status?: UserStatus | null;
  statusNote?: string;
  /** On a break or at lunch, from the clock. */
  onBreak?: boolean;
}

export const PRESENCE_COLLECTION = 'presence';

/**
 * How often an active person's browser checks in.
 *
 * Five minutes rather than one, to keep writes down at around thirty staff.
 * The price is that "last seen" can be up to five minutes behind. Keep equal
 * to BEAT_MINUTES in src/types/attendance.ts: each beat is counted as that
 * many minutes of activity.
 */
export const PRESENCE_HEARTBEAT_MS = 5 * 60_000;

/** Heartbeat interval plus slack, so background-tab timer slowdowns do not flicker. */
export const PRESENCE_ONLINE_WINDOW_MS = PRESENCE_HEARTBEAT_MS + 2 * 60_000;

export type UserStatus = 'busy' | 'meeting' | 'away';
export const USER_STATUSES: UserStatus[] = ['busy', 'meeting', 'away'];
export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  busy:    'Busy',
  meeting: 'In a meeting',
  away:    'Away',
};
export const MAX_STATUS_NOTE = 80;

export function isUserStatus(v: unknown): v is UserStatus {
  return v === 'busy' || v === 'meeting' || v === 'away';
}

/** Online now, judged against the reader's clock. */
export function isOnline(presence: Presence | null, now: number = Date.now()): boolean {
  const at = presence?.lastActiveAt?.toMillis?.();
  return typeof at === 'number' && now - at < PRESENCE_ONLINE_WINDOW_MS;
}

/** TTMS is open and checking in, but nobody has touched it lately. */
export function isIdle(presence: Presence | null, now: number = Date.now()): boolean {
  const beat = presence?.lastBeatAt?.toMillis?.();
  return !isOnline(presence, now) && typeof beat === 'number' && now - beat < PRESENCE_ONLINE_WINDOW_MS;
}
