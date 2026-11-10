'use client';

import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { clockText, dayShift } from '@/types/clockChange';
import type { ZoneGap } from '@/types/clockChange';
import { Bi } from '@/components/spanish/Es';

/*
 * "When it is 8:00 am in Eastern, it is … for you" — and the other way round.
 *
 * Works in hours on the reader's own clock, from the zone's gap with them
 * (src/types/clockChange.ts). Around a clock change it answers twice, before
 * and after, so the hour that moved is the thing on screen. Nothing is saved;
 * the slider starts at 8am every time.
 */

const PRESETS: Array<[number, string]> = [[7, '7 am'], [8, '8 am'], [12, 'Noon'], [17, '5 pm']];

export default function TimeConverter({
  zone,
  changeLabel,
}: {
  zone: ZoneGap;
  /** The change's date as shown elsewhere on the card, or null when no change is near. */
  changeLabel: string | null;
}) {
  const [hour, setHour] = useState(8);
  const [fromThem, setFromThem] = useState(true);

  const place = zone.id === 'office' ? 'at the office' : `in ${zone.name}`;
  const convert = (gap: number) => (fromThem ? hour - gap / 60 : hour + gap / 60);
  const before = convert(zone.before);
  const after = convert(zone.after);
  const unit = fromThem ? 'your time' : `${zone.name} time`;
  const showBoth = zone.moved && changeLabel !== null;

  const value = (h: number) => (
    <>
      {clockText(h)}
      {dayShift(h) !== 0 && (
        <span className="ml-1 text-[11px] font-medium text-gray-400">{dayShift(h) > 0 ? 'next day' : 'day before'}</span>
      )}
    </>
  );

  return (
    <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 text-sm text-gray-600">
        <span>
          When it is{' '}
          <span className="font-[family-name:var(--font-rajdhani)] text-2xl font-bold tabular-nums text-gray-900">
            {clockText(hour)}
          </span>
          {fromThem ? ` ${place}, it is…` : ` for you, ${place} it is…`}
        </span>
        <button
          type="button"
          onClick={() => setFromThem((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-brand-600 transition hover:border-brand-500"
        >
          <ArrowLeftRight size={12} />
          {fromThem ? 'Start from your time' : `Start from ${zone.name}`}
        </button>
      </div>

      <div>
        <input
          type="range"
          min={0}
          max={23.5}
          step={0.5}
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          aria-label="Time to convert"
          className="w-full accent-brand-600"
        />
        <div className="-mt-1 flex justify-between text-[10px] tabular-nums text-gray-400">
          <span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>11:30 pm</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([h, label]) => (
          <button
            key={h}
            type="button"
            data-es={label === 'Noon' ? 'Noon' : undefined}
            onClick={() => setHour(h)}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-600 transition hover:border-brand-500 hover:text-gray-900"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-1.5">
        {showBoth ? (
          <>
            <div className="flex items-baseline justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <span className="text-xs text-gray-400">Until {changeLabel}</span>
              <span className="text-sm font-medium tabular-nums text-gray-400 line-through">{value(before)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="text-xs text-amber-700">From {changeLabel}</span>
              <span className="text-lg font-semibold tabular-nums text-amber-700">{value(after)}</span>
            </div>
          </>
        ) : (
          <div className="flex items-baseline justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <span className="text-xs text-gray-400">{fromThem ? 'Your time' : `${zone.name} time`}</span>
            <span className="text-lg font-semibold tabular-nums text-gray-900">{value(after)}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {showBoth
          ? `Shown in ${unit}. Anything booked ${place} for after ${changeLabel} moves by one hour on your side.`
          : changeLabel !== null
            ? `${zone.name} keeps the same gap with you through this change, so nothing booked there moves.`
            : <Bi>{'Shown on today’s clocks.'}</Bi>}
      </p>
    </div>
  );
}
