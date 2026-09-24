'use client';

import {
  FEE_PAYERS,
  FEE_PAYER_LABEL,
  PAYMENT_SIDE_LABEL,
  feeRateLabel,
  paymentFee,
  termsFromMethod,
  usd,
} from '@/types/paymentMethod';
import type { FeePayer, OrderPaymentTerms, PaymentMethod, PaymentSide } from '@/types/paymentMethod';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

interface Props {
  side: PaymentSide;
  /** The options an admin set up in Settings → Operations. */
  methods: PaymentMethod[];
  value: OrderPaymentTerms | null;
  onChange: (terms: OrderPaymentTerms | null) => void;
  /** What a percentage fee is taken of — the agreed rate, or the carrier pay. */
  base: number;
}

/**
 * One of the two payment dropdowns on an order's Financials. Picking an option
 * copies it onto the order with its default payer; the payer can then be
 * changed for this load, the fee cannot — it is the company's price for the
 * option. See src/types/paymentMethod.ts.
 */
export default function PaymentTermsField({ side, methods, value, onChange, base }: Props) {
  // An order keeps the option it was given even after an admin removes it
  // from the list, so it has to stay selectable here or opening the edit form
  // would silently drop it on save.
  const retired = value && !methods.some((m) => m.id === value.methodId) ? value : null;

  function pick(id: string) {
    if (!id) { onChange(null); return; }
    // Re-picking the option already on the load keeps its copy — including a
    // payer the broker changed, and the fee it was booked at.
    if (value && id === value.methodId) return;
    const m = methods.find((x) => x.id === id);
    if (m) onChange(termsFromMethod(m));
  }

  const fee = value ? paymentFee(value, base) : 0;

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{PAYMENT_SIDE_LABEL[side]}</label>
        <select value={value?.methodId ?? ''} onChange={(e) => pick(e.target.value)} className={INPUT}>
          <option value="">{methods.length || retired ? 'Not set' : 'None set up yet'}</option>
          {retired && (
            <option value={retired.methodId}>{retired.methodName} (no longer offered)</option>
          )}
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}{m.feeType !== 'none' ? ` — ${feeRateLabel(m)} fee` : ''}
            </option>
          ))}
        </select>
        {!methods.length && !retired && (
          <p className="text-xs text-gray-500 mt-1">An admin adds these in Settings → Operations.</p>
        )}
      </div>

      {value && value.feeType !== 'none' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fee</label>
            <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
              {usd(fee)}
              {value.feeType === 'percent' && <span className="text-gray-500"> ({value.feeAmount}%)</span>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fee paid by</label>
            <select
              value={value.feePayer}
              onChange={(e) => onChange({ ...value, feePayer: e.target.value as FeePayer })}
              className={INPUT}
            >
              {FEE_PAYERS.map((p) => <option key={p} value={p}>{FEE_PAYER_LABEL[p]}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
