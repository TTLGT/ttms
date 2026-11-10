'use client';

import { useEffect, useMemo, useState } from 'react';
import { zoneGaps } from '@/types/clockChange';
import type { ClockChange, ZoneId } from '@/types/clockChange';
import UsTimeZoneMap from './UsTimeZoneMap';
import TimeConverter from './TimeConverter';
import { Bi } from '@/components/spanish/Es';

/*
 * The map and the converter side by side — the body of the clock change
 * banner, and the whole of the dashboard's US time zones section.
 *
 * Self-contained on purpose: it takes whose clock and which change, and asks
 * nobody anything, so it can move to the Broker Dashboard when that exists
 * without bringing the banner along.
 */
export default function TimeZoneTool({
  viewerTz,
  change,
  changeLabel,
}: {
  viewerTz: string;
  /** A change near today, to show before and after; null for today's gaps only. */
  change: ClockChange | null;
  changeLabel: string | null;
}) {
  const gaps = useMemo(() => zoneGaps(viewerTz, change), [viewerTz, change]);
  // Starts on a zone that moved, since that is what the reader came to see;
  // Eastern otherwise, where most of the freight is.
  const [selected, setSelected] = useState<ZoneId>(() => (gaps.find((g) => g.moved) ?? gaps[0]).id);
  useEffect(() => {
    if (!gaps.some((g) => g.id === selected)) setSelected((gaps.find((g) => g.moved) ?? gaps[0]).id);
  }, [gaps, selected]);

  const zone = gaps.find((g) => g.id === selected) ?? gaps[0];
  const anyStill = gaps.some((g) => !g.moved) && gaps.some((g) => g.moved);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <Bi>Your time difference with the US</Bi>
        </p>
        <UsTimeZoneMap gaps={gaps} selected={selected} onSelect={setSelected} />

        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Time zones">
          {gaps.map((g) => {
            const on = g.id === selected;
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                data-es={g.name}
                onClick={() => setSelected(g.id)}
                title={g.where}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  on
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-brand-500'
                }`}
              >
                {g.moved && <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-white' : 'bg-amber-500'}`} aria-hidden />}
                {g.name}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] leading-snug text-gray-400">
          {anyStill && <><Bi>Striped: your time difference with that zone does not change.</Bi>{' '}</>}
          <Bi>A few states, such as Texas, Florida and Tennessee, are split between two zones and are coloured by the one covering most of the state.</Bi>
        </p>
      </div>

      {/* Not keyed by zone: the time and direction someone set carry over as they click around the map. */}
      <TimeConverter zone={zone} changeLabel={change ? changeLabel : null} />
    </div>
  );
}
