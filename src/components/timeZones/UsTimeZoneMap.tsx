'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { ZONE_OF_STATE, ZONE_STATES, gapText } from '@/types/clockChange';
import type { ZoneGap, ZoneId } from '@/types/clockChange';

/*
 * The US drawn state by state, each filled by its time zone and labelled with
 * the reader's gap to it — see src/types/clockChange.ts.
 *
 * The shapes are src/lib/data/usStates.json: us-atlas 3.0.1's
 * `states-albers-10m.json` (US Census boundaries, public domain), already
 * projected to a 975×610 Albers USA frame with Alaska and Hawaii in the usual
 * insets, turned into SVG path strings with d3-geo at one decimal place. No
 * map service and no key; about 100 KB, fetched only when a map is on screen.
 * To rebuild it: topojson-client's `feature()` over `objects.states`, then
 * `geoPath().digits(1)` with no projection, keeping `{ n: name, d: path,
 * c: centroid, a: area }` per state.
 *
 * Colours come from globals.css (`.tz-map`): SVG fills are not reached by the
 * Tailwind colour mapping, so the rules there read the same CSS variables the
 * mapping writes, and the map follows light, dim and dark like everything else.
 */

interface Shape { n: string; d: string; c: number[]; a: number }

// Kept for the life of the page: the banner and the dashboard section can both
// draw a map, and the second should not wait for the file again.
let loaded: Shape[] | null = null;

/** Neighbouring zones alternate between two tints so the boundaries read. */
const TINT: Record<string, string> = { pt: 'tz-z1', mt: 'tz-z2', ct: 'tz-z1', et: 'tz-z2', az: 'tz-z1', ak: 'tz-z2', hi: 'tz-z1' };

/** Where a label would otherwise sit on a coastline or a neighbour's name. */
const NUDGE: Record<string, [number, number]> = { et: [25, 10], pt: [-10, 0], ct: [0, -20], hi: [40, -40], ak: [0, -10] };

export default function UsTimeZoneMap({
  gaps,
  selected,
  onSelect,
}: {
  gaps: ZoneGap[];
  selected: ZoneId;
  onSelect: (id: ZoneId) => void;
}) {
  const [shapes, setShapes] = useState<Shape[] | null>(loaded);
  const [hover, setHover] = useState<string | null>(null);
  // Two maps can be on one page, and a pattern id must be unique in the document.
  const patternId = `tz-nochange-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    if (loaded) return;
    let live = true;
    import('@/lib/data/usStates.json')
      .then((m) => {
        loaded = m.default as unknown as Shape[];
        if (live) setShapes(loaded);
      })
      // A map that cannot load leaves the zone buttons beside it, which do the same job.
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const byId = useMemo(() => new Map(gaps.map((g) => [g.id, g])), [gaps]);

  // Each zone's label at the area-weighted middle of its states.
  const labelAt = useMemo(() => {
    const out: Record<string, [number, number]> = {};
    if (!shapes) return out;
    for (const zone of Object.keys(ZONE_STATES)) {
      let x = 0, y = 0, a = 0;
      for (const s of shapes) {
        if (ZONE_OF_STATE[s.n] !== zone) continue;
        x += s.c[0] * s.a; y += s.c[1] * s.a; a += s.a;
      }
      if (!a) continue;
      const [dx, dy] = NUDGE[zone] ?? [0, 0];
      out[zone] = [x / a + dx, y / a + dy];
    }
    return out;
  }, [shapes]);

  if (!shapes) {
    return <div className="aspect-[975/610] w-full animate-pulse rounded-lg bg-gray-100" aria-hidden />;
  }

  const hoveredZone = hover ? byId.get(ZONE_OF_STATE[hover]) : undefined;

  return (
    <div>
      <svg
        viewBox="0 0 975 610"
        className="tz-map block h-auto w-full"
        role="img"
        aria-label="Map of US time zones with your time difference to each"
        data-learn-skip
      >
        <defs>
          <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect className="tz-pat-bg" width="8" height="8" />
            <line className="tz-pat-ln" x1="0" y1="0" x2="0" y2="8" />
          </pattern>
        </defs>

        {shapes.map((s) => {
          const id = ZONE_OF_STATE[s.n];
          const g = id ? byId.get(id) : undefined;
          if (!g) return null;
          const isSel = id === selected;
          // Striped where the reader's gap does not move — the zones a clock
          // change leaves alone, from where they sit.
          const striped = !isSel && !g.moved;
          return (
            <path
              key={s.n}
              d={s.d}
              className={`tz-st ${isSel ? 'tz-sel' : g.moved ? TINT[id] : ''}`}
              style={striped ? { fill: `url(#${patternId})` } : undefined}
              onClick={() => onSelect(id)}
              onMouseEnter={() => setHover(s.n)}
              onMouseLeave={() => setHover((h) => (h === s.n ? null : h))}
            >
              <title>{`${s.n} · ${g.name}`}</title>
            </path>
          );
        })}

        {Object.entries(labelAt).map(([id, [x, y]]) => {
          const g = byId.get(id as ZoneId);
          if (!g) return null;
          return (
            <g key={id} className={`tz-label${g.moved ? ' moved' : ''}${id === selected ? ' sel' : ''}`}>
              <text className="nm" x={x.toFixed(0)} y={(y - 8).toFixed(0)}>{g.name}</text>
              <text className="gp" x={x.toFixed(0)} y={(y + 14).toFixed(0)}>{gapText(g.after)}</text>
              {g.moved && (
                <text className="was hidden sm:inline" x={x.toFixed(0)} y={(y + 32).toFixed(0)}>was {gapText(g.before)}</text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="mt-1 min-h-[20px] text-xs tabular-nums text-gray-500">
        {hover && hoveredZone ? (
          <>
            <span className="font-semibold text-gray-800">{hover}</span>
            {` · ${hoveredZone.name} time · `}
            {hoveredZone.moved
              ? <>{gapText(hoveredZone.before)} → <span className="font-semibold text-gray-800">{gapText(hoveredZone.after)}</span></>
              : gapText(hoveredZone.after)}
            {' of you'}
          </>
        ) : (
          <span data-es>Point at a state to see its time zone. Click it to convert a time.</span>
        )}
      </p>
    </div>
  );
}
