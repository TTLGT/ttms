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
  cleanServiceCharges,
  isPaidService,
  serviceChargesTotal,
} from '@/types/order';
import type { Accessorial, CommodityItem, Order, ServiceCharge } from '@/types/order';
import { Plus, X } from 'lucide-react';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/** A charge typed by hand, while it is being edited — the label may still be blank. */
interface OtherCharge { label: string; amount: number | null }

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
    otherCharges: [],
  };
}

export function priceTermsFromOrder(o: Partial<Order>): PriceTerms {
  const charges = cleanServiceCharges(o.serviceCharges);
  const serviceCosts: PriceTerms['serviceCosts'] = {};
  for (const c of charges) if (c.service !== 'other') serviceCosts[c.service] = c.amount;
  return {
    clientPayment: o.clientPayment ?? null,
    carrierPayment: o.carrierPayment ?? null,
    brokerFeeTerms: o.brokerFeeTerms ?? null,
    specialTerms: o.specialTerms ?? '',
    complexTerms: { ...blankComplexTerms(), ...(o.complexTerms ?? {}) },
    serviceCosts,
    otherCharges: charges.filter((c) => c.service === 'other')
      .map((c) => ({ label: c.label ?? '', amount: c.amount })),
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
  const serviceCharges: ServiceCharge[] = [
    ...accessorials.filter((a) => isPaidService(a) && t.serviceCosts[a] != null)
      .map((a): ServiceCharge => ({ service: a, amount: t.serviceCosts[a] ?? null })),
    ...t.otherCharges.filter((c) => c.label.trim())
      .map((c): ServiceCharge => ({ service: 'other', label: c.label.trim(), amount: c.amount })),
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

/** Why the form cannot be saved as it stands, or '' — a typed charge with an amount but no name. */
export function priceTermsProblem(t: PriceTerms): string {
  return t.otherCharges.some((c) => !c.label.trim() && c.amount != null)
    ? 'Name the service for every charge added by hand in Price and Terms, or remove the line.'
    : '';
}

/** A blank box is "nothing on this leg", kept as null rather than a false 0. */
function money(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

interface Props {
  agreedRate: string;
  onAgreedRate: (v: string) => void;
  brokerFee: string;
  onBrokerFee: (v: string) => void;
  carrierPay: number;
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
 * Carrier Pay stays worked out from the other two, as it always has been here.
 */
export default function PriceAndTermsSection({
  agreedRate, onAgreedRate, brokerFee, onBrokerFee, carrierPay, laneMiles, terms, onTerms, commodities, accessorials,
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

  const rate = parseFloat(agreedRate) || 0;
  const fee = parseFloat(brokerFee) || 0;
  const pay = Math.max(0, carrierPay);
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
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Price and Terms</h2>
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
            customerPrice: rate > 0 ? rate : null,
            driverPay: rate > 0 && pay > 0 ? pay : null,
          })}
          onApply={(r) => {
            onAgreedRate(String(r.agreedRate));
            onBrokerFee(String(r.brokerFee));
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* field-* ids are where the SA review's "Fix" links land — see fixTargets.ts. */}
        <div id="field-agreedRate">
          <label className="block text-xs font-medium text-gray-600 mb-1">Agreed Rate (USD)</label>
          <MoneyInput value={agreedRate} onChange={onAgreedRate}
            placeholder="0.00" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Broker Fee (USD)</label>
          <MoneyInput value={brokerFee} onChange={onBrokerFee}
            placeholder="0.00" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Carrier Pay (auto)</label>
          <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
            {carrierPay > 0 ? usd(carrierPay) : '—'}
          </div>
        </div>
      </div>

      <ServiceChargesFields
        accessorials={accessorials}
        costs={terms.serviceCosts}
        onCosts={(serviceCosts) => set({ serviceCosts })}
        others={terms.otherCharges}
        onOthers={(otherCharges) => set({ otherCharges })}
        agreedRate={rate}
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
        <label className="block text-xs font-medium text-gray-600 mb-1">Special Terms</label>
        <textarea value={terms.specialTerms} onChange={(e) => set({ specialTerms: e.target.value })} rows={2}
          maxLength={2000} placeholder="Anything the dropdowns cannot say — a deposit arrangement, a payment deadline…"
          className={`${INPUT} resize-y`} />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-600">Enable Complex Terms</span>
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
        <p className="text-sm font-semibold text-gray-800">Complex Payment Terms</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Who pays whom on this load. These replace the carrier pay terms and broker fee terms.
          Both remaining figures reach $0.00 once every dollar is accounted for.
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
 * What the Agreed Rate pays for besides the move: a line per paid service
 * ticked in Freight, plus any typed by hand. A breakdown of the rate, not an
 * addition to it — see ServiceCharge — so the rest of the rate is shown as
 * the linehaul, and a breakdown bigger than the rate is flagged rather than
 * refused (the rate may simply not be typed yet).
 */
function ServiceChargesFields({ accessorials, costs, onCosts, others, onOthers, agreedRate }: {
  accessorials: readonly Accessorial[];
  costs: PriceTerms['serviceCosts'];
  onCosts: (c: PriceTerms['serviceCosts']) => void;
  others: OtherCharge[];
  onOthers: (o: OtherCharge[]) => void;
  agreedRate: number;
}) {
  const paid = accessorials.filter(isPaidService);
  const lines = [
    ...paid.map((a) => ({ amount: costs[a] ?? null })),
    ...others.filter((o) => o.label.trim()),
  ];
  const total = serviceChargesTotal(lines);
  const linehaul = Math.round((agreedRate - total) * 100) / 100;
  const setOther = (i: number, patch: Partial<OtherCharge>) =>
    onOthers(others.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const full = paid.length + others.length >= MAX_SERVICE_CHARGES;

  return (
    <div id="field-serviceCharges" className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-800">Services in the Agreed Rate</p>
        <p className="text-xs text-gray-500 mt-0.5">
          What part of the Agreed Rate pays for each service — not added on top of it. Tick a service under
          Freight → Services with a cost and its line appears here; add anything rarer by hand. These figures
          are kept on the load only and are not printed on the SA, the Dispatch Sheet or the invoice.
        </p>
      </div>

      {paid.length === 0 && others.length === 0 && (
        <p className="text-xs text-gray-500 italic">No services with a cost on this load.</p>
      )}

      {paid.map((a) => (
        <div key={a} className="grid grid-cols-[minmax(0,1fr)_9rem_2rem] gap-2 items-center">
          <span className="text-sm text-gray-700">{ACCESSORIAL_LABEL[a]}</span>
          <MoneyInput
            value={costs[a] == null ? '' : String(costs[a])}
            onChange={(v) => onCosts({ ...costs, [a]: money(v) })}
            placeholder="0.00"
            className={INPUT}
          />
          {/* No remove here: the line belongs to the tick box in Freight. */}
          <span />
        </div>
      ))}

      {others.map((o, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_9rem_2rem] gap-2 items-center">
          <input
            value={o.label}
            onChange={(e) => setOther(i, { label: e.target.value })}
            list="other-charge-suggestions"
            maxLength={80}
            placeholder="Service, e.g. Detention"
            aria-label="Service name"
            className={INPUT}
          />
          <MoneyInput
            value={o.amount == null ? '' : String(o.amount)}
            onChange={(v) => setOther(i, { amount: money(v) })}
            placeholder="0.00"
            className={INPUT}
          />
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
          onClick={() => onOthers([...others, { label: '', amount: null }])}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add a charge by hand
        </button>
        {lines.length > 0 && (
          <p className="text-xs text-gray-600">
            Services: <span className="font-semibold text-gray-900">{usd(total)}</span>
            {agreedRate > 0 && (
              <>{' · '}Linehaul (the rest of the rate): <span className="font-semibold text-gray-900">{usd(Math.max(0, linehaul))}</span></>
            )}
          </p>
        )}
      </div>

      {agreedRate > 0 && linehaul < 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The services add up to {usd(total)}, which is more than the Agreed Rate of {usd(agreedRate)}. They are
          part of the rate, so either a cost is too high or the rate needs raising.
        </p>
      )}
    </div>
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
