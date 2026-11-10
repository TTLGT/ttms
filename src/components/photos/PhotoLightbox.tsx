'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check, ChevronLeft, ChevronRight, ExternalLink, Loader2, MapPin, Star, Trash2, X,
} from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  MAX_CAPTION,
  PHOTO_STAGES,
  PHOTO_STAGE_LABEL,
  hasRoute,
  type CommodityLineChoice,
  type LoadPhoto,
  type PhotoStage,
} from '@/types/loadPhoto';
import { STAGE_COLOR } from './PhotoBits';

/**
 * What the viewer saves. `stage` only when it was changed — see onSubmit.
 * The single `location` is never sent: nobody is asked for it any more (see
 * hasRoute()), and the server keeps whatever a picture already carries.
 */
export interface PhotoPatch { caption: string; stage?: PhotoStage; pickupAt: string; deliverTo: string; commodityItemId: string }

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
  /** Extra line at the top of the details — the Documents screen puts the load there. */
  context?: (photo: T) => ReactNode;
  /**
   * A commodity's pickup and delivery choices. Given on the order's own
   * Pictures tab; without it (the Documents screen, which has no order to
   * hand) the two stops are shown but changed from the load.
   */
  routeChoices?: { pickup: string[]; delivery: string[] };
  /** The load's freight lines, when it has more than one — see commodityLineChoices(). */
  lines?: CommodityLineChoice[];
}

/** One line under each type, so nobody has to guess what "Location" means. */
const STAGE_HINT: Record<PhotoStage, string> = {
  commodity: 'The freight itself',
  truck:     "The driver's truck and trailer",
  location:  'A place: a dock, a gate, a yard',
  proof:     'Damage, a broken seal, a shortage',
  other:     'Anything else',
};

type Draft = Required<PhotoPatch>;
const draftOf = (p: LoadPhoto): Draft =>
  ({ caption: p.caption, stage: p.stage, pickupAt: p.pickupAt, deliverTo: p.deliverTo, commodityItemId: p.commodityItemId });

/**
 * One picture at a time, with everything about it beside it.
 *
 * Laid out like any other card in the app (2026-11-10): the picture on a dark
 * ground on the left, and a details panel in the app's own colours on the
 * right — on a phone, below. The details are always open for editing, with
 * plain labels and a Save button that appears once something has changed.
 * The old viewer was a black full-screen overlay with small grey controls and
 * the fields behind an Edit button, and people read it as somewhere they were
 * not meant to touch.
 *
 * Arrow keys, the on-screen arrows, a swipe, or a tap on the strip of
 * pictures move it; Escape closes. Moving or closing with unsaved changes
 * asks first. The dark picture area is written with inline colours rather
 * than `bg-gray-900` & co.: tailwind.config.ts remaps those families for
 * dark mode, and the picture must sit on dark in every theme.
 */
export default function PhotoLightbox<T extends LoadPhoto>({
  photos, index, onIndex, onClose,
  isCover, onSetCover, onSave, onDelete, canDelete, context, routeChoices, lines = [],
}: Props<T>) {
  const { formatDateTime } = useDateFormatters();
  const photo = photos[index];
  const [busy, setBusy]     = useState<'' | 'cover' | 'save' | 'delete'>('');
  const [error, setError]   = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [draft, setDraft]   = useState<Draft>(() => (photo ? draftOf(photo) : { caption: '', stage: 'other', pickupAt: '', deliverTo: '', commodityItemId: '' }));
  const [loaded, setLoaded] = useState(false);
  const strip  = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const count = photos.length;
  const dirty = !!photo && !!onSave && (
    draft.caption.trim() !== photo.caption
    || draft.stage !== photo.stage
    || (hasRoute(draft.stage) && (
      draft.pickupAt !== photo.pickupAt || draft.deliverTo !== photo.deliverTo || draft.commodityItemId !== photo.commodityItemId
    ))
  );

  function leaveOk(): boolean {
    return !dirty || window.confirm('You have changes to this picture that are not saved. Leave without saving them?');
  }
  const go = (delta: number) => {
    if (count === 0 || !leaveOk()) return;
    onIndex((index + delta + count) % count);
  };
  const close = () => { if (leaveOk()) onClose(); };

  // Keyboard, while not typing into a box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { close(); return; }
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
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

  // Each move starts the details afresh and keeps the strip's active tile in
  // view. Keyed on the id too, so a save that replaces the record refreshes it.
  useEffect(() => {
    if (photo) setDraft(draftOf(photo));
    setError('');
    setLoaded(false);
    strip.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index, photo?.id]);

  useEffect(() => { setSavedAt(null); }, [photo?.id]);

  if (!photo) return null;

  async function run(kind: 'cover' | 'save' | 'delete', job: () => Promise<void>) {
    setBusy(kind);
    setError('');
    try { await job(); }
    catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(''); }
  }

  function save() {
    if (!onSave || !photo) return;
    // The type only when it was changed: an old Signed SA picture reads as
    // Other, and saving its caption must not rewrite it to Other and take it
    // out of signedSaProof().
    const patch: PhotoPatch = {
      caption: draft.caption, pickupAt: draft.pickupAt, deliverTo: draft.deliverTo, commodityItemId: draft.commodityItemId,
    };
    if (draft.stage !== photo.stage) patch.stage = draft.stage;
    const id = photo.id;
    void run('save', async () => {
      await onSave(photo, patch);
      // The server trims the caption; matching it here is what makes the
      // form read as saved rather than still changed.
      setDraft((d) => ({ ...d, caption: d.caption.trim() }));
      setSavedAt(id);
    });
  }

  const cover     = isCover?.(photo) ?? false;
  const editable  = !!onSave;
  const route     = hasRoute(draft.stage);
  const deletable = onDelete && (canDelete ? canDelete(photo) : true);
  // A picture's own stop stays on the list even when the load's stops have
  // changed since, so opening it never quietly drops it.
  const keep = (choices: string[], current: string) => [...new Set([...choices, ...(current ? [current] : [])])];
  // Linked to a freight line, the stops are the line's — exactly, blanks
  // included, since the server shows them that way (toLoadPhoto()).
  const withLine = (d: Draft, id: string): Draft => {
    const line = lines.find((l) => l.id === id);
    return line
      ? { ...d, commodityItemId: id, pickupAt: line.pickupAt, deliverTo: line.deliverTo }
      : { ...d, commodityItemId: '' };
  };
  // Turning a picture into a commodity fills each stop the load has only one
  // of, as the upload tray does.
  const withStage = (d: Draft, stage: PhotoStage): Draft => {
    if (!hasRoute(stage) || !routeChoices) return { ...d, stage };
    const only = (current: string, choices: string[]) => current || (choices.length === 1 ? choices[0] : '');
    return {
      ...d, stage,
      pickupAt:  only(d.pickupAt, routeChoices.pickup),
      deliverTo: only(d.deliverTo, routeChoices.delivery),
    };
  };

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60';
  const heading = 'block text-xs font-semibold text-gray-700 mb-1.5';
  const navBtn = 'absolute top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white transition hover:scale-105';
  const wash = { background: 'rgba(255,255,255,0.16)' };

  // A picture linked to a freight line follows the line's stops, so they are
  // shown here, never chosen.
  const linked = draft.commodityItemId !== '';
  const stopBox = (title: string, key: 'pickupAt' | 'deliverTo', choices: string[] | undefined) => (
    <label className="block">
      <span data-es className={heading}>{title}</span>
      {editable && choices && !linked ? (
        <select value={draft[key]} disabled={busy !== ''} className={field}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}>
          <option data-es value="">Not set</option>
          {keep(choices, draft[key]).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      ) : (
        <p className="text-sm text-gray-800">{draft[key] || <span data-es className="text-gray-400">Not set</span>}</p>
      )}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center lg:p-6"
      style={{ background: 'rgba(10,12,16,0.72)' }}
      role="dialog" aria-modal="true" aria-label="Picture" data-learn-skip
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="relative w-full h-full lg:max-w-6xl lg:max-h-[52rem] bg-white lg:rounded-2xl shadow-2xl overflow-hidden flex flex-col lg:flex-row">

        {/* The picture. `min-w-0` lets it shrink below its content: without
            it the strip of thumbnails (one per picture, never wrapping) sets
            the column's width, and on a load with a dozen pictures it pushed
            the details panel past the card's clipped edge. */}
        <div className="relative flex flex-col min-h-0 min-w-0 h-[45vh] lg:h-auto lg:flex-1" style={{ background: '#111318' }}>
          <div
            className="relative flex-1 min-h-0 flex items-center justify-center select-none p-2 sm:p-4"
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
              className={`relative max-w-full max-h-full object-contain rounded-md transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
            {cover && (
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                style={{ background: 'rgba(0,0,0,0.55)' }}>
                <Star className="w-3.5 h-3.5 text-amber-300" fill="currentColor" /> <span data-es>Profile picture</span>
              </span>
            )}
            {count > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Previous picture" title="Previous picture"
                  className={`${navBtn} left-2 sm:left-4`} style={wash}>
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Next picture" title="Next picture"
                  className={`${navBtn} right-2 sm:right-4`} style={wash}>
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {count > 1 && (
            <div ref={strip} className="flex gap-1.5 overflow-x-auto px-3 pb-3 pt-1 tab-scroll">
              {photos.map((p, i) => (
                <button key={p.id} type="button" data-index={i} onClick={() => { if (i !== index && leaveOk()) onIndex(i); }}
                  aria-label={`Picture ${i + 1}`}
                  className={`relative flex-shrink-0 w-16 h-12 rounded-md overflow-hidden border-2 transition ${
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

        {/* The details */}
        <div className="flex flex-col min-h-0 flex-1 lg:flex-none lg:flex-shrink-0 lg:w-[24rem] border-t lg:border-t-0 lg:border-l border-gray-200">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">
              {count > 1 ? `Picture ${index + 1} of ${count}` : 'Picture'}
            </h2>
            <button type="button" onClick={close} aria-label="Close" title="Close"
              className="ml-auto p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
            {context && <div className="text-sm">{context(photo)}</div>}

            {/* Type */}
            <div>
              <span data-es className={heading}>What does it show?</span>
              {editable ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5" role="radiogroup">
                  {PHOTO_STAGES.map((s) => {
                    const on = draft.stage === s;
                    return (
                      <button key={s} type="button" role="radio" aria-checked={on} disabled={busy !== ''}
                        onClick={() => setDraft(withStage(draft, s))}
                        className={`flex items-center gap-3 text-left rounded-lg border px-3 py-2 transition ${
                          on ? 'border-brand-500 ring-1 ring-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}>
                        <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${on ? 'border-brand-600' : 'border-gray-300'}`}>
                          {on && <span className="w-2 h-2 rounded-full bg-brand-600" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900">{PHOTO_STAGE_LABEL[s]}</span>
                          <span data-es className="block text-xs text-gray-500">{STAGE_HINT[s]}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className={`inline-flex items-center text-xs font-medium border rounded-full px-2.5 py-0.5 ${STAGE_COLOR[photo.stage]}`}>
                  {PHOTO_STAGE_LABEL[photo.stage]}
                </span>
              )}
            </div>

            {/* Which line, then its stops — commodity only */}
            {route && (
              <div className="space-y-3">
                {editable && lines.length > 0 ? (
                  <label className="block">
                    <span data-es className={heading}>Which commodity?</span>
                    <select value={draft.commodityItemId} disabled={busy !== ''} className={field}
                      onChange={(e) => setDraft(withLine(draft, e.target.value))}>
                      <option data-es value="">The whole load</option>
                      {lines.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                  </label>
                ) : photo.commodity && (
                  <div>
                    <span data-es className={heading}>Commodity</span>
                    <p className="text-sm text-gray-800">{photo.commodity}</p>
                  </div>
                )}
                {stopBox('Picked up at', 'pickupAt', routeChoices?.pickup)}
                {stopBox('Delivered to', 'deliverTo', routeChoices?.delivery)}
                {linked ? (
                  <p className="text-xs text-gray-500">
                    <span data-es>These follow the commodity&apos;s pickup and delivery in Freight.</span>{' '}
                    <a href={`/dashboard/orders/${photo.orderId}/edit?section=freight`}
                      className="font-medium text-brand-600 hover:underline" data-es>Change them in Freight</a>
                  </p>
                ) : editable && !routeChoices && (
                  <p data-es className="text-xs text-gray-500">To change the stops, open the picture from the load&apos;s Pictures tab.</p>
                )}
              </div>
            )}
            {/* A stop some other picture already carries — the driver's proof
                pictures are filed at one — is shown, never asked for. */}
            {!route && photo.location && (
              <p className="flex items-start gap-1.5 text-sm text-gray-700">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" /> {photo.location}
              </p>
            )}

            {/* Caption */}
            <label className="block">
              <span data-es className={heading}>Caption</span>
              {editable ? (
                <textarea value={draft.caption} maxLength={MAX_CAPTION} rows={3} disabled={busy !== ''}
                  onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
                  placeholder="e.g. Strapped and tarped at the dock"
                  className={`${field} resize-y`} />
              ) : (
                <p className="text-sm text-gray-800">{photo.caption || <span className="text-gray-400">—</span>}</p>
              )}
            </label>

            {/* Profile picture */}
            {onSetCover && (
              <div className={`rounded-lg border px-3 py-3 ${cover ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
                {cover ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
                    <Star className="w-4 h-4 text-amber-500" fill="currentColor" />
                    <span data-es>This is the load&apos;s profile picture</span>
                  </p>
                ) : (
                  <button type="button" disabled={busy !== ''}
                    onClick={() => run('cover', () => onSetCover(photo))}
                    className="inline-flex items-center gap-2 text-sm font-medium text-gray-800 hover:text-brand-700 disabled:opacity-50">
                    {busy === 'cover' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4 text-gray-400" />}
                    <span data-es>Make this the profile picture</span>
                  </button>
                )}
                <p data-es className="text-xs text-gray-500 mt-1">The profile picture shows on the orders list and at the top of the load.</p>
              </div>
            )}

            <div className="text-xs text-gray-500 space-y-2">
              <p>
                <span data-es>Added by</span> {photo.uploadedByName || '—'}
                {photo.createdAt ? ` · ${formatDateTime(new Date(photo.createdAt))}` : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={photo.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                  <ExternalLink className="w-4 h-4" /> <span data-es>Open full size</span>
                </a>
                {deletable && (
                  <button type="button" disabled={busy !== ''}
                    onClick={() => {
                      if (!window.confirm('Remove this picture from the load? This cannot be undone.')) return;
                      void run('delete', () => onDelete!(photo));
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" /> <span data-es>{busy === 'delete' ? 'Removing…' : 'Remove picture'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Save — only once something has changed, so an untouched picture shows no buttons to worry about */}
          {editable && (dirty || error || savedAt === photo.id) && (
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center gap-2">
              {error ? (
                <p className="text-xs text-red-600 mr-auto">{error}</p>
              ) : dirty ? (
                <p data-es className="text-xs text-gray-600 mr-auto">You have unsaved changes</p>
              ) : (
                <p className="text-xs text-green-700 mr-auto inline-flex items-center gap-1">
                  <Check className="w-4 h-4" /> <span data-es>Changes saved</span>
                </p>
              )}
              {dirty && (
                <>
                  <button type="button" disabled={busy !== ''} onClick={() => setDraft(draftOf(photo))}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50">
                    <span data-es>Undo changes</span>
                  </button>
                  <button type="button" disabled={busy !== ''} onClick={save}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                    {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span data-es>{busy === 'save' ? 'Saving…' : 'Save changes'}</span>
                  </button>
                </>
              )}
            </div>
          )}
          {!editable && error && <p className="px-5 pb-3 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
