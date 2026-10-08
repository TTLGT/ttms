import { convertLength, type DimensionUnit } from './order';

/**
 * The quote calculator's rate card: what each kind of truck is charged at, how
 * big a load each one takes, and a market figure to check a driver's price
 * against.
 *
 * It started life as the "Calculator" tab of a Google Sheet the brokers kept,
 * and the defaults below are that sheet's numbers, so the first time anybody
 * opens the calculator it answers the way the sheet did. From then on it is an
 * admin's to keep right, in Settings → Operations → Quote Rates.
 *
 * ## Why the rates are typed in rather than looked up
 *
 * There is no free source of live lane rates. DAT, Truckstop and Greenscreens
 * all sell theirs, per seat or per call. What DAT does give away is a weekly
 * press release with three national averages — van, reefer and flatbed — so
 * those three are the `market` block: an admin copies them in when they want,
 * and the calculator measures the driver's price against them. That is a
 * sanity check, not a price. A national average says nothing about a lane.
 *
 * ## What the numbers mean
 *
 * The per-mile ranges are what **the client** is charged, as in the sheet,
 * where rate × miles was the "Estimated Price" and the driver's price was a
 * separate box. The market figures are what DAT reports brokers paying
 * **carriers**, so they are compared with driver pay, never with the price.
 *
 * Stored as one document, `appSettings/quoteRates`, written only by
 * `PUT /api/quote-rates`. Pure — no Firestore here, so the browser, the route
 * and the calculator all share one definition of the maths.
 */

// ── Load size ───────────────────────────────────────────────────────────────

/** The sheet's three columns: how much of the truck the load takes. */
export type LoadSize = 'partial' | 'ltl' | 'tl';
export const LOAD_SIZES: LoadSize[] = ['partial', 'ltl', 'tl'];

export const LOAD_SIZE_LABEL: Record<LoadSize, string> = {
  partial: 'Partial',
  ltl:     'Less than truckload',
  tl:      'Truckload',
};
export const LOAD_SIZE_SHORT: Record<LoadSize, string> = { partial: 'PL', ltl: 'LTL', tl: 'TL' };

/**
 * A suggested load size, from how much of a truck the load takes up.
 *
 * Whichever is larger of the length and the weight share decides it, because
 * either one alone fills a truck: a 40 ft beam weighing very little still takes
 * the whole deck. Thirds are a rule of thumb, not an industry definition — it
 * is only ever offered as a suggestion, and the broker's choice wins.
 */
export function suggestLoadSize(share: number | null): LoadSize | null {
  if (share === null || !Number.isFinite(share) || share <= 0) return null;
  if (share <= 1 / 3) return 'partial';
  if (share <= 2 / 3) return 'ltl';
  return 'tl';
}

// ── Truck types ─────────────────────────────────────────────────────────────

/** A low-to-high range. Equal ends is a single figure, as the sheet's merged cells were. */
export interface RateRange {
  low: number;
  high: number;
}

/**
 * How a truck type is priced.
 *
 * - `perMile` — a dollar-per-mile range for each load size. Most trucks.
 * - `hourly`  — a dollar-per-hour range. The Landoll, which is booked for its
 *               winch and tilt bed rather than for distance.
 * - `towing`  — a hook-up fee plus per-mile, with a cheaper local tier.
 */
export type PricingKind = 'perMile' | 'hourly' | 'towing';
export const PRICING_KINDS: PricingKind[] = ['perMile', 'hourly', 'towing'];
export const PRICING_KIND_LABEL: Record<PricingKind, string> = {
  perMile: 'Per mile',
  hourly:  'Per hour',
  towing:  'Towing',
};

export interface TowingTier {
  hookup: RateRange;
  /** Miles the hook-up fee already covers before per-mile starts. */
  includedMiles: number;
  perMile: RateRange;
}

export interface TowingRates {
  /** A tow this long or shorter is priced as local. */
  localUpToMiles: number;
  local: TowingTier;
  long: TowingTier;
}

/** The biggest load the truck takes. Null on any one of them means "not checked". */
export interface TruckLimits {
  lengthFt: number | null;
  widthFt: number | null;
  heightFt: number | null;
  weightLb: number | null;
}

/** Which of DAT's three published averages a truck type is closest to. */
export type MarketEquipment = 'van' | 'reefer' | 'flatbed';
export const MARKET_EQUIPMENT: MarketEquipment[] = ['van', 'reefer', 'flatbed'];
export const MARKET_EQUIPMENT_LABEL: Record<MarketEquipment, string> = {
  van: 'Van', reefer: 'Reefer', flatbed: 'Flatbed',
};

export interface TruckType {
  /** Stable key. Never shown, never renamed — a quote may be linked to it. */
  id: string;
  /** The sheet's short code: HS, SD, F… */
  code: string;
  name: string;
  pricing: PricingKind;
  /** For `perMile`. A null size is one this truck is not offered for. */
  perMile: Record<LoadSize, RateRange | null>;
  /** For `hourly`. */
  hourly: RateRange | null;
  /** For `towing`. */
  towing: TowingRates | null;
  /** Null for a truck with no deck to measure against — driveaway, a tow. */
  limits: TruckLimits | null;
  /** Anything the limits cannot say: upper deck height, axles, pallet count. */
  notes: string;
  market: MarketEquipment | null;
}

// ── Market check ────────────────────────────────────────────────────────────

export interface MarketRates {
  /** National averages, dollars per mile, broker to carrier. Null = not known. */
  van: number | null;
  reefer: number | null;
  flatbed: number | null;
  /** The last day of the week the figures describe, YYYY-MM-DD. */
  asOf: string;
  /** Where they came from, in words — shown beside the figures. */
  source: string;
}

// ── The whole card ──────────────────────────────────────────────────────────

export interface QuoteRates {
  trucks: TruckType[];
  market: MarketRates;
  /**
   * The broker fee a load is expected to clear. The sheet showed $500 in its
   * "Broker fee out of uShip" cell before anything was typed, which is read
   * here as the fee the office aims for. The calculator flags a quote under it
   * and offers "driver pay + this" as a price; it never refuses one.
   */
  targetBrokerFee: number;
  /** uShip's cut as a percentage, to pre-fill the uShip column. Null = type it each time. */
  ushipFeePercent: number | null;
}

const range = (low: number, high = low): RateRange => ({ low, high });

const perMile = (
  partial: RateRange | null, ltl: RateRange | null, tl: RateRange | null,
): Record<LoadSize, RateRange | null> => ({ partial, ltl, tl });

const NO_PER_MILE = perMile(null, null, null);

/**
 * The Google Sheet's numbers, as they were handed over on 2026-10-08.
 *
 * Limits are the top of each range the sheet gave, since the question asked of
 * them is "could this truck take it". Two are not from the sheet: the
 * Conestoga's (its picture was not in what was handed over; these are the
 * usual 53 ft trailer's), and the towing local/long boundary of 50 miles, which
 * the sheet named but never drew. The Landoll has no limits because the sheet
 * gave none — the calculator says "not checked" rather than guess.
 */
export const DEFAULT_QUOTE_RATES: QuoteRates = {
  trucks: [
    {
      id: 'hotshot', code: 'HS', name: 'Hot Shot', pricing: 'perMile',
      perMile: perMile(range(1, 1.5), range(1.5, 2), range(2, 2.5)),
      hourly: null, towing: null,
      limits: { lengthFt: 40, widthFt: 8.5, heightFt: 10.5, weightLb: 20000 },
      notes: 'Deck 20–40 ft, 7.5–8.5 ft wide.',
      market: null,
    },
    {
      id: 'stepdeck', code: 'SD', name: 'Step Deck', pricing: 'perMile',
      perMile: perMile(range(2), range(2.5, 3), range(3, 4)),
      hourly: null, towing: null,
      limits: { lengthFt: 53, widthFt: 8.5, heightFt: 10.5, weightLb: 48000 },
      notes: 'Lower deck 37–42 ft, upper deck 8–11 ft. Height 10.5 ft on the lower deck, 8.5 ft on the upper. 45,000–48,000 lbs.',
      market: 'flatbed',
    },
    {
      id: 'flatbed', code: 'F', name: 'Flat Bed', pricing: 'perMile',
      perMile: perMile(range(1.5, 2), range(2, 3), range(3, 4)),
      hourly: null, towing: null,
      limits: { lengthFt: 53, widthFt: 8.5, heightFt: 8.5, weightLb: 48000 },
      notes: '48–53 ft. 45,000–48,000 lbs.',
      market: 'flatbed',
    },
    {
      id: 'dryvan', code: 'V', name: 'Dry Van', pricing: 'perMile',
      perMile: perMile(range(2.5, 3), range(3, 4), range(4, 5)),
      hourly: null, towing: null,
      limits: { lengthFt: 53, widthFt: 8, heightFt: 8, weightLb: 45000 },
      notes: '48–53 ft. 42,000–45,000 lbs.',
      market: 'van',
    },
    {
      id: 'lowboy', code: 'L/RGN', name: 'Lowboy / RGN', pricing: 'perMile',
      perMile: perMile(null, range(3, 3.5), range(4, 5)),
      hourly: null, towing: null,
      limits: { lengthFt: 29.6, widthFt: 8.5, heightFt: 12, weightLb: 40000 },
      notes: 'Lowboy: 24–29.6 ft, 11.5–12 ft high, 40,000 lbs on 2 axles and up to 80,000 lbs with more. RGN: 29 ft, 11.6 ft high, 42,000 lbs.',
      market: null,
    },
    {
      id: 'reefer', code: 'R', name: 'Reefer', pricing: 'perMile',
      perMile: perMile(range(2, 2.5), range(2.5, 3), range(3.5, 4)),
      hourly: null, towing: null,
      limits: { lengthFt: 53, widthFt: 8.5, heightFt: 8.5, weightLb: 44000 },
      notes: '48–53 ft. 24 pallets.',
      market: 'reefer',
    },
    {
      id: 'driveaway', code: 'DW', name: 'Driveaway', pricing: 'perMile',
      perMile: perMile(range(1.5), range(1.5), range(1.5)),
      hourly: null, towing: null,
      limits: null,
      notes: 'The vehicle is driven to delivery, so there is no deck to fit.',
      market: null,
    },
    {
      id: 'landoll', code: 'LAF', name: 'Landoll Flatbed', pricing: 'hourly',
      perMile: NO_PER_MILE,
      hourly: range(75, 90),
      towing: null,
      limits: null,
      notes: 'Tilt-bed trailer with a winch, booked by the hour.',
      market: null,
    },
    {
      id: 'conestoga', code: 'C', name: 'Conestoga', pricing: 'perMile',
      perMile: perMile(range(1.5, 2), range(2, 3), range(3, 4)),
      hourly: null, towing: null,
      limits: { lengthFt: 53, widthFt: 8.5, heightFt: 8.5, weightLb: 45000 },
      notes: 'Flatbed with a rolling tarp.',
      market: 'flatbed',
    },
    {
      id: 'towed', code: 'T', name: 'Towed', pricing: 'towing',
      perMile: NO_PER_MILE,
      hourly: null,
      towing: {
        localUpToMiles: 50,
        local: { hookup: range(50), includedMiles: 10, perMile: range(2, 4) },
        long:  { hookup: range(75, 125), includedMiles: 0, perMile: range(2, 4) },
      },
      limits: null,
      notes: 'Source: homeguide.com/costs/towing-service-cost.',
      market: null,
    },
  ],
  market: {
    van: 2.95,
    reefer: 3.54,
    flatbed: 3.54,
    asOf: '2026-09-05',
    source: 'DAT national average spot rate, broker to carrier, fuel included — week of Aug 30 to Sep 5, 2026',
  },
  targetBrokerFee: 500,
  ushipFeePercent: null,
};

// ── Units ───────────────────────────────────────────────────────────────────

export type DistanceUnit = 'mi' | 'km' | 'm';
export const DISTANCE_UNITS: DistanceUnit[] = ['mi', 'km', 'm'];
export const DISTANCE_UNIT_LABEL: Record<DistanceUnit, string> = { mi: 'miles', km: 'km', m: 'meters' };
const METERS_PER_MILE = 1609.344;

export function toMiles(value: number, unit: DistanceUnit): number {
  if (!Number.isFinite(value)) return 0;
  if (unit === 'mi') return value;
  if (unit === 'km') return (value * 1000) / METERS_PER_MILE;
  return value / METERS_PER_MILE;
}

/**
 * The sheet offered tons as well as kilos. Both kinds are offered here and
 * named, because "ton" alone is 2,000 lbs to a US shipper and 1,000 kg to
 * everybody else, and the difference is 10% of a truck's capacity.
 */
export type QuoteWeightUnit = 'lb' | 'kg' | 't' | 'ton';
export const QUOTE_WEIGHT_UNITS: QuoteWeightUnit[] = ['lb', 'kg', 't', 'ton'];
export const QUOTE_WEIGHT_UNIT_LABEL: Record<QuoteWeightUnit, string> = {
  lb: 'lbs', kg: 'kg', t: 'metric tons', ton: 'US tons',
};
const LB_PER: Record<QuoteWeightUnit, number> = {
  lb: 1, kg: 2.20462262185, t: 2204.62262185, ton: 2000,
};

export function toLb(value: number, unit: QuoteWeightUnit): number {
  return Number.isFinite(value) ? value * LB_PER[unit] : 0;
}

export function toFeet(value: number, unit: DimensionUnit): number {
  return Number.isFinite(value) ? convertLength(value, unit, 'ft') : 0;
}

// ── Fit ─────────────────────────────────────────────────────────────────────

export type FitResult = 'fits' | 'over' | 'unchecked';

export interface TruckFit {
  /** Per measure. `unchecked` when the truck has no limit or the load no figure. */
  length: FitResult;
  width: FitResult;
  height: FitResult;
  weight: FitResult;
  /** `over` if anything is over; `fits` if something was checked and nothing is; else `unchecked`. */
  overall: FitResult;
  /** How full the truck is, 0–1+, by whichever of length and weight is fuller. */
  share: number | null;
}

export interface LoadMeasures {
  lengthFt: number | null;
  widthFt: number | null;
  heightFt: number | null;
  weightLb: number | null;
}

function check(load: number | null, limit: number | null): FitResult {
  if (load === null || load <= 0 || limit === null || limit <= 0) return 'unchecked';
  // A hundredth of a foot of tolerance, so 8.5 ft typed as 102 in is not "over".
  return load <= limit + 0.01 ? 'fits' : 'over';
}

export function truckFit(truck: TruckType, load: LoadMeasures): TruckFit {
  const lim = truck.limits;
  const length = check(load.lengthFt, lim?.lengthFt ?? null);
  const width  = check(load.widthFt,  lim?.widthFt  ?? null);
  const height = check(load.heightFt, lim?.heightFt ?? null);
  const weight = check(load.weightLb, lim?.weightLb ?? null);
  const all = [length, width, height, weight];
  const overall: FitResult = all.includes('over') ? 'over' : all.includes('fits') ? 'fits' : 'unchecked';

  const shares = [
    lim?.lengthFt && load.lengthFt ? load.lengthFt / lim.lengthFt : null,
    lim?.weightLb && load.weightLb ? load.weightLb / lim.weightLb : null,
  ].filter((s): s is number => s !== null);
  return { length, width, height, weight, overall, share: shares.length ? Math.max(...shares) : null };
}

// ── Pricing ─────────────────────────────────────────────────────────────────

/** A point between the low and high ends of a range. 0 = low, 1 = high. */
export function between(r: RateRange, position: number): number {
  const p = Math.min(1, Math.max(0, position));
  return r.low + (r.high - r.low) * p;
}

export interface PriceInput {
  miles: number;
  /** Only for hourly trucks. */
  hours: number;
  size: LoadSize;
  /** 0 = the low end of every range, 1 = the high end. */
  position: number;
}

export interface PriceEstimate {
  /** The price at the chosen position, and at either end. */
  price: number;
  low: number;
  high: number;
  /** "$3.50 / mile", "$80.00 / hour", "$100 hook-up + $3.00 / mile" — how `price` was reached. */
  basis: string;
  /** Null when there is a price; otherwise why there is not one. */
  missing: string | null;
}

const money2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

function towingPrice(t: TowingRates, miles: number, position: number) {
  const tier = miles <= t.localUpToMiles ? t.local : t.long;
  const billable = Math.max(0, miles - tier.includedMiles);
  const at = (p: number) => between(tier.hookup, p) + billable * between(tier.perMile, p);
  return { tier, local: tier === t.local, low: at(0), high: at(1), price: at(position) };
}

/**
 * What the client would be charged for this truck, at the chosen point of its
 * range. One function for all three kinds so the page, the dialog and the
 * copied text can never disagree about a number.
 */
export function estimatePrice(truck: TruckType, input: PriceInput): PriceEstimate {
  const none = (missing: string): PriceEstimate => ({ price: 0, low: 0, high: 0, basis: '', missing });

  if (truck.pricing === 'hourly') {
    if (!truck.hourly) return none('No hourly rate is set for this truck.');
    if (!(input.hours > 0)) return none('Enter how many hours the job will take.');
    const rate = between(truck.hourly, input.position);
    return {
      price: rate * input.hours,
      low: truck.hourly.low * input.hours,
      high: truck.hourly.high * input.hours,
      basis: `${money2(rate)} / hour × ${input.hours} h`,
      missing: null,
    };
  }

  if (!(input.miles > 0)) return none('Enter the distance, or the two ZIP codes.');

  if (truck.pricing === 'towing') {
    if (!truck.towing) return none('No towing rates are set.');
    const t = towingPrice(truck.towing, input.miles, input.position);
    const rate = between(t.tier.perMile, input.position);
    const hook = between(t.tier.hookup, input.position);
    const after = t.tier.includedMiles > 0 ? ` after ${t.tier.includedMiles} mi` : '';
    return {
      price: t.price, low: t.low, high: t.high,
      basis: `${t.local ? 'Local' : 'Long distance'}: ${money2(hook)} hook-up + ${money2(rate)} / mile${after}`,
      missing: null,
    };
  }

  const r = truck.perMile[input.size];
  if (!r) return none(`${truck.name} is not offered for ${LOAD_SIZE_LABEL[input.size].toLowerCase()} loads.`);
  const rate = between(r, input.position);
  return {
    price: rate * input.miles,
    low: r.low * input.miles,
    high: r.high * input.miles,
    basis: `${money2(rate)} / mile × ${Math.round(input.miles).toLocaleString('en-US')} mi`,
    missing: null,
  };
}

/** The range a truck charges at one load size, as words — for the truck picker. */
export function rateSummary(truck: TruckType, size: LoadSize): string {
  const span = (r: RateRange, unit: string) =>
    r.low === r.high ? `${money2(r.low)}${unit}` : `${money2(r.low)}–${money2(r.high)}${unit}`;
  if (truck.pricing === 'hourly') return truck.hourly ? span(truck.hourly, '/h') : '—';
  if (truck.pricing === 'towing') {
    if (!truck.towing) return '—';
    return `${span(truck.towing.long.hookup, '')} + ${span(truck.towing.long.perMile, '/mi')}`;
  }
  const r = truck.perMile[size];
  return r ? span(r, '/mi') : 'Not offered';
}

/** The market figure for a truck type, or null if it has none or the admin left it blank. */
export function marketRateFor(truck: TruckType, market: MarketRates): number | null {
  if (!truck.market) return null;
  const v = market[truck.market];
  return typeof v === 'number' && v > 0 ? v : null;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Checked on save in `PUT /api/quote-rates`, and again on read so a document
 * edited by hand in the Console cannot put NaN into somebody's quote.
 *
 * The caps are generous sanity bounds, not business rules: they exist to catch
 * a decimal point in the wrong place ($350 a mile), not to second-guess a rate.
 */
const MAX_TRUCKS = 30;
const CAP = { perMile: 100, hourly: 5000, hookup: 10000, miles: 10000, feet: 200, pounds: 500000, fee: 100000 };

type Checked<T> = { ok: T } | { error: string };

function num(raw: unknown, what: string, max: number): Checked<number> {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return { error: `${what} must be a number of zero or more.` };
  if (n > max) return { error: `${what} looks too large (${n}). The most allowed is ${max.toLocaleString('en-US')}.` };
  return { ok: Math.round(n * 100) / 100 };
}

function optNum(raw: unknown, what: string, max: number): Checked<number | null> {
  if (raw === null || raw === undefined || raw === '') return { ok: null };
  const r = num(raw, what, max);
  return 'error' in r ? r : { ok: r.ok > 0 ? r.ok : null };
}

function rangeOf(raw: unknown, what: string, max: number): Checked<RateRange> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const low = num(r.low, `${what} (low)`, max);
  if ('error' in low) return low;
  const high = num(r.high === undefined || r.high === '' ? r.low : r.high, `${what} (high)`, max);
  if ('error' in high) return high;
  if (high.ok < low.ok) return { error: `${what}: the high end is below the low end.` };
  return { ok: { low: low.ok, high: high.ok } };
}

function optRange(raw: unknown, what: string, max: number): Checked<RateRange | null> {
  if (raw === null || raw === undefined) return { ok: null };
  return rangeOf(raw, what, max);
}

function towingOf(raw: unknown, name: string): Checked<TowingRates> {
  const t = (raw ?? {}) as Record<string, unknown>;
  const upTo = num(t.localUpToMiles, `${name}: local tows up to`, CAP.miles);
  if ('error' in upTo) return upTo;
  const tiers: Partial<Record<'local' | 'long', TowingTier>> = {};
  for (const key of ['local', 'long'] as const) {
    const tier = (t[key] ?? {}) as Record<string, unknown>;
    const label = `${name} ${key === 'local' ? 'local' : 'long distance'}`;
    const hookup = rangeOf(tier.hookup, `${label} hook-up`, CAP.hookup);
    if ('error' in hookup) return hookup;
    const incl = num(tier.includedMiles ?? 0, `${label} included miles`, CAP.miles);
    if ('error' in incl) return incl;
    const pm = rangeOf(tier.perMile, `${label} per mile`, CAP.perMile);
    if ('error' in pm) return pm;
    tiers[key] = { hookup: hookup.ok, includedMiles: incl.ok, perMile: pm.ok };
  }
  return { ok: { localUpToMiles: upTo.ok, local: tiers.local!, long: tiers.long! } };
}

function truckOf(raw: unknown, index: number): Checked<TruckType> {
  const t = (raw ?? {}) as Record<string, unknown>;
  const name = typeof t.name === 'string' ? t.name.trim().slice(0, 40) : '';
  if (!name) return { error: `Truck ${index + 1} needs a name.` };
  const code = typeof t.code === 'string' ? t.code.trim().toUpperCase().slice(0, 8) : '';
  if (!code) return { error: `${name} needs a short code, such as "F".` };
  const id = typeof t.id === 'string' && /^[a-z0-9-]{1,40}$/.test(t.id) ? t.id : '';
  if (!id) return { error: `${name} has no valid id.` };
  const pricing = (PRICING_KINDS as unknown[]).includes(t.pricing) ? (t.pricing as PricingKind) : null;
  if (!pricing) return { error: `${name}: choose how it is priced.` };

  const pm: Record<LoadSize, RateRange | null> = { partial: null, ltl: null, tl: null };
  const rawPm = (t.perMile ?? {}) as Record<string, unknown>;
  for (const size of LOAD_SIZES) {
    const r = optRange(rawPm[size], `${name} ${LOAD_SIZE_LABEL[size].toLowerCase()} per mile`, CAP.perMile);
    if ('error' in r) return r;
    pm[size] = r.ok;
  }
  if (pricing === 'perMile' && !LOAD_SIZES.some((s) => pm[s])) {
    return { error: `${name} is priced per mile but has no rate for any load size.` };
  }

  const hourly = optRange(t.hourly, `${name} per hour`, CAP.hourly);
  if ('error' in hourly) return hourly;
  if (pricing === 'hourly' && !hourly.ok) return { error: `${name} is priced per hour but has no hourly rate.` };

  let towing: TowingRates | null = null;
  if (t.towing) {
    const tw = towingOf(t.towing, name);
    if ('error' in tw) return tw;
    towing = tw.ok;
  }
  if (pricing === 'towing' && !towing) return { error: `${name} is priced as towing but has no towing rates.` };

  let limits: TruckLimits | null = null;
  if (t.limits) {
    const l = t.limits as Record<string, unknown>;
    const parts: Partial<TruckLimits> = {};
    for (const [key, what, max] of [
      ['lengthFt', 'length', CAP.feet], ['widthFt', 'width', CAP.feet],
      ['heightFt', 'height', CAP.feet], ['weightLb', 'weight', CAP.pounds],
    ] as const) {
      const v = optNum(l[key], `${name} maximum ${what}`, max);
      if ('error' in v) return v;
      parts[key] = v.ok;
    }
    limits = parts as TruckLimits;
    if (Object.values(limits).every((v) => v === null)) limits = null;
  }

  const market = (MARKET_EQUIPMENT as unknown[]).includes(t.market) ? (t.market as MarketEquipment) : null;
  const notes = typeof t.notes === 'string' ? t.notes.trim().slice(0, 500) : '';

  return { ok: { id, code, name, pricing, perMile: pm, hourly: hourly.ok, towing, limits, notes, market } };
}

export function validateQuoteRates(raw: unknown): Checked<QuoteRates> {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(r.trucks) || r.trucks.length === 0) return { error: 'There must be at least one truck type.' };
  if (r.trucks.length > MAX_TRUCKS) return { error: `At most ${MAX_TRUCKS} truck types.` };

  const trucks: TruckType[] = [];
  const ids = new Set<string>();
  const codes = new Set<string>();
  for (let i = 0; i < r.trucks.length; i++) {
    const t = truckOf(r.trucks[i], i);
    if ('error' in t) return t;
    if (ids.has(t.ok.id)) return { error: `Two truck types share the id "${t.ok.id}".` };
    if (codes.has(t.ok.code)) return { error: `Two truck types share the code "${t.ok.code}".` };
    ids.add(t.ok.id);
    codes.add(t.ok.code);
    trucks.push(t.ok);
  }

  const m = (r.market ?? {}) as Record<string, unknown>;
  const market: MarketRates = { van: null, reefer: null, flatbed: null, asOf: '', source: '' };
  for (const eq of MARKET_EQUIPMENT) {
    const v = optNum(m[eq], `Market ${MARKET_EQUIPMENT_LABEL[eq].toLowerCase()} rate`, CAP.perMile);
    if ('error' in v) return v;
    market[eq] = v.ok;
  }
  market.asOf = typeof m.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.asOf) ? m.asOf : '';
  market.source = typeof m.source === 'string' ? m.source.trim().slice(0, 300) : '';

  const fee = num(r.targetBrokerFee ?? 0, 'Target broker fee', CAP.fee);
  if ('error' in fee) return fee;
  const uship = optNum(r.ushipFeePercent, 'uShip fee', 100);
  if ('error' in uship) return uship;

  return { ok: { trucks, market, targetBrokerFee: fee.ok, ushipFeePercent: uship.ok } };
}

/** A fresh id for a truck type an admin adds, unlike any already on the card. */
export function newTruckId(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'truck';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
