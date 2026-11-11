'use client';

import DateField from '@/components/DateField';
import { Bi } from '@/components/spanish/Es';
import { LOAD_TYPES, LOAD_TYPE_LABEL, isLoadType } from '@/types/order';
import type { LoadType, Order } from '@/types/order';

/**
 * The load facts in the General section of both order forms (2026-11-11):
 * load type, quote date and the client's budget. See Order.loadType.
 */

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

export interface LoadFacts {
  loadType: LoadType | '';
  /** `YYYY-MM-DD`, like DateField. */
  quoteDate: string;
  /** As typed; '' for none. */
  clientBudget: string;
}

/** Today in the browser, for a new order's quote date. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function loadFactsFromOrder(o: Partial<Order>, dayOf: (v: unknown) => string): LoadFacts {
  return {
    loadType: isLoadType(o.loadType) ? o.loadType : '',
    quoteDate: dayOf(o.quoteDate ?? null),
    clientBudget: o.clientBudget ? String(o.clientBudget) : '',
  };
}

/** The fields as saved. Dates at noon, the way the order's other dates are. */
export function loadFactsForSave(f: LoadFacts): Pick<Order, 'loadType' | 'quoteDate' | 'clientBudget'> {
  const budget = parseFloat(f.clientBudget);
  return {
    loadType: f.loadType,
    // A Date: it travels through encodeRecordPatch(), which makes it a Timestamp.
    quoteDate: (f.quoteDate ? new Date(`${f.quoteDate}T12:00:00`) : null) as unknown as Order['quoteDate'],
    clientBudget: Number.isFinite(budget) && budget > 0 ? budget : null,
  };
}

export default function LoadFactsFields({ value, onChange }: { value: LoadFacts; onChange: (v: LoadFacts) => void }) {
  return (
    <>
      <div id="field-loadType">
        <label data-es className="block text-xs font-medium text-gray-600 mb-1">Load type</label>
        <select value={value.loadType} onChange={(e) => onChange({ ...value, loadType: e.target.value as LoadType | '' })} className={INPUT}>
          <option data-es value="">Not set</option>
          {LOAD_TYPES.map((t) => <option key={t} value={t}>{LOAD_TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <div id="field-quoteDate">
        <label data-es className="block text-xs font-medium text-gray-600 mb-1">Quote date</label>
        <DateField value={value.quoteDate} onChange={(quoteDate) => onChange({ ...value, quoteDate })} className={INPUT} />
        <p className="text-xs text-gray-500 mt-1"><Bi>The day the client was quoted, if it was before today.</Bi></p>
      </div>
      <div id="field-clientBudget">
        <label data-es className="block text-xs font-medium text-gray-600 mb-1">Client budget (optional)</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={value.clientBudget}
            onChange={(e) => onChange({ ...value, clientBudget: e.target.value })} className={`${INPUT} pl-7`} />
        </div>
        <p className="text-xs text-gray-500 mt-1"><Bi>What the client said they want to spend. Only seen inside TTMS.</Bi></p>
      </div>
    </>
  );
}
