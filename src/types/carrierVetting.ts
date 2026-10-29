import type { FmcsaAnswer, FmcsaConcern, OperatingSince } from './fmcsa';

/**
 * A carrier vetting record: what TTMS knew about a carrier at the moment it
 * was hired for a load, frozen, so it can be shown later exactly as it was.
 *
 * Why it exists. On 2026-05-14 the Supreme Court ruled in Montgomery v. Caribe
 * Transport II that federal law does not shield a broker from a state
 * negligent-selection claim — when a carrier we hired has an accident, we can
 * be sued for having hired it. The defence is proof that the carrier was
 * checked properly before it was hired, and proof is what the screens did
 * not keep: a tick on the review says somebody looked, not what they saw, and
 * the carrier's FMCSA check is overwritten by the next one.
 *
 * So each record holds:
 * - FMCSA's answer **asked at that moment** (`fmcsaSource: 'live'`), not the
 *   carrier's last stored check, which may be days old. When FMCSA cannot be
 *   reached the stored one is kept instead and the record says so.
 * - The carrier's own details and insurance certificate as they stood — and a
 *   **copy** of the certificate file, because the carrier's is replaced when a
 *   new one arrives.
 * - A **copy of the SaferWeb page** as FMCSA served it, the public source a
 *   court will recognise, with its own fingerprint.
 * - The review ticks — who confirmed what, and when.
 *
 * Taken automatically every time a Dispatch Sheet is emailed (the moment the
 * carrier is hired), and by hand from the load at any other time.
 *
 * Never changed and never deleted: there is no route that does either, and
 * the collection is closed to the browser. `hash` is a SHA-256 of the record
 * as written (see `vettingHashInput()`), printed on the Carrier Selection
 * File and checked again every time it is printed, so an edit made later by
 * somebody with Console access would show.
 */
export const CARRIER_VETTINGS_COLLECTION = 'carrierVettings';

/** Where a record's file copies live in the bucket. Closed in storage.rules by having no rule. */
export function vettingFilePath(orderId: string, vettingId: string, name: string): string {
  return `carrier-vetting/${orderId}/${vettingId}/${name}`;
}

export type VettingTrigger = 'dispatch_sheet' | 'manual';

export const VETTING_TRIGGER_LABEL: Record<VettingTrigger, string> = {
  dispatch_sheet: 'Dispatch Sheet emailed',
  manual:         'Saved by hand',
};

/** A file copied into the record. */
export interface VettingFile {
  path: string;
  sha256: string;
  bytes: number;
  contentType: string;
  /** Where it was copied from: FMCSA's address, or the carrier's certificate path. */
  source: string;
}

/** One item on the carrier review, as it stood. */
export interface VettingCheck {
  key: string;
  label: string;
  /** Null when nobody had ticked it. */
  byName: string | null;
  at: number | null;
}

export interface CarrierVetting {
  id: string;
  orderId: string;
  orderNumber: string;
  carrierId: string;
  /** Epoch ms, server time. */
  takenAt: number;
  takenByName: string;
  takenByEmail: string;
  trigger: VettingTrigger;
  /** The Dispatch Sheet version whose sending took it, when that is what did. */
  dispatchVersion: number | null;

  /** The carrier's record in TTMS at that moment. */
  carrier: {
    name: string;
    dot: string;
    mc: string;
    phone: string;
    email: string;
    address: string;
    contactName: string;
    dispatcher: string;
    dispatcherPhone: string;
    insuranceProvider: string;
    insurancePolicyNumber: string;
    /** Epoch ms of the certificate's expiry, null when none was recorded. */
    insuranceExpiration: number | null;
    /** Whole dollars, null when not recorded — never read as $0. */
    liabilityCoverage: number | null;
    cargoCoverage: number | null;
  };

  /** FMCSA's answer, or null when there was none at all. */
  fmcsa: FmcsaAnswer | null;
  /**
   * `live` — asked of FMCSA as the record was taken.
   * `stored` — FMCSA could not be reached; this is the carrier's last check.
   * `none` — FMCSA could not be reached and the carrier had never been checked.
   */
  fmcsaSource: 'live' | 'stored' | 'none';
  /** When the answer above was given: now for `live`, the old check's time for `stored`. */
  fmcsaAt: number | null;
  /** Why the live lookup failed, when it did. */
  fmcsaError: string;
  concerns: FmcsaConcern[];
  operatingSince: OperatingSince | null;

  load: {
    pickup: string;
    delivery: string;
    /** Epoch ms. */
    pickupDate: number | null;
    commodity: string;
    equipment: string;
    carrierPay: number;
  };

  driver: {
    name: string;
    phone: string;
    licenseOnFile: boolean;
    /** Epoch ms, null when no expiry is recorded. */
    licenseExpiration: number | null;
  };
  truckPhotos: number;

  /** The Dispatch Sheet review, as it stood. Null when nobody asked for one on this load. */
  review: {
    status: string;
    checks: VettingCheck[];
  } | null;

  files: {
    saferWeb: VettingFile | null;
    insurance: VettingFile | null;
  };
  /** Why a file could not be copied, by file — said on the record rather than left as a gap. */
  fileErrors: { saferWeb?: string; insurance?: string };

  hash: string;
}

/**
 * One Carrier Selection File as it was handed out, kept at
 * `carrierVettings/{vettingId}/prints/{printId}` with the PDF itself beside
 * the record's other files.
 *
 * The PDF is drawn fresh from the record every time, so two prints of one
 * record can differ — the integrity line, the date printed, a layout changed
 * since. Each copy that left TTMS is kept byte for byte, so the copy a
 * lawyer was given can be produced again exactly. A print is saved before
 * the PDF is handed over: if it cannot be kept, it is not given out.
 *
 * A subcollection, so a print never touches the record and its hash.
 */
export interface VettingPrint {
  id: string;
  /** Epoch ms. */
  printedAt: number;
  printedByName: string;
  printedByEmail: string;
  path: string;
  sha256: string;
  bytes: number;
  /** What the integrity checks said on this copy. */
  intact: { record: boolean; saferWeb: boolean | null; insurance: boolean | null };
}

export const VETTING_PRINTS_SUBCOLLECTION = 'prints';

/**
 * The exact text the hash is taken over: the record without its hash, every
 * object's keys sorted, so the same record always gives the same string
 * whatever order Firestore hands the fields back in.
 */
export function vettingHashInput(record: Omit<CarrierVetting, 'hash' | 'id'> | CarrierVetting): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hash: _h, id: _i, ...rest } = record as CarrierVetting;
  return canonical(rest);
}

function canonical(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** The worst thing FMCSA said, for a one-word summary. */
export function vettingLevel(v: Pick<CarrierVetting, 'concerns' | 'fmcsa'>): 'ok' | 'warn' | 'bad' | 'unknown' {
  if (!v.fmcsa) return 'unknown';
  if (v.concerns.some((c) => c.level === 'bad')) return 'bad';
  if (v.concerns.length > 0) return 'warn';
  return 'ok';
}
