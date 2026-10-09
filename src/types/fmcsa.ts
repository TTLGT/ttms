import type { Timestamp } from 'firebase/firestore';
import type { PhoneRegion } from '@/lib/phone';
import { isPhoneRegion } from '@/lib/phone';
import type { Carrier } from './carrier';

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
  /**
   * What FMCSA's daily open data adds to the live lookup: the registered
   * phone and email, the insurers and policies on file, pending
   * cancellations and suspension notices. Absent on checks made before it
   * existed, and null when the open data could not be reached — the live
   * answer above still stands on its own, so a check is never failed for it.
   */
  registry?: FmcsaRegistry | null;
}

export type FmcsaInsuranceKind = 'liability' | 'cargo' | 'bond' | 'other';

export interface FmcsaPolicy {
  kind: FmcsaInsuranceKind;
  /** Excess (umbrella) liability over a primary policy, rather than the primary. */
  excess: boolean;
  company: string;
  /** '' when FMCSA has none, which is what a self-insured carrier files. */
  policyNo: string;
  /** YYYY-MM-DD. */
  effectiveDate: string;
  /** Whole dollars, as filed — not necessarily the whole limit on the certificate. */
  amount: number;
}

export interface FmcsaPendingCancellation {
  kind: FmcsaInsuranceKind;
  company: string;
  policyNo: string;
  /** YYYY-MM-DD the policy stops covering. */
  cancelDate: string;
  /** True when another current policy of the same kind will still be on file. */
  replaced: boolean;
}

export interface FmcsaSuspension {
  /** "Motor Carrier of Property (Except Household Goods)", as FMCSA words it. */
  authorityType: string;
  /** "Operating Authority Involuntary Suspension Notice", as FMCSA words it. */
  notice: string;
  /** YYYY-MM-DD. */
  servedDate: string;
  /** YYYY-MM-DD the suspension takes, or took, effect. */
  effectiveDate: string;
  involuntary: boolean;
}

/**
 * FMCSA's registration data as published to data.transportation.gov. Since
 * May 2026 this is what carriers file in Motus; it refreshes once a day, so
 * it can be a day behind the live lookup.
 */
export interface FmcsaRegistry {
  /** Office-day the open data was read, YYYY-MM-DD. */
  asOf: string;
  phone: string;
  cellPhone: string;
  fax: string;
  email: string;
  /** FMCSA's "company officer" — usually the owner. */
  officer: string;
  /** 'US', 'CA', 'MX' — the physical address's country, for the phone's country. */
  country: string;
  mailingAddress: string;
  /** YYYY-MM-DD of the last MCS-150 update, '' when unknown. */
  mcs150Date: string;
  /**
   * YYYY-MM-DD FMCSA first granted this DOT a for-hire **carrier** authority
   * (an MC as a carrier, not as a broker), '' when no grant could be found.
   * Optional: checks made before 2026-10-08 do not have it. Read it through
   * `operatingSince()`, never on its own.
   */
  authorityGranted?: string;
  /** YYYY-MM-DD the DOT number was registered (the census `add_date`). Optional, as above. */
  dotAdded?: string;
  /** What the carrier says it hauls: "General Freight", "Refrigerated Food"… */
  cargoTypes: string[];
  /** Policies on file now, cancelled ones already removed. */
  policies: FmcsaPolicy[];
  pendingCancellations: FmcsaPendingCancellation[];
  /** Suspension notices with an effective date in the last year or still ahead. */
  suspensions: FmcsaSuspension[];
}

export const INSURANCE_KIND_LABEL: Record<FmcsaInsuranceKind, string> = {
  liability: 'Liability',
  cargo: 'Cargo',
  bond: 'Bond',
  other: 'Other',
};

/**
 * The policy that answers "who insures this carrier": the newest primary
 * liability policy, or the newest excess one when there is no primary.
 */
export function primaryPolicy(r: FmcsaRegistry | null | undefined, kind: FmcsaInsuranceKind): FmcsaPolicy | null {
  const of = (r?.policies ?? []).filter((p) => p.kind === kind);
  const primary = of.filter((p) => !p.excess);
  const pool = primary.length ? primary : of;
  return [...pool].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null;
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

/**
 * How long a carrier must have been operating before we use it. A carrier a
 * few weeks old has no record to look at, and new authorities — bought,
 * borrowed or set up for one load — are where most freight fraud starts.
 */
export const MIN_OPERATING_MONTHS = 6;

export interface OperatingSince {
  /** YYYY-MM-DD. */
  day: string;
  /**
   * `authority` when FMCSA's grant date was found; `dot` when only the date
   * the DOT number was registered was. The DOT date can be years older than
   * the authority — a private fleet that went for-hire last month — so it is
   * the weaker answer, and the screen says which one it is showing.
   */
  source: 'authority' | 'dot';
}

/** Since when this carrier has been operating, as far as FMCSA says; null when unknown. */
export function operatingSince(r: FmcsaRegistry | null | undefined): OperatingSince | null {
  if (r?.authorityGranted) return { day: r.authorityGranted, source: 'authority' };
  if (r?.dotAdded) return { day: r.dotAdded, source: 'dot' };
  return null;
}

/** YYYY-MM-DD the carrier reaches `MIN_OPERATING_MONTHS`, from a YYYY-MM-DD start. */
export function operatingThreshold(since: string): string {
  const [y, m, d] = since.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + MIN_OPERATING_MONTHS, d));
  return t.toISOString().slice(0, 10);
}

/** True when it is known to be newer than `MIN_OPERATING_MONTHS`. Unknown is not "new". */
export function isNewCarrier(since: OperatingSince | null, today: string = officeDay()): boolean {
  return Boolean(since && operatingThreshold(since.day) > today);
}

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

/** Today as YYYY-MM-DD in office time (UTC−6, no daylight saving), like the rest of TTMS. */
export function officeDay(now = Date.now()): string {
  return new Date(now - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function fmcsaConcerns(
  c: FmcsaAnswer,
  ourMc?: string,
  /** How a YYYY-MM-DD date is written in a sentence — the company date format. */
  formatDay: (iso: string) => string = (iso) => iso,
  today: string = officeDay(),
): FmcsaConcern[] {
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

  const since = operatingSince(c.registry);
  if (isNewCarrier(since, today)) {
    out.push({
      level: 'warn',
      text: since!.source === 'authority'
        ? `Operating authority was granted on ${formatDay(since!.day)} — less than ${MIN_OPERATING_MONTHS} months ago.`
        : `The DOT number was registered on ${formatDay(since!.day)} — less than ${MIN_OPERATING_MONTHS} months ago.`,
    });
  }

  const reg = c.registry;
  for (const p of reg?.pendingCancellations ?? []) {
    if (p.replaced) continue;
    const what = `${INSURANCE_KIND_LABEL[p.kind]} insurance with ${p.company || 'its insurer'}`;
    out.push({
      level: p.kind === 'liability' ? 'bad' : 'warn',
      text: `${what} is being cancelled on ${formatDay(p.cancelDate)}, and no replacement is on file.`,
    });
  }
  // A suspension notice nearly always means the insurance filing lapsed, and
  // a new liability filing after the notice was served usually cures it —
  // which is why a notice that is still ahead drops to a warning once one is
  // on file. Whether it was cured is FMCSA's to say, so the text sends the
  // broker to SAFER rather than guessing.
  const liabilitySince = (day: string) =>
    (reg?.policies ?? []).find((p) => p.kind === 'liability' && p.effectiveDate >= day);
  for (const s of reg?.suspensions ?? []) {
    if (!s.involuntary) continue;
    const refiled = liabilitySince(s.servedDate);
    if (s.effectiveDate >= today) {
      out.push(refiled
        ? {
            level: 'warn',
            text: `Suspension notice served ${formatDay(s.servedDate)}, taking effect ${formatDay(s.effectiveDate)}. New liability insurance was filed ${formatDay(refiled.effectiveDate)}, which usually clears it — confirm on SAFER.`,
          }
        : {
            level: 'bad',
            text: `Suspension notice served ${formatDay(s.servedDate)}: authority will be suspended on ${formatDay(s.effectiveDate)} unless the carrier fixes it.`,
          });
    } else {
      out.push({
        level: 'warn',
        text: `Had a suspension notice for ${formatDay(s.effectiveDate)} in the past year — usually a lapse in insurance.`,
      });
    }
  }

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

/**
 * The carrier details an FMCSA answer can fill in. Everything here is a field
 * the broker could have typed and can still change: it is a starting point,
 * not a record of FMCSA's, which is what `fmcsa` itself is.
 *
 * The liability figure is the amount *filed* with FMCSA (often the $750,000
 * legal minimum), which can be less than the limit on the certificate. It is
 * still better than a blank, and the certificate is where the real one is
 * read from.
 */
export interface FmcsaCarrierFill {
  companyName: string;
  dot: string;
  mc: string;
  address: string;
  phone: string;
  phoneRegion: PhoneRegion | undefined;
  email: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceCoverage: number | null;
  insuranceCargoCoverage: number | null;
}

export function fmcsaCarrierFill(a: FmcsaAnswer, kind: 'dot' | 'mc', typed: string): FmcsaCarrierFill {
  const r = a.registry;
  const liability = primaryPolicy(r, 'liability');
  const cargo = primaryPolicy(r, 'cargo');
  return {
    companyName: a.legalName,
    dot: a.dotNumber || (kind === 'dot' ? typed : ''),
    // The MC the broker typed when they typed one: a company can hold several
    // dockets, and the one on the rate confirmation is the one they meant.
    mc: kind === 'mc' ? typed : (a.docketNumbers[0] ?? ''),
    address: fmcsaAddress(a),
    phone: r?.phone || r?.cellPhone || '',
    phoneRegion: r && isPhoneRegion(r.country) ? r.country : undefined,
    email: r?.email ?? '',
    insuranceProvider: liability?.company ?? '',
    insurancePolicyNumber: liability?.policyNo ?? '',
    insuranceCoverage: liability && liability.amount > 0 ? liability.amount : null,
    insuranceCargoCoverage: cargo && cargo.amount > 0 ? cargo.amount : null,
  };
}

/** The carrier fields `fmcsaBlankFills()` may write. */
export type FmcsaFillable = Pick<
  Carrier,
  | 'dot' | 'phone' | 'phoneRegion' | 'email' | 'address'
  | 'insuranceProvider' | 'insurancePolicyNumber'
  | 'insuranceCoverage' | 'insuranceCargoCoverage'
>;

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * What FMCSA could fill in on this carrier without overwriting anything:
 * only the fields that are blank on our record. Something a broker typed is
 * never replaced — it may well be newer than what the carrier registered.
 *
 * The single definition, shared by the "fill in" button on the FMCSA panel and
 * the check that runs after a BATS import (`src/lib/fmcsaSweep.ts`), so the two
 * cannot disagree about what counts as safe to fill. The name and the numbers
 * are deliberately not here — see the sweep for the one case where it fills a
 * DOT.
 */
export function fmcsaBlankFills(carrier: Partial<Carrier>, check: FmcsaAnswer): Partial<FmcsaFillable> {
  if (!check.found) return {};
  const f = fmcsaCarrierFill(check, check.lookedUpBy, check.query);
  const out: Partial<FmcsaFillable> = {};
  const mc = (carrier.mc ?? '').replace(/\D+/g, '');
  if (isBlank(carrier.dot) && check.lookedUpBy === 'mc' && check.dotNumber && mc && check.docketNumbers.includes(mc)) {
    out.dot = check.dotNumber;
  }
  if (isBlank(carrier.phone) && f.phone) {
    out.phone = f.phone;
    if (f.phoneRegion) out.phoneRegion = f.phoneRegion;
  }
  if (isBlank(carrier.email) && f.email) out.email = f.email;
  if (isBlank(carrier.address) && f.address) out.address = f.address;
  if (isBlank(carrier.insuranceProvider) && f.insuranceProvider) out.insuranceProvider = f.insuranceProvider;
  if (isBlank(carrier.insurancePolicyNumber) && f.insurancePolicyNumber) out.insurancePolicyNumber = f.insurancePolicyNumber;
  if (isBlank(carrier.insuranceCoverage) && f.insuranceCoverage !== null) out.insuranceCoverage = f.insuranceCoverage;
  if (isBlank(carrier.insuranceCargoCoverage) && f.insuranceCargoCoverage !== null) out.insuranceCargoCoverage = f.insuranceCargoCoverage;
  return out;
}
