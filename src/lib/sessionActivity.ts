/**
 * When this browser last saw somebody use TTMS — in any tab.
 *
 * Kept in localStorage rather than in memory because the idle limit is about
 * the person, not the tab: somebody working in Orders with chat open in a
 * second tab is not idle in the chat tab. Every tab writes here on activity
 * and reads here before deciding to sign out. See SessionGuard.
 *
 * It also survives the browser being closed, which is the point: reopening it
 * the next morning finds yesterday's time and signs out straight away, rather
 * than starting the idle limit afresh.
 *
 * Every access is wrapped: a private window or blocked site data makes
 * localStorage throw, and then the guard falls back to the tab's own memory —
 * weaker (one tab only, forgotten on close) but never a crash or a lock-out.
 * The `maxDays` limit does not depend on this at all; the server enforces it.
 */
const KEY = 'ttms.session.lastActive';

export function readLastActive(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function writeLastActive(at: number): void {
  try {
    // Never move it backwards: two tabs writing at once must not let the
    // slower one undo the other's later time.
    if (at > readLastActive()) localStorage.setItem(KEY, String(at));
  } catch { /* see above */ }
}

/**
 * Called on a fresh Google sign-in, so last week's stale time cannot sign the
 * person straight back out. SessionGuard also counts the sign-in time itself
 * as activity; this is the belt to that pair of braces.
 */
export function noteSignedIn(): void {
  writeLastActive(Date.now());
}
