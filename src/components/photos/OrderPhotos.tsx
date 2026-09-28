'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImageUp, Images } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  deleteLoadPhoto,
  listOrderPhotos,
  prepareLoadPhoto,
  setOrderCover,
  updateLoadPhoto,
  uploadLoadPhoto,
} from '@/lib/loadPhotos';
import {
  MAX_CAPTION,
  PHOTO_STAGES,
  PHOTO_STAGE_LABEL,
  defaultStageFor,
  type LoadPhoto,
  type PhotoStage,
} from '@/types/loadPhoto';
import { orderCommodityItems, type Order } from '@/types/order';
import PhotoReel from './PhotoReel';
import PhotoLightbox from './PhotoLightbox';

interface QueueItem {
  key: string;
  name: string;
  state: 'waiting' | 'preparing' | 'uploading' | 'done' | 'failed';
  progress: number;
  error?: string;
}

interface Props {
  order: Order;
  /** Tells the page when the profile picture changes, so its header follows. */
  onCoverChange: (coverPhotoId: string | null, thumbUrl: string | null) => void;
  onCountChange?: (count: number) => void;
}

/**
 * A load's pictures: add them, slide through them, pick the profile picture.
 *
 * Anybody who can open the load can add pictures and choose its profile
 * picture, the same as editing any other part of it. Removing one is narrower
 * — see DELETE /api/orders/{id}/photos/{photoId}.
 */
export default function OrderPhotos({ order, onCoverChange, onCountChange }: Props) {
  const { user, can } = useAuth();
  const [photos, setPhotos]   = useState<LoadPhoto[]>([]);
  const [coverId, setCoverId] = useState<string | null>(order.coverPhotoId ?? null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen]       = useState<number | null>(null);

  const [stage, setStage]         = useState<PhotoStage>(defaultStageFor(order.status));
  const [commodity, setCommodity] = useState('');
  const [caption, setCaption]     = useState('');
  const [queue, setQueue]         = useState<QueueItem[]>([]);
  const [dragging, setDragging]   = useState(false);
  const pickRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // The load's own lines, so a picture can say which freight it shows. The
  // whole-load summary is the empty choice and is what the server files it
  // under when nothing narrower is picked.
  const commodityChoices = useMemo(() => {
    const seen = new Set<string>();
    return orderCommodityItems(order)
      .map((i) => i.description.trim())
      .filter((d) => d && !seen.has(d.toLowerCase()) && seen.add(d.toLowerCase()));
  }, [order]);

  useEffect(() => {
    let live = true;
    listOrderPhotos(order.id)
      .then(({ photos: list, coverPhotoId }) => {
        if (!live) return;
        setPhotos(list);
        setCoverId(coverPhotoId);
      })
      .catch((e) => { if (live) setLoadError(e instanceof Error ? e.message : 'Could not load pictures'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [order.id]);

  // Not until the list has arrived, or the tab would read 0 for a moment on a
  // load that has pictures.
  useEffect(() => {
    if (!loading && !loadError) onCountChange?.(photos.length);
  }, [loading, loadError, photos.length, onCountChange]);

  function announceCover(id: string | null, list: LoadPhoto[]) {
    setCoverId(id);
    onCoverChange(id, list.find((p) => p.id === id)?.thumbUrl ?? null);
  }

  function patchQueue(key: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (images.length === 0) return;
    const items = images.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`, name: f.name, state: 'waiting' as const, progress: 0,
    }));
    setQueue((q) => [...q.filter((x) => x.state !== 'done'), ...items]);

    // One at a time: each picture is decoded to full size in memory before it
    // is shrunk, and a phone handed twenty of those at once runs out.
    let list = photos;
    for (const [i, file] of images.entries()) {
      const key = items[i].key;
      try {
        patchQueue(key, { state: 'preparing' });
        const prepared = await prepareLoadPhoto(file);
        patchQueue(key, { state: 'uploading' });
        const { photo, coverPhotoId } = await uploadLoadPhoto(
          order.id, prepared, { caption, stage, commodity },
          (progress) => patchQueue(key, { progress }),
        );
        list = [...list, photo];
        setPhotos(list);
        if (coverPhotoId !== coverId) announceCover(coverPhotoId, list);
        patchQueue(key, { state: 'done', progress: 100 });
      } catch (e) {
        patchQueue(key, { state: 'failed', error: e instanceof Error ? e.message : 'Upload failed' });
      }
    }
    setCaption('');
  }

  const busy = queue.some((q) => q.state === 'waiting' || q.state === 'preparing' || q.state === 'uploading');
  const field = 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400';

  return (
    <div
      className={`bg-white rounded-xl border p-5 transition ${dragging ? 'border-brand-400 ring-2 ring-brand-200' : 'border-gray-200'}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles([...e.dataTransfer.files]); }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Images className="w-4 h-4 text-gray-400" /> Load Pictures
            {photos.length > 0 && <span className="text-xs font-normal text-gray-400">{photos.length}</span>}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            The star marks the load&apos;s profile picture, shown beside its number. Open a picture to change it.
          </p>
        </div>
      </div>

      {/* Upload bar */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label>
          <span className="block text-xs text-gray-500 mb-0.5">Stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value as PhotoStage)} className={field}>
            {PHOTO_STAGES.map((s) => <option key={s} value={s}>{PHOTO_STAGE_LABEL[s]}</option>)}
          </select>
        </label>
        <label>
          <span className="block text-xs text-gray-500 mb-0.5">Shows</span>
          <select value={commodity} onChange={(e) => setCommodity(e.target.value)} className={`${field} max-w-[14rem]`}>
            <option value="">Whole load{order.commodity ? ` — ${order.commodity}` : ''}</option>
            {commodityChoices.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[10rem]">
          <span className="block text-xs text-gray-500 mb-0.5">Caption (optional, applies to this batch)</span>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={MAX_CAPTION}
            placeholder="e.g. Strapped and tarped at the dock" className={`${field} w-full`} />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => pickRef.current?.click()} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
            <ImageUp className="w-4 h-4" /> Add pictures
          </button>
          {/* The camera opens straight away on a phone; on a PC `capture` is
              ignored and this would be a second file picker, so it is hidden. */}
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy}
            className="sm:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-brand-200 bg-brand-50 text-brand-700 disabled:opacity-50">
            <Camera className="w-4 h-4" /> Take photo
          </button>
        </div>
        <input ref={pickRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void addFiles(f); }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void addFiles(f); }} />
      </div>

      {queue.length > 0 && (
        <ul className="mb-4 space-y-1">
          {queue.map((q) => (
            <li key={q.key} className="flex items-center gap-2 text-xs">
              <span className="truncate max-w-[14rem] text-gray-600">{q.name}</span>
              {q.state === 'uploading' && (
                <span className="flex items-center gap-2 w-32">
                  <span className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <span className="block bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${q.progress}%` }} />
                  </span>
                  <span className="text-gray-500 tabular-nums">{q.progress}%</span>
                </span>
              )}
              {q.state === 'waiting'   && <span className="text-gray-400">Waiting…</span>}
              {q.state === 'preparing' && <span className="text-gray-400">Shrinking…</span>}
              {q.state === 'done'      && <span className="text-green-600">Added</span>}
              {q.state === 'failed'    && <span className="text-red-600">{q.error}</span>}
            </li>
          ))}
        </ul>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : photos.length === 0 ? (
        <button type="button" onClick={() => pickRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 text-center hover:border-brand-300 transition">
          <Images className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No pictures of this load yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Drop them here or choose them. The first one becomes the load&apos;s profile picture.
          </p>
        </button>
      ) : (
        <PhotoReel photos={photos} coverPhotoId={coverId} onOpen={setOpen} />
      )}

      {open !== null && (
        <PhotoLightbox
          photos={photos}
          index={Math.min(open, photos.length - 1)}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          isCover={(p) => p.id === coverId}
          onSetCover={async (p) => announceCover(await setOrderCover(order.id, p.id), photos)}
          onSave={async (p, patch) => {
            const saved = await updateLoadPhoto(order.id, p.id, patch);
            setPhotos((list) => list.map((x) => (x.id === saved.id ? saved : x)));
          }}
          canDelete={(p) => p.uploadedByUid === user?.uid || can('orders.viewAll')}
          onDelete={async (p) => {
            const nextCover = await deleteLoadPhoto(order.id, p.id);
            const rest = photos.filter((x) => x.id !== p.id);
            setPhotos(rest);
            announceCover(nextCover, rest);
            if (rest.length === 0) setOpen(null);
          }}
          commodityOptions={[order.commodity, ...commodityChoices].filter(Boolean)}
        />
      )}
    </div>
  );
}
