'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Check, CheckCircle2, ClipboardCopy, Info, Loader2, MapPin, Minus, X, XCircle,
} from 'lucide-react';
import MoneyInput from '@/components/MoneyInput';
import { useAuth } from '@/context/AuthContext';
import { copyToClipboard } from '@/lib/clipboard';
import { getQuoteRatesOrDefaults } from '@/lib/quoteRates';
import { fetchLaneDistance, type DistanceResult } from '@/lib/routeDistanceClient';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { DIMENSION_UNITS, type Address, type DimensionUnit } from '@/types/order';
import { usd } from '@/types/paymentMethod';
import {
  DEFAULT_QUOTE_RATES,
  DISTANCE_UNITS,
  DISTANCE_UNIT_LABEL,
  LOAD_SIZES,
  LOAD_SIZE_LABEL,
  LOAD_SIZE_SHORT,
  MARKET_EQUIPMENT_LABEL,
  QUOTE_WEIGHT_UNITS,
  QUOTE_WEIGHT_UNIT_LABEL,
  estimatePrice,
  marketRateFor,
  rateSummary,
  suggestLoadSize,
  toFeet,
  toLb,
  toMiles,
  truckFit,
  type DistanceUnit,
  type FitResult,
  type LoadMeasures,
  type LoadSize,
  type QuoteRates,
  type QuoteWeightUnit,
  type TruckType,
} from '@/types/quoteRates';

/**
 * The quote calculator: lane, load, truck, then what to charge, what to pay the
 * driver and what is left for us.
 *
 * Ordered the way the Google Sheet it replaces was used, top to bottom, but
 * every figure follows the ones above it as they are typed — there is no
 * "Calculate" button and no "Clear" button that has to be pressed first. A
 * figure the broker types over (the price, the driver's pay, the uShip total)
 * stops following and stays as typed until they press "Use estimate" again,
 * because a number that moves under somebody who has already quoted it is
 * worse than one that does not update.
 *
 * Nothing here is saved. It is a scratch pad; what reaches an order is what
 * "Apply to order" writes into the order form, which the broker then saves.
 */

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400';
const SELECT =
  'border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export interface QuotePrefill {
  miles?: number | null;
  /** Where `miles` came from, to say so beside the box. */
  milesNote?: string;
  lengthFt?: number | null;
  widthFt?: number | null;
  heightFt?: number | null;
  weightLb?: number | null;
  /** What the order is already priced at, if anything. */
  customerPrice?: number | null;
  driverPay?: number | null;
}

export interface QuoteApplied {
  agreedRate: number;
  brokerFee: number;
}

interface Props {
  prefill?: QuotePrefill;
  /** Present when opened from an order form: writes the price and fee into it. */
  onApply?: (result: QuoteApplied) => void;
}

/** A number from a text box, or null for blank or nonsense. */
function parse(v: string): number | null {
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Prefilled figures are shown without a trail of float noise. */
const show = (n: number | null | undefined) => (n && n > 0 ? String(round2(n)) : '');
const zipOf = (zip: string): Address => ({ street: '', city: '', state: '', zip: zip.trim(), country: 'US' });
const ZIP_RE = /^\d{5}$/;

const POSITIONS = [
  { label: 'Low', value: 0 },
  { label: 'Mid', value: 0.5 },
  { label: 'High', value: 1 },
];

export default function QuoteCalculator({ prefill, onApply }: Props) {
  const { can } = useAuth();
  const { formatCalendarDate } = useDateFormatters();

  // ── The rate card ────────────────────────────────────────────────────────
  const [rates, setRates] = useState<QuoteRates>(DEFAULT_QUOTE_RATES);
  const [ratesNote, setRatesNote] = useState<'loading' | 'ok' | 'default' | 'failed'>('loading');
  useEffect(() => {
    getQuoteRatesOrDefaults().then((res) => {
      setRates(res.rates);
      setRatesNote(res.failed ? 'failed' : res.isDefault ? 'default' : 'ok');
    });
  }, []);

  // ── Lane ─────────────────────────────────────────────────────────────────
  const [distanceMode, setDistanceMode] = useState<'zip' | 'typed'>(prefill?.miles ? 'typed' : 'zip');
  const [originZip, setOriginZip] = useState('');
  const [destZip, setDestZip] = useState('');
  const [lookup, setLookup] = useState<DistanceResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [typedDistance, setTypedDistance] = useState(show(prefill?.miles));
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('mi');

  const zipsReady = ZIP_RE.test(originZip.trim()) && ZIP_RE.test(destZip.trim());

  async function runLookup(manual: boolean) {
    setLooking(true);
    setLookup(await fetchLaneDistance(zipOf(originZip), zipOf(destZip), manual));
    setLooking(false);
  }

  // Looked up as the second ZIP is finished, never on a keystroke before then.
  // Not `manual`: under Google Routes an unseen lane answers `needs_lookup`
  // and waits for the button, so typing can never run up a bill.
  const lookupSeq = useRef(0);
  useEffect(() => {
    if (distanceMode !== 'zip' || !zipsReady) { setLookup(null); return; }
    const seq = ++lookupSeq.current;
    const t = setTimeout(async () => {
      setLooking(true);
      const result = await fetchLaneDistance(zipOf(originZip), zipOf(destZip), false);
      if (seq === lookupSeq.current) { setLookup(result); setLooking(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [distanceMode, originZip, destZip, zipsReady]);

  const miles = distanceMode === 'zip'
    ? (lookup?.status === 'ok' ? lookup.miles : 0)
    : toMiles(parse(typedDistance) ?? 0, distanceUnit);
  const milesAreEstimate = distanceMode === 'zip' && lookup?.status === 'ok' && lookup.source === 'estimate';

  // ── Load ─────────────────────────────────────────────────────────────────
  const [length, setLength] = useState(show(prefill?.lengthFt));
  const [width, setWidth] = useState(show(prefill?.widthFt));
  const [height, setHeight] = useState(show(prefill?.heightFt));
  const [dimUnit, setDimUnit] = useState<DimensionUnit>('ft');
  const [weight, setWeight] = useState(show(prefill?.weightLb));
  const [weightUnit, setWeightUnit] = useState<QuoteWeightUnit>('lb');

  const load: LoadMeasures = {
    lengthFt: parse(length) !== null ? toFeet(parse(length)!, dimUnit) : null,
    widthFt:  parse(width)  !== null ? toFeet(parse(width)!, dimUnit) : null,
    heightFt: parse(height) !== null ? toFeet(parse(height)!, dimUnit) : null,
    weightLb: parse(weight) !== null ? toLb(parse(weight)!, weightUnit) : null,
  };
  const anyLoad = Object.values(load).some((v) => v !== null && v > 0);

  // ── Truck and size ───────────────────────────────────────────────────────
  const [truckId, setTruckId] = useState<string>('');
  const [chosenSize, setChosenSize] = useState<LoadSize | null>(null);
  const [position, setPosition] = useState(0.5);
  const [hours, setHours] = useState('');

  const truck: TruckType | null = rates.trucks.find((t) => t.id === truckId) ?? null;
  // Ten trucks, four comparisons each — cheaper to redo than to memoise.
  const fits = new Map(rates.trucks.map((t) => [t.id, truckFit(t, load)]));
  const suggestedSize = truck ? suggestLoadSize(fits.get(truck.id)?.share ?? null) : null;
  const size: LoadSize = chosenSize ?? suggestedSize ?? 'tl';
  const nothingFits = anyLoad && rates.trucks.every((t) => fits.get(t.id)?.overall !== 'fits');

  // ── Price ────────────────────────────────────────────────────────────────
  const estimate = truck ? estimatePrice(truck, { miles, hours: parse(hours) ?? 0, size, position }) : null;
  const estimated = estimate && !estimate.missing ? round2(estimate.price) : null;

  // null = follow the estimate. Set from an order already priced, since that
  // is the figure the broker came here to check, not one to be replaced.
  const [priceTyped, setPriceTyped] = useState<string | null>(show(prefill?.customerPrice) || null);
  const [driverTyped, setDriverTyped] = useState(show(prefill?.driverPay));
  const customerPrice = priceTyped !== null ? (parse(priceTyped) ?? 0) : (estimated ?? 0);
  const driverPay = parse(driverTyped) ?? 0;
  const brokerFee = round2(customerPrice - driverPay);
  const margin = customerPrice > 0 ? brokerFee / customerPrice : null;

  const market = truck ? marketRateFor(truck, rates.market) : null;
  const marketPay = market && miles > 0 ? round2(market * miles) : null;
  const driverPpm = driverPay > 0 && miles > 0 ? driverPay / miles : null;
  const target = rates.targetBrokerFee;

  // ── uShip ────────────────────────────────────────────────────────────────
  const [ushipTyped, setUshipTyped] = useState<string | null>(null);
  const [ushipFeeMode, setUshipFeeMode] = useState<'percent' | 'usd'>('percent');
  const [ushipFeeTyped, setUshipFeeTyped] = useState<string | null>(null);
  const ushipTotal = ushipTyped !== null ? (parse(ushipTyped) ?? 0) : customerPrice;
  const ushipFeeInput = ushipFeeTyped ?? (rates.ushipFeePercent !== null && ushipFeeMode === 'percent' ? String(rates.ushipFeePercent) : '');
  const ushipFee = ushipFeeMode === 'percent'
    ? round2(ushipTotal * ((parse(ushipFeeInput) ?? 0) / 100))
    : (parse(ushipFeeInput) ?? 0);
  const ushipBrokerFee = round2(ushipTotal - ushipFee - driverPay);

  const [channel, setChannel] = useState<'direct' | 'uship'>('direct');

  // ── Output ───────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState<'' | 'client' | 'internal'>('');
  const [applied, setApplied] = useState(false);

  const laneText = miles > 0
    ? `${Math.round(miles).toLocaleString('en-US')} miles${milesAreEstimate ? ' (estimated)' : ''}`
    : '';
  const lanePlaces = distanceMode === 'zip' && zipsReady ? `${originZip.trim()} to ${destZip.trim()}` : '';
  const dimsText = [load.lengthFt, load.widthFt, load.heightFt].some((v) => v)
    ? `${[load.lengthFt, load.widthFt, load.heightFt].map((v) => (v ? v.toFixed(1) : '—')).join(' × ')} ft`
    : '';
  const weightText = load.weightLb ? `${Math.round(load.weightLb).toLocaleString('en-US')} lbs` : '';

  function clientText() {
    return [
      'Quote — Total Transport Logistics',
      truck ? `Equipment: ${truck.name}${truck.pricing === 'perMile' ? ` (${LOAD_SIZE_LABEL[size].toLowerCase()})` : ''}` : '',
      lanePlaces ? `Lane: ${lanePlaces}` : '',
      laneText ? `Distance: ${laneText}` : '',
      dimsText || weightText ? `Freight: ${[dimsText, weightText].filter(Boolean).join(', ')}` : '',
      `Price: ${usd(channel === 'uship' ? ushipTotal : customerPrice)}`,
    ].filter(Boolean).join('\n');
  }

  function internalText() {
    const fee = channel === 'uship' ? ushipBrokerFee : brokerFee;
    return [
      clientText(),
      estimate && !estimate.missing ? `Basis: ${estimate.basis}` : '',
      `Driver pay: ${usd(driverPay)}${driverPpm ? ` (${usd(driverPpm)}/mi)` : ''}`,
      channel === 'uship' ? `uShip fee: ${usd(ushipFee)}` : '',
      `Broker fee: ${usd(fee)}`,
    ].filter(Boolean).join('\n');
  }

  async function copy(kind: 'client' | 'internal') {
    if (await copyToClipboard(kind === 'client' ? clientText() : internalText())) {
      setCopied(kind);
      setTimeout(() => setCopied(''), 1800);
    }
  }

  function apply() {
    if (!onApply) return;
    // On uShip the order's Agreed Rate is what the client paid uShip, and the
    // broker fee is everything that is not the driver's, uShip's cut included —
    // so Carrier Pay, which the order works out as the difference, still comes
    // out as the driver's pay. uShip's cut is ours to pay out of the fee.
    const agreedRate = round2(channel === 'uship' ? ushipTotal : customerPrice);
    onApply({ agreedRate, brokerFee: round2(agreedRate - driverPay) });
    setApplied(true);
  }

  const canEditRates = can('quoteRates.manage') || can('settings.manage');

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      {/* ── Left: what is being moved, and on what ── */}
      <div className="space-y-6 min-w-0">
        {ratesNote !== 'ok' && ratesNote !== 'loading' && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>
              {ratesNote === 'failed'
                ? 'The saved rates could not be loaded, so these are the built-in starting rates.'
                : 'Nobody has saved a rate card yet, so these are the built-in starting rates from the old Google Sheet.'}
              {canEditRates && (
                <> <Link href="/dashboard/settings/operations#quote-rates" className="underline font-medium">Update them in Settings</Link>.</>
              )}
            </span>
          </p>
        )}

        {/* Lane */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">1 · Distance</h2>
            <Segmented
              value={distanceMode}
              onChange={setDistanceMode}
              options={[{ value: 'zip', label: 'From ZIP codes' }, { value: 'typed', label: 'Type it' }]}
            />
          </div>

          {distanceMode === 'zip' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Pickup ZIP</label>
                  <input value={originZip} onChange={(e) => setOriginZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    inputMode="numeric" placeholder="e.g. 77001" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Delivery ZIP</label>
                  <input value={destZip} onChange={(e) => setDestZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    inputMode="numeric" placeholder="e.g. 30301" className={INPUT} />
                </div>
              </div>
              <LookupStatus result={lookup} looking={looking} ready={zipsReady}
                onManual={() => void runLookup(true)} onTypeInstead={() => setDistanceMode('typed')} />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={typedDistance} onChange={(e) => setTypedDistance(e.target.value)}
                  inputMode="decimal" placeholder="Distance" className={INPUT} />
                <select value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value as DistanceUnit)} className={SELECT}>
                  {DISTANCE_UNITS.map((u) => <option key={u} value={u}>{DISTANCE_UNIT_LABEL[u]}</option>)}
                </select>
              </div>
              {prefill?.milesNote && typedDistance === show(prefill.miles) && (
                <p className="text-xs text-gray-500">{prefill.milesNote}</p>
              )}
              {distanceUnit !== 'mi' && miles > 0 && (
                <p className="text-xs text-gray-500">= {Math.round(miles).toLocaleString('en-US')} miles</p>
              )}
            </div>
          )}
        </section>

        {/* Load */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">2 · Freight</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumberBox label="Length" value={length} onChange={setLength} />
            <NumberBox label="Width" value={width} onChange={setWidth} />
            <NumberBox label="Height" value={height} onChange={setHeight} />
            <div>
              <label className={LABEL}>Unit</label>
              <select value={dimUnit} onChange={(e) => setDimUnit(e.target.value as DimensionUnit)} className={`${SELECT} w-full`}>
                {DIMENSION_UNITS.map((u) => <option key={u} value={u}>{({ in: 'inches', ft: 'feet', cm: 'cm', m: 'meters' } as const)[u]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-1 sm:col-span-3">
              <NumberBox label="Weight" value={weight} onChange={setWeight} />
            </div>
            <div>
              <label className={LABEL}>Unit</label>
              <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value as QuoteWeightUnit)} className={`${SELECT} w-full`}>
                {QUOTE_WEIGHT_UNITS.map((u) => <option key={u} value={u}>{QUOTE_WEIGHT_UNIT_LABEL[u]}</option>)}
              </select>
            </div>
          </div>
          {(dimsText || weightText) && (dimUnit !== 'ft' || weightUnit !== 'lb') && (
            <p className="text-xs text-gray-500">= {[dimsText, weightText].filter(Boolean).join(' · ')}</p>
          )}
        </section>

        {/* Trucks */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">3 · Truck</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {anyLoad ? 'Each truck checked against the freight above. Pick one to price it.' : 'Pick a truck to price it. Enter the freight to see which ones it fits.'}
              </p>
            </div>
            <div>
              <Segmented
                value={size}
                onChange={(s) => setChosenSize(s)}
                options={LOAD_SIZES.map((s) => ({ value: s, label: LOAD_SIZE_SHORT[s], title: LOAD_SIZE_LABEL[s] }))}
              />
              <p className="text-[11px] text-gray-500 mt-1 text-right">
                {LOAD_SIZE_LABEL[size]}
                {suggestedSize && chosenSize === null && ' · suggested'}
                {suggestedSize && chosenSize !== null && chosenSize !== suggestedSize && (
                  <> · <button type="button" onClick={() => setChosenSize(null)} className="text-brand-600 hover:underline">
                    suggest {LOAD_SIZE_SHORT[suggestedSize]}
                  </button></>
                )}
              </p>
            </div>
          </div>

          {nothingFits && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              No truck on the rate card takes this freight as entered. It may need an oversize permit or a specialised trailer.
            </p>
          )}

          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-2 font-medium">Truck</th>
                  <th className="py-2 px-2 font-medium">Rate ({LOAD_SIZE_SHORT[size]})</th>
                  <th className="py-2 px-1 font-medium text-center">Length</th>
                  <th className="py-2 px-1 font-medium text-center">Width</th>
                  <th className="py-2 px-1 font-medium text-center">Height</th>
                  <th className="py-2 px-1 font-medium text-center">Weight</th>
                </tr>
              </thead>
              <tbody>
                {rates.trucks.map((t) => {
                  const fit = fits.get(t.id)!;
                  const selected = t.id === truckId;
                  const offered = t.pricing !== 'perMile' || t.perMile[size] !== null;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setTruckId(t.id)}
                      title={[t.notes, limitsText(t)].filter(Boolean).join('\n')}
                      className={`cursor-pointer border-b border-gray-100 last:border-0 transition ${
                        selected ? 'bg-brand-50' : fit.overall === 'over' ? 'opacity-60 hover:opacity-100 hover:bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300'
                          }`}>
                            {selected && <Check className="w-3 h-3" />}
                          </span>
                          <span className="font-semibold text-gray-900">{t.name}</span>
                          <span className="text-[11px] text-gray-500">{t.code}</span>
                        </div>
                      </td>
                      <td className={`py-2 px-2 whitespace-nowrap ${offered ? 'text-gray-700' : 'text-gray-400'}`}>
                        {rateSummary(t, size)}
                      </td>
                      <FitCell result={fit.length} />
                      <FitCell result={fit.width} />
                      <FitCell result={fit.height} />
                      <FitCell result={fit.weight} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {truck && (truck.notes || truck.limits) && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600 space-y-0.5">
              <p className="font-semibold text-gray-800">{truck.name}</p>
              {truck.limits && <p>Takes up to {limitsText(truck)}.</p>}
              {truck.notes && <p>{truck.notes}</p>}
            </div>
          )}
        </section>
      </div>

      {/* ── Right: the money ── */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">4 · Price</h2>

          {!truck ? (
            <p className="text-sm text-gray-500">Pick a truck to see an estimate.</p>
          ) : (
            <>
              {truck.pricing === 'hourly' && (
                <NumberBox label="Hours" value={hours} onChange={setHours} placeholder="How long the job takes" />
              )}

              {estimate?.missing ? (
                <p className="text-sm text-gray-500">{estimate.missing}</p>
              ) : estimate && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Estimated price · {truck.name}</p>
                    <p className="text-3xl font-bold text-gray-900 tabular-nums">{usd(estimate.price)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{estimate.basis}</p>
                  </div>
                  {estimate.high > estimate.low && (
                    <div>
                      <input type="range" min={0} max={1} step={0.05} value={position}
                        onChange={(e) => setPosition(Number(e.target.value))}
                        className="w-full accent-brand-600" aria-label="Where in the range to price" />
                      <div className="flex justify-between text-[11px] text-gray-500 tabular-nums">
                        <span>{usd(estimate.low)}</span>
                        <span className="flex gap-1">
                          {POSITIONS.map((p) => (
                            <button key={p.label} type="button" onClick={() => setPosition(p.value)}
                              className={`px-1.5 rounded ${position === p.value ? 'bg-brand-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
                              {p.label}
                            </button>
                          ))}
                        </span>
                        <span>{usd(estimate.high)}</span>
                      </div>
                    </div>
                  )}
                  {milesAreEstimate && (
                    <p className="text-[11px] text-gray-500">The miles are a ZIP-to-ZIP estimate, usually within about 5%.</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">5 · Driver and fee</h2>
            <Segmented value={channel} onChange={setChannel}
              options={[{ value: 'direct', label: 'Direct' }, { value: 'uship', label: 'uShip' }]} />
          </div>

          {channel === 'direct' ? (
            <FollowingMoney
              label="Price to the client"
              typed={priceTyped}
              onTyped={setPriceTyped}
              following={estimated}
              followingLabel="estimate"
            />
          ) : (
            <div className="space-y-3">
              <FollowingMoney
                label="Total in uShip"
                typed={ushipTyped}
                onTyped={setUshipTyped}
                following={customerPrice || null}
                followingLabel="direct price"
              />
              <div>
                <label className={LABEL}>uShip fee</label>
                <div className="flex gap-2">
                  {ushipFeeMode === 'usd' ? (
                    <MoneyInput value={ushipFeeInput} onChange={(v) => setUshipFeeTyped(v)} placeholder="0.00" className={INPUT} />
                  ) : (
                    <input value={ushipFeeInput} onChange={(e) => setUshipFeeTyped(e.target.value)}
                      inputMode="decimal" placeholder="e.g. 15" className={INPUT} />
                  )}
                  <Segmented value={ushipFeeMode}
                    onChange={(m) => { setUshipFeeMode(m); setUshipFeeTyped(null); }}
                    options={[{ value: 'percent', label: '%' }, { value: 'usd', label: '$' }]} />
                </div>
                {ushipFeeMode === 'percent' && ushipFee > 0 && (
                  <p className="text-[11px] text-gray-500 mt-1">= {usd(ushipFee)}</p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className={LABEL}>Driver pay</label>
            <MoneyInput value={driverTyped} onChange={setDriverTyped} placeholder="0.00" className={INPUT} />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {marketPay !== null && (
                <Chip onClick={() => setDriverTyped(String(marketPay))}>
                  Market {usd(marketPay)}
                </Chip>
              )}
              {customerPrice > target && (
                <Chip onClick={() => setDriverTyped(String(round2((channel === 'uship' ? ushipTotal - ushipFee : customerPrice) - target)))}>
                  Leave {usd(target)} fee
                </Chip>
              )}
            </div>
          </div>

          <FeeSummary
            fee={channel === 'uship' ? ushipBrokerFee : brokerFee}
            margin={channel === 'uship'
              ? (ushipTotal > 0 ? ushipBrokerFee / ushipTotal : null)
              : margin}
            target={target}
            hasDriver={driverPay > 0}
            hasPrice={(channel === 'uship' ? ushipTotal : customerPrice) > 0}
          />

          {channel === 'direct' && driverPay > 0 && customerPrice > 0 && driverPay + target > customerPrice && (
            <button type="button" onClick={() => setPriceTyped(String(round2(driverPay + target)))}
              className="text-xs text-brand-600 hover:underline">
              Price at driver pay + {usd(target)} = {usd(driverPay + target)}
            </button>
          )}

          {driverPpm !== null && (
            <MarketCheck driverPpm={driverPpm} market={market} truck={truck} rates={rates} formatCalendarDate={formatCalendarDate} />
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
          {onApply && (
            <button type="button" onClick={apply}
              disabled={!(channel === 'uship' ? ushipTotal : customerPrice)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {applied ? <Check className="w-4 h-4" /> : null}
              {applied ? 'Applied — apply again' : 'Apply to order'}
            </button>
          )}
          {onApply && (
            <p className="text-[11px] text-gray-500">
              Sets the order&apos;s Agreed Rate to {usd(channel === 'uship' ? ushipTotal : customerPrice)} and its Broker Fee
              to {usd((channel === 'uship' ? ushipTotal : customerPrice) - driverPay)}, so Carrier Pay
              is {usd(driverPay)}.{channel === 'uship' && ' uShip’s fee comes out of the broker fee.'} Nothing is saved until you save the order.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void copy('client')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
              {copied === 'client' ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
              Copy for client
            </button>
            <button type="button" onClick={() => void copy('internal')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
              {copied === 'internal' ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
              Copy with costs
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            &ldquo;Copy for client&rdquo; leaves out the driver&apos;s pay and our fee.
          </p>
        </section>
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function limitsText(t: TruckType): string {
  const l = t.limits;
  if (!l) return '';
  const parts = [
    l.lengthFt ? `${l.lengthFt} ft long` : '',
    l.widthFt ? `${l.widthFt} ft wide` : '',
    l.heightFt ? `${l.heightFt} ft high` : '',
    l.weightLb ? `${l.weightLb.toLocaleString('en-US')} lbs` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

function NumberBox({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        inputMode="decimal" placeholder={placeholder ?? '0'} className={INPUT} />
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-gray-300 overflow-hidden">
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title} onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-medium transition ${
            value === o.value ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-full border border-gray-300 px-2.5 py-0.5 text-[11px] text-gray-700 hover:border-brand-400 hover:text-brand-700">
      {children}
    </button>
  );
}

function FitCell({ result }: { result: FitResult }) {
  return (
    <td className="py-2 px-1 text-center">
      {result === 'fits' && <CheckCircle2 className="inline w-4 h-4 text-green-600" aria-label="Fits" />}
      {result === 'over' && <XCircle className="inline w-4 h-4 text-red-600" aria-label="Too big" />}
      {result === 'unchecked' && <Minus className="inline w-4 h-4 text-gray-300" aria-label="Not checked" />}
    </td>
  );
}

/**
 * A money box that shows a computed figure until somebody types over it, then
 * keeps what they typed. "Use estimate" hands it back to the computation.
 */
function FollowingMoney({ label, typed, onTyped, following, followingLabel }: {
  label: string;
  typed: string | null;
  onTyped: (v: string | null) => void;
  following: number | null;
  followingLabel: string;
}) {
  const value = typed ?? (following !== null ? String(following) : '');
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className={LABEL}>{label}</label>
        {typed !== null && following !== null && (
          <button type="button" onClick={() => onTyped(null)} className="text-[11px] text-brand-600 hover:underline">
            Use {followingLabel} ({usd(following)})
          </button>
        )}
      </div>
      <MoneyInput value={value} onChange={(v) => onTyped(v)} placeholder="0.00" className={INPUT} />
    </div>
  );
}

function FeeSummary({ fee, margin, target, hasDriver, hasPrice }: {
  fee: number; margin: number | null; target: number; hasDriver: boolean; hasPrice: boolean;
}) {
  if (!hasPrice || !hasDriver) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Enter the price and the driver&apos;s pay to see the broker fee.
      </div>
    );
  }
  const tone = fee < 0
    ? 'border-red-200 bg-red-50 text-red-800'
    : target > 0 && fee < target
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-green-200 bg-green-50 text-green-800';
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">Broker fee</span>
        <span className="text-xl font-bold tabular-nums">{usd(fee)}</span>
      </div>
      <p className="text-[11px] mt-0.5">
        {margin !== null && `${(margin * 100).toFixed(1)}% of the price. `}
        {fee < 0 ? 'The driver costs more than the client pays.' : target > 0 && fee < target ? `Under the ${usd(target)} target.` : target > 0 ? `At or above the ${usd(target)} target.` : ''}
      </p>
    </div>
  );
}

/**
 * The driver's pay per mile against DAT's national average for the nearest
 * equipment. Said as a comparison, never as a verdict: a national figure knows
 * nothing about this lane, and a hot Texas-to-Georgia lane in produce season
 * should be well above it.
 */
function MarketCheck({ driverPpm, market, truck, rates, formatCalendarDate }: {
  driverPpm: number;
  market: number | null;
  truck: TruckType | null;
  rates: QuoteRates;
  formatCalendarDate: (value: string | null | undefined) => string;
}) {
  if (!truck) return null;
  if (market === null) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
        Driver pay is {usd(driverPpm)}/mi. There is no market figure for {truck.name.toLowerCase()} to compare it with.
      </p>
    );
  }
  const diff = (driverPpm - market) / market;
  const asOf = formatCalendarDate(rates.market.asOf);
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-gray-600" title={rates.market.source}>
      <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span>
        Driver pay is {usd(driverPpm)}/mi —{' '}
        <span className="font-medium">{Math.abs(diff * 100).toFixed(0)}% {diff >= 0 ? 'above' : 'below'}</span>{' '}
        the national {truck.market ? MARKET_EQUIPMENT_LABEL[truck.market].toLowerCase() : ''} average of {usd(market)}/mi
        {asOf && ` (as of ${asOf})`}. A national figure, not this lane&apos;s.
      </span>
    </p>
  );
}

function LookupStatus({ result, looking, ready, onManual, onTypeInstead }: {
  result: DistanceResult | null;
  looking: boolean;
  ready: boolean;
  onManual: () => void;
  onTypeInstead: () => void;
}) {
  if (!ready) return <p className="text-xs text-gray-500">Enter two 5-digit US ZIP codes, or type the distance instead.</p>;
  if (looking) return <p className="flex items-center gap-1.5 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />Working out the distance…</p>;
  if (!result) return null;

  switch (result.status) {
    case 'ok':
      return (
        <p className="flex items-center gap-1.5 text-sm text-gray-800">
          <MapPin className="w-4 h-4 text-brand-600" />
          <span className="font-semibold">{Math.round(result.miles).toLocaleString('en-US')} miles</span>
          <span className="text-xs text-gray-500">
            {result.source === 'routes' ? 'road miles from Google' : 'estimated from the ZIP codes'}
          </span>
        </p>
      );
    case 'needs_lookup':
      return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span>This lane has not been looked up before. Google charges for each new lane.</span>
          <button type="button" onClick={onManual} className="rounded border border-brand-300 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-50">
            Look up with Google
          </button>
        </div>
      );
    case 'disabled':
      return (
        <p className="text-xs text-gray-600">
          Lane distances are switched off in Settings.{' '}
          <button type="button" onClick={onTypeInstead} className="text-brand-600 hover:underline">Type the distance</button>.
        </p>
      );
    case 'unknown_zip':
      return <p className="flex items-center gap-1.5 text-xs text-red-700"><X className="w-3.5 h-3.5" />ZIP {result.zip} was not recognised.</p>;
    case 'need_zip':
      return null;
    case 'error':
      return <p className="flex items-center gap-1.5 text-xs text-red-700"><X className="w-3.5 h-3.5" />{result.message}</p>;
  }
}
