import type { Timestamp } from 'firebase/firestore';

/**
 * What FMCSA said about a carrier the last time somebody looked, stored on the
 * carrier as `fmcsa`.
 *
 * Only FMCSA's answer is stored, never a verdict on it. What counts as a
 * concern is worked out on read by `fmcsaConcerns()` below, so tightening a
 * rule changes every carrier's warning at once rather than only the ones
 * checked since.
 *
 * Written only by `POST /api/carriers/{id}/fmcsa`, through the Admin SDK.
 * `firestore.rules` refuses the field from the browser: a broker who could
 * write it could mark a carrier "authorized" without FMCSA ever having been
 * asked.
 *
 * Insurance figures are FMCSA's own unit, **thousands of dollars** — 750 is
 * $750,000 — kept as given so a stored check can be compared with the
 * response it came from. Show them through `fmcsaDollars()`.
 */
export interface FmcsaCheck {
  /** Server time of the lookup. */
  checkedAt: Timestamp;
  checkedByName: string;
  /** Which of our numbers was sent. DOT when the carrier has one. */
  lookedUpBy: 'dot' | 'mc';
  /** The digits that were sent. */
  query: string;
  /**
   * False when FMCSA has no carrier under that number — itself the loudest
   * concern there is, and why every field below may be blank.
   */
  found: boolean;
  legalName: string;
  dbaName: string;
  dotNumber: string;
  /** Every MC/FF/MX docket FMCSA lists under the DOT number, digits only. */
  docketNumbers: string[];
  /** 'Y' / 'N' as FMCSA gives it. */
  allowedToOperate: string;
  /** USDOT number status: 'A' active, 'I' inactive. */
  statusCode: string;
  /** For-hire authority: 'A' active, 'I' inactive, 'N' none. */
  commonAuthority: string;
  contractAuthority: string;
  brokerAuthority: string;
  /** Liability (BIPD) insurance on file, in thousands of dollars. */
  liabilityOnFile: number;
  /** 'Y' when FMCSA requires liability insurance of this carrier. */
  liabilityRequired: string;
  /** The liability amount required, in thousands of dollars. */
  liabilityRequiredAmount: number;
  cargoOnFile: number;
  cargoRequired: string;
  bondOnFile: number;
  /** 'S' satisfactory, 'C' conditional, 'U' unsatisfactory, '' not rated. */
  safetyRating: string;
  safetyRatingDate: string;
  /** Date of an out-of-service order, '' when there is none. */
  oosDate: string;
  /** 'Y' when the carrier's biennial MCS-150 update is overdue. */
  mcs150Outdated: string;
  powerUnits: number;
  drivers: number;
  crashTotal: number;
  fatalCrash: number;
  vehicleInspections: number;
  vehicleOosRate: number;
  vehicleOosNational: number;
  driverInspections: number;
  driverOosRate: number;
  driverOosNational: number;
  /** Where the carrier's physical address is, for a sanity check by eye. */
  city: string;
  state: string;
  /**
   * The rest of the physical address, for filling in a new carrier. Optional
   * because checks stored before the lookup could add carriers lack them.
   */
  street?: string;
  zip?: string;
}

export type FmcsaLevel = 'ok' | 'warn' | 'bad';

export interface FmcsaConcern {
  level: Exclude<FmcsaLevel, 'ok'>;
  text: string;
}

/**
 * Below this many inspections an out-of-service rate is noise: one bad day
 * out of two inspections reads as 50%.
 */
const MIN_INSPECTIONS_FOR_RATE = 5;

/**
 * How far above the national out-of-service average counts as worth a look.
 * A quarter over, not merely over: half of all carriers are above an average
 * by definition, and a warning on every second carrier stops being read.
 */
const OOS_RATE_MARGIN = 1.25;

const AUTHORITY_ACTIVE = 'A';

/** FMCSA's rates come with a dozen decimals. One is plenty. */
export function fmcsaRate(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

/** "$750,000" from FMCSA's 750. */
export function fmcsaDollars(thousands: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    .format(thousands * 1000);
}

/**
 * Everything about a check a broker should stop and look at, worst first.
 *
 * `bad` means do not tender until it is explained — FMCSA says this carrier
 * cannot legally haul the load. `warn` means look before tendering. Neither
 * blocks anything in the app; that is a business decision nobody has made.
 *
 * `ourMc` is the MC on our own record. When FMCSA's DOT does not list it, the
 * numbers on file belong to two different companies — the shape of a
 * borrowed or stolen MC, which is the most common way freight is stolen.
 */
/** FMCSA's answer without who asked or when — a lookup before it is filed. */
export type FmcsaAnswer = Omit<FmcsaCheck, 'checkedAt' | 'checkedByName'>;

export function fmcsaConcerns(c: FmcsaAnswer, ourMc?: string): FmcsaConcern[] {
  const out: FmcsaConcern[] = [];
  if (!c.found) {
    out.push({ level: 'bad', text: `FMCSA has no carrier under ${c.lookedUpBy.toUpperCase()} ${c.query}.` });
    return out;
  }

  if (c.oosDate) out.push({ level: 'bad', text: `Under an out-of-service order since ${c.oosDate}.` });
  if (c.allowedToOperate !== 'Y') out.push({ level: 'bad', text: 'FMCSA says this carrier is not allowed to operate.' });
  if (c.statusCode !== AUTHORITY_ACTIVE) out.push({ level: 'bad', text: 'The USDOT number is not active.' });

  if (c.commonAuthority !== AUTHORITY_ACTIVE && c.contractAuthority !== AUTHORITY_ACTIVE) {
    const lapsed = c.commonAuthority === 'I' || c.contractAuthority === 'I';
    out.push({
      level: 'bad',
      text: lapsed
        ? 'Operating authority (MC) is inactive — it has been revoked or has lapsed.'
        : 'No for-hire operating authority (MC). It may only haul within its own state.',
    });
  }

  if (c.liabilityRequired === 'Y') {
    if (c.liabilityOnFile <= 0) {
      out.push({ level: 'bad', text: 'No liability insurance on file with FMCSA.' });
    } else if (c.liabilityOnFile < c.liabilityRequiredAmount) {
      out.push({
        level: 'bad',
        text: `Liability insurance on file (${fmcsaDollars(c.liabilityOnFile)}) is below the ${fmcsaDollars(c.liabilityRequiredAmount)} required.`,
      });
    }
  }
  if (c.cargoRequired === 'Y' && c.cargoOnFile <= 0) {
    out.push({ level: 'warn', text: 'No cargo insurance on file with FMCSA, though it is required.' });
  }

  if (c.safetyRating === 'U') out.push({ level: 'bad', text: 'Safety rating is Unsatisfactory.' });
  if (c.safetyRating === 'C') out.push({ level: 'warn', text: 'Safety rating is Conditional.' });

  const mc = (ourMc ?? '').replace(/\D+/g, '');
  if (mc && c.docketNumbers.length > 0 && !c.docketNumbers.includes(mc)) {
    out.push({
      level: 'bad',
      text: `Our MC ${mc} is not registered to DOT ${c.dotNumber} — FMCSA lists MC ${c.docketNumbers.join(', ')}. Confirm who you are talking to.`,
    });
  }

  if (c.mcs150Outdated === 'Y') out.push({ level: 'warn', text: 'Registration (MCS-150) is out of date.' });

  if (c.vehicleInspections >= MIN_INSPECTIONS_FOR_RATE && c.vehicleOosNational > 0
      && c.vehicleOosRate > c.vehicleOosNational * OOS_RATE_MARGIN) {
    out.push({
      level: 'warn',
      text: `Vehicle out-of-service rate ${fmcsaRate(c.vehicleOosRate)} is well above the ${fmcsaRate(c.vehicleOosNational)} national average.`,
    });
  }
  if (c.driverInspections >= MIN_INSPECTIONS_FOR_RATE && c.driverOosNational > 0
      && c.driverOosRate > c.driverOosNational * OOS_RATE_MARGIN) {
    out.push({
      level: 'warn',
      text: `Driver out-of-service rate ${fmcsaRate(c.driverOosRate)} is well above the ${fmcsaRate(c.driverOosNational)} national average.`,
    });
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
}

export function fmcsaLevel(concerns: FmcsaConcern[]): FmcsaLevel {
  if (concerns.some((c) => c.level === 'bad')) return 'bad';
  if (concerns.length > 0) return 'warn';
  return 'ok';
}

/**
 * How old a check may get before a screen that is about to use the carrier
 * looks again by itself. A day, because authority and insurance change on
 * FMCSA's side without telling anybody, and a carrier booked every day should
 * not run a week on last Monday's answer.
 */
export const FMCSA_STALE_MS = 24 * 60 * 60 * 1000;

export function fmcsaIsStale(c: FmcsaCheck | null | undefined, now = Date.now()): boolean {
  if (!c?.checkedAt || typeof c.checkedAt.toMillis !== 'function') return true;
  return now - c.checkedAt.toMillis() > FMCSA_STALE_MS;
}

/** Plain-language labels for FMCSA's one-letter codes. */
export function authorityLabel(code: string): string {
  return code === 'A' ? 'Active' : code === 'I' ? 'Inactive' : 'None';
}

export function safetyRatingLabel(code: string): string {
  return code === 'S' ? 'Satisfactory' : code === 'C' ? 'Conditional' : code === 'U' ? 'Unsatisfactory' : 'Not rated';
}

/** "2411 C BULL STREET, SAVANNAH, GA 31401" — FMCSA's address as one line, for a new carrier. */
export function fmcsaAddress(c: Pick<FmcsaCheck, 'street' | 'city' | 'state' | 'zip'>): string {
  const cityState = [c.city, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [c.street, cityState].filter(Boolean).join(', ');
}
