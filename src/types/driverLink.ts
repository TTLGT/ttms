/**
 * The driver's link — one page a driver opens from a text or an email to say
 * where the load is: arrived, picked up, in transit, arrived, delivered, plus
 * pictures, their location, and whether they have been paid.
 *
 * It is the signing link's arrangement, for somebody who has no account:
 *
 * - **A random token is the address**, `driverLinks/{token}`, closed to the
 *   client SDK (no rule matches it). Everything goes through
 *   `/api/driver/[token]` with the Admin SDK.
 * - **The token is not the whole credential.** Before anything about the load
 *   shows, the driver types the phone number on the load, and the browser is
 *   given a cookie scoped to that one link — the same speed bump as
 *   `src/lib/signAccess.ts`, and the same ten-wrong-answers lock.
 * - **One live link per load.** Making a new one switches the old one off
 *   (`revokedAt`), so a driver who was replaced cannot keep reporting.
 *   A link also stops working once the load's carrier changes.
 *
 * What a driver can do is narrow on purpose: add facts about the trip, never
 * edit the order. The steps they tap move the status forward only (see
 * `statusForStep()`), and only once the carrier has signed — a driver's tap is
 * not a substitute for the rate confirmation.
 */

import type { OrderStatus } from './order';

export const DRIVER_LINKS_COLLECTION = 'driverLinks';

/** How long a link works. Long enough for a slow load and the wait to be paid. */
export const DRIVER_LINK_DAYS = 45;

/** The trip, in the order it happens. */
export const DRIVER_STEPS = ['arrived_pickup', 'picked_up', 'in_transit', 'arrived_delivery', 'delivered'] as const;
export type DriverStep = (typeof DRIVER_STEPS)[number];

export function isDriverStep(value: unknown): value is DriverStep {
  return typeof value === 'string' && (DRIVER_STEPS as readonly string[]).includes(value);
}

/** Labels for staff screens and the change log. The driver page has its own, in two languages. */
export const DRIVER_STEP_LABEL: Record<DriverStep, string> = {
  arrived_pickup:   'Arrived at pickup',
  picked_up:        'Loaded / picked up',
  in_transit:       'In transit',
  arrived_delivery: 'Arrived at delivery',
  delivered:        'Delivered',
};

/**
 * The status a step moves the load to, or null for one that moves nothing.
 * Arriving is news, not a status: the freight has not moved yet.
 */
export function statusForStep(step: DriverStep): OrderStatus | null {
  if (step === 'picked_up' || step === 'in_transit') return 'in_transit';
  if (step === 'delivered') return 'delivered';
  return null;
}

/**
 * The steps that cannot be sent without a picture, and which stop it is
 * filed against. Picked up and Delivered are the two that change who holds
 * the freight, so they are the two worth evidence — usually the signed BOL
 * or the freight on the deck / at the door. The server refuses either
 * without one (`recordStep()`); the page asks for it before it sends.
 */
export const STEP_PHOTO: Partial<Record<DriverStep, { stop: 'pickup' | 'delivery'; caption: string }>> = {
  picked_up: { stop: 'pickup',   caption: 'Proof of pickup' },
  delivered: { stop: 'delivery', caption: 'Proof of delivery' },
};

export function stepNeedsPhoto(step: DriverStep): boolean {
  return Boolean(STEP_PHOTO[step]);
}

/** Where a step was tapped, when the driver let the phone say. */
export interface DriverPoint {
  lat: number;
  lng: number;
  /** Metres, as the phone reported it. */
  accuracy: number | null;
}

/**
 * One step as recorded on the order (`driverProgress[step]`). Times are epoch
 * milliseconds rather than Timestamps: the order is handed to the browser as
 * JSON, and a number needs no reviving at either end.
 */
export interface DriverStepMark {
  at: number;
  point: DriverPoint | null;
  /** The step's picture, for the steps in `STEP_PHOTO`. */
  photoId?: string | null;
}

export type DriverProgress = Partial<Record<DriverStep, DriverStepMark>>;

/** The last location the driver sent (`driverLocation` on the order). */
export interface DriverLocation extends DriverPoint {
  at: number;
}

/** A location shared less often than this is refused — a stuck button is not news. */
export const MIN_LOCATION_GAP_MS = 30_000;

/** A Google Maps link for a point — what staff click to see the truck. */
export function mapsUrl(p: Pick<DriverPoint, 'lat' | 'lng'>): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/** A point from a request, or null when it is missing or not a place on Earth. */
export function cleanPoint(lat: unknown, lng: unknown, accuracy: unknown): DriverPoint | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null;
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  const acc = Number(accuracy);
  return {
    lat: Math.round(la * 1e6) / 1e6,
    lng: Math.round(ln * 1e6) / 1e6,
    accuracy: Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null,
  };
}

/** The link as the order screen receives it. */
export interface DriverLinkInfo {
  url: string;
  driverName: string;
  driverPhone: string;
  createdAt: number;
  createdByName: string;
  expiresAt: number;
  expired: boolean;
  lastSentTo: string;
  lastSentAt: number | null;
  /** True once the driver has typed their number on it. */
  opened: boolean;
}
