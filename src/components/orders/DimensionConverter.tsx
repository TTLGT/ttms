'use client';

import { useState } from 'react';
import { Calculator } from 'lucide-react';

/**
 * A scratchpad beside the order form. Brokers get dimensions quoted in
 * whatever the customer happens to use — a European machine in metres, a US
 * flatbed in feet-and-inches — and have to enter one consistent set on the
 * order. This converts; it deliberately does not write into the form, so a
 * stray keystroke here can never alter the load that gets booked.
 *
 * Its unit list is wider than the order's own (`DimensionUnit` / `WeightUnit`)
 * because a broker may need to read yards or grams even though the order is
 * never stored in them.
 */

const LENGTH_UNITS = {
  in: { label: 'Inches (in)', perInch: 1 },
  ft: { label: 'Feet (ft)', perInch: 12 },
  yd: { label: 'Yards (yd)', perInch: 36 },
  mm: { label: 'Millimetres (mm)', perInch: 1 / 25.4 },
  cm: { label: 'Centimetres (cm)', perInch: 1 / 2.54 },
  m: { label: 'Metres (m)', perInch: 100 / 2.54 },
} as const;

const WEIGHT_UNITS = {
  lb: { label: 'Pounds (lbs)', perPound: 1 },
  kg: { label: 'Kilograms (kg)', perPound: 2.20462262185 },
  oz: { label: 'Ounces (oz)', perPound: 1 / 16 },
  g: { label: 'Grams (g)', perPound: 2.20462262185 / 1000 },
  ton: { label: 'US tons', perPound: 2000 },
  t: { label: 'Metric tonnes', perPound: 2204.62262185 },
} as const;

type LengthUnit = keyof typeof LENGTH_UNITS;
type WeightUnit = keyof typeof WEIGHT_UNITS;

/** Trims to something readable without hiding a meaningful fraction. */
function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  const abs = Math.abs(n);
  const decimals = abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  return Number(n.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function parse(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const INPUT =
  'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{children}</h3>
  );
}

export default function DimensionConverter() {
  const [lengthValue, setLengthValue] = useState('');
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>('in');

  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');

  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');

  const [vL, setVL] = useState('');
  const [vW, setVW] = useState('');
  const [vH, setVH] = useState('');
  const [vUnit, setVUnit] = useState<LengthUnit>('in');

  const asInches = parse(lengthValue) * LENGTH_UNITS[lengthUnit].perInch;
  const asPounds = parse(weightValue) * WEIGHT_UNITS[weightUnit].perPound;

  const ftInTotalInches = parse(feet) * 12 + parse(inches);

  const factor = LENGTH_UNITS[vUnit].perInch;
  const cubicInches = parse(vL) * factor * (parse(vW) * factor) * (parse(vH) * factor);

  return (
    <aside className="bg-white rounded-xl border border-gray-200 p-5 space-y-6 lg:sticky lg:top-8">
      <div className="flex items-center gap-2">
        <Calculator className="w-4 h-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-gray-900">Conversion Calculator</h2>
      </div>
      <p className="-mt-4 text-xs text-gray-500">
        A scratchpad only — nothing here is saved to the order.
      </p>

      {/* Length */}
      <div>
        <SectionTitle>Length</SectionTitle>
        <div className="flex gap-2 mb-2">
          <input
            type="number"
            step="any"
            value={lengthValue}
            onChange={(e) => setLengthValue(e.target.value)}
            placeholder="0"
            className={INPUT}
          />
          <select
            value={lengthUnit}
            onChange={(e) => setLengthUnit(e.target.value as LengthUnit)}
            className={`${INPUT} w-32`}
          >
            {(Object.keys(LENGTH_UNITS) as LengthUnit[]).map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          {(Object.keys(LENGTH_UNITS) as LengthUnit[])
            .filter((u) => u !== lengthUnit)
            .map((u) => (
              <ResultRow
                key={u}
                label={LENGTH_UNITS[u].label}
                value={`${fmt(asInches / LENGTH_UNITS[u].perInch)} ${u}`}
              />
            ))}
        </div>
      </div>

      {/* Feet + inches — the way US flatbed dimensions are almost always quoted */}
      <div>
        <SectionTitle>Feet &amp; inches</SectionTitle>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number"
            step="any"
            value={feet}
            onChange={(e) => setFeet(e.target.value)}
            placeholder="0"
            className={INPUT}
          />
          <span className="text-xs text-gray-500">ft</span>
          <input
            type="number"
            step="any"
            value={inches}
            onChange={(e) => setInches(e.target.value)}
            placeholder="0"
            className={INPUT}
          />
          <span className="text-xs text-gray-500">in</span>
        </div>
        <ResultRow label="Total inches" value={`${fmt(ftInTotalInches)} in`} />
        <ResultRow label="Decimal feet" value={`${fmt(ftInTotalInches / 12)} ft`} />
        <ResultRow label="Centimetres" value={`${fmt(ftInTotalInches * 2.54)} cm`} />
        <ResultRow label="Metres" value={`${fmt((ftInTotalInches * 2.54) / 100)} m`} />
      </div>

      {/* Weight */}
      <div>
        <SectionTitle>Weight</SectionTitle>
        <div className="flex gap-2 mb-2">
          <input
            type="number"
            step="any"
            value={weightValue}
            onChange={(e) => setWeightValue(e.target.value)}
            placeholder="0"
            className={INPUT}
          />
          <select
            value={weightUnit}
            onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}
            className={`${INPUT} w-32`}
          >
            {(Object.keys(WEIGHT_UNITS) as WeightUnit[]).map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          {(Object.keys(WEIGHT_UNITS) as WeightUnit[])
            .filter((u) => u !== weightUnit)
            .map((u) => (
              <ResultRow
                key={u}
                label={WEIGHT_UNITS[u].label}
                value={`${fmt(asPounds / WEIGHT_UNITS[u].perPound)} ${u}`}
              />
            ))}
        </div>
      </div>

      {/* Volume */}
      <div>
        <SectionTitle>Volume (L × W × H)</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <input type="number" step="any" value={vL} onChange={(e) => setVL(e.target.value)} placeholder="L" className={INPUT} />
          <input type="number" step="any" value={vW} onChange={(e) => setVW(e.target.value)} placeholder="W" className={INPUT} />
          <input type="number" step="any" value={vH} onChange={(e) => setVH(e.target.value)} placeholder="H" className={INPUT} />
          <select
            value={vUnit}
            onChange={(e) => setVUnit(e.target.value as LengthUnit)}
            className={INPUT}
          >
            {(Object.keys(LENGTH_UNITS) as LengthUnit[]).map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <ResultRow label="Cubic feet" value={`${fmt(cubicInches / 1728)} ft³`} />
        <ResultRow label="Cubic metres" value={`${fmt(cubicInches / 61023.7441)} m³`} />
        <ResultRow label="Cubic inches" value={`${fmt(cubicInches)} in³`} />
      </div>
    </aside>
  );
}
