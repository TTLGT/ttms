'use client';

import { useEffect, useState } from 'react';
import { updateOrder } from '@/lib/orders';
import {
  DOCK_PARTIES, DOCK_PARTY_LABEL,
  FREIGHT_CHARGE_TERMS, FREIGHT_CHARGE_TERMS_LABEL, FREIGHT_COUNTED_BY, FREIGHT_COUNTED_BY_LABEL,
  type DockParty, type FreightChargeTerms, type FreightCountedBy, type Order,
} from '@/types/order';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

type BolDetails = Pick<Order,
  'truckNumber' | 'trailerNumber' | 'freightChargeTerms' | 'thirdPartyBillTo' | 'trailerLoadedBy' | 'freightCountedBy'
  | 'trailerUnloadedBy' | 'deliveryCountedBy' | 'bolShowDockBoxes'>;

function detailsOf(o: Partial<Order>): Required<BolDetails> {
  return {
    truckNumber:        o.truckNumber ?? '',
    trailerNumber:      o.trailerNumber ?? '',
    freightChargeTerms: o.freightChargeTerms ?? null,
    thirdPartyBillTo:   o.thirdPartyBillTo ?? '',
    trailerLoadedBy:    o.trailerLoadedBy ?? null,
    freightCountedBy:   o.freightCountedBy ?? null,
    trailerUnloadedBy:  o.trailerUnloadedBy ?? null,
    deliveryCountedBy:  o.deliveryCountedBy ?? null,
    bolShowDockBoxes:   o.bolShowDockBoxes === true,
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
 * Every one is optional. A truck, trailer or charge term left unset prints as
 * an empty box for a pen, the same as the paper form, so a load can be
 * dispatched before anybody knows the trailer number. The loading and count
 * answers are the exception: unanswered ones are left off the BOL unless
 * `bolShowDockBoxes` asks for the full grid.
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
        trailerUnloadedBy:  draft.trailerUnloadedBy,
        deliveryCountedBy:  draft.deliveryCountedBy,
        bolShowDockBoxes:   draft.bolShowDockBoxes,
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
          <p className="text-xs font-medium text-gray-600 mb-1.5">Loaded by</p>
          <Choice<DockParty> options={DOCK_PARTIES} labels={DOCK_PARTY_LABEL}
            value={draft.trailerLoadedBy} onChange={(v) => set({ trailerLoadedBy: v })} disabled={off} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Unloaded by</p>
          <Choice<DockParty> options={DOCK_PARTIES} labels={DOCK_PARTY_LABEL}
            value={draft.trailerUnloadedBy} onChange={(v) => set({ trailerUnloadedBy: v })} disabled={off} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Counted at pickup by</p>
          <Choice<FreightCountedBy> options={FREIGHT_COUNTED_BY} labels={FREIGHT_COUNTED_BY_LABEL}
            value={draft.freightCountedBy} onChange={(v) => set({ freightCountedBy: v })} disabled={off} />
          {(draft.freightCountedBy === 'driver_pallets' || draft.freightCountedBy === 'driver_pieces') && (
            <p className="text-xs text-gray-500 mt-1.5">
              {draft.freightCountedBy === 'driver_pallets'
                ? 'The driver counts the pallets but not what is on them. The pieces are taken on the shipper’s word, so the driver is not responsible for pieces missing from a pallet.'
                : 'The driver counts every box or piece. The driver is responsible if the count is short at delivery.'}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Counted at delivery by</p>
          <Choice<DockParty> options={DOCK_PARTIES} labels={DOCK_PARTY_LABEL}
            value={draft.deliveryCountedBy} onChange={(v) => set({ deliveryCountedBy: v })} disabled={off} />
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={draft.bolShowDockBoxes} disabled={off}
          onChange={(e) => set({ bolShowDockBoxes: e.target.checked })} className="mt-0.5" />
        <span>
          Print all the loading, unloading and count boxes on the BOL
          <span className="block text-gray-400">
            Only when the carrier or client asks for boxes to tick by hand. Otherwise the BOL shows only the answers above, and leaves the section out when there are none.
          </span>
        </span>
      </label>

      <p className="text-xs text-gray-400">
        Handling units and hazardous material are set on each freight line. Truck, trailer and freight charges left empty print as a blank to fill in by hand.
        Loading, unloading and counts also go on the carrier&apos;s Dispatch Sheet the next time it is sent. Leave a count empty when nobody counts.
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
