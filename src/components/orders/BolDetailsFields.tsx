'use client';

import { useEffect, useState } from 'react';
import { updateOrder } from '@/lib/orders';
import { Bi } from '@/components/spanish/Es';
import { Hint } from './DetailBits';
import {
  DOCK_PARTIES, DOCK_PARTY_LABEL,
  FREIGHT_CHARGE_TERMS, FREIGHT_CHARGE_TERMS_LABEL, FREIGHT_COUNTED_BY, FREIGHT_COUNTED_BY_LABEL,
  type DockParty, type FreightChargeTerms, type FreightCountedBy, type Order,
} from '@/types/order';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/*
 * Who loads and unloads moved out of this card on 2026-11-06, into Loading
 * and Unloading — wanted from the quote on and required before the SA, which
 * this card (drawn from Booked) could never be. The counts stay: only the
 * BOL and the Dispatch Sheet print them.
 */
type BolDetails = Pick<Order,
  'truckNumber' | 'trailerNumber' | 'freightChargeTerms' | 'thirdPartyBillTo' | 'freightCountedBy'
  | 'deliveryCountedBy' | 'bolShowDockBoxes'>;

function detailsOf(o: Partial<Order>): Required<BolDetails> {
  return {
    truckNumber:        o.truckNumber ?? '',
    trailerNumber:      o.trailerNumber ?? '',
    freightChargeTerms: o.freightChargeTerms ?? null,
    thirdPartyBillTo:   o.thirdPartyBillTo ?? '',
    freightCountedBy:   o.freightCountedBy ?? null,
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

/** One question of the card, with its answers under it. */
function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p data-es className="mb-2 text-sm font-semibold text-gray-900">{title}</p>
      {children}
    </div>
  );
}

/*
 * What each answer means, under its name. Plain words for the freight
 * terms; the two driver counts keep the distinction the paper form makes,
 * because it decides who answers for a short count.
 */
const CHARGE_MEANING: Record<FreightChargeTerms, string> = {
  prepaid: "The shipper's side pays",
  collect: 'The consignee pays on delivery',
  third_party: 'Someone else is billed',
};

const PICKUP_COUNT_MEANING: Record<FreightCountedBy, string> = {
  shipper: "The driver takes the shipper's count",
  driver_pallets: 'Not responsible for pieces on a pallet',
  driver_pieces: 'Responsible if the count is short at delivery',
  consignee: "The consignee's people count it",
  third_party: 'Someone hired counts it',
};

/** Answers as cards with their meaning; pressing the chosen one again clears it, like Choice. */
function RadioCards<T extends string>({ options, labels, meanings, value, onChange, disabled }: {
  options: T[]; labels: Record<T, string>; meanings: Record<T, string>;
  value: T | null; onChange: (v: T | null) => void; disabled: boolean;
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {options.map((o) => {
        const on = value === o;
        return (
          <button key={o} type="button" role="radio" aria-checked={on} disabled={disabled}
            onClick={() => onChange(on ? null : o)}
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-default ${
              on ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ${on ? 'border-[5px] border-brand-600' : 'border-2 border-gray-300'}`} />
            <span className="min-w-0">
              <span data-es className={`block text-sm ${on ? 'font-semibold text-brand-700' : 'font-medium text-gray-900'}`}>{labels[o]}</span>
              <span data-es className="block text-xs text-gray-500">{meanings[o]}</span>
            </span>
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
        freightCountedBy:   draft.freightCountedBy,
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
  // Asked as plain questions (2026-11-11, chosen by the office from a set of
  // drafts), each answer with its meaning under it, so nobody has to know
  // what "Collect" or "said to contain" means to fill this in.
  return (
    <div className="mt-4 border-t border-gray-100 pt-4 space-y-5">
      <Question title="Who pays the freight charges?">
        <RadioCards<FreightChargeTerms> options={FREIGHT_CHARGE_TERMS} labels={FREIGHT_CHARGE_TERMS_LABEL}
          meanings={CHARGE_MEANING} value={draft.freightChargeTerms}
          onChange={(v) => set({ freightChargeTerms: v })} disabled={off} />
        {draft.freightChargeTerms === 'third_party' && (
          <textarea value={draft.thirdPartyBillTo} maxLength={300} rows={3} disabled={off}
            onChange={(e) => set({ thirdPartyBillTo: e.target.value })}
            placeholder="3rd party freight charges — bill to (name and address)"
            className={`${INPUT} mt-2`} />
        )}
      </Question>

      <Question title="Who counts the freight at pickup?">
        <RadioCards<FreightCountedBy> options={FREIGHT_COUNTED_BY} labels={FREIGHT_COUNTED_BY_LABEL}
          meanings={PICKUP_COUNT_MEANING} value={draft.freightCountedBy}
          onChange={(v) => set({ freightCountedBy: v })} disabled={off} />
      </Question>

      <Question title="Who counts at delivery?">
        <Choice<DockParty> options={DOCK_PARTIES} labels={DOCK_PARTY_LABEL}
          value={draft.deliveryCountedBy} onChange={(v) => set({ deliveryCountedBy: v })} disabled={off} />
      </Question>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label data-es className="block text-sm font-semibold text-gray-900 mb-1.5">Truck number</label>
          <input value={draft.truckNumber} maxLength={30} disabled={off}
            onChange={(e) => set({ truckNumber: e.target.value })} placeholder="Leave empty to write it by hand" className={INPUT} />
        </div>
        <div>
          <label data-es className="block text-sm font-semibold text-gray-900 mb-1.5">Trailer number</label>
          <input value={draft.trailerNumber} maxLength={30} disabled={off}
            onChange={(e) => set({ trailerNumber: e.target.value })} placeholder="Leave empty to write it by hand" className={INPUT} />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <input type="checkbox" checked={draft.bolShowDockBoxes} disabled={off}
          onChange={(e) => set({ bolShowDockBoxes: e.target.checked })} className="mt-1" />
        <span>
          <span data-es className="font-semibold text-gray-900">Print every loading, unloading and count box on the BOL</span>
          <span data-es className="block text-xs text-gray-500">
            Only when the carrier or client asks for boxes to tick by hand. Otherwise the BOL shows only the answers above.
          </span>
        </span>
      </label>

      <Hint label="How these print on the BOL">
        <Bi>Handling units and hazardous material are set on each freight line. Truck, trailer and freight charges left empty print as a blank to fill in by hand.
        Who loads and unloads is set in Loading and Unloading. The counts also go on the carrier&apos;s Dispatch Sheet the next time it is sent. Leave a count empty when nobody counts.</Bi>
      </Hint>

      {/* Only once something has changed: a Save button that does nothing
          until then is one more thing to read. */}
      {canEdit && (dirty || saved || error) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
          {dirty && <span data-es className="text-xs font-medium text-amber-700">Unsaved changes to the BOL details</span>}
          {dirty && (
            <button type="button" onClick={save} disabled={saving}
              className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Save BOL details'}
            </button>
          )}
          {dirty && !saving && (
            <button type="button" onClick={() => { setDraft(JSON.parse(key)); setError(''); }}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition">
              Undo
            </button>
          )}
          {saved && !dirty && <span data-es className="text-xs text-green-700">Saved.</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
