/**
 * Company-wide settings an admin controls from the Settings page.
 *
 * Stored as a single Firestore document (`appSettings/general`) rather than
 * one doc per setting: there are few of them, they are read together on nearly
 * every page, and one document is one read.
 */

/**
 * How an order works out the distance between its two addresses.
 *
 * - `off`      — no distance shown anywhere.
 * - `estimate` — free, offline, from ZIP centroids. ~5% typical error.
 * - `routes`   — Google Routes API. Exact road miles, **billed per lookup**,
 *                and needs GOOGLE_MAPS_API_KEY set on the server.
 */
export type LaneDistanceMode = 'off' | 'estimate' | 'routes';

export interface AppSettings {
  laneDistanceMode: LaneDistanceMode;
}

/**
 * What the app assumes before an admin has chosen anything — including on the
 * very first load, when the settings document does not exist yet.
 *
 * `estimate` rather than `routes`: a default must never be the option that
 * spends money.
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  laneDistanceMode: 'estimate',
};

export const LANE_DISTANCE_MODES: LaneDistanceMode[] = ['off', 'estimate', 'routes'];

export function isLaneDistanceMode(v: unknown): v is LaneDistanceMode {
  return v === 'off' || v === 'estimate' || v === 'routes';
}
