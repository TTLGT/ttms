'use client';

import { Plus, Trash2 } from 'lucide-react';
import MoneyInput from '@/components/MoneyInput';
import {
  blankCommodityItem,
  itemVolumeFt3,
  itemWeightLb,
  totalPieces,
  totalWeightLb,
  totalCommodityValue,
  DIMENSION_UNITS,
  WEIGHT_UNITS,
  DIMENSION_UNIT_LABEL,
  WEIGHT_UNIT_LABEL,
  itemStop,
  VEHICLE_CONDITIONS,
  VEHICLE_CONDITION_LABEL,
  VEHICLE_TYPE_SUGGESTIONS,
} from '@/types/order';
import type { CommodityItem, DimensionUnit, StopKind, WeightUnit } from '@/types/order';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

/**
 * Number inputs are held as strings so a half-typed value ("1.", "") is not
 * coerced to 0 under the broker's cursor. The item itself stays numeric, so
 * this converts only on the way in.
 */
function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Renders 0 as an empty box — a blank weight reads better than a false "0". */
function str(v: number): string {
  return v ? String(v) : '';
}

/**
 * Unlike the numbers above, a blank value box means "not declared" and stays
 * null, not 0 — a line recorded as worth $0 would read as a real figure. A
 * typed 0 is kept, so the rendering side (`value ?? ''`) round-trips it.
 */
function money(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

interface Props {
  value: CommodityItem[];
  onChange: (items: CommodityItem[]) => void;
  /**
   * One label per pickup and per delivery on the load, first stop first —
   * "Pickup 1 · Acme, Dallas TX". A line is asked where it is picked up or
   * delivered only when there is more than one stop of that kind to choose
   * from; with one, everything goes through it and the question is noise.
   */
  pickups?: string[];
  deliveries?: string[];
}

export default function CommodityItemsFields({ value, onChange, pickups = [], deliveries = [] }: Props) {
  const askPickup = pickups.length > 1;
  const askDelivery = deliveries.length > 1;
  const items = value.length ? value : [blankCommodityItem()];

  function patch(id: string, changes: Partial<CommodityItem>) {
    onChange(items.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }

  function add() {
    // A second piece is usually a variation on the first, so the new line
    // inherits the units the broker is already working in.
    const last = items[items.length - 1];
    onChange([
      ...items,
      { ...blankCommodityItem(), dimensionUnit: last.dimensionUnit, weightUnit: last.weightUnit },
    ]);
  }

  function remove(id: string) {
    const next = items.filter((it) => it.id !== id);
    // Never leave the editor with nothing to type into.
    onChange(next.length ? next : [blankCommodityItem()]);
  }

  const pieces = totalPieces(items);
  const weight = totalWeightLb(items);
  const volume = items.reduce((sum, it) => sum + itemVolumeFt3(it), 0);
  const declared = totalCommodityValue(items);

  return (
    <div className="space-y-3">
      <datalist id="vehicle-type-suggestions">
        {VEHICLE_TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
      </datalist>
      {items.map((item, idx) => {
        const lineWeight = itemWeightLb(item);
        return (
          <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Item {idx + 1}
              </p>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="text-gray-400 hover:text-red-600 transition"
                  aria-label={`Remove item ${idx + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-12 gap-3">
              <div className="col-span-6">
                <label className="block text-xs font-medium text-gray-600 mb-1">Commodity</label>
                <input
                  required={idx === 0}
                  value={item.description}
                  onChange={(e) => patch(item.id, { description: e.target.value })}
                  placeholder="e.g. Excavator, Crated parts"
                  className={INPUT}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Line value (USD)</label>
                <MoneyInput
                  value={item.value == null ? '' : String(item.value)}
                  onChange={(v) => patch(item.id, { value: money(v) })}
                  placeholder="0.00"
                  title="What the goods on this line are worth, all pieces together"
                  className={INPUT}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Pieces</label>
                <input
                  type="number"
                  min="1"
                  value={str(item.quantity)}
                  onChange={(e) => patch(item.id, { quantity: num(e.target.value) })}
                  placeholder="1"
                  className={INPUT}
                />
              </div>

              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Length</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={str(item.length)}
                  onChange={(e) => patch(item.id, { length: num(e.target.value) })}
                  placeholder="0"
                  className={INPUT}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Width</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={str(item.width)}
                  onChange={(e) => patch(item.id, { width: num(e.target.value) })}
                  placeholder="0"
                  className={INPUT}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Height</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={str(item.height)}
                  onChange={(e) => patch(item.id, { height: num(e.target.value) })}
                  placeholder="0"
                  className={INPUT}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Units</label>
                <select
                  value={item.dimensionUnit}
                  onChange={(e) => patch(item.id, { dimensionUnit: e.target.value as DimensionUnit })}
                  className={INPUT}
                >
                  {DIMENSION_UNITS.map((u) => (
                    <option key={u} value={u}>{DIMENSION_UNIT_LABEL[u]}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-6">
                <label className="block text-xs font-medium text-gray-600 mb-1">Weight (each)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={str(item.weight)}
                  onChange={(e) => patch(item.id, { weight: num(e.target.value) })}
                  placeholder="0"
                  className={INPUT}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Units</label>
                <select
                  value={item.weightUnit}
                  onChange={(e) => patch(item.id, { weightUnit: e.target.value as WeightUnit })}
                  className={INPUT}
                >
                  {WEIGHT_UNITS.map((u) => (
                    <option key={u} value={u}>{WEIGHT_UNIT_LABEL[u]}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Line total</label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-700">
                  {lineWeight ? `${Math.round(lineWeight).toLocaleString()} lbs` : '—'}
                </div>
              </div>

              {/* Vehicle — asked on every line. Left blank for freight that
                  is not a vehicle; nothing here is required. */}
              <p className="col-span-6 sm:col-span-12 mt-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Vehicle
              </p>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={item.year ?? ''}
                  onChange={(e) => patch(item.id, { year: e.target.value.replace(/\D/g, '') })}
                  placeholder="2019"
                  className={INPUT}
                />
              </div>
              <div className="col-span-4 sm:col-span-5">
                <label className="block text-xs font-medium text-gray-600 mb-1">Make</label>
                <input
                  maxLength={60}
                  value={item.make ?? ''}
                  onChange={(e) => patch(item.id, { make: e.target.value })}
                  placeholder="e.g. Toyota"
                  className={INPUT}
                />
              </div>
              <div className="col-span-6 sm:col-span-5">
                <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
                <input
                  maxLength={60}
                  value={item.model ?? ''}
                  onChange={(e) => patch(item.id, { model: e.target.value })}
                  placeholder="e.g. Camry"
                  className={INPUT}
                />
              </div>

              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                <input
                  maxLength={40}
                  value={item.color ?? ''}
                  onChange={(e) => patch(item.id, { color: e.target.value })}
                  placeholder="e.g. Silver"
                  className={INPUT}
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle type</label>
                <input
                  maxLength={40}
                  list="vehicle-type-suggestions"
                  value={item.vehicleType ?? ''}
                  onChange={(e) => patch(item.id, { vehicleType: e.target.value })}
                  placeholder="e.g. SUV"
                  className={INPUT}
                />
              </div>
              <div className="col-span-6">
                <label className="block text-xs font-medium text-gray-600 mb-1">VIN</label>
                <input
                  maxLength={17}
                  value={item.vin ?? ''}
                  // VINs are printed in capitals with no spaces or dashes, so
                  // both are tidied away as typed. Length is not enforced:
                  // a pre-1981 VIN is shorter than 17 and still real.
                  onChange={(e) => patch(item.id, { vin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                  placeholder="17 characters"
                  className={`${INPUT} font-mono tracking-wide`}
                />
              </div>

              <div className="col-span-6 sm:col-span-12">
                <span className="block text-xs font-medium text-gray-600 mb-1">Vehicle condition</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Vehicle condition, item ${idx + 1}`}>
                  {VEHICLE_CONDITIONS.map((c) => {
                    const on = item.condition === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        // Clicking the chosen one again clears it, so a line
                        // that is not a vehicle can go back to "not said".
                        onClick={() => patch(item.id, { condition: on ? null : c })}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                          on
                            ? c === 'inoperable'
                              ? 'border-red-300 bg-red-50 text-red-700 font-medium'
                              : 'border-green-300 bg-green-50 text-green-700 font-medium'
                            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {VEHICLE_CONDITION_LABEL[c]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {askPickup && (
                <StopSelect kind="pickup" label="Picked up at" stops={pickups}
                  value={itemStop(item, 'pickup', pickups.length)}
                  onChange={(pickupStop) => patch(item.id, { pickupStop })} />
              )}
              {askDelivery && (
                <StopSelect kind="delivery" label="Delivered to" stops={deliveries}
                  value={itemStop(item, 'delivery', deliveries.length)}
                  onChange={(deliveryStop) => patch(item.id, { deliveryStop })} />
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="w-4 h-4" /> Add another commodity
        </button>
        <p className="text-xs text-gray-500">
          {pieces.toLocaleString()} {pieces === 1 ? 'piece' : 'pieces'}
          {' · '}
          {weight ? `${Math.round(weight).toLocaleString()} lbs total` : 'no weight yet'}
          {volume ? ` · ${volume.toFixed(1)} ft³` : ''}
          {declared != null
            ? ` · $${declared.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} declared`
            : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * Which stop a line goes through. Left on "Not set" it is still saved; the
 * BOL then prints a dash for it, which is the driver's cue to ask rather than
 * a guess that sends the excavator to the wrong dock.
 */
function StopSelect({ kind, label, stops, value, onChange }: {
  kind: StopKind;
  label: string;
  stops: string[];
  value: number | null;
  onChange: (index: number | null) => void;
}) {
  return (
    <div className="col-span-6">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`${INPUT} ${value == null ? 'text-gray-500' : ''}`}
        aria-label={`${label} (${kind})`}
      >
        <option value="">Not set</option>
        {stops.map((name, i) => <option key={i} value={i}>{name}</option>)}
      </select>
    </div>
  );
}
