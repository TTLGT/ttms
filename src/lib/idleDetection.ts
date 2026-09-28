'use client';

/**
 * Whether anybody is using the computer — keyboard, mouse, a locked screen —
 * not just the TTMS tab. The browser's Idle Detection API (Chrome and Edge).
 *
 * It answers one question and nothing else: has there been input anywhere on
 * this computer in the last minute, and is the screen locked. Never which
 * program, never what was typed. That narrowness is the point, and what the
 * staff policy (AttendancePolicy.tsx) promises.
 *
 * **Used only while somebody is clocked in.** Outside their hours the
 * heartbeat goes back to counting TTMS alone, so an open tab in the evening
 * does not become a window onto somebody's home computer. See
 * usePresenceHeartbeat.
 *
 * **Permission.** A site cannot grant itself this. Where the Chrome/Edge policy
 * IdleDetectionAllowedForUrls names TTMS it is granted and nobody is asked —
 * scripts/allow-idle-detection.bat writes it on a PC, because the Google Admin
 * console does not offer it for Chrome browsers. Anywhere else the browser
 * asks once, and it can only ask inside a click — which is why the request
 * rides on the Clock in button.
 * Somebody who says no is measured on TTMS alone, and each day records which it
 * was, so HR can tell the two apart.
 */

// Not in TypeScript's DOM library yet.
interface IdleDetectorLike extends EventTarget {
  userState: 'active' | 'idle' | null;
  screenState: 'locked' | 'unlocked' | null;
  start(options: { threshold: number; signal?: AbortSignal }): Promise<void>;
}
interface IdleDetectorCtor {
  new (): IdleDetectorLike;
  requestPermission(): Promise<'granted' | 'denied'>;
}

function ctor(): IdleDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { IdleDetector?: IdleDetectorCtor }).IdleDetector) ?? null;
}

export type IdlePermission = 'unsupported' | 'granted' | 'denied' | 'prompt';

/** Where the permission stands, without asking. */
export async function idlePermission(): Promise<IdlePermission> {
  if (!ctor()) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'idle-detection' as PermissionName });
    return status.state as IdlePermission;
  } catch {
    return 'prompt';
  }
}

/**
 * Ask — must be called synchronously inside a click. Resolves to the answer;
 * never throws, because the clock-in it rides on must not fail over this.
 */
export async function requestIdlePermission(): Promise<IdlePermission> {
  const C = ctor();
  if (!C) return 'unsupported';
  try {
    return await C.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * The browser's minimum. Anything lower is refused. A minute is well inside
 * the five-minute heartbeat, so it loses nothing.
 */
const THRESHOLD_MS = 60_000;

let controller: AbortController | null = null;
let detector: IdleDetectorLike | null = null;
/** The last moment the computer was known to be in use. */
let lastActiveAt = 0;

/** Told the moment the computer goes from unused to used. See onSystemActive. */
const activeListeners = new Set<() => void>();

function onChange() {
  if (!detector) return;
  if (detector.userState === 'idle' || detector.screenState === 'locked') {
    // "Idle" is reported a threshold after the last input, and a lock is the
    // moment they walked away. Either way the last use was about then.
    lastActiveAt = Math.max(lastActiveAt, Date.now() - (detector.screenState === 'locked' ? 0 : THRESHOLD_MS));
  } else {
    lastActiveAt = Date.now();
    for (const fn of activeListeners) fn();
  }
}

/**
 * Call `fn` whenever somebody comes back to the computer — so chat can say
 * Online at once rather than at the next check. Returns the unsubscribe.
 */
export function onSystemActive(fn: () => void): () => void {
  activeListeners.add(fn);
  return () => { activeListeners.delete(fn); };
}

/** Start watching, if permitted. Safe to call repeatedly. */
export async function startSystemIdle(): Promise<boolean> {
  if (detector) return true;
  const C = ctor();
  if (!C || (await idlePermission()) !== 'granted') return false;
  try {
    const d = new C();
    const c = new AbortController();
    d.addEventListener('change', onChange);
    await d.start({ threshold: THRESHOLD_MS, signal: c.signal });
    detector = d;
    controller = c;
    onChange();
    return true;
  } catch {
    return false;
  }
}

export function stopSystemIdle() {
  controller?.abort();
  detector?.removeEventListener('change', onChange);
  controller = null;
  detector = null;
}

/**
 * The computer's answer, or null when nobody is watching (unsupported, not
 * permitted, or not clocked in) — the heartbeat then counts TTMS alone.
 */
export function systemActivity(): { activeNow: boolean; lastActiveAt: number } | null {
  if (!detector) return null;
  const activeNow = detector.userState === 'active' && detector.screenState !== 'locked';
  if (activeNow) lastActiveAt = Date.now();
  return { activeNow, lastActiveAt };
}
