'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, Pencil, Star, Trash2, X } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  MAX_CAPTION,
  MAX_PHOTO_COMMODITY,
  PHOTO_STAGES,
  PHOTO_STAGE_LABEL,
  type LoadPhoto,
  type PhotoStage,
} from '@/types/loadPhoto';
import { StageBadge } from './PhotoBits';

export interface PhotoPatch { caption: string; stage: PhotoStage; commodity: string }

interface Props<T extends LoadPhoto> {
  photos: T[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  isCover?: (photo: T) => boolean;
  /** Omit to hide the button — e.g. when the reader cannot change the load. */
  onSetCover?: (photo: T) => Promise<void>;
  onSave?: (photo: T, patch: PhotoPatch) => Promise<void>;
  onDelete?: (photo: T) => Promise<void>;
  canDelete?: (photo: T) => boolean;
  /** Extra line above the caption — the Documents screen puts the load there. */
  context?: (photo: T) => ReactNode;
  /** Suggestions for the commodity box when editing. */
  commodityOptions?: string[];
}

/**
 * One picture at a time, full screen, sliding left and right through the set.
 *
 * Arrow keys, the on-screen arrows, a swipe, or a tap on the filmstrip along
 * the bottom all move it; Escape closes. Always dark regardless of theme — a
 * photo reads best against black, and the controls are drawn for that. Which
 * is why the translucent washes are written as rgba() rather than
 * `bg-white/10`: tailwind.config.ts turns `bg-white` into the dark surface in
 * dark mode, and a dark wash on black is no button at all.
 */
export default function PhotoLightbox<T extends LoadPhoto>({
  photos, index, onIndex, onClose,
  isCover, onSetCover, onSave, onDelete, canDelete, context, commodityOptions = [],
}: Props<T>) {
  const { formatDateTime } = useDateFormatters();
  const photo = photos[index];
  const [busy, setBusy]       = useState<'' | 'cover' | 'save' | 'delete'>('');
  const [error, setError]     = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<PhotoPatch>({ caption: '', stage: 'other', commodity: '' });
  const [loaded, setLoaded]   = useState(false);
  const strip   = useRef<HTMLDivElement>(null);
  const touchX  = useRef<number | null>(null);

  const count = photos.length;
  const go = (delta: number) => {
    if (count === 0) return;
    onIndex((index + delta + count) % count);
  };

  // Keyboard, while not typing into the edit form.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select');
      if (e.key === 'Escape') { if (editing) setEditing(false); else onClose(); return; }
      if (typing) return;
      if (e.key === 'ArrowLeft')  go(-1);
      if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The page behind should not scroll while this covers it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // Each move resets the per-picture state and keeps the filmstrip's active
  // tile in view.
  useEffect(() => {
    setEditing(false);
    setError('');
    setLoaded(false);
    strip.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index, photo?.id]);

  if (!photo) return null;

  async function run(kind: 'cover' | 'save' | 'delete', job: () => Promise<void>) {
    setBusy(kind);
    setError('');
    try { await job(); }
    catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(''); }
  }

  const cover = isCover?.(photo) ?? false;
  const deletable = onDelete && (canDelete ? canDelete(photo) : true);
  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/90 hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-50 transition';

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col text-white" role="dialog" aria-modal="true" data-learn-skip>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-white/10">
        <span className="text-sm text-white/60 tabular-nums">{index + 1} / {count}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {onSetCover && (
            <button type="button" className={btn} disabled={cover || busy !== ''}
              onClick={() => run('cover', () => onSetCover(photo))}>
              <Star className={`w-4 h-4 ${cover ? 'text-amber-300' : ''}`} fill={cover ? 'currentColor' : 'none'} />
              <span className="hidden sm:inline">
                {cover ? 'Profile picture' : busy === 'cover' ? 'Setting…' : 'Set as profile picture'}
              </span>
            </button>
          )}
          {onSave && (
            <button type="button" className={btn} disabled={busy !== ''}
              onClick={() => { setDraft({ caption: photo.caption, stage: photo.stage, commodity: photo.commodity }); setEditing((v) => !v); }}>
              <Pencil className="w-4 h-4" /><span className="hidden sm:inline">Edit</span>
            </button>
          )}
          <a href={photo.url} target="_blank" rel="noreferrer" className={btn}>
            <Download className="w-4 h-4" /><span className="hidden sm:inline">Full size</span>
          </a>
          {deletable && (
            <button type="button" className={`${btn} hover:!bg-red-500/30`} disabled={busy !== ''}
              onClick={() => {
                if (!window.confirm('Remove this picture from the load? This cannot be undone.')) return;
                void run('delete', () => onDelete!(photo));
              }}>
              <Trash2 className="w-4 h-4" /><span className="hidden sm:inline">{busy === 'delete' ? 'Removing…' : 'Remove'}</span>
            </button>
          )}
          <button type="button" className={btn} onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* The picture */}
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center select-none"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          if (start === null) return;
          const dx = e.changedTouches[0].clientX - start;
          // A deliberate swipe, not a wobble while pinching to zoom.
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {!loaded && (
          // The thumbnail is almost always cached already, so it stands in
          // while the full picture arrives instead of a blank screen.
          // eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket
          <img src={photo.thumbUrl} alt="" className="absolute max-w-full max-h-full object-contain blur-sm opacity-60" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket */}
        <img
          key={photo.id}
          src={photo.url}
          alt={photo.caption}
          onLoad={() => setLoaded(true)}
          className={`relative max-w-full max-h-full object-contain transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous picture"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] flex items-center justify-center">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next picture"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] flex items-center justify-center">
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Details, or the edit form */}
      <div className="px-4 py-3 border-t border-white/10 text-sm">
        {context && <div className="mb-1">{context(photo)}</div>}
        {editing && onSave ? (
          <form
            className="flex flex-col sm:flex-row sm:items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run('save', async () => { await onSave(photo, draft); setEditing(false); });
            }}
          >
            <label className="flex-1 min-w-0">
              <span className="block text-xs text-white/60 mb-0.5">Caption</span>
              <input value={draft.caption} maxLength={MAX_CAPTION} autoFocus
                onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
                className="w-full rounded-md bg-[rgba(255,255,255,0.1)] border border-white/20 px-2 py-1.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </label>
            <label>
              <span className="block text-xs text-white/60 mb-0.5">Stage</span>
              <select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value as PhotoStage })}
                className="rounded-md bg-[rgba(255,255,255,0.1)] border border-white/20 px-2 py-1.5 text-white focus:outline-none">
                {PHOTO_STAGES.map((s) => <option key={s} value={s} className="text-black">{PHOTO_STAGE_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="sm:w-56">
              <span className="block text-xs text-white/60 mb-0.5">Commodity</span>
              <input value={draft.commodity} maxLength={MAX_PHOTO_COMMODITY} list="lightbox-commodities"
                onChange={(e) => setDraft({ ...draft, commodity: e.target.value })}
                className="w-full rounded-md bg-[rgba(255,255,255,0.1)] border border-white/20 px-2 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-400" />
              <datalist id="lightbox-commodities">
                {commodityOptions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
            <button type="submit" disabled={busy !== ''}
              className="px-4 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white font-medium disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StageBadge stage={photo.stage} />
            {photo.caption && <span className="text-white">{photo.caption}</span>}
            {photo.commodity && <span className="text-white/60">{photo.commodity}</span>}
            <span className="text-white/40 text-xs ml-auto">
              {photo.uploadedByName}{photo.createdAt ? ` · ${formatDateTime(new Date(photo.createdAt))}` : ''}
            </span>
          </div>
        )}
        {error && <p className="text-red-300 text-xs mt-1">{error}</p>}
      </div>

      {/* Filmstrip */}
      {count > 1 && (
        <div ref={strip} className="flex gap-1.5 overflow-x-auto px-3 pb-3 tab-scroll">
          {photos.map((p, i) => (
            <button key={p.id} type="button" data-index={i} onClick={() => onIndex(i)}
              className={`relative flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition ${
                i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-100'
              }`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket */}
              <img src={p.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
              {isCover?.(p) && <Star className="absolute right-0.5 top-0.5 w-3 h-3 text-amber-300" fill="currentColor" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
