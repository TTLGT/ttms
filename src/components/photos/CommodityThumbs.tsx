'use client';

import { photosForItem, type LoadPhoto } from '@/types/loadPhoto';
import { orderCommodityItems, type Order } from '@/types/order';

/** How many commodities get a tile before the rest fold into "+N". */
const MAX_TILES = 3;

/**
 * Each commodity's picture, the order of the Freight table — or [] when there
 * is nothing to show one per commodity of: a load with one line, or no line
 * with a picture yet. A line with no picture is left out rather than drawn as
 * an empty box beside ones that have them.
 */
export function commodityFaces(order: Order, photos: LoadPhoto[]) {
  const items = orderCommodityItems(order);
  if (items.length < 2) return [];
  return items.flatMap((item, i) => {
    const mine = photosForItem(photos, item);
    // The load's profile picture when it is one of this line's, else its first.
    const face = mine.find((p) => p.id === order.coverPhotoId) ?? mine[0];
    return face ? [{ item, number: i + 1, face }] : [];
  });
}

/**
 * The order header's picture on a load with several commodities
 * (2026-11-10): one tile per commodity instead of the single profile picture,
 * so a car and the trailer behind it are both recognisable at a glance.
 * Numbered like the Freight table's lines. A tile opens that commodity's
 * pictures; "+N" opens the Pictures tab.
 *
 * Only the pictures the page already read for the Freight section are used —
 * no read of its own.
 */
export default function CommodityThumbs({ faces, onOpen, onMore }: {
  faces: ReturnType<typeof commodityFaces>;
  onOpen: (itemId: string, photoId: string) => void;
  onMore: () => void;
}) {
  const shown = faces.slice(0, MAX_TILES);
  const rest  = faces.length - shown.length;
  const tile  = 'relative flex-shrink-0 w-11 h-11 sm:w-14 sm:h-14 rounded-xl overflow-hidden border border-gray-200 bg-gray-100 hover:ring-2 hover:ring-brand-300 transition';
  return (
    <div className="flex flex-shrink-0 items-start gap-1.5">
      {shown.map(({ item, number, face }) => (
        <button key={item.id} type="button" onClick={() => onOpen(item.id, face.id)}
          title={`${number}. ${item.description || 'Commodity'}`} className={tile}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket */}
          <img src={face.thumbUrl} alt={item.description} className="w-full h-full object-cover" />
          <span className="absolute left-1 bottom-1 min-w-[1rem] h-4 rounded-full px-1 text-[10px] font-semibold leading-4 text-center text-white"
            style={{ background: 'rgba(0,0,0,0.6)' }}>
            {number}
          </span>
        </button>
      ))}
      {rest > 0 && (
        <button type="button" onClick={onMore} title="All pictures"
          className={`${tile} flex items-center justify-center text-sm font-semibold text-gray-600`}>
          +{rest}
        </button>
      )}
    </div>
  );
}
