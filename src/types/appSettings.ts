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

/**
 * How every date in the app is written on screen.
 *
 * - `d-mmm-yyyy` — 25-Nov-2000. The month is spelled, so it cannot be misread.
 * - `mm/dd/yyyy` — 11/25/2000. US order.
 * - `dd/mm/yyyy` — 25/11/2000. Day first, as most of the world writes it.
 *
 * Company-wide rather than per-person on purpose: brokers read each other's
 * orders and screenshot them to each other, and a date that means one thing on
 * one screen and another thing on the next is worse than either format alone.
 */
export type DateFormat = 'd-mmm-yyyy' | 'mm/dd/yyyy' | 'dd/mm/yyyy';

export interface AppSettings {
  laneDistanceMode: LaneDistanceMode;
  dateFormat: DateFormat;
}

/**
 * What the app assumes before an admin has chosen anything — including on the
 * very first load, when the settings document does not exist yet.
 *
 * `estimate` rather than `routes`: a default must never be the option that
 * spends money.
 *
 * `d-mmm-yyyy` rather than either slash format: it is the one nobody can read
 * as the wrong day. This office has US and Latin American staff entering the
 * same records, and 03/04 is March to one of them and April to the other — so
 * the default is the format that carries no assumption about who is reading.
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  laneDistanceMode: 'estimate',
  dateFormat: 'd-mmm-yyyy',
};

export const LANE_DISTANCE_MODES: LaneDistanceMode[] = ['off', 'estimate', 'routes'];

export function isLaneDistanceMode(v: unknown): v is LaneDistanceMode {
  return v === 'off' || v === 'estimate' || v === 'routes';
}

export const DATE_FORMATS: DateFormat[] = ['d-mmm-yyyy', 'mm/dd/yyyy', 'dd/mm/yyyy'];

export function isDateFormat(v: unknown): v is DateFormat {
  return v === 'd-mmm-yyyy' || v === 'mm/dd/yyyy' || v === 'dd/mm/yyyy';
}
