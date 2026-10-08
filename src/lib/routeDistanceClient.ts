import { auth } from './firebase';
import type { Address } from '@/types/order';
import type { LaneMilesSource } from '@/types/order';

/**
 * Client half of the lane distance lookup. Which method runs — the free
 * offline estimate or a billed Google Routes call — is decided server-side
 * from the admin setting, never by the caller. See /api/route-distance.
 */

export type DistanceResult =
  | {
      status: 'ok';
      miles: number;
      source: LaneMilesSource;
      /**
       * When this figure was produced, off the server's clock. Under Google
       * Routes a cached lane answers with the date it was originally looked
       * up, not today — so this is the age of the number, not of the answer.
       * Null on a cached lane written before the date was recorded.
       */
      calculatedAt?: string | null;
      straightLineMiles?: number;
      degraded?: string;
    }
  /** Lane distances are switched off in Settings. */
  | { status: 'disabled' }
  /**
   * Google Routes is the chosen method and this lane has never been looked up,
   * so answering it would be billed. Nothing happens until the caller asks
   * again with `manual`, which is what the button in the form does.
   */
  | { status: 'needs_lookup' }
  /** One or both addresses have no usable ZIP yet. */
  | { status: 'need_zip'; degraded?: string }
  | { status: 'unknown_zip'; zip: string; degraded?: string }
  | { status: 'error'; message: string };

/**
 * @param manual A person asked for this — they clicked a button. Under Google
 *   Routes an unlooked-up lane is only fetched, and billed, when this is set;
 *   without it the server answers from its cache or says `needs_lookup`. Leave
 *   it off for anything that fires on its own, such as a form watching an
 *   address being typed.
 */
export async function fetchLaneDistance(
  origin: Address,
  destination: Address,
  manual = false,
): Promise<DistanceResult> {
  const user = auth.currentUser;
  if (!user) return { status: 'error', message: 'Not signed in' };

  try {
    const res = await fetch('/api/route-distance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await user.getIdToken()}`,
      },
      body: JSON.stringify({ origin, destination, manual }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 'error', message: (data as { error?: string }).error ?? 'Distance lookup failed' };
    }
    return data as DistanceResult;
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Distance lookup failed' };
  }
}

/**
 * The distance of a whole trip — every pickup, then every delivery — as the
 * sum of its legs, each asked for exactly as a two-stop lane always was.
 *
 * Leg by leg rather than one multi-stop request so that each leg lands in, and
 * is answered from, the same per-lane cache as everything else: under Google
 * Routes a leg the company has already paid for is never bought twice. With
 * two stops this is one call, identical to `fetchLaneDistance`.
 *
 * The answer is only as good as its worst leg: if any leg is waiting for a
 * paid lookup, or has no ZIP, the trip says so rather than adding up the rest.
 * And if any leg had to fall back to the estimate, the total is an estimate.
 */
export async function fetchTripDistance(
  stops: readonly Address[],
  manual = false,
): Promise<DistanceResult> {
  if (stops.length < 2) return { status: 'need_zip' };
  const legs = await Promise.all(
    stops.slice(1).map((to, i) => fetchLaneDistance(stops[i], to, manual)),
  );
  if (legs.length === 1) return legs[0];

  for (const status of ['disabled', 'error', 'unknown_zip', 'need_zip', 'needs_lookup'] as const) {
    const hit = legs.find((l) => l.status === status);
    if (hit) return hit;
  }

  const ok = legs as Extract<DistanceResult, { status: 'ok' }>[];
  const dates = ok.map((l) => l.calculatedAt).filter((d): d is string => Boolean(d)).sort();
  return {
    status: 'ok',
    miles: ok.reduce((sum, l) => sum + l.miles, 0),
    source: ok.every((l) => l.source === 'routes') ? 'routes' : 'estimate',
    // The oldest leg, since that is how old the total is.
    calculatedAt: dates[0] ?? null,
    degraded: ok.find((l) => l.degraded)?.degraded,
  };
}
