'use client';

import { useEffect, useState } from 'react';
import PaymentTermsField from '@/components/orders/PaymentTermsField';
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
import type { Order } from '@/types/order';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/** Everything in Price and Terms except the three money boxes the form already had. */
export interface PriceTerms {
  clientPayment: OrderPaymentTerms | null;
  carrierPayment: OrderPaymentTerms | null;
  brokerFeeTerms: OrderPaymentTerms | null;
  specialTerms: string;
  complexTerms: ComplexTerms;
}

export function blankPriceTerms(): PriceTerms {
  return {
    clientPayment: null,
    carrierPayment: null,
    brokerFeeTerms: null,
    specialTerms: '',
    complexTerms: blankComplexTerms(),
  };
}

export function priceTermsFromOrder(o: Partial<Order>): PriceTerms {
  return {
    clientPayment: o.clientPayment ?? null,
    carrierPayment: o.carrierPayment ?? null,
    brokerFeeTerms: o.brokerFeeTerms ?? null,
    specialTerms: o.specialTerms ?? '',
    complexTerms: { ...blankComplexTerms(), ...(o.complexTerms ?? {}) },
  };
}

/**
 * The fields written to the order. Complex terms replace the two terms
 * dropdowns, as in BATS, so whichever set is not in use is saved as null —
 * otherwise the record would show a "COD - Cash" nobody chose alongside a
 * leg-by-leg breakdown that contradicts it.
 */
export function priceTermsForSave(t: PriceTerms): Pick<Order,
  'clientPayment' | 'carrierPayment' | 'brokerFeeTerms' | 'specialTerms' | 'complexTerms'> {
  const complex = t.complexTerms.enabled;
  return {
    clientPayment: t.clientPayment,
    carrierPayment: complex ? null : t.carrierPayment,
    brokerFeeTerms: complex ? null : t.brokerFeeTerms,
    specialTerms: t.specialTerms.trim(),
    complexTerms: complex ? t.complexTerms : null,
  };
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
}

/**
 * BATS's "Price and Terms" block, shared by the new and edit order forms.
 *
 * BATS's "Total Tariff" is this app's Agreed Rate, and the name is kept: it is
 * what the invoice, the client's confirmation and every list already call it.
 * Carrier Pay stays worked out from the other two, as it always has been here.
 */
export default function PriceAndTermsSection({
  agreedRate, onAgreedRate, brokerFee, onBrokerFee, carrierPay, laneMiles, terms, onTerms,
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
      <div>
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Price and Terms</h2>
        <p className="text-xs text-gray-500 mt-1">
          Total mileage: {laneMiles ? Math.round(laneMiles).toLocaleString() : '—'}
          {' · '}Total PPM: {ppm !== null ? usd(ppm) : '—'}
          {' · '}Carrier pay PPM: {payPpm !== null ? usd(payPpm) : '—'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Agreed Rate (USD)</label>
          <input type="number" min="0" step="0.01" value={agreedRate} onChange={(e) => onAgreedRate(e.target.value)}
            placeholder="0.00" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Broker Fee (USD)</label>
          <input type="number" min="0" step="0.01" value={brokerFee} onChange={(e) => onBrokerFee(e.target.value)}
            placeholder="0.00" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Carrier Pay (auto)</label>
          <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
            {carrierPay > 0 ? usd(carrierPay) : '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PaymentTermsField side="client" methods={methods.client}
          value={terms.clientPayment} onChange={(v) => set({ clientPayment: v })}
          base={feeBase('client', bases)} />
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
            <input
              type="number"
              min="0"
              step="0.01"
              value={terms[leg] ?? ''}
              onChange={(e) => onChange({ [leg]: money(e.target.value) })}
              placeholder="0.00"
              className={INPUT}
            />
          </div>
        ))}
      </div>
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
