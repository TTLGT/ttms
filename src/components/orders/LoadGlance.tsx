'use client';

import { ArrowRight } from 'lucide-react';
import { OrderCoverThumb } from '@/components/photos/PhotoBits';
import { withCountry } from '@/types/addressCountry';
import { formatDimensions, itemWeightLb } from '@/types/order';
import type { Address, CommodityItem } from '@/types/order';
import { Bi } from '@/components/spanish/Es';

/** "Dallas, TX 75201" — the street is left out; this is for recognising the lane. */
function place(a: Address): string {
  const line = [a.city.trim(), [a.state.trim(), a.zip.trim()].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  return line ? withCountry(line, a) : '';
}

/**
 * What the load is and where it goes, read-only, above a one-section edit
 * that would otherwise show neither (asked for on Loading and Unloading,
 * 2026-11-12: whether a forklift is enough depends on the freight and the
 * place). Drawn from the form's own state, so it costs no read; the picture
 * is the signed cover link the order already came back with.
 */
export default function LoadGlance({ coverUrl, commodities, origin, destination, extraStops }: {
  coverUrl: string | null | undefined;
  commodities: CommodityItem[];
  origin: Address;
  destination: Address;
  /** Pickups and deliveries beyond the first of each, only counted here. */
  extraStops: number;
}) {
  const from = place(origin);
  const to = place(destination);
  const lines = commodities.filter((c) => c.description.trim() || c.make || c.model);
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex gap-4 items-start">
        <OrderCoverThumb url={coverUrl} size={88} className="rounded-xl" alt="Load profile picture" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-gray-900">
            <span>{from || <span className="text-gray-400 font-normal">No pickup city yet</span>}</span>
            <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>{to || <span className="text-gray-400 font-normal">No delivery city yet</span>}</span>
            {extraStops > 0 && (
              <span className="text-xs font-normal text-gray-500">
                + {extraStops} more {extraStops === 1 ? 'stop' : 'stops'}
              </span>
            )}
          </div>
          {lines.length ? (
            <ul className="space-y-1">
              {lines.map((c) => {
                const name = c.description.trim() || [c.year, c.make, c.model].filter(Boolean).join(' ');
                const dims = formatDimensions(c);
                const lb = itemWeightLb(c);
                return (
                  <li key={c.id} className="text-sm text-gray-700">
                    <span className="text-gray-500">{c.quantity || 1} ×</span> {name}
                    {(dims || lb > 0) && (
                      <span className="text-xs text-gray-500">
                        {' · '}{[dims, lb > 0 ? `${Math.round(lb).toLocaleString()} lb total` : ''].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-400"><Bi>No commodity described yet.</Bi></p>
          )}
        </div>
      </div>
    </section>
  );
}
