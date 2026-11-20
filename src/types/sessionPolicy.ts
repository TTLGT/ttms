/**
 * How long a TTMS sign-in lasts — `appSettings/general.sessionPolicy`, Settings
 * → Operations → Sign-out Timer.
 *
 * Firebase keeps a browser signed in until somebody presses Sign out: closing
 * the tab, the browser or the computer ends nothing. Removal and suspension
 * were already covered (every page load re-checks the allowlist, suspension
 * revokes the refresh token, every API call checks for revocation), so this is
 * not about a person who has left. It is about the **computer**: a lost
 * laptop, or an unlocked PC at home, opens straight into rates, clients,
 * licences and — for HR — payroll fields.
 *
 * Two limits, each switchable off (0):
 *
 * - `idleMinutes` — no click, key or scroll in **any** TTMS tab for this long
 *   signs the browser out, with a one-minute warning. Measured in the browser
 *   (`SessionGuard`), because only the browser knows about clicks. A laptop
 *   that slept past the limit is signed out the moment it wakes.
 * - `maxDays` — a sign-in older than this ends however busy somebody is. This
 *   one is checked twice: in the browser, and in `/api/auth/session` against
 *   the ID token's `auth_time`, which Google sets and the browser cannot
 *   change. So a reload cannot outlive it either.
 *
 * Neither is an access decision — the allowlist still is — and neither clocks
 * anybody out: attendance is held on the server and is untouched by a sign-out.
 *
 * Signing back in is usually one click, because Google itself stays signed in
 * on that computer. This shortens how long an *open* TTMS session lasts; it is
 * not a substitute for locking the screen.
 */
export interface SessionPolicy {
  /** Minutes without activity before signing out. 0 = never. */
  idleMinutes: number;
  /** Days a sign-in may last, active or not. 0 = never. */
  maxDays: number;
}

/**
 * 3 hours idle, 7 days at most (asked for, 2026-11-20; first built at 8 hours,
 * shortened the same day). Three hours covers a long lunch or a run of calls
 * away from the keyboard, while a computer left open does not stay open for
 * the rest of the day. A week means everybody signs in again about once a week.
 */
export const DEFAULT_SESSION_POLICY: SessionPolicy = { idleMinutes: 180, maxDays: 7 };

/** The choices offered. A fixed list so nobody saves "1 minute" by accident. */
export const IDLE_MINUTE_OPTIONS = [0, 30, 60, 120, 180, 240, 480, 720] as const;
export const MAX_DAY_OPTIONS     = [0, 1, 3, 7, 14, 30] as const;

/** How long before an idle sign-out the warning appears. */
export const IDLE_WARNING_MS = 60_000;

export function isIdleMinutes(v: unknown): v is number {
  return typeof v === 'number' && (IDLE_MINUTE_OPTIONS as readonly number[]).includes(v);
}

export function isMaxDays(v: unknown): v is number {
  return typeof v === 'number' && (MAX_DAY_OPTIONS as readonly number[]).includes(v);
}

/**
 * The stored policy, with the default for anything unusable — per field, so a
 * document with one good value keeps it. Absent means the default, not off:
 * this shipped turned on, with no backfill.
 */
export function readSessionPolicy(raw: unknown): SessionPolicy {
  const stored = (raw ?? {}) as Partial<SessionPolicy>;
  return {
    idleMinutes: isIdleMinutes(stored.idleMinutes) ? stored.idleMinutes : DEFAULT_SESSION_POLICY.idleMinutes,
    maxDays:     isMaxDays(stored.maxDays)         ? stored.maxDays     : DEFAULT_SESSION_POLICY.maxDays,
  };
}

/** When a sign-in made at `signedInAt` runs out, or null if it never does. */
export function sessionEndsAt(signedInAt: number, policy: SessionPolicy): number | null {
  return policy.maxDays > 0 ? signedInAt + policy.maxDays * 86_400_000 : null;
}

/** "8 hours", "30 minutes", "Never" — the same words in the panel and the dialog. */
export function idleLabel(minutes: number): string {
  if (minutes === 0) return 'Never';
  if (minutes < 60)  return `${minutes} minutes`;
  const h = minutes / 60;
  return h === 1 ? '1 hour' : `${h} hours`;
}

export function maxDaysLabel(days: number): string {
  if (days === 0) return 'Never';
  return days === 1 ? '1 day' : `${days} days`;
}
