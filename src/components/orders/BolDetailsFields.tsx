'use client';

import { useEffect, useState } from 'react';
import { updateOrder } from '@/lib/orders';
import {
  FREIGHT_CHARGE_TERMS, FREIGHT_CHARGE_TERMS_LABEL, FREIGHT_COUNTED_BY, FREIGHT_COUNTED_BY_LABEL,
  TRAILER_LOADED_BY, TRAILER_LOADED_BY_LABEL,
  type FreightChargeTerms, type FreightCountedBy, type Order, type TrailerLoadedBy,
} from '@/types/order';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

type BolDetails = Pick<Order,
  'truckNumber' | 'trailerNumber' | 'freightChargeTerms' | 'thirdPartyBillTo' | 'trailerLoadedBy' | 'freightCountedBy'>;

function detailsOf(o: Partial<Order>): Required<BolDetails> {
  return {
    truckNumber:        o.truckNumber ?? '',
    trailerNumber:      o.trailerNumber ?? '',
    freightChargeTerms: o.freightChargeTerms ?? null,
    thirdPartyBillTo:   o.thirdPartyBillTo ?? '',
    trailerLoadedBy:    o.trailerLoadedBy ?? null,
    freightCountedBy:   o.freightCountedBy ?? null,
  };
}

/** A row of choices where pressing the chosen one again clears it — "not said" is always reachable. */
function Choice<T extends string>({ options, labels, value, onChange, disabled }: {
  options: T[]; labels: Record<T, string>; value: T | null; onChange: (v: T | null) => void; disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o;
        return (
          <button key={o} type="button" role="radio" aria-checked={on} disabled={disabled}
            onClick={() => onChange(on ? null : o)}
            className={`px-3 py-1.5 rounded-lg border text-xs transition ${
              on ? 'border-brand-300 bg-brand-50 text-brand-800 font-semibold' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
            {labels[o]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The parts of the Bill of Lading nothing else on the order answers — the
 * truck, who pays the freight, and what happened at the dock — in the BOL
 * card on the order.
 *
 * Every one is optional. Left unset, the BOL prints an empty box for a pen,
 * the same as the paper form, so a load can be dispatched before anybody
 * knows the trailer number.
 *
 * `onSaved` hands the saved values back, so the page can redraw the BOL with
 * them — a stored BOL does not change by itself.
 */
export default function BolDetailsFields({ order, orderId, canEdit, onSaved }: {
  order: Partial<Order>;
  orderId: string;
  canEdit: boolean;
  onSaved: (patch: BolDetails) => void;
}) {
  const [draft, setDraft] = useState(() => detailsOf(order));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // A save elsewhere on the page (or a reload) brings new values in.
  const key = JSON.stringify(detailsOf(order));
  useEffect(() => { setDraft(JSON.parse(key)); }, [key]);

  const dirty = JSON.stringify(draft) !== key;
  const set = (p: Partial<BolDetails>) => { setDraft((d) => ({ ...d, ...p })); setSaved(false); };

  async function save() {
    setSaving(true); setError('');
    try {
      const patch: BolDetails = {
        truckNumber:        draft.truckNumber.trim(),
        trailerNumber:      draft.trailerNumber.trim(),
        freightChargeTerms: draft.freightChargeTerms,
        // Only meaningful for 3rd-party terms; cleared otherwise so a stale
        // bill-to does not print under Prepaid.
        thirdPartyBillTo:   draft.freightChargeTerms === 'third_party' ? draft.thirdPartyBillTo.trim() : '',
        trailerLoadedBy:    draft.trailerLoadedBy,
        freightCountedBy:   draft.freightCountedBy,
      };
      await updateOrder(orderId, patch);
      setSaved(true);
      onSaved(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the BOL details');
    } finally {
      setSaving(false);
    }
  }

  const off = !canEdit || saving;
  return (
    <div className="mt-4 border-t border-gray-100 pt-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Truck No</label>
          <input value={draft.truckNumber} maxLength={30} disabled={off}
            onChange={(e) => set({ truckNumber: e.target.value })} placeholder="Unit number" className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Trailer No</label>
          <input value={draft.trailerNumber} maxLength={30} disabled={off}
            onChange={(e) => set({ trailerNumber: e.target.value })} placeholder="Unit number" className={INPUT} />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600 mb-1.5">Freight charge terms</p>
        <Choice<FreightChargeTerms> options={FREIGHT_CHARGE_TERMS} labels={FREIGHT_CHARGE_TERMS_LABEL}
          value={draft.freightChargeTerms} onChange={(v) => set({ freightChargeTerms: v })} disabled={off} />
        {draft.freightChargeTerms === 'third_party' && (
          <textarea value={draft.thirdPartyBillTo} maxLength={300} rows={3} disabled={off}
            onChange={(e) => set({ thirdPartyBillTo: e.target.value })}
            placeholder="3rd party freight charges — bill to (name and address)"
            className={`${INPUT} mt-2`} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Trailer loaded</p>
          <Choice<TrailerLoadedBy> options={TRAILER_LOADED_BY} labels={TRAILER_LOADED_BY_LABEL}
            value={draft.trailerLoadedBy} onChange={(v) => set({ trailerLoadedBy: v })} disabled={off} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Freight counted</p>
          <Choice<FreightCountedBy> options={FREIGHT_COUNTED_BY} labels={FREIGHT_COUNTED_BY_LABEL}
            value={draft.freightCountedBy} onChange={(v) => set({ freightCountedBy: v })} disabled={off} />
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Handling units and hazardous material are set on each freight line. Anything left empty prints as a blank box to fill in by hand.
      </p>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={!dirty || saving}
            className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
            {saving ? 'Saving…' : 'Save BOL details'}
          </button>
          {saved && !dirty && <span className="text-xs text-green-700">Saved.</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
