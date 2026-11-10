'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Link2, Loader2 } from 'lucide-react';
import { listOrderPhotos, prepareLoadPhoto, uploadLoadPhoto } from '@/lib/loadPhotos';
import { itemPhotoRoute, photosForItem, type LoadPhoto } from '@/types/loadPhoto';
import type { CommodityItem, Order } from '@/types/order';
import LinkPhotosDialog from './LinkPhotosDialog';

/**
 * The load's pictures, for the Freight section — read only when there is a
 * reason to: the section shows pictures beside its lines only when there is
 * more than one line, and a load with no pictures has nothing to fetch.
 * `refreshKey` re-reads them, e.g. on coming back from the Pictures tab.
 */
export function useLinePhotos(orderId: string, enabled: boolean, refreshKey: unknown) {
  const [photos, setPhotos] = useState<LoadPhoto[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    listOrderPhotos(orderId)
      .then(({ photos: list }) => { if (live) setPhotos(list); })
      .catch(() => { /* the pictures are a convenience here; the table still reads without them */ });
    return () => { live = false; };
  }, [orderId, enabled, refreshKey]);
  return [photos, setPhotos] as const;
}

interface Props {
  order: Order;
  item: CommodityItem;
  /** Every picture on the load; this cell picks out the line's own. */
  photos: LoadPhoto[];
  /** Draw the line's picture beside it — only when the load has several lines. */
  showPicture: boolean;
  onOpen: (photo: LoadPhoto) => void;
  onAdded: (photo: LoadPhoto, coverPhotoId: string | null) => void;
  /** A picture already on the load, now linked to this line. */
  onLinked: (photo: LoadPhoto) => void;
  /** The line's own text — description, vehicle, stops. */
  children: ReactNode;
}

/**
 * A freight line's picture and its "Add picture" button (2026-11-10).
 *
 * A picture added here skips the Pictures tab's tray on purpose: everything
 * the tray would ask is already known from the line — it is a Commodity, it
 * shows this line, and it is picked up and delivered where the line says.
 * It is linked to the line (`commodityItemId`), so the viewer says which
 * commodity it is and the picture can be told apart from the others.
 *
 * "Link a picture" does the same for a picture already on the load — see
 * LinkPhotosDialog.
 *
 * Wraps the commodity cell's text, so the picture sits beside the
 * description it belongs to and the button under it.
 */
export default function LinePhotoCell({ order, item, photos, showPicture, onOpen, onAdded, onLinked, children }: Props) {
  const [linking, setLinking] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ n: number; of: number; pct: number } | null>(null);
  const [error, setError] = useState('');
  const mine = photosForItem(photos, item);
  // The load's profile picture when it is one of this line's, else the first.
  const face = mine.find((p) => p.id === order.coverPhotoId) ?? mine[0];
  // Offered only where linking means something — a load with several lines —
  // and only when the load has a picture this line does not.
  const canLink = showPicture && photos.length > mine.length;

  async function add(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (images.length === 0) return;
    setError('');
    const route = itemPhotoRoute(order, item);
    try {
      for (let i = 0; i < images.length; i++) {
        setProgress({ n: i + 1, of: images.length, pct: 0 });
        const prepared = await prepareLoadPhoto(images[i]);
        const { photo, coverPhotoId } = await uploadLoadPhoto(
          order.id, prepared,
          {
            caption: '', stage: 'commodity', commodity: item.description, location: '',
            ...route,
            // A load from before freight lines has one made-up line, 'legacy',
            // which is not a real id to link to.
            commodityItemId: item.id === 'legacy' ? '' : item.id,
          },
          (pct) => setProgress({ n: i + 1, of: images.length, pct }),
        );
        onAdded(photo, coverPhotoId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The picture could not be added');
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex items-start gap-3">
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
        <button type="button" onClick={() => pick.current?.click()} disabled={progress !== null}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60">
          {progress
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding{progress.of > 1 ? ` ${progress.n} of ${progress.of}` : ''}… {progress.pct}%</>
            : <><ImagePlus className="w-3.5 h-3.5" /> <span data-es>Add picture</span></>}
        </button>
        {canLink && progress === null && (
          <button type="button" onClick={() => setLinking(true)}
            className="mt-1 ml-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            <Link2 className="w-3.5 h-3.5" /> <span data-es>Link a picture</span>
          </button>
        )}
        {linking && (
          <LinkPhotosDialog order={order} item={item} photos={photos}
            onLinked={onLinked} onClose={() => setLinking(false)} />
        )}
        <input ref={pick} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void add(f); }} />
        {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
      </div>
    </div>
  );
}
