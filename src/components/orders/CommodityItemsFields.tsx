'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  blankCommodityItem,
  itemVolumeFt3,
  itemWeightLb,
  totalPieces,
  totalWeightLb,
  DIMENSION_UNITS,
  WEIGHT_UNITS,
  DIMENSION_UNIT_LABEL,
  WEIGHT_UNIT_LABEL,
} from '@/types/order';
import type { CommodityItem, DimensionUnit, WeightUnit } from '@/types/order';

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

interface Props {
  value: CommodityItem[];
  onChange: (items: CommodityItem[]) => void;
}

export default function CommodityItemsFields({ value, onChange }: Props) {
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

  return (
    <div className="space-y-3">
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
              <div className="col-span-6 sm:col-span-9">
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
        </p>
      </div>
    </div>
  );
}
