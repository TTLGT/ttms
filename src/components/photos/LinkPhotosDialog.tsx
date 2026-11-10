'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { updateLoadPhoto } from '@/lib/loadPhotos';
import {
  PHOTO_STAGE_LABEL,
  commodityLineChoices,
  itemPhotoRoute,
  photosForItem,
  type LoadPhoto,
} from '@/types/loadPhoto';
import type { CommodityItem, Order } from '@/types/order';
import { StageBadge } from './PhotoBits';
import { Bi } from '@/components/spanish/Es';

interface Props {
  order: Order;
  item: CommodityItem;
  /** Every picture on the load. The line's own are left out of the choices. */
  photos: LoadPhoto[];
  onLinked: (photo: LoadPhoto) => void;
  onClose: () => void;
}

/**
 * Links pictures already on the load to one freight line (2026-11-10) — for
 * pictures added from the Pictures tab, from the driver's link, or before
 * lines could have pictures of their own.
 *
 * Linking is an ordinary picture edit (PATCH /photos/{id}), the same as
 * choosing the line in the viewer's "Which commodity?": the picture becomes a
 * Commodity, linked to this line, labelled with its description and given its
 * pickup and delivery — which it then follows whenever the line's stops
 * change in Freight (toLoadPhoto()).
 *
 * Retyping is said out loud before it happens, because the type carries
 * weight elsewhere: a Truck picture is what the SA review counts, and a Proof
 * one is kept off the client's documents.
 */
export default function LinkPhotosDialog({ order, item, photos, onLinked, onClose }: Props) {
  const own = new Set(photosForItem(photos, item).map((p) => p.id));
  const choices = photos.filter((p) => !own.has(p.id));
  const lines = commodityLineChoices(order);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const chosen = choices.filter((p) => picked.has(p.id));
  const retyped = chosen.filter((p) => p.stage !== 'commodity');
  const name = item.description.trim() || 'this commodity';

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function link() {
    setBusy(true);
    setError('');
    const route = itemPhotoRoute(order, item);
    try {
      for (const p of chosen) {
        const saved = await updateLoadPhoto(order.id, p.id, {
          ...(p.stage !== 'commodity' ? { stage: 'commodity' as const } : {}),
          commodityItemId: item.id,
          pickupAt:  route.pickupAt,
          deliverTo: route.deliverTo,
        });
        onLinked(saved);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The pictures could not be linked');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(10,12,16,0.6)' }}
      role="dialog" aria-modal="true" aria-label="Link pictures"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-3xl bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Link pictures to {name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <Bi>Pick the pictures of this load that show it. They will show beside it in Freight, with its pickup and delivery.</Bi>
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="ml-auto p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {choices.length === 0 ? (
            <p data-es className="text-sm text-gray-500 py-8 text-center">
              Every picture on this load is already linked to this commodity.
            </p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {choices.map((p) => {
                const on = picked.has(p.id);
                const now = p.commodityItemId ? lines.find((l) => l.id === p.commodityItemId)?.label : '';
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => toggle(p.id)} disabled={busy} aria-pressed={on}
                      className={`w-full text-left rounded-xl border overflow-hidden transition ${
                        on ? 'border-brand-500 ring-2 ring-brand-500' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <span className="relative block aspect-[4/3] bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket */}
                        <img src={p.thumbUrl} alt={p.caption} loading="lazy" className="w-full h-full object-cover" />
                        <span className={`absolute right-2 top-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          on ? 'bg-brand-600 border-brand-600 text-white' : 'border-white'
                        }`} style={on ? undefined : { background: 'rgba(0,0,0,0.3)' }}>
                          {on && <Check className="w-4 h-4" />}
                        </span>
                      </span>
                      <span className="block px-2.5 py-2 space-y-1">
                        <StageBadge stage={p.stage} />
                        <span className="block text-xs text-gray-600 truncate">
                          {now ? `Now with ${now}` : p.caption || p.commodity || '—'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 space-y-2">
          {retyped.length > 0 && (
            <p className="text-xs text-amber-800">
              {retyped.length === 1 ? 'One of these is' : `${retyped.length} of these are`} not a Commodity picture
              ({[...new Set(retyped.map((p) => PHOTO_STAGE_LABEL[p.stage]))].join(', ')}) and will become one.
              {retyped.some((p) => p.stage === 'truck') && ' A Truck picture stops counting toward the SA review’s truck check.'}
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50">
              <span data-es>Cancel</span>
            </button>
            <button type="button" onClick={() => void link()} disabled={busy || chosen.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Linking…' : chosen.length > 1 ? `Link ${chosen.length} pictures` : 'Link picture'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
