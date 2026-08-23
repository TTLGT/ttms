'use client';

import { useEffect, useRef, useState } from 'react';
import { Route } from 'lucide-react';
import { formatLaneMiles, isRoutableAddress, laneMilesCaption, laneMilesLabel } from '@/types/order';
import type { Address, LaneMilesSource } from '@/types/order';
import { fetchLaneDistance } from '@/lib/routeDistanceClient';

export interface LaneDistanceValue {
  laneMiles: number | null;
  laneMilesSource: LaneMilesSource | null;
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
 * The debounce matters more under Google Routes than under the free estimate:
 * there, every fire is a billed request.
 */
export default function RouteDistanceField({ origin, destination, value, onChange }: Props) {
  const [message, setMessage] = useState('');
  const [disabled, setDisabled] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      const result = await fetchLaneDistance(origin, destination);
      if (cancelled) return;

      if (result.status === 'disabled') {
        setDisabled(true);
        return;
      }
      setDisabled(false);

      if (result.status === 'ok') {
        // A degraded result means Google failed and the free estimate stood in.
        // Worth saying out loud — an admin who chose Routes should find out
        // their key or billing has lapsed.
        setMessage(result.degraded ? `Google Routes unavailable (${result.degraded}) — showing an estimate` : '');
        onChangeRef.current({ laneMiles: result.miles, laneMilesSource: result.source });
        return;
      }

      onChangeRef.current({ laneMiles: null, laneMilesSource: null });
      if (result.status === 'need_zip') setMessage('Add a ZIP to both addresses to work out the distance');
      if (result.status === 'unknown_zip') setMessage(`ZIP ${result.zip} was not recognised`);
      if (result.status === 'error') setMessage(result.message);
    }, 600);

    return () => { cancelled = true; clearTimeout(timer); };
    // `lane` already tracks every address field the lookup reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane]);

  if (disabled) return null;

  const caption = laneMilesCaption(value.laneMilesSource);

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3">
      <Route className="w-4 h-4 text-brand-600 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-600">{laneMilesLabel(value.laneMilesSource)}</p>
        {value.laneMiles !== null ? (
          <>
            <p className="text-sm font-semibold text-gray-900">
              {formatLaneMiles(value.laneMiles, value.laneMilesSource)}
              {caption && <span className="font-normal text-gray-500"> · {caption}</span>}
            </p>
            {message && <p className="text-xs text-amber-700 mt-0.5">{message}</p>}
          </>
        ) : (
          <p className="text-sm text-gray-500 truncate">
            {message || (routable ? 'Not worked out yet' : 'Enter both addresses to work out the distance')}
          </p>
        )}
      </div>
    </div>
  );
}
