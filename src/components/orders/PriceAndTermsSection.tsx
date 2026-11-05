'use client';

import { useEffect, useState } from 'react';
import MoneyInput from '@/components/MoneyInput';
import PaymentTermsField from '@/components/orders/PaymentTermsField';
import QuoteCalculatorDialog, { quotePrefillFromItems } from '@/components/quotes/QuoteCalculatorDialog';
import { getAppSettingsOrDefaults } from '@/lib/appSettings';
import {
  COMPLEX_LEGS,
  COMPLEX_LEG_LABEL,
  blankComplexTerms,
  feeBase,
  perMile,
  remainingBrokerFee,
  remainingCarrierPay,
  usd,
} from '@/types/paymentMethod';
import type { ComplexTerms, OrderPaymentTerms, PaymentMethod, PaymentSide } from '@/types/paymentMethod';
import {
  ACCESSORIAL_LABEL,
  MAX_SERVICE_CHARGES,
  OTHER_CHARGE_SUGGESTIONS,
  SERVICE_ARRANGERS,
  SERVICE_ARRANGER_LABEL,
  isServiceArranger,
  cleanServiceCharges,
  isPaidService,
  serviceChargesTotal,
} from '@/types/order';
import type { Accessorial, CommodityItem, Order, ServiceArranger, ServiceCharge } from '@/types/order';
import { Plus, X } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/** A charge typed by hand, while it is being edited — the label may still be blank. */
interface OtherCharge { label: string; amount: number | null; arrangedBy: ServiceArranger | null }

/** Everything in Price and Terms except the three money boxes the form already had. */
export interface PriceTerms {
  clientPayment: OrderPaymentTerms | null;
  carrierPayment: OrderPaymentTerms | null;
  brokerFeeTerms: OrderPaymentTerms | null;
  specialTerms: string;
  complexTerms: ComplexTerms;
  /**
   * The cost typed for each paid service, kept even while its box is
   * unticked, so unticking and re-ticking in one sitting does not lose the
   * figure. Only ticked ones are saved — see priceTermsForSave().
   */
  serviceCosts: Partial<Record<Accessorial, number | null>>;
  /** Who arranges each paid service — kept the same way as the costs. */
  serviceArrangers: Partial<Record<Accessorial, ServiceArranger | null>>;
  otherCharges: OtherCharge[];
}

export function blankPriceTerms(): PriceTerms {
  return {
    clientPayment: null,
    carrierPayment: null,
    brokerFeeTerms: null,
    specialTerms: '',
    complexTerms: blankComplexTerms(),
    serviceCosts: {},
    serviceArrangers: {},
    otherCharges: [],
  };
}

export function priceTermsFromOrder(o: Partial<Order>): PriceTerms {
  const charges = cleanServiceCharges(o.serviceCharges);
  const serviceCosts: PriceTerms['serviceCosts'] = {};
  const serviceArrangers: PriceTerms['serviceArrangers'] = {};
  for (const c of charges) {
    if (c.service === 'other') continue;
    serviceCosts[c.service] = c.amount;
    serviceArrangers[c.service] = c.arrangedBy ?? null;
  }
  return {
    clientPayment: o.clientPayment ?? null,
    carrierPayment: o.carrierPayment ?? null,
    brokerFeeTerms: o.brokerFeeTerms ?? null,
    specialTerms: o.specialTerms ?? '',
    complexTerms: { ...blankComplexTerms(), ...(o.complexTerms ?? {}) },
    serviceCosts,
    serviceArrangers,
    otherCharges: charges.filter((c) => c.service === 'other')
      .map((c) => ({ label: c.label ?? '', amount: c.amount, arrangedBy: c.arrangedBy ?? null })),
  };
}

/**
 * The fields written to the order. Complex terms replace the two terms
 * dropdowns, as in BATS, so whichever set is not in use is saved as null —
 * otherwise the record would show a "COD - Cash" nobody chose alongside a
 * leg-by-leg breakdown that contradicts it.
 *
 * `accessorials` is what is ticked as the save goes out — on the order on
 * file when only this section is being saved — so a service no longer ticked
 * takes its cost with it. Paid services go in catalog order, then the typed
 * ones, so a save never reads as a change for the order alone.
 */
export function priceTermsForSave(t: PriceTerms, accessorials: readonly Accessorial[]): Pick<Order,
  'clientPayment' | 'carrierPayment' | 'brokerFeeTerms' | 'specialTerms' | 'complexTerms' | 'serviceCharges'> {
  const complex = t.complexTerms.enabled;
  // A client-arranged service is always $0, whatever is left in its box.
  const priced = (by: ServiceArranger | null | undefined, amount: number | null | undefined) =>
    by === 'client' ? 0 : amount ?? null;
  const serviceCharges: ServiceCharge[] = [
    ...accessorials.filter((a) => isPaidService(a) && (t.serviceCosts[a] != null || t.serviceArrangers[a]))
      .map((a): ServiceCharge => ({
        service: a,
        amount: priced(t.serviceArrangers[a], t.serviceCosts[a]),
        arrangedBy: t.serviceArrangers[a] ?? null,
      })),
    ...t.otherCharges.filter((c) => c.label.trim())
      .map((c): ServiceCharge => ({
        service: 'other', label: c.label.trim(), amount: priced(c.arrangedBy, c.amount), arrangedBy: c.arrangedBy,
      })),
  ];
  return {
    clientPayment: t.clientPayment,
    carrierPayment: complex ? null : t.carrierPayment,
    brokerFeeTerms: complex ? null : t.brokerFeeTerms,
    specialTerms: t.specialTerms.trim(),
    complexTerms: complex ? t.complexTerms : null,
    serviceCharges,
  };
}

/**
 * Why the form cannot be saved as it stands, or ''. Every additional service
 * must say who arranges it — the SA and the Dispatch Sheet print it beside
 * the service — and a line added by hand must have a name.
 */
export function priceTermsProblem(t: PriceTerms, accessorials: readonly Accessorial[]): string {
  if (t.otherCharges.some((c) => !c.label.trim() && (c.amount != null || c.arrangedBy))) {
    return 'Name the service for every charge added by hand in Price and Terms, or remove the line.';
  }
  const unsaid = [
    ...accessorials.filter((a) => isPaidService(a) && !t.serviceArrangers[a]).map((a) => ACCESSORIAL_LABEL[a]),
    ...t.otherCharges.filter((c) => c.label.trim() && !c.arrangedBy).map((c) => c.label.trim()),
  ];
  return unsaid.length
    ? `Choose who arranges ${unsaid.join(', ')} in Price and Terms → Additional Services — the carrier, the client or TTL.`
    : '';
}

/** A blank box is "nothing on this leg", kept as null rather than a false 0. */
function money(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The additional services as they will be saved, added up. */
export function servicesTotalOf(t: PriceTerms, accessorials: readonly Accessorial[]): number {
  return serviceChargesTotal(priceTermsForSave(t, accessorials).serviceCharges ?? []);
}

/**
 * What the client pays: carrier pay + broker fee + additional services
 * (2026-11-04). The single definition, used by both order forms for what
 * they save and by this section for what it shows. Before this the Agreed
 * Rate was typed and carrier pay was worked out from it.
 */
export function agreedRateFrom(
  t: PriceTerms, accessorials: readonly Accessorial[], brokerFee: string, carrierPay: string,
): number {
  return round2((parseFloat(carrierPay) || 0) + (parseFloat(brokerFee) || 0) + servicesTotalOf(t, accessorials));
}

interface Props {
  brokerFee: string;
  onBrokerFee: (v: string) => void;
  carrierPay: string;
  onCarrierPay: (v: string) => void;
  /**
   * The Agreed Rate on file, on the edit form. When it does not equal the
   * sum — a BATS import stored all three figures separately, and they need
   * not add up — the form says so before a save rewrites it.
   */
  storedAgreedRate?: number | null;
  laneMiles: number | null;
  terms: PriceTerms;
  onTerms: (t: PriceTerms) => void;
  /**
   * The order's freight lines, so the quote calculator opens on the load's
   * size and weight. Optional: without them it opens on the miles alone.
   */
  commodities?: readonly CommodityItem[];
  /** What is ticked in Freight — each paid service among them gets a cost line here. */
  accessorials: readonly Accessorial[];
}

/**
 * BATS's "Price and Terms" block, shared by the new and edit order forms.
 *
 * BATS's "Total Tariff" is this app's Agreed Rate, and the name is kept: it is
 * what the invoice, the client's confirmation and every list already call it.
 * It is worked out — carrier pay, broker fee and additional services, added
 * up (agreedRateFrom()) — and carrier pay is typed.
 */
export default function PriceAndTermsSection({
  brokerFee, onBrokerFee, carrierPay, onCarrierPay, storedAgreedRate,
  laneMiles, terms, onTerms, commodities, accessorials,
}: Props) {
  const [methods, setMethods] = useState<Record<PaymentSide, PaymentMethod[]>>({
    client: [], carrier: [], brokerFee: [],
  });

  // Defaults on failure: the order still saves without any terms, and a broker
  // should not be kept from booking a load by a settings hiccup.
  useEffect(() => {
    getAppSettingsOrDefaults().then(({ settings }) => setMethods({
      client: settings.clientPaymentMethods,
      carrier: settings.carrierPaymentMethods,
      brokerFee: settings.brokerFeeTermOptions,
    }));
  }, []);

  const fee = parseFloat(brokerFee) || 0;
  const pay = parseFloat(carrierPay) || 0;
  const services = servicesTotalOf(terms, accessorials);
  const rate = agreedRateFrom(terms, accessorials, brokerFee, carrierPay);
  const mismatch = storedAgreedRate != null && storedAgreedRate > 0 && Math.abs(storedAgreedRate - rate) >= 0.005;
  const bases = { agreedRate: rate, carrierPay: pay, brokerFee: fee };
  const complex = terms.complexTerms;

  const set = (patch: Partial<PriceTerms>) => onTerms({ ...terms, ...patch });
  const setComplex = (patch: Partial<ComplexTerms>) => set({ complexTerms: { ...complex, ...patch } });

  const ppm = perMile(rate, laneMiles);
  const payPpm = perMile(pay, laneMiles);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 data-es className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Price and Terms</h2>
          <p className="text-xs text-gray-500 mt-1">
            Total mileage: {laneMiles ? Math.round(laneMiles).toLocaleString() : '—'}
            {' · '}Total PPM: {ppm !== null ? usd(ppm) : '—'}
            {' · '}Carrier pay PPM: {payPpm !== null ? usd(payPpm) : '—'}
          </p>
        </div>
        {/* Starts from the form as it stands when opened — the miles, the
            freight, and whatever price is already on it — so on an existing
            order it checks the current figures rather than replacing them. */}
        <QuoteCalculatorDialog
          prefill={() => ({
            miles: laneMiles,
            milesNote: laneMiles ? 'The mileage on this order.' : undefined,
            ...quotePrefillFromItems(commodities ?? []),
            // The calculator prices the move, so it is given (and gives back)
            // the move: carrier pay and fee, without the additional services.
            customerPrice: pay + fee > 0 ? pay + fee : null,
            driverPay: pay > 0 ? pay : null,
          })}
          onApply={(r) => {
            onBrokerFee(String(r.brokerFee));
            onCarrierPay(String(round2(Math.max(0, r.agreedRate - r.brokerFee))));
          }}
        />
      </div>

      {/* field-* ids are where the SA review's "Fix" links land — see
          fixTargets.ts. A missing Agreed Rate is fixed by typing what it is
          made of, so the link lands on this row and focuses Carrier Pay. */}
      <div id="field-agreedRate" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label data-es className="block text-xs font-medium text-gray-600 mb-1">Carrier Pay (USD)</label>
          <MoneyInput value={carrierPay} onChange={onCarrierPay}
            placeholder="0.00" className={INPUT} />
        </div>
        <div>
          <label data-es className="block text-xs font-medium text-gray-600 mb-1">Broker Fee (USD)</label>
          <MoneyInput value={brokerFee} onChange={onBrokerFee}
            placeholder="0.00" className={INPUT} />
        </div>
        <div>
          <label data-es className="block text-xs font-medium text-gray-600 mb-1">Agreed Rate (auto)</label>
          <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-900 font-semibold">
            {rate > 0 ? usd(rate) : '—'}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Carrier pay + broker fee{services > 0 ? ` + ${usd(services)} additional services` : ''}. What the client pays.
          </p>
        </div>
      </div>

      {mismatch && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The Agreed Rate on file is {usd(storedAgreedRate!)}, but carrier pay, broker fee and additional services
          add up to {usd(rate)}. Saving will make the Agreed Rate {usd(rate)}. If {usd(storedAgreedRate!)} is the
          price the client agreed, change Carrier Pay or Broker Fee until the total matches.
        </p>
      )}

      <ServiceChargesFields
        accessorials={accessorials}
        costs={terms.serviceCosts}
        onCosts={(serviceCosts) => set({ serviceCosts })}
        arrangers={terms.serviceArrangers}
        onArrangers={(serviceArrangers) => set({ serviceArrangers })}
        others={terms.otherCharges}
        onOthers={(otherCharges) => set({ otherCharges })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div id="field-clientPayment">
          <PaymentTermsField side="client" methods={methods.client}
            value={terms.clientPayment} onChange={(v) => set({ clientPayment: v })}
            base={feeBase('client', bases)} />
        </div>
        {!complex.enabled && (
          <>
            <PaymentTermsField side="carrier" methods={methods.carrier}
              value={terms.carrierPayment} onChange={(v) => set({ carrierPayment: v })}
              base={feeBase('carrier', bases)} />
            <PaymentTermsField side="brokerFee" methods={methods.brokerFee}
              value={terms.brokerFeeTerms} onChange={(v) => set({ brokerFeeTerms: v })}
              base={feeBase('brokerFee', bases)} />
          </>
        )}
      </div>

      <div>
        <label data-es className="block text-xs font-medium text-gray-600 mb-1">Special Terms</label>
        <textarea value={terms.specialTerms} onChange={(e) => set({ specialTerms: e.target.value })} rows={2}
          maxLength={2000} placeholder="Anything the dropdowns cannot say — a deposit arrangement, a payment deadline…"
          className={`${INPUT} resize-y`} />
      </div>

      <div className="flex items-center gap-3">
        <span data-es className="text-xs font-medium text-gray-600">Enable Complex Terms</span>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {[false, true].map((on) => (
            <button
              key={String(on)}
              type="button"
              onClick={() => setComplex({ enabled: on })}
              className={`px-4 py-1.5 text-sm font-medium transition ${
                complex.enabled === on ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {on ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </div>

      {complex.enabled && (
        <ComplexTermsFields terms={complex} onChange={setComplex} carrierPay={pay} brokerFee={fee} />
      )}
    </section>
  );
}

function ComplexTermsFields({ terms, onChange, carrierPay, brokerFee }: {
  terms: ComplexTerms;
  onChange: (patch: Partial<ComplexTerms>) => void;
  carrierPay: number;
  brokerFee: number;
}) {
  const leftCarrier = remainingCarrierPay(terms, carrierPay);
  const leftBroker = remainingBrokerFee(terms, brokerFee);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-4">
      <div>
        <p data-es className="text-sm font-semibold text-gray-800">Complex Payment Terms</p>
        <p className="text-xs text-gray-500 mt-0.5">
          <Bi>Who pays whom on this load. These replace the carrier pay terms and broker fee terms.
          Both remaining figures reach $0.00 once every dollar is accounted for.</Bi>
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Remaining label="Remaining Carrier Pay" amount={leftCarrier} />
        <Remaining label="Remaining Broker Fee" amount={leftBroker} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COMPLEX_LEGS.map((leg) => (
          <div key={leg}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{COMPLEX_LEG_LABEL[leg]}</label>
            <MoneyInput
              value={terms[leg] == null ? '' : String(terms[leg])}
              onChange={(v) => onChange({ [leg]: money(v) })}
              placeholder="0.00"
              className={INPUT}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Additional Services: a line per paid service ticked in Freight, plus any
 * typed by hand. Their total is one of the three parts the Agreed Rate is
 * added up from — see agreedRateFrom().
 */
function ServiceChargesFields({ accessorials, costs, onCosts, arrangers, onArrangers, others, onOthers }: {
  accessorials: readonly Accessorial[];
  costs: PriceTerms['serviceCosts'];
  onCosts: (c: PriceTerms['serviceCosts']) => void;
  arrangers: PriceTerms['serviceArrangers'];
  onArrangers: (a: PriceTerms['serviceArrangers']) => void;
  others: OtherCharge[];
  onOthers: (o: OtherCharge[]) => void;
}) {
  const paid = accessorials.filter(isPaidService);
  const lines = [
    ...paid.map((a) => ({ amount: arrangers[a] === 'client' ? 0 : costs[a] ?? null })),
    ...others.filter((o) => o.label.trim()).map((o) => ({ amount: o.arrangedBy === 'client' ? 0 : o.amount })),
  ];
  const total = serviceChargesTotal(lines);
  const setOther = (i: number, patch: Partial<OtherCharge>) =>
    onOthers(others.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const full = paid.length + others.length >= MAX_SERVICE_CHARGES;

  return (
    <div id="field-serviceCharges" className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-3">
      <div>
        <p data-es className="text-sm font-semibold text-gray-800">Additional Services</p>
        <p className="text-xs text-gray-500 mt-0.5">
          <Bi>What each service costs the client. Added to carrier pay and the broker fee to make the Agreed Rate. Tick
          a service under Freight → Additional Services and its line appears here; add anything rarer by hand. The
          client&apos;s SA and invoice list each service with its price; the Dispatch Sheet names them without
          prices. Say who arranges each one — the carrier, the client or TTL. One the client arranges costs
          $0, and the SA says &ldquo;Arranged by the client&rdquo; in place of a price.</Bi>
        </p>
      </div>

      {paid.length === 0 && others.length === 0 && (
        <p data-es className="text-xs text-gray-500 italic">No additional services on this load.</p>
      )}

      {paid.map((a) => (
        <div key={a} className={ROW}>
          <span className="text-sm text-gray-700">{ACCESSORIAL_LABEL[a]}</span>
          <ArrangerSelect value={arrangers[a] ?? null} onChange={(v) => onArrangers({ ...arrangers, [a]: v })} />
          <CostInput arrangedBy={arrangers[a] ?? null}
            value={costs[a] ?? null} onChange={(v) => onCosts({ ...costs, [a]: v })} />
          {/* No remove here: the line belongs to the tick box in Freight. */}
          <span />
        </div>
      ))}

      {others.map((o, i) => (
        <div key={i} className={ROW}>
          <input
            value={o.label}
            onChange={(e) => setOther(i, { label: e.target.value })}
            list="other-charge-suggestions"
            maxLength={80}
            placeholder="Service, e.g. Detention"
            aria-label="Service name"
            className={INPUT}
          />
          <ArrangerSelect value={o.arrangedBy} onChange={(v) => setOther(i, { arrangedBy: v })} />
          <CostInput arrangedBy={o.arrangedBy} value={o.amount} onChange={(v) => setOther(i, { amount: v })} />
          <button type="button" onClick={() => onOthers(others.filter((_, j) => j !== i))}
            aria-label="Remove this charge"
            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <datalist id="other-charge-suggestions">
        {OTHER_CHARGE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button type="button" disabled={full}
          onClick={() => onOthers([...others, { label: '', amount: null, arrangedBy: null }])}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add a charge by hand
        </button>
        {lines.length > 0 && (
          <p className="text-xs text-gray-600">
            Additional services: <span className="font-semibold text-gray-900">{usd(total)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** Service name · who arranges it · cost · remove, on wide screens; stacked on a phone. */
const ROW = 'grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_2rem] gap-2 items-center';

/** Who arranges it. Required before the form saves — see priceTermsProblem(). */
function ArrangerSelect({ value, onChange }: {
  value: ServiceArranger | null;
  onChange: (v: ServiceArranger | null) => void;
}) {
  return (
    <select value={value ?? ''} aria-label="Arranged by"
      onChange={(e) => onChange(isServiceArranger(e.target.value) ? e.target.value : null)}
      className={`${INPUT} ${value ? '' : 'text-gray-400'}`}>
      <option data-es value="">Arranged by…</option>
      {SERVICE_ARRANGERS.map((a) => <option key={a} value={a}>{SERVICE_ARRANGER_LABEL[a]}</option>)}
    </select>
  );
}

/**
 * The cost, unless the client arranges it: then it is $0 by definition, and
 * the SA and invoice print "Arranged by the client" where the price would be.
 */
function CostInput({ arrangedBy, value, onChange }: {
  arrangedBy: ServiceArranger | null;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  if (arrangedBy === 'client') {
    return (
      <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
        title="The client arranges it, so it costs the client nothing through us">
        $0.00 · client
      </div>
    );
  }
  return (
    <MoneyInput value={value == null ? '' : String(value)} onChange={(v) => onChange(money(v))}
      placeholder="0.00" className={INPUT} />
  );
}

/** Green at zero, amber otherwise — a load with money unaccounted for should look it. */
function Remaining({ label, amount }: { label: string; amount: number }) {
  const settled = amount === 0;
  return (
    <div className={`rounded-lg border px-3 py-2 ${settled ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <span className="text-xs font-medium">{label}: </span>
      <span className="font-semibold">{usd(amount)}</span>
    </div>
  );
}
