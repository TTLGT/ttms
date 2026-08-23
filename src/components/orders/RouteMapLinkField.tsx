'use client';

import { useEffect, useRef } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { buildRouteMapUrl } from '@/types/order';
import type { Address } from '@/types/order';

interface Props {
  origin: Address;
  destination: Address;
  value: string;
  onChange: (url: string) => void;
}

/**
 * The Google Maps route link, kept in step with the two addresses.
 *
 * It rewrites itself while the field still holds a link this component
 * generated, and stops the moment a broker types their own — pasting a link to
 * a specific gate, yard or truck-legal route is the whole reason the field is
 * editable, and having it overwritten on the next keystroke in the address
 * would make that impossible.
 */
export default function RouteMapLinkField({ origin, destination, value, onChange }: Props) {
  const auto = buildRouteMapUrl(origin, destination);
  // The last URL this component produced. Anything else already in the box —
  // a link loaded from a saved order, say — is the broker's own.
  const lastAuto = useRef(value);
  // Set once the broker types in the field, including clearing it. Without
  // this, a deliberately emptied field would refill on the next render.
  const userEdited = useRef(false);

  useEffect(() => {
    if (!auto || userEdited.current) return;
    if (value && value !== lastAuto.current) return;
    if (value === auto) return;
    lastAuto.current = auto;
    onChange(auto);
    // onChange is a fresh closure on every parent render; depending on it here
    // would loop. The address-derived URL is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, value]);

  function regenerate() {
    if (!auto) return;
    lastAuto.current = auto;
    userEdited.current = false;
    onChange(auto);
  }

  function handleType(next: string) {
    userEdited.current = true;
    onChange(next);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-600">Google Maps route</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={regenerate}
            disabled={!auto || value === auto}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:text-gray-300 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-3 h-3" /> Rebuild from addresses
          </button>
          {value && (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <ExternalLink className="w-3 h-3" /> Open
            </a>
          )}
        </div>
      </div>
      <input
        type="url"
        value={value}
        onChange={(e) => handleType(e.target.value)}
        placeholder="Fills in automatically once both addresses are entered"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      <p className="mt-1 text-xs text-gray-500">
        Built from the origin and destination above. Paste your own link to override it — a custom
        link is never overwritten.
      </p>
    </div>
  );
}
