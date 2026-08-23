import { addressToQuery } from '@/types/order';
import type { Address } from '@/types/order';

/**
 * Exact road miles from the Google Routes API.
 *
 * The paid half of the lane distance feature — only reached when an admin has
 * set the lane distance mode to `routes` (see `src/types/appSettings.ts`). The
 * free offline estimate in `routeDistance.ts` is the default, and stays the
 * fallback whenever this is unavailable.
 *
 * Server-side only. The key is billable per request, so it must never reach a
 * browser, and it is read at call time rather than module load — the same lazy
 * treatment Resend gets, so a missing key degrades one feature instead of
 * breaking the build.
 */

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const METERS_PER_MILE = 1609.344;

export type GoogleRouteResult =
  | { status: 'ok'; miles: number }
  /** No API key on the server — the caller falls back to the estimate. */
  | { status: 'unconfigured' }
  /** Google returned 200 but could not route between these addresses. */
  | { status: 'no_route' }
  | { status: 'error'; message: string };

export async function lookupDrivingMiles(
  origin: Address,
  destination: Address,
): Promise<GoogleRouteResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { status: 'unconfigured' };

  const from = addressToQuery(origin);
  const to = addressToQuery(destination);
  if (!from || !to) return { status: 'no_route' };

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // Routes API bills by the fields requested. Distance is all this
        // feature needs — do not widen without checking what it costs.
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { address: from },
        destination: { address: to },
        travelMode: 'DRIVE',
        // A lane's mileage is a property of the lane, not of this afternoon's
        // traffic. TRAFFIC_UNAWARE keeps the answer stable between lookups and
        // is the cheapest tier.
        routingPreference: 'TRAFFIC_UNAWARE',
        units: 'IMPERIAL',
      }),
    });
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Route lookup failed' };
  }

  if (!res.ok) {
    // Google's body carries the reason — bad key, API not enabled, billing
    // off. All one-time setup problems, so they are worth surfacing verbatim.
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return {
      status: 'error',
      message: body?.error?.message ?? `Route lookup failed (${res.status})`,
    };
  }

  const data = (await res.json().catch(() => null)) as {
    routes?: { distanceMeters?: number }[];
  } | null;

  const meters = data?.routes?.[0]?.distanceMeters;
  if (!meters) return { status: 'no_route' };

  return { status: 'ok', miles: Math.round(meters / METERS_PER_MILE) };
}
