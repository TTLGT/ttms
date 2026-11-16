'use client';

import { useState } from 'react';
import { Camera, ClipboardPaste, ImageUp, Images } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { updateLoadPhoto } from '@/lib/loadPhotos';
import type { LoadPhoto } from '@/types/loadPhoto';
import PhotoReel from './PhotoReel';
import PhotoLightbox from './PhotoLightbox';
import PictureNeeds from './PictureNeeds';
import { useLoadPhotos } from './LoadPhotosContext';
import { Bi } from '@/components/spanish/Es';

/**
 * The Pictures tab: what the load still needs, every picture it has, and the
 * profile picture.
 *
 * Adding is no longer done here. The tray, the uploads and the list live in
 * the page's picture store (LoadPhotosContext), shared with the header tile,
 * the freight lines and the drop-anywhere frame, so a picture chosen here and
 * not yet saved survives a switch to Details. This tab only draws.
 *
 * Anybody who can open the load can add pictures and choose its profile
 * picture, the same as editing any other part of it. Removing one is narrower
 * — see DELETE /api/orders/{id}/photos/{photoId}.
 */
export default function OrderPhotos({ truckNeeded }: { truckNeeded: boolean }) {
  const { user, can } = useAuth();
  const s = useLoadPhotos();
  const { order, photos, loaded, loadError, coverId } = s;
  const [openId, setOpenId] = useState<string | null>(null);

  if (!order) return null;
  const open = openId ? photos.findIndex((p) => p.id === openId) : -1;
  const openPhoto = (p: LoadPhoto) => setOpenId(p.id);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Images className="w-4 h-4 text-gray-400" /> <span data-es>Load Pictures</span>
            {photos.length > 0 && <span className="text-xs font-normal text-gray-400">{photos.length}</span>}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            <Bi>1. Add pictures: drop, paste or choose them, anywhere on this load. 2. Tap a type. 3. Save. The star marks the load&apos;s profile picture.</Bi>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => s.choose()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700">
            <ImageUp className="w-4 h-4" /> <span data-es>Add pictures</span>
          </button>
          <button type="button" onClick={() => void s.pasteFromClipboard()}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
            <ClipboardPaste className="w-4 h-4" /> <span data-es>Paste picture</span>
          </button>
          {/* The camera opens straight away on a phone; on a PC `capture` is
              ignored and this would be a second file picker, so it is hidden. */}
          <button type="button" onClick={() => s.camera()}
            className="sm:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-brand-200 bg-brand-50 text-brand-700">
            <Camera className="w-4 h-4" /> <span data-es>Take a photo</span>
          </button>
        </div>
      </div>

      {loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : !loaded ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <PictureNeeds truckNeeded={truckNeeded} onOpen={openPhoto} />
          {photos.length > 0 && (
            <PhotoReel photos={photos} coverPhotoId={coverId} onOpen={(i) => setOpenId(photos[i]?.id ?? null)} />
          )}
        </>
      )}

      {open >= 0 && (
        <PhotoLightbox
          photos={photos}
          index={open}
          onIndex={(i) => setOpenId(photos[i]?.id ?? null)}
          onClose={() => setOpenId(null)}
          isCover={(p) => p.id === coverId}
          onSetCover={s.setCover}
          onSave={async (p, patch) => s.replaced(await updateLoadPhoto(order.id, p.id, patch))}
          canDelete={(p) => p.uploadedByUid === user?.uid || can('orders.viewAll')}
          onDelete={async (p) => {
            const at = open;
            await s.remove(p);
            const rest = photos.filter((x) => x.id !== p.id);
            setOpenId(rest.length ? rest[Math.min(at, rest.length - 1)].id : null);
          }}
          routeChoices={{ pickup: s.pickupChoices, delivery: s.deliveryChoices }}
          lines={s.lines}
        />
      )}
    </div>
  );
}
