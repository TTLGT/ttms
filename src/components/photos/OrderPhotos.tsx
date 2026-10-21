'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImageUp, Images, Loader2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  deleteLoadPhoto,
  listOrderPhotos,
  prepareLoadPhoto,
  setOrderCover,
  updateLoadPhoto,
  uploadLoadPhoto,
  type PreparedPhoto,
} from '@/lib/loadPhotos';
import {
  MAX_CAPTION,
  PHOTO_STAGES,
  PHOTO_STAGE_LABEL,
  locationKindsFor,
  photoLocationChoices,
  type LoadPhoto,
  type PhotoStage,
} from '@/types/loadPhoto';
import type { Order } from '@/types/order';
import PhotoReel from './PhotoReel';
import PhotoLightbox from './PhotoLightbox';

/**
 * A picture that has been chosen but not saved. It sits in the tray, shrunk
 * and previewed, until somebody has tagged it and pressed Save — nothing is
 * sent before then, so a wrong pick costs nothing and there is no half-tagged
 * picture on the load to go back and fix.
 */
interface Draft {
  key: string;
  name: string;
  state: 'preparing' | 'ready' | 'uploading' | 'failed';
  prepared?: PreparedPhoto;
  /** Object URL of the thumbnail; revoked when the draft leaves the tray. */
  preview?: string;
  progress: number;
  error?: string;
  /** '' until somebody picks one — the type is the one tag that is required. */
  stage: PhotoStage | '';
  location: string;
  caption: string;
}

interface Props {
  order: Order;
  /** Tells the page when the profile picture changes, so its header follows. */
  onCoverChange: (coverPhotoId: string | null, thumbUrl: string | null) => void;
  onCountChange?: (count: number) => void;
}

/**
 * A load's pictures: add them, tag them, slide through them, pick the profile
 * picture.
 *
 * Adding is two steps on purpose. Choosing files only puts them in the tray;
 * the type, stop and caption are set there, per picture, and Save sends them.
 * The type is what the SA review counts (`truck`) and what keeps a picture off
 * the client's documents (`truck`, `proof`) — too much rides on it to take
 * from a dropdown somebody set before choosing the files and forgot about.
 *
 * What the picture shows is not asked: the server files it under the load's
 * commodity, which is all the Documents screen groups by.
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

  const [drafts, setDrafts]     = useState<Draft[]>([]);
  const [saving, setSaving]     = useState(false);
  const [trayError, setTrayError] = useState('');
  const [dragging, setDragging] = useState(false);
  const pickRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Files waiting to be shrunk, and whether the loop that shrinks them is
  // running. One at a time: each picture is decoded to full size in memory
  // before it is shrunk, and a phone handed twenty of those at once runs out.
  const toPrepare = useRef<{ key: string; file: File }[]>([]);
  const preparing = useRef(false);
  const draftsRef = useRef<Draft[]>([]);
  draftsRef.current = drafts;

  const locationsFor = useCallback(
    (stage: PhotoStage | '') => photoLocationChoices(order, locationKindsFor(stage)),
    [order],
  );

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

  // Previews are object URLs, which hold the image in memory until revoked.
  useEffect(() => () => {
    for (const d of draftsRef.current) if (d.preview) URL.revokeObjectURL(d.preview);
  }, []);

  // Pictures in the tray are not on the load yet; leaving would lose them.
  const unsaved = drafts.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  function announceCover(id: string | null, list: LoadPhoto[]) {
    setCoverId(id);
    onCoverChange(id, list.find((p) => p.id === id)?.thumbUrl ?? null);
  }

  function patchDraft(key: string, patch: Partial<Draft>) {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  /**
   * A new type, and the stop that goes with it: kept when it still fits the
   * type, filled in when the load has only one stop the type could mean, and
   * otherwise left for the person to choose.
   */
  function withStage(d: Draft, stage: PhotoStage | ''): Draft {
    const choices = locationsFor(stage);
    const location = choices.includes(d.location) ? d.location : choices.length === 1 ? choices[0] : '';
    return { ...d, stage, location };
  }

  async function runPrepare() {
    if (preparing.current) return;
    preparing.current = true;
    try {
      while (toPrepare.current.length > 0) {
        const { key, file } = toPrepare.current.shift()!;
        // Removed from the tray while it waited.
        if (!draftsRef.current.some((d) => d.key === key)) continue;
        try {
          const prepared = await prepareLoadPhoto(file);
          const preview  = URL.createObjectURL(prepared.thumb);
          if (!draftsRef.current.some((d) => d.key === key)) { URL.revokeObjectURL(preview); continue; }
          patchDraft(key, { state: 'ready', prepared, preview });
        } catch (e) {
          patchDraft(key, { state: 'failed', error: e instanceof Error ? e.message : 'Could not open that picture' });
        }
      }
    } finally {
      preparing.current = false;
    }
  }

  function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (images.length === 0) return;
    setTrayError('');
    const stamp = Date.now();
    const fresh: Draft[] = images.map((f, i) => ({
      key: `${stamp}-${i}-${f.name}`, name: f.name, state: 'preparing', progress: 0,
      stage: '', location: '', caption: '',
    }));
    // Written to the ref as well as the state so the shrinking loop, which
    // checks the ref, sees them before React has rendered.
    draftsRef.current = [...draftsRef.current, ...fresh];
    setDrafts((list) => [...list, ...fresh]);
    toPrepare.current.push(...images.map((file, i) => ({ key: fresh[i].key, file })));
    void runPrepare();
  }

  function removeDraft(key: string) {
    const d = drafts.find((x) => x.key === key);
    if (d?.preview) URL.revokeObjectURL(d.preview);
    draftsRef.current = draftsRef.current.filter((x) => x.key !== key);
    setDrafts((list) => list.filter((x) => x.key !== key));
  }

  function discardAll() {
    if (drafts.length > 1 && !window.confirm(`Discard these ${drafts.length} pictures? They have not been saved.`)) return;
    for (const d of drafts) if (d.preview) URL.revokeObjectURL(d.preview);
    toPrepare.current = [];
    draftsRef.current = [];
    setDrafts([]);
    setTrayError('');
  }

  async function saveAll() {
    const ready = drafts.filter((d) => d.prepared && d.state !== 'uploading');
    if (ready.some((d) => !d.stage)) {
      setTrayError('Choose a type for every picture before saving.');
      return;
    }
    setTrayError('');
    setSaving(true);
    let list  = photos;
    let cover = coverId;
    for (const d of ready) {
      try {
        patchDraft(d.key, { state: 'uploading', progress: 0, error: undefined });
        const { photo, coverPhotoId } = await uploadLoadPhoto(
          order.id, d.prepared!,
          { caption: d.caption, stage: d.stage as PhotoStage, commodity: '', location: d.location },
          (progress) => patchDraft(d.key, { progress }),
        );
        list = [...list, photo];
        setPhotos(list);
        if (coverPhotoId !== cover) { cover = coverPhotoId; announceCover(coverPhotoId, list); }
        removeDraft(d.key);
      } catch (e) {
        // Left in the tray, tags and all, so Save tries it again.
        patchDraft(d.key, { state: 'ready', progress: 0, error: e instanceof Error ? e.message : 'Upload failed' });
      }
    }
    setSaving(false);
  }

  const stillShrinking = drafts.some((d) => d.state === 'preparing');
  const saveable       = drafts.filter((d) => d.prepared).length;
  const untyped        = drafts.filter((d) => d.prepared && !d.stage).length;

  // "Set for all": a value shows only when every picture already agrees on it.
  const same = <K extends 'stage' | 'location'>(k: K): Draft[K] | '' =>
    drafts.length > 0 && drafts.every((d) => d[k] === drafts[0][k]) ? drafts[0][k] : '';
  const allStage     = same('stage');
  const allLocations = allStage ? locationsFor(allStage) : [];

  const field = 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60';
  const label = 'block text-xs text-gray-500 mb-0.5';

  return (
    <div
      className={`bg-white rounded-xl border p-5 transition ${dragging ? 'border-brand-400 ring-2 ring-brand-200' : 'border-gray-200'}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Images className="w-4 h-4 text-gray-400" /> Load Pictures
            {photos.length > 0 && <span className="text-xs font-normal text-gray-400">{photos.length}</span>}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Choose pictures (or drop them here), tag each one, then save. The star marks the
            load&apos;s profile picture — open a picture to change it or its tags.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => pickRef.current?.click()} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
            <ImageUp className="w-4 h-4" /> Add pictures
          </button>
          {/* The camera opens straight away on a phone; on a PC `capture` is
              ignored and this would be a second file picker, so it is hidden. */}
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={saving}
            className="sm:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-brand-200 bg-brand-50 text-brand-700 disabled:opacity-50">
            <Camera className="w-4 h-4" /> Take photo
          </button>
        </div>
        <input ref={pickRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; addFiles(f); }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; addFiles(f); }} />
      </div>

      {/* The tray: chosen, not yet saved */}
      {drafts.length > 0 && (
        <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <p className="text-sm font-semibold text-gray-900">
              {drafts.length} new picture{drafts.length === 1 ? '' : 's'} — not saved yet
            </p>
            <p className="text-xs text-gray-500">Pick a type for each one. The rest is optional.</p>
          </div>

          {drafts.length > 1 && (
            <div className="flex flex-wrap items-end gap-2 mb-3 pb-3 border-b border-brand-100">
              <span className="text-xs font-medium text-gray-600 w-full">Set for all</span>
              <label>
                <span className={label}>Type</span>
                <select value={allStage} disabled={saving} className={field}
                  onChange={(e) => {
                    const stage = e.target.value as PhotoStage | '';
                    setDrafts((list) => list.map((d) => withStage(d, stage)));
                  }}>
                  <option value="">{allStage ? 'Choose…' : 'Mixed / choose…'}</option>
                  {PHOTO_STAGES.map((s) => <option key={s} value={s}>{PHOTO_STAGE_LABEL[s]}</option>)}
                </select>
              </label>
              {allLocations.length > 1 && (
                <label>
                  <span className={label}>Stop</span>
                  <select value={same('location')} disabled={saving} className={`${field} max-w-[16rem]`}
                    onChange={(e) => { const v = e.target.value; setDrafts((list) => list.map((d) => ({ ...d, location: v }))); }}>
                    <option value="">Not tied to one stop</option>
                    {allLocations.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          <ul className="space-y-3">
            {drafts.map((d) => {
              const locations = locationsFor(d.stage);
              const locked = saving || d.state === 'uploading';
              return (
                <li key={d.key} className="flex flex-col sm:flex-row gap-3 rounded-lg bg-white border border-gray-200 p-3">
                  <div className="relative w-full sm:w-36 h-40 sm:h-28 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
                    {d.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a local object URL, never fetched
                      <img src={d.preview} alt={d.name} className="w-full h-full object-cover" />
                    ) : d.state === 'preparing' ? (
                      <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                    ) : (
                      <Images className="w-6 h-6 text-gray-300" />
                    )}
                    {d.state === 'uploading' && (
                      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/20">
                        <span className="block h-full bg-brand-500 transition-all" style={{ width: `${d.progress}%` }} />
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-2">
                      <p className="text-xs text-gray-500 truncate flex-1">
                        {d.name}
                        {d.state === 'preparing' && ' · getting it ready…'}
                        {d.state === 'uploading' && ` · saving ${d.progress}%`}
                      </p>
                      <button type="button" onClick={() => removeDraft(d.key)} disabled={locked}
                        aria-label={`Remove ${d.name}`} title="Remove — it will not be saved"
                        className="p-1 -m-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {d.state === 'failed' && !d.prepared ? (
                      <p className="text-xs text-red-600">{d.error}</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-[12rem_1fr_1fr] gap-2">
                        <label>
                          <span className={label}>Type <span className="text-red-500">*</span></span>
                          <select value={d.stage} disabled={locked}
                            onChange={(e) => setDrafts((list) => list.map((x) => (x.key === d.key ? withStage(x, e.target.value as PhotoStage | '') : x)))}
                            className={`${field} w-full ${!d.stage && trayError ? 'border-red-400 ring-1 ring-red-300' : ''}`}>
                            <option value="">Choose…</option>
                            {PHOTO_STAGES.map((s) => <option key={s} value={s}>{PHOTO_STAGE_LABEL[s]}</option>)}
                          </select>
                        </label>
                        {locations.length > 0 && (
                          <label>
                            <span className={label}>Stop</span>
                            <select value={d.location} disabled={locked}
                              onChange={(e) => patchDraft(d.key, { location: e.target.value })}
                              className={`${field} w-full`}>
                              <option value="">Not tied to one stop</option>
                              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </label>
                        )}
                        <label className={locations.length > 0 ? '' : 'sm:col-span-2'}>
                          <span className={label}>Caption</span>
                          <input value={d.caption} maxLength={MAX_CAPTION} disabled={locked}
                            onChange={(e) => patchDraft(d.key, { caption: e.target.value })}
                            placeholder="e.g. Strapped and tarped at the dock" className={`${field} w-full`} />
                        </label>
                      </div>
                    )}
                    {d.error && d.prepared && <p className="text-xs text-red-600 mt-1.5">{d.error} — press Save to try again.</p>}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
            {trayError && <p className="text-xs text-red-600 mr-auto">{trayError}</p>}
            {!trayError && untyped > 0 && !saving && (
              <p className="text-xs text-gray-500 mr-auto">
                {untyped} picture{untyped === 1 ? '' : 's'} still need{untyped === 1 ? 's' : ''} a type.
              </p>
            )}
            <button type="button" onClick={discardAll} disabled={saving}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Discard
            </button>
            <button type="button" onClick={() => void saveAll()}
              disabled={saving || stillShrinking || saveable === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : stillShrinking ? 'Getting pictures ready…'
                : `Save ${saveable} picture${saveable === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : photos.length === 0 ? (
        drafts.length === 0 && (
          <button type="button" onClick={() => pickRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 text-center hover:border-brand-300 transition">
            <Images className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No pictures of this load yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Drop them here or click to choose. You tag them before they are saved, and the
              first one becomes the load&apos;s profile picture.
            </p>
          </button>
        )
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
          locationsFor={locationsFor}
        />
      )}
    </div>
  );
}
