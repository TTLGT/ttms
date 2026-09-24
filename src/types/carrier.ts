import type { Timestamp } from 'firebase/firestore';
import type { PhoneRegion } from '@/lib/phone';

export interface Carrier {
  id: string;
  batsId: string | null;
  companyName: string;
  /**
   * `companyName` lowercased, for search. Maintained by createCarrier and
   * updateCarrier; see carrierNameKey below for why it exists and why it is
   * not the party `toNameKey`.
   */
  nameKey?: string;
  contactName: string;
  /**
   * What the main contact does at the carrier — one of CARRIER_CONTACT_TITLES,
   * or '' for not recorded. Optional because no carrier written before it has
   * one; read it through carrierMainContact(), which treats absent as blank.
   */
  contactTitle?: string;
  email: string;
  phone: string;
  /**
   * Which country `phone` is in. Absent on every carrier written before the
   * picker existed — read it through `phoneRegionOf()`, which answers US.
   */
  phoneRegion?: PhoneRegion;
  dot: string;
  mc: string;
  address: string;
  fax: string;
  dispatcher: string;
  dispatcherPhone: string;
  /** Which country `dispatcherPhone` is in. Same contract as `phoneRegion`. */
  dispatcherPhoneRegion?: PhoneRegion;
  dispatcherEmail: string;
  billingContact: string;
  billingPhone: string;
  /** Which country `billingPhone` is in. Same contract as `phoneRegion`. */
  billingPhoneRegion?: PhoneRegion;
  billingEmail: string;
  insuranceExpiration: Timestamp | null;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  /**
   * Path in the bucket to the certificate of insurance, under
   * `carrier-insurance/`. Optional because every carrier written before this
   * field existed — the whole BATS import — has no such key, and a required
   * `string | null` would be a lie about what comes back from Firestore.
   * Uploaded and cleared by InsuranceFileUpload; see storage.rules for who may
   * read it.
   */
  insuranceStoragePath?: string | null;
  /**
   * The coverage limit on the certificate, in whole US dollars. Optional for
   * the same reason as the path above — no carrier written before it has one —
   * and null when somebody saved the form without filling it in. Read it
   * through formatCoverage(); a missing amount is "not recorded", never $0.
   */
  insuranceCoverage?: number | null;
  isActive: boolean;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * The lowercased form of a carrier's name, stored alongside it as `nameKey` so
 * the database can answer a search instead of the browser.
 *
 * Carrier names are cased however they arrived — about four fifths of the
 * imported ones are in block capitals and the rest are not — and Firestore's
 * range queries are case-sensitive, so a search for "tyjo" would never reach
 * "TYJO LOGISTICS" without a normalized key to match against.
 *
 * Deliberately *not* `toNameKey` from party.ts. That one canonicalises company
 * suffixes ("Inc." and "Incorporated" collapse together) because its job is to
 * decide whether two names are the same company. This one's job is to match
 * what somebody has typed so far, and rewriting the text would mean a prefix of
 * the name is not always a prefix of the key.
 */
export function carrierNameKey(raw: string): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * The jobs a carrier's main contact is offered as, in the order the picker
 * lists them. Dispatcher first because it is what the contact usually is — the
 * person a broker rings about a truck. A label and nothing more: it grants
 * nothing and nothing branches on it, so adding one is safe and a stored value
 * that has since left the list still shows (see ContactTitleSelect).
 */
export const CARRIER_CONTACT_TITLES = [
  'Dispatcher',
  'Owner',
  'Owner-Operator',
  'Manager',
  'Operations Manager',
  'Supervisor',
  'Safety Manager',
  'Fleet Manager',
  'Accounting',
  'Sales',
  'Other',
] as const;

export interface CarrierContact {
  name: string;
  title: string;
  phone: string;
  phoneRegion?: PhoneRegion;
  email: string;
}

/**
 * Who to call at a carrier about a load: the main contact, or — when that is
 * blank — the dispatcher block, which is where the BATS import put the name
 * for many carriers. Null when neither has anything in it.
 *
 * The fallback is per record, not per field: mixing the contact's phone with
 * the dispatcher's name would show a person beside somebody else's number.
 */
export function carrierMainContact(c: Carrier): CarrierContact | null {
  const main: CarrierContact = {
    name:        (c.contactName ?? '').trim(),
    title:       (c.contactTitle ?? '').trim(),
    phone:       (c.phone ?? '').trim(),
    phoneRegion: c.phoneRegion,
    email:       (c.email ?? '').trim(),
  };
  if (main.name || main.phone || main.email) return main;

  const dispatch: CarrierContact = {
    name:        (c.dispatcher ?? '').trim(),
    title:       'Dispatcher',
    phone:       (c.dispatcherPhone ?? '').trim(),
    phoneRegion: c.dispatcherPhoneRegion,
    email:       (c.dispatcherEmail ?? '').trim(),
  };
  if (dispatch.name || dispatch.phone || dispatch.email) return dispatch;
  return null;
}

/**
 * An MC or DOT number reduced to its digits — how both are stored.
 *
 * The carriers search answers an all-digit query with an exact match on `mc`
 * and `dot` (see listCarriersPage), so a carrier saved as "MC-123456" could
 * never be found by typing the 123456 off a rate confirmation. Storing the
 * digits alone makes the stored value and the searched value the same thing.
 * The cost is the docket prefix: an FF or MX number is stored as bare digits
 * like an MC one, which the "MC / FF" label on the forms already treated as
 * one field.
 *
 * ⚠️ Anything that writes `mc` or `dot` must pass it through here —
 * createCarrier and updateCarrier do, so the app's forms are covered. Mirrored
 * in scripts/import-bats.js and scripts/backfill-carrier-numbers.js.
 */
export function carrierNumber(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D+/g, '');
}

/**
 * What was typed into a coverage box, as whole dollars — or null for blank or
 * nonsense. Commas, a dollar sign and spaces are dropped, because the figure
 * is usually copied straight off a certificate that reads "$1,000,000".
 */
export function parseCoverageInput(raw: string): number | null {
  const cleaned = (raw ?? '').replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** "$1,000,000", or '' when no amount is recorded. */
export function formatCoverage(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export type InsuranceStatus ='active' | 'expiring_soon' | 'expired' | 'unknown';

export function getInsuranceStatus(
  expiration: Timestamp | null | undefined
): InsuranceStatus {
  if (!expiration || typeof expiration.toDate !== 'function') return 'unknown';
  const daysUntil = Math.floor(
    (expiration.toDate().getTime() - Date.now()) / 86_400_000
  );
  if (daysUntil < 0)  return 'expired';
  if (daysUntil <= 30) return 'expiring_soon';
  return 'active';
}
