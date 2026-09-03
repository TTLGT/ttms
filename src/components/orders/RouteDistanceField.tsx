'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Route } from 'lucide-react';
import { formatLaneMiles, isRoutableAddress, laneMilesAtNote, laneMilesCaption, laneMilesLabel } from '@/types/order';
import type { Address, LaneMilesSource } from '@/types/order';
import { fetchLaneDistance } from '@/lib/routeDistanceClient';
import type { DistanceResult } from '@/lib/routeDistanceClient';
import { useDateFormatters } from '@/lib/useDateFormatters';

export interface LaneDistanceValue {
  laneMiles: number | null;
  laneMilesSource: LaneMilesSource | null;
  /**
   * When the mileage was worked out — see `laneMilesAt` on Order.
   *
   * A real Date, never the `{_seconds}` shape a loaded order arrives in: the
   * form writes this value straight back, and that shape would save as a map
   * instead of a timestamp. Callers loading an order pass it through
   * `toDate()` from src/lib/dateFormat.ts.
   */
  laneMilesAt: Date | null;
}

interface Props {
  origin: Address;
  destination: Address;
  value: LaneDistanceValue;
  onChange: (value: LaneDistanceValue) => void;
}

/**
 * Lane distance for the order, filled in as the two addresses take shape.
 *
 * Which method runs is the admin's choice in Settings, not this component's —
 * it renders whatever the server sends back and labels it accordingly. When
 * distances are switched off it renders nothing at all, so the Route section
 * looks as it did before the feature existed.
 *
 * Under the free estimate it still fills itself in as you type. Under Google
 * Routes it does not: a lane nobody has looked up before is charged for, and a
 * broker types several versions of an address on the way to the right one — so
 * the server answers `needs_lookup` and the number waits for the button here.
 * A lane the company has already paid for once comes back from the cache with
 * no click needed, which is why a saved order being re-opened still fills in.
 * The spending rule itself lives in /api/route-distance; this component only
 * decides how to ask.
 */
export default function RouteDistanceField({ origin, destination, value, onChange }: Props) {
  const { formatDateTime } = useDateFormatters();
  const [message, setMessage] = useState('');
  const [disabled, setDisabled] = useState(false);
  /** Google Routes is on and this lane has never been priced — it costs money. */
  const [needsLookup, setNeedsLookup] = useState(false);
  const [looking, setLooking] = useState(false);

  const routable = isRoutableAddress(origin) && isRoutableAddress(destination);
  // Google routes off the full address; the estimate only reads the ZIP. Key
  // on the whole thing so a corrected street address re-runs under Routes.
  const lane = `${origin?.street ?? ''}|${origin?.city ?? ''}|${origin?.state ?? ''}|${origin?.zip ?? ''}`
    + `>${destination?.street ?? ''}|${destination?.city ?? ''}|${destination?.state ?? ''}|${destination?.zip ?? ''}`;

  // Held in a ref so the effect below does not depend on it — the parent hands
  // over a fresh closure on every render, which would restart the debounce on
  // every keystroke and mean it never settles.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const laneRef = useRef(lane);
  laneRef.current = lane;

  // The lane the mileage on screen was worked out for. Under Routes the number
  // no longer follows the addresses on its own, so without this a corrected ZIP
  // would leave the old mileage sitting there looking current. Tracked during
  // render rather than in an effect so that a value arriving from outside — an
  // order finishing loading on the edit page — counts as belonging to the lane
  // it arrived with.
  const valueLane = useRef(lane);
  const lastMiles = useRef(value.laneMiles);
  if (lastMiles.current !== value.laneMiles) {
    lastMiles.current = value.laneMiles;
    valueLane.current = lane;
  }
  const stale = value.laneMiles !== null && valueLane.current !== lane;

  const apply = useCallback((result: DistanceResult) => {
    if (result.status === 'disabled') {
      setDisabled(true);
      return;
    }
    setDisabled(false);

    if (result.status === 'needs_lookup') {
      // Deliberately leaves the current value alone. An order being edited
      // keeps the mileage it was saved with until somebody asks for a new one;
      // clearing it here would throw a stored number away on the way past.
      setNeedsLookup(true);
      setMessage('');
      return;
    }
    setNeedsLookup(false);

    if (result.status === 'ok') {
      // A degraded result means Google failed and the free estimate stood in.
      // Worth saying out loud — an admin who chose Routes should find out
      // their key or billing has lapsed.
      setMessage(result.degraded ? `Google Routes unavailable (${result.degraded}) — showing an estimate` : '');
      // Set here as well as during render: a new lane can genuinely come back
      // with the same mileage as the old one, and then nothing else would tell
      // this apart from the number never having been refreshed.
      lastMiles.current = result.miles;
      valueLane.current = laneRef.current;
      onChangeRef.current({
        laneMiles: result.miles,
        laneMilesSource: result.source,
        // The server's date, not the browser's — and under Routes a cached
        // lane hands back the date it was originally looked up.
        laneMilesAt: result.calculatedAt ? new Date(result.calculatedAt) : null,
      });
      return;
    }

    onChangeRef.current({ laneMiles: null, laneMilesSource: null, laneMilesAt: null });
    if (result.status === 'need_zip') setMessage('Add a ZIP to both addresses to work out the distance');
    if (result.status === 'unknown_zip') setMessage(`ZIP ${result.zip} was not recognised`);
    if (result.status === 'error') setMessage(result.message);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      // Never asked as `manual`: this fires while somebody is still typing, so
      // under Google Routes it can only be answered from the cache. Nothing on
      // this path can bill.
      const result = await fetchLaneDistance(origin, destination);
      if (!cancelled) apply(result);
    }, 600);

    return () => { cancelled = true; clearTimeout(timer); };
    // `lane` already tracks every address field the lookup reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane]);

  /** The one path in this form allowed to spend money, and only on a click. */
  async function lookUpNow() {
    setLooking(true);
    setMessage('');
    const result = await fetchLaneDistance(origin, destination, true);
    setLooking(false);
    apply(result);
  }

  if (disabled) return null;

  const caption = laneMilesCaption(value.laneMilesSource);
  const atNote = laneMilesAtNote(value.laneMilesSource, formatDateTime(value.laneMilesAt, ''));
  // A half-typed address has nothing worth paying for yet, so the button only
  // appears once both ends could actually be routed.
  const showButton = needsLookup && routable;

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3">
      <Route className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-600">{laneMilesLabel(value.laneMilesSource)}</p>
        {value.laneMiles !== null ? (
          <>
            <p className="text-sm font-semibold text-gray-900">
              {formatLaneMiles(value.laneMiles, value.laneMilesSource)}
              {caption && <span className="font-normal text-gray-500"> · {caption}</span>}
            </p>
            {/* An order being edited usually opens on a distance somebody else
                worked out, possibly months ago — and under Routes a lane just
                fetched can itself be old. Saying when settles whether it is
                worth rechecking. */}
            {atNote && <p className="text-xs text-gray-500 mt-0.5">{atNote}</p>}
            {stale && showButton && (
              <p className="text-xs text-amber-700 mt-0.5">
                The addresses have changed since this distance was worked out.
              </p>
            )}
            {message && <p className="text-xs text-amber-700 mt-0.5">{message}</p>}
          </>
        ) : (
          <p className="text-sm text-gray-500">
            {message || (showButton
              ? 'Not worked out yet — each new lane is charged, so it waits for you'
              : routable
                ? 'Not worked out yet'
                : 'Enter both addresses to work out the distance')}
          </p>
        )}
        {showButton && (
          <button
            type="button"
            onClick={lookUpNow}
            disabled={looking}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${looking ? 'animate-spin' : ''}`} />
            {looking
              ? 'Asking Google…'
              : value.laneMiles !== null ? 'Work out the distance again' : 'Work out the distance'}
          </button>
        )}
      </div>
    </div>
  );
}
