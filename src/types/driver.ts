import type { Timestamp } from 'firebase/firestore';

/**
 * A driver who runs loads for a carrier.
 *
 * Before this existed a driver was three free-text fields typed onto each
 * order — `driverName`, `driverPhone`, `driverLicenseStoragePath` — so the
 * only way to answer "who drives for this carrier" was to read the carrier's
 * order history back one load at a time, which is what lastDriverForCarrier()
 * in the order page still does for its prefill.
 *
 * **The order keeps those text fields.** A driver record is what you pick
 * from; the name and phone are still copied onto the load, because a BOL, an
 * agreement and a signed PDF are a record of what was true on the day. If the
 * order read through to this record instead, correcting a typo in a phone
 * number would silently rewrite paperwork that has already left the building.
 * `driverId` on the order is the link back, and it is allowed to be null: a
 * one-off driver typed straight onto a load is still valid.
 */
export interface Driver {
  id: string;
  /** The carrier this driver runs for. A driver at two carriers is two records. */
  carrierId: string;
  name: string;
  /**
   * `name` lowercased and squashed, for matching rather than display. Same
   * shape and the same reasoning as carrierNameKey — see the note there.
   * Written by createDriver and updateDriver.
   */
  nameKey?: string;
  phone: string;
  /** CDL number as printed on the licence. Not validated; states differ. */
  licenseNumber: string;
  licenseExpiration: Timestamp | null;
  /** Path in the bucket, under `driver-licenses/`. See needsOrderAccess(). */
  licenseStoragePath: string | null;
  /** Cleared rather than deleted, so past loads keep pointing at a real record. */
  isActive: boolean;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * The matching form of a driver's name.
 *
 * Deliberately the same transformation as `carrierNameKey`: lowercase, strip
 * anything that is not a letter or a digit, collapse the gaps. It is what lets
 * the backfill decide that "MIKE DELGADO" and "Mike Delgado" typed onto two
 * loads are one person, and what stops a second record being minted for a
 * driver already on file.
 *
 * It is not clever about it. "M. Delgado" and "Mike Delgado" stay two people,
 * because guessing they are one is how a licence ends up filed against the
 * wrong driver.
 */
export function driverNameKey(raw: string): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export type LicenseStatus = 'active' | 'expiring_soon' | 'expired' | 'unknown';

/**
 * Whether a driver's licence is current.
 *
 * Same thresholds as getInsuranceStatus for carriers, so the two badges on a
 * carrier's page mean the same thing by the same rules.
 */
export function getLicenseStatus(
  expiration: Timestamp | null | undefined
): LicenseStatus {
  if (!expiration || typeof expiration.toDate !== 'function') return 'unknown';
  const daysUntil = Math.floor(
    (expiration.toDate().getTime() - Date.now()) / 86_400_000
  );
  if (daysUntil < 0)   return 'expired';
  if (daysUntil <= 30) return 'expiring_soon';
  return 'active';
}

/** What a driver is called on screen when the record has no name on it. */
export function driverDisplayName(driver: Pick<Driver, 'name' | 'phone'>): string {
  return driver.name?.trim() || driver.phone?.trim() || 'Unnamed driver';
}
