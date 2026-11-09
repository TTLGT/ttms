'use client';

import { PackageOpen } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';
import ProviderPicker from '@/components/providers/ProviderPicker';
import { providerServiceFor } from '@/types/provider';
import {
  DOCK_HELP_LABEL, DOCK_HELP_SERVICES, DOCK_PARTIES, DOCK_PARTY_LABEL, SERVICE_ARRANGERS, SERVICE_ARRANGER_LABEL,
  MAX_DOCK_CONDITIONS, dockConditionsOf, dockEndOf, dockEndProblem,
  type DockEnd, type DockHelp, type DockHelpService, type DockParty, type Order, type ServiceArranger,
} from '@/types/order';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/** The six fields this block edits. */
export type DockWork = Required<Pick<Order,
  'trailerLoadedBy' | 'trailerUnloadedBy' | 'loadingHelp' | 'unloadingHelp' | 'loadingConditions' | 'unloadingConditions'>>;

export const BLANK_DOCK_WORK: DockWork = {
  trailerLoadedBy: null, trailerUnloadedBy: null, loadingHelp: null, unloadingHelp: null,
  loadingConditions: '', unloadingConditions: '',
};

export function dockWorkFromOrder(o: Partial<Order>): DockWork {
  return {
    trailerLoadedBy:   dockEndOf(o, 'pickup').by,
    trailerUnloadedBy: dockEndOf(o, 'delivery').by,
    loadingHelp:       dockEndOf(o, 'pickup').help,
    unloadingHelp:     dockEndOf(o, 'delivery').help,
    loadingConditions:   dockConditionsOf(o, 'pickup'),
    unloadingConditions: dockConditionsOf(o, 'delivery'),
  };
}

/**
 * An example under the box, for the answer picked. Examples rather than a
 * template: what matters differs at every dock, and a pre-filled box gets
 * saved unread.
 */
const CONDITIONS_HINT: Record<DockParty, string> = {
  driver:      'e.g. Driver loads and secures with own straps and load bars. Dock 4, 8am–10am window.',
  shipper:     'e.g. Shipper loads with forklift; driver stays with the truck and checks the count.',
  consignee:   'e.g. Consignee unloads with forklift; driver opens the doors and stays to sign.',
  third_party: 'e.g. Lumper unloads; driver pays at the dock and sends the receipt. Driver stays to count.',
};

/**
 * As saved: help only where a 3rd party does the work, so a load switched
 * from "3rd party" to "Driver" does not keep a crane nobody hires. The server
 * clears it the same way (reconcileDockHelp()); this keeps the change log
 * honest about what was sent.
 */
export function dockWorkForSave(d: DockWork): DockWork {
  return {
    trailerLoadedBy:   d.trailerLoadedBy,
    trailerUnloadedBy: d.trailerUnloadedBy,
    loadingHelp:       d.trailerLoadedBy === 'third_party' ? d.loadingHelp : null,
    unloadingHelp:     d.trailerUnloadedBy === 'third_party' ? d.unloadingHelp : null,
    // Kept when the answer changes: the words usually still apply, and the
    // box stays on screen beside the new answer for the broker to correct.
    loadingConditions:   d.loadingConditions.trim(),
    unloadingConditions: d.unloadingConditions.trim(),
  };
}

/** A row of choices where pressing the chosen one again clears it. */
function Choice<T extends string>({ options, labels, value, onChange, name }: {
  options: readonly T[]; labels: Record<T, string>; value: T | null; onChange: (v: T | null) => void; name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o;
        return (
          <button key={o} type="button" role="radio" aria-checked={on} data-es
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

function EndFields({ end, value, onChange, near }: { end: DockEnd; value: DockWork; onChange: (v: DockWork) => void; near?: string }) {
  const byKey = end === 'pickup' ? 'trailerLoadedBy' : 'trailerUnloadedBy';
  const helpKey = end === 'pickup' ? 'loadingHelp' : 'unloadingHelp';
  const condKey = end === 'pickup' ? 'loadingConditions' : 'unloadingConditions';
  const by = value[byKey];
  const help: DockHelp = value[helpKey] ?? { service: null, hiredBy: null };
  const setHelp = (p: Partial<DockHelp>) => onChange({ ...value, [helpKey]: { ...help, ...p } });
  const problem = dockEndProblem(dockWorkForSave(value), end);

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <p data-es className="text-sm font-semibold text-gray-800">{end === 'pickup' ? 'Pickup' : 'Delivery'}</p>
      <div>
        <p data-es className="text-xs font-medium text-gray-600 mb-1.5">
          {end === 'pickup' ? 'Who loads the truck?' : 'Who unloads the truck?'}
        </p>
        <Choice<DockParty> name={end === 'pickup' ? 'Loaded by' : 'Unloaded by'}
          options={DOCK_PARTIES} labels={DOCK_PARTY_LABEL} value={by}
          onChange={(v) => onChange({ ...value, [byKey]: v })} />
        {by === 'driver' && (
          <p className="text-xs text-amber-700 mt-1.5">
            <Bi>The driver does the work. The Dispatch Sheet tells the carrier before they accept the load.</Bi>
          </p>
        )}
      </div>

      {by === 'third_party' && (
        <>
          <div>
            <p data-es className="text-xs font-medium text-gray-600 mb-1.5">What is the 3rd party?</p>
            <Choice<DockHelpService> name="3rd party" options={DOCK_HELP_SERVICES} labels={DOCK_HELP_LABEL}
              value={help.service} onChange={(service) => setHelp({ service, label: service === 'other' ? help.label ?? '' : undefined })} />
            {help.service === 'other' && (
              <input value={help.label ?? ''} maxLength={60} onChange={(e) => setHelp({ label: e.target.value })}
                placeholder="Who, e.g. Pallet crew" aria-label="Name the 3rd party" className={`${INPUT} mt-2`} />
            )}
          </div>
          <div>
            <p data-es className="text-xs font-medium text-gray-600 mb-1.5">Which provider</p>
            <ProviderPicker service={providerServiceFor(help.service)} near={near}
              value={{ providerId: help.providerId, providerName: help.providerName }}
              onChange={(p) => setHelp({ providerId: p.providerId, providerName: p.providerName })} />
          </div>
          <div>
            <p data-es className="text-xs font-medium text-gray-600 mb-1.5">Hired by</p>
            <Choice<ServiceArranger> name="Hired by" options={SERVICE_ARRANGERS} labels={SERVICE_ARRANGER_LABEL}
              value={help.hiredBy} onChange={(hiredBy) => setHelp({ hiredBy })} />
            {help.hiredBy === 'ttl' && (
              <p className="text-xs text-gray-500 mt-1.5">
                <Bi>TTL books and pays them. Put the cost in Price and Terms, where it is added to the Agreed Rate.</Bi>
              </p>
            )}
            {help.hiredBy === 'carrier' && (
              <p className="text-xs text-gray-500 mt-1.5">
                <Bi>The carrier or the driver books and pays them. Agree with the carrier how they are paid back.</Bi>
              </p>
            )}
          </div>
        </>
      )}

      {by && (
        <div>
          <label htmlFor={`dock-conditions-${end}`} className="block text-xs font-medium text-gray-600 mb-1.5">
            <span data-es>Conditions</span> <span className="text-red-600" aria-hidden>*</span>
          </label>
          <textarea id={`dock-conditions-${end}`} rows={3} maxLength={MAX_DOCK_CONDITIONS} aria-required
            value={value[condKey]} onChange={(e) => onChange({ ...value, [condKey]: e.target.value })}
            placeholder={CONDITIONS_HINT[by]} className={INPUT} />
          <p className="text-xs text-gray-500 mt-1">
            <Bi>Who does what, what they bring, who pays and anything the driver must do. Printed on the SA, the Dispatch Sheet and the BOL.</Bi>
          </p>
        </div>
      )}

      {problem &&<p className="text-xs text-amber-700">{problem} <Bi>Needed before the SA, the Dispatch Sheet or the BOL goes out.</Bi></p>}
    </div>
  );
}

/**
 * Loading and Unloading, on the new and edit order forms: who does the work
 * at each end, and — when it is a 3rd party — what they are and who hires
 * them. Required before the SA goes out (orderReadiness()), not before the
 * load is saved, so a quote can be written before anybody knows.
 *
 * Picking a lumper, forklift, crane or rigging crew ticks that service and
 * sets who arranges it — see reconcileDockHelp(). The counts stay in the
 * Bill of Lading card: they only matter to the BOL.
 */
export default function DockWorkFields({ value, onChange, pickupState, deliveryState }: {
  value: DockWork;
  onChange: (v: DockWork) => void;
  /** The states of the two stops, so providers near each come first. */
  pickupState?: string;
  deliveryState?: string;
}) {
  return (
    <section id="field-dockWork" className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <h2 data-es className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <PackageOpen className="w-4 h-4 text-gray-500" aria-hidden /> Loading and Unloading
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          <Bi>Who loads the truck at pickup and unloads it at delivery, and the conditions at each end. When it is a
          3rd party — a lumper, a forklift, a crane — say what it is and who hires them. Printed on the client&apos;s SA,
          the carrier&apos;s Dispatch Sheet and the BOL, and needed before any of them goes out.</Bi>
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EndFields end="pickup" value={value} onChange={onChange} near={pickupState} />
        <EndFields end="delivery" value={value} onChange={onChange} near={deliveryState} />
      </div>
    </section>
  );
}
