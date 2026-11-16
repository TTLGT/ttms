'use client';

import { useState, type ReactNode } from 'react';
import { ImagePlus, Link2, Loader2 } from 'lucide-react';
import { itemPhotoRoute, photosForItem, type LoadPhoto } from '@/types/loadPhoto';
import type { CommodityItem, Order } from '@/types/order';
import LinkPhotosDialog from './LinkPhotosDialog';
import { useLoadPhotos, type PhotoPreset } from './LoadPhotosContext';

interface Props {
  order: Order;
  item: CommodityItem;
  /** Draw the line's picture beside it — only when the load has several lines. */
  showPicture: boolean;
  onOpen: (photo: LoadPhoto) => void;
  /** The line's own text — description, vehicle, stops. */
  children: ReactNode;
}

/**
 * A freight line's picture and its "Add picture" button (2026-11-10).
 *
 * A picture added here — from the button, or dropped on the line — goes
 * through the page's picture store like every other (LoadPhotosContext), with
 * everything already known from the line: it is a Commodity, it shows this
 * line, and it is picked up and delivered where the line says. So it is saved
 * at once, with no tray, and linked to the line (`commodityItemId`).
 *
 * "Link a picture" does the same for a picture already on the load — see
 * LinkPhotosDialog.
 *
 * Wraps the commodity cell's text, so the picture sits beside the
 * description it belongs to and the button under it.
 */
export default function LinePhotoCell({ order, item, showPicture, onOpen, children }: Props) {
  const store = useLoadPhotos();
  const { photos } = store;
  const [linking, setLinking] = useState(false);
  const [over, setOver] = useState(false);
  const mine = photosForItem(photos, item);
  // The load's profile picture when it is one of this line's, else the first.
  const face = mine.find((p) => p.id === order.coverPhotoId) ?? mine[0];
  // Offered only where linking means something — a load with several lines —
  // and only when the load has a picture this line does not.
  const canLink = showPicture && photos.length > mine.length;
  const preset: PhotoPreset = {
    stage: 'commodity', commodityItemId: item.id, commodity: item.description,
    ...itemPhotoRoute(order, item),
  };
  // This line's pictures on their way up.
  const busy = store.drafts.filter((d) => d.commodityItemId === item.id && d.auto
    && (d.state === 'preparing' || d.state === 'uploading'));

  return (
    <div
      // A picture dropped on the line is a picture of the line.
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(false);
        store.addFiles([...e.dataTransfer.files], preset);
      }}
      className={`flex items-start gap-3 rounded-lg ${over ? 'ring-2 ring-brand-400 bg-brand-50' : ''}`}>
      {showPicture && face && (
        <button type="button" onClick={() => onOpen(face)} title="Open picture"
          className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 hover:ring-2 hover:ring-brand-400 transition">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket */}
          <img src={face.thumbUrl} alt={item.description} className="w-full h-full object-cover" />
          {mine.length > 1 && (
            <span className="absolute right-1 bottom-1 rounded-full px-1.5 text-[10px] font-semibold text-white"
              style={{ background: 'rgba(0,0,0,0.6)' }}>
              +{mine.length - 1}
            </span>
          )}
        </button>
      )}
      <div className="min-w-0">
        {children}
        <button type="button" onClick={() => store.choose(preset)} disabled={busy.length > 0}
          title="Add a picture of this commodity — or drop one on the line"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60">
          {busy.length
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding{busy.length > 1 ? ` ${busy.length}` : ''}…</>
            : <><ImagePlus className="w-3.5 h-3.5" /> <span data-es>Add picture</span></>}
        </button>
        {canLink && busy.length === 0 && (
          <button type="button" onClick={() => setLinking(true)}
            className="mt-1 ml-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            <Link2 className="w-3.5 h-3.5" /> <span data-es>Link a picture</span>
          </button>
        )}
        {linking && (
          <LinkPhotosDialog order={order} item={item} photos={photos}
            onLinked={store.replaced} onClose={() => setLinking(false)} />
        )}
      </div>
    </div>
  );
}
