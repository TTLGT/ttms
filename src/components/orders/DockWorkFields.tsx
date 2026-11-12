'use client';

import { PackageOpen } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';
import ProviderPicker from '@/components/providers/ProviderPicker';
import { providerServiceFor } from '@/types/provider';
import {
  DOCK_HELP_LABEL, DOCK_HELP_SERVICES, DOCK_PARTIES, DOCK_PARTY_LABEL, SERVICE_ARRANGERS, SERVICE_ARRANGER_LABEL,
  MAX_DOCK_CONDITIONS, MAX_DOCK_ROLE_BRINGS, MAX_DOCK_ROLE_DOES, MAX_DOCK_ROLE_NOTES,
  composeDockConditions, dockAnswerForSave, dockConditionsOf, dockEndOf, dockEndProblem, dockPartiesOdd, dockPartiesOf,
  dockPartyName, dockRolesOf,
  type DockEnd, type DockHelp, type DockHelpService, type DockParty, type DockRole, type DockRoles, type Order, type ServiceArranger,
} from '@/types/order';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/** The eight fields this block edits. */
export type DockWork = Required<Pick<Order,
  'trailerLoadedBy' | 'trailerUnloadedBy' | 'loadingHelp' | 'unloadingHelp' | 'loadingConditions' | 'unloadingConditions'
  | 'loadingRoles' | 'unloadingRoles'>>;

export const BLANK_DOCK_WORK: DockWork = {
  trailerLoadedBy: null, trailerUnloadedBy: null, loadingHelp: null, unloadingHelp: null,
  loadingConditions: '', unloadingConditions: '', loadingRoles: null, unloadingRoles: null,
};

const BLANK_ROLES: DockRoles = { parties: {}, notes: '' };

/**
 * A shared end with no per-party answers yet — written before the boxes
 * existed — opens with its old text in "Anything else", so nothing typed is
 * lost when the boxes appear.
 */
function rolesFor(o: Partial<Order>, end: DockEnd): DockRoles | null {
  if (dockEndOf(o, end).by.length < 2) return null;
  return dockRolesOf(o, end) ?? { parties: {}, notes: dockConditionsOf(o, end) };
}

export function dockWorkFromOrder(o: Partial<Order>): DockWork {
  return {
    trailerLoadedBy:   dockEndOf(o, 'pickup').by,
    trailerUnloadedBy: dockEndOf(o, 'delivery').by,
    loadingHelp:       dockEndOf(o, 'pickup').help,
    unloadingHelp:     dockEndOf(o, 'delivery').help,
    loadingConditions:   dockConditionsOf(o, 'pickup'),
    unloadingConditions: dockConditionsOf(o, 'delivery'),
    loadingRoles:   rolesFor(o, 'pickup'),
    unloadingRoles: rolesFor(o, 'delivery'),
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

/** Examples for each party's two boxes at a shared dock. */
const DOES_HINT: Record<DockParty, string> = {
  shipper:     'e.g. Drives the vehicle onto the trailer with their own operator',
  consignee:   'e.g. Drives it off the trailer; signs for it',
  driver:      'e.g. Guides it on, then chains and secures it',
  third_party: 'e.g. Unloads the pallets to the dock',
};
const BRINGS_HINT: Record<DockParty, string> = {
  shipper:     'e.g. Forklift and operator',
  consignee:   'e.g. Forklift',
  driver:      'e.g. Straps, chains, load bars',
  third_party: 'e.g. Pallet jack',
};

/** One end as saved: help only if a 3rd party is there, roles only if several share it. */
function endForSave(byRaw: DockWork['trailerLoadedBy'], help: DockHelp | null, conditions: string, roles: DockRoles | null) {
  const by = dockPartiesOf(byRaw);
  const keptHelp = by.includes('third_party') ? help : null;
  const keptRoles = by.length > 1 ? roles ?? BLANK_ROLES : null;
  return {
    by: dockAnswerForSave(by),
    help: keptHelp,
    roles: keptRoles,
    // A shared end prints the text built from its boxes; the server builds
    // it again from the same boxes. A single one keeps its own words.
    conditions: keptRoles ? composeDockConditions(by, keptRoles, keptHelp) : conditions.trim(),
  };
}

/**
 * As saved: help only where a 3rd party does the work, so a load switched
 * from "3rd party" to "Driver" does not keep a crane nobody hires. The server
 * clears it the same way (reconcileDockHelp()); this keeps the change log
 * honest about what was sent.
 */
export function dockWorkForSave(d: DockWork): DockWork {
  const p = endForSave(d.trailerLoadedBy, d.loadingHelp, d.loadingConditions, d.loadingRoles);
  const q = endForSave(d.trailerUnloadedBy, d.unloadingHelp, d.unloadingConditions, d.unloadingRoles);
  return {
    // One party as a string, several as a list — see DockAnswer.
    trailerLoadedBy: p.by, trailerUnloadedBy: q.by,
    loadingHelp: p.help, unloadingHelp: q.help,
    loadingConditions: p.conditions, unloadingConditions: q.conditions,
    loadingRoles: p.roles, unloadingRoles: q.roles,
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

/**
 * A row of choices where any number may be on at once (2026-11-12): who
 * loads is often more than one — the shipper's forklift and the driver's
 * straps. Pressing one again takes it off.
 */
function MultiChoice<T extends string>({ options, labels, value, onChange, name }: {
  options: readonly T[]; labels: Record<T, string>; value: readonly T[]; onChange: (v: T[]) => void; name: string;
}) {
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} data-es
            // Kept in catalog order, so the printed "Shipper + Driver" does
            // not depend on which was pressed first.
            onClick={() => onChange(options.filter((x) => (x === o ? !on : value.includes(x))))}
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
  const rolesKey = end === 'pickup' ? 'loadingRoles' : 'unloadingRoles';
  const by = dockPartiesOf(value[byKey]);
  const third = by.includes('third_party');
  const help: DockHelp = value[helpKey] ?? { service: null, hiredBy: null };
  const setHelp = (p: Partial<DockHelp>) => onChange({ ...value, [helpKey]: { ...help, ...p } });
  const roles = value[rolesKey] ?? BLANK_ROLES;
  const setRole = (p: DockParty, r: Partial<DockRole>) => onChange({
    ...value,
    [rolesKey]: { ...roles, parties: { ...roles.parties, [p]: { does: '', brings: '', ...roles.parties[p], ...r } } },
  });

  /*
   * Moving between one box and one per party carries the words across, so
   * nothing typed is lost: one box's text becomes "Anything else" on the
   * way to several, and the several become the one box's text on the way
   * back, where the broker can trim it.
   */
  const setBy = (next: DockParty[]) => {
    if (next.length > 1 && by.length < 2) {
      onChange({ ...value, [byKey]: next, [rolesKey]: value[rolesKey] ?? { parties: {}, notes: value[condKey].trim() } });
    } else if (next.length < 2 && by.length > 1) {
      onChange({ ...value, [byKey]: next, [rolesKey]: null, [condKey]: composeDockConditions(by, roles, help) });
    } else {
      onChange({ ...value, [byKey]: next });
    }
  };
  const problem = dockEndProblem(dockWorkForSave(value), end);
  // The example under the box: the 3rd party's when one is picked, since
  // that is the end with the most to say; else the first picked.
  const hintFor: DockParty | undefined = third ? 'third_party' : by[0];

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <p data-es className="text-sm font-semibold text-gray-800">{end === 'pickup' ? 'Pickup' : 'Delivery'}</p>
      <div>
        <p data-es className="text-xs font-medium text-gray-600 mb-1.5">
          {end === 'pickup' ? 'Who loads the truck?' : 'Who unloads the truck?'}
        </p>
        <MultiChoice<DockParty> name={end === 'pickup' ? 'Loaded by' : 'Unloaded by'}
          options={DOCK_PARTIES} labels={DOCK_PARTY_LABEL} value={by}
          onChange={setBy} />
        <p className="text-xs text-gray-500 mt-1.5">
          <Bi>Pick everyone who helps — more than one is fine.</Bi>
        </p>
        {dockPartiesOdd(by) && (
          <p className="text-xs text-amber-700 mt-1.5">
            <Bi>Both the shipper and the consignee? They are usually at different ends of the load. Check this is right — you can still save it.</Bi>
          </p>
        )}
        {/* Alone, the driver does the work; with anybody else they share it,
            and the carrier should hear which before accepting either way. */}
        {by.includes('driver') && (
          <p className="text-xs text-amber-700 mt-1.5">
            {by.length === 1
              ? <Bi>The driver does the work. The Dispatch Sheet tells the carrier before they accept the load.</Bi>
              : end === 'pickup'
                ? <Bi>The driver works together with the others to load the truck. The Dispatch Sheet tells the carrier before they accept the load.</Bi>
                : <Bi>The driver works together with the others to unload the truck. The Dispatch Sheet tells the carrier before they accept the load.</Bi>}
          </p>
        )}
      </div>

      {third && (
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

      {/* With several at one dock, "who does what" is the whole point: a
          shared job nobody split is the one that goes wrong. So each party
          gets its own two questions instead of one box to remember them in. */}
      {by.length > 1 ? (
        <div className="space-y-3">
          {by.map((p) => {
            const name = dockPartyName(p, help);
            const r = roles.parties[p] ?? { does: '', brings: '' };
            return (
              <div key={p} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-800">{name}</p>
                <div>
                  <label htmlFor={`dock-${end}-${p}-does`} className="block text-xs font-medium text-gray-600 mb-1">
                    <span data-es>What will they do?</span> <span className="text-red-600" aria-hidden>*</span>
                  </label>
                  <textarea id={`dock-${end}-${p}-does`} rows={2} maxLength={MAX_DOCK_ROLE_DOES} aria-required
                    value={r.does} onChange={(e) => setRole(p, { does: e.target.value })}
                    placeholder={DOES_HINT[p]} className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`dock-${end}-${p}-brings`} className="block text-xs font-medium text-gray-600 mb-1">
                    <span data-es>What tools or equipment will they bring?</span>
                  </label>
                  <input id={`dock-${end}-${p}-brings`} maxLength={MAX_DOCK_ROLE_BRINGS}
                    value={r.brings} onChange={(e) => setRole(p, { brings: e.target.value })}
                    placeholder={BRINGS_HINT[p]} className={INPUT} />
                </div>
              </div>
            );
          })}
          <div>
            <label htmlFor={`dock-${end}-notes`} className="block text-xs font-medium text-gray-600 mb-1">
              <span data-es>Anything else at this dock</span>
            </label>
            <textarea id={`dock-${end}-notes`} rows={2} maxLength={MAX_DOCK_ROLE_NOTES}
              value={roles.notes} onChange={(e) => onChange({ ...value, [rolesKey]: { ...roles, notes: e.target.value } })}
              placeholder="e.g. Dock 4, 8am–10am window. Driver stays to sign." className={INPUT} />
            <p className="text-xs text-gray-500 mt-1">
              <Bi>Each answer is printed as its own line on the SA, the Dispatch Sheet and the BOL.</Bi>
            </p>
          </div>
        </div>
      ) : hintFor && (
        <div>
          <label htmlFor={`dock-conditions-${end}`} className="block text-xs font-medium text-gray-600 mb-1.5">
            <span data-es>Conditions</span> <span className="text-red-600" aria-hidden>*</span>
          </label>
          <textarea id={`dock-conditions-${end}`} rows={3} maxLength={MAX_DOCK_CONDITIONS} aria-required
            value={value[condKey]} onChange={(e) => onChange({ ...value, [condKey]: e.target.value })}
            placeholder={CONDITIONS_HINT[hintFor]} className={INPUT} />
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
