import zipCentroids from './data/zipCentroids.json';
import type { Address } from '@/types/order';

/**
 * Estimated driving distance for a lane, computed entirely offline.
 *
 * There is no routing API behind this and no API key: a real routing lookup
 * (Google Routes, Mapbox, HERE) bills per request, and this is called often
 * enough — every new order, every address edit — that the cost was not worth
 * the accuracy. Instead:
 *
 *   1. Both ZIPs are looked up in the US Census ZCTA centroid table bundled
 *      alongside this file.
 *   2. Great-circle distance between the two points.
 *   3. Multiplied by a circuity factor — roads do not run in straight lines.
 *
 * Accuracy against real driving distances is roughly ±5% on typical US lanes,
 * with mountain routes the worst case (Denver–Salt Lake City comes out ~17%
 * short, because the interstate detours a long way around the Rockies).
 * Good enough to sanity-check a quote or compare two lanes; NOT good enough to
 * bill a customer per mile. Everything that shows this number calls it an
 * estimate, and it must stay labelled that way.
 *
 * Server-side by convention rather than by secrecy — the centroid table is
 * ~800 KB and has no business in the browser bundle.
 */

// TypeScript infers the JSON's arrays as number[], not [number, number], so
// pairs are read out positionally rather than destructured as tuples.
const CENTROIDS: Record<string, number[]> = zipCentroids;

const EARTH_RADIUS_MILES = 3958.7613;

/**
 * Road miles ÷ straight-line miles. Short hops wander proportionally more —
 * they run on local streets rather than interstates — so the factor tapers as
 * the lane gets longer. Values sit around the ~1.2 US average reported in
 * road-network circuity studies, checked against a sample of known lanes.
 */
function circuityFactor(straightLineMiles: number): number {
  if (straightLineMiles < 100) return 1.22;
  if (straightLineMiles < 300) return 1.18;
  if (straightLineMiles < 1000) return 1.17;
  return 1.16;
}

export type RouteEstimate = {
  miles: number;
  straightLineMiles: number;
};

export type RouteEstimateResult =
  | { status: 'ok'; estimate: RouteEstimate }
  /** One or both addresses have no usable ZIP. */
  | { status: 'need_zip' }
  /** A ZIP was given but is not in the table — a PO-box-only or brand-new ZIP. */
  | { status: 'unknown_zip'; zip: string };

/** First five digits, so "30301-1234" and " 30301 " both resolve. */
function normalizeZip(raw: string | undefined | null): string {
  const digits = (raw ?? '').trim().replace(/[^0-9]/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : '';
}

/**
 * Mean centroid of every ZIP sharing a three-digit prefix, built on first use.
 * A ZIP missing from the ZCTA table (PO-box-only ZIPs have no populated area,
 * so the Census does not publish one) still lands in roughly the right place —
 * a ZIP3 region is small next to a freight lane.
 */
let zip3Centroids: Record<string, [number, number]> | null = null;

function zip3Centroid(zip: string): [number, number] | null {
  if (!zip3Centroids) {
    const sums: Record<string, [number, number, number]> = {};
    for (const [z, pair] of Object.entries(CENTROIDS)) {
      const prefix = z.slice(0, 3);
      const acc = sums[prefix] ?? [0, 0, 0];
      acc[0] += pair[0];
      acc[1] += pair[1];
      acc[2] += 1;
      sums[prefix] = acc;
    }
    zip3Centroids = {};
    for (const [prefix, [lat, lng, n]] of Object.entries(sums)) {
      zip3Centroids[prefix] = [lat / n, lng / n];
    }
  }
  return zip3Centroids[zip.slice(0, 3)] ?? null;
}

function locate(zip: string): [number, number] | null {
  const exact = CENTROIDS[zip];
  if (exact) return [exact[0], exact[1]];
  return zip3Centroid(zip);
}

function haversineMiles(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateRouteMiles(origin: Address, destination: Address): RouteEstimateResult {
  const fromZip = normalizeZip(origin?.zip);
  const toZip = normalizeZip(destination?.zip);
  if (!fromZip || !toZip) return { status: 'need_zip' };

  const from = locate(fromZip);
  if (!from) return { status: 'unknown_zip', zip: fromZip };
  const to = locate(toZip);
  if (!to) return { status: 'unknown_zip', zip: toZip };

  const straightLineMiles = haversineMiles(from, to);

  return {
    status: 'ok',
    estimate: {
      miles: Math.round(straightLineMiles * circuityFactor(straightLineMiles)),
      straightLineMiles: Math.round(straightLineMiles),
    },
  };
}
