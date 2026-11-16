'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ImagePlus, Images, Loader2, Undo2, X } from 'lucide-react';
import {
  MAX_CAPTION,
  PHOTO_STAGES,
  PHOTO_STAGE_HINT,
  PHOTO_STAGE_LABEL,
  hasRoute,
  type PhotoStage,
} from '@/types/loadPhoto';
import { orderDisplayNumber } from '@/types/order';
import { Bi } from '@/components/spanish/Es';
import { useLoadPhotos, type Draft } from './LoadPhotosContext';

/**
 * Everything the picture store draws over the order page: the two hidden file
 * inputs, the drop-anywhere frame, the tray where pictures are tagged, and
 * the card in the corner that says what was saved and offers Undo.
 *
 * Rendered once, by the order page, inside LoadPhotosProvider.
 */
export default function PhotoAdderLayer({ onOpenDocuments }: { onOpenDocuments: () => void }) {
  const store = useLoadPhotos();
  const { pickRef, cameraRef, onPicked } = store;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <input ref={pickRef} type="file" accept="image/*" multiple className="hidden" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; onPicked(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; onPicked(f); }} />
      {mounted && createPortal(
        <>
          <DropFrame />
          {store.trayOpen && store.drafts.some((d) => !d.auto || d.state === 'failed' || d.error) && <Tray />}
          <Corner onOpenDocuments={onOpenDocuments} />
        </>,
        document.body,
      )}
    </>
  );
}

/* ------------------------------------------------------------ drop frame */

/**
 * A picture dragged over any part of the order page, on any tab, can be let
 * go there. Listens on the window rather than on a box, so it reaches Details.
 *
 * A drop area that already exists wins: the Documents tab's file slots and
 * the chat composer call preventDefault() in their own handlers, which run
 * before these, so a signed SA photographed on a phone still lands in the
 * signed-SA slot. The frame is drawn with pointer-events off for the same
 * reason — it must never sit between the file and the slot under it.
 */
function DropFrame() {
  const { addFiles, order } = useLoadPhotos();
  const [over, setOver] = useState(false);
  const hide = useRef<number | null>(null);
  // A drag that started on this page — a thumbnail, a board card — is not a
  // file being brought in.
  const inside = useRef(false);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !inside.current && !!e.dataTransfer?.types.includes('Files');
    const later = () => {
      if (hide.current) window.clearTimeout(hide.current);
      hide.current = window.setTimeout(() => setOver(false), 150);
    };
    function onStart() { inside.current = true; }
    function onEnd()   { inside.current = false; setOver(false); }
    function onOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      if (e.defaultPrevented) { setOver(false); return; }   // a slot underneath took it
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setOver(true);
      later();
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return;
      setOver(false);
      if (e.defaultPrevented) return;
      e.preventDefault();
      addFiles([...(e.dataTransfer?.files ?? [])]);
    }
    window.addEventListener('dragstart', onStart);
    window.addEventListener('dragend', onEnd);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragstart', onStart);
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
      if (hide.current) window.clearTimeout(hide.current);
    };
  }, [addFiles]);

  if (!over || !order) return null;
  return (
    <div className="pointer-events-none fixed inset-3 z-[60] flex items-center justify-center rounded-2xl border-4 border-dashed border-brand-400 bg-brand-50/80">
      <div className="text-center">
        <ImagePlus className="mx-auto mb-2 h-10 w-10 text-brand-600" />
        <p className="text-2xl font-bold text-brand-700 font-[family-name:var(--font-rajdhani)]">
          Drop to add to load {orderDisplayNumber(order)}
        </p>
        <p data-es className="mt-1 text-sm text-gray-600">You pick a type for each picture next.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tray */

const chipBase = 'rounded-full border px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50';
const chipOn   = 'border-brand-600 bg-brand-600 text-white';
const chipOff  = 'border-gray-300 bg-white text-gray-700 hover:border-brand-400 hover:text-brand-700';

/** The five types as buttons — one tap, every choice in sight. */
function TypeChips({ value, onPick, disabled, label }: {
  value: PhotoStage | ''; onPick: (s: PhotoStage) => void; disabled?: boolean; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {PHOTO_STAGES.map((s) => (
        <button key={s} type="button" disabled={disabled} aria-pressed={value === s}
          title={PHOTO_STAGE_HINT[s]} data-es={PHOTO_STAGE_LABEL[s]}
          onClick={() => onPick(s)}
          className={`${chipBase} ${value === s ? chipOn : chipOff}`}>
          {PHOTO_STAGE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

const field = 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60';
const label = 'block text-xs text-gray-500 mb-0.5';

/**
 * Where chosen pictures wait for a type. A window over the page rather than a
 * block on the Pictures tab, so it opens wherever the picture came in and
 * nobody is moved off what they were doing. Closing it keeps the pictures —
 * the corner card says they are waiting — and only Discard throws them away.
 */
function Tray() {
  const s = useLoadPhotos();
  const { drafts, order, lines, pickupChoices, deliveryChoices, saving } = s;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const shown = drafts.filter((d) => !d.auto || d.state === 'failed' || d.error);
  const close = () => s.setTrayOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!order) return null;
  const keys        = shown.map((d) => d.key);
  const ready       = shown.filter((d) => d.prepared && d.state === 'ready');
  const untyped     = ready.filter((d) => !d.stage).length;
  const shrinking   = shown.some((d) => d.state === 'preparing');
  const allStage    = shown.length > 0 && shown.every((d) => d.stage === shown[0].stage) ? shown[0].stage : '';
  const allLine     = shown.length > 0 && shown.every((d) => d.commodityItemId === shown[0].commodityItemId) ? shown[0].commodityItemId : '';

  return (
    <div role="dialog" aria-modal="true" aria-label="Add pictures"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6"
      onClick={close}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              {shown.length} new picture{shown.length === 1 ? '' : 's'} for load {orderDisplayNumber(order)}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <Bi>Tap a type for each picture, then save. The caption is optional.</Bi>
            </p>
          </div>
          <button type="button" onClick={close} title="Close — the pictures wait until you save or discard them"
            aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {shown.length > 1 && (
            <div className="mb-4 rounded-xl bg-gray-50 p-3">
              <p data-es className="mb-1.5 text-xs font-medium text-gray-600">All of them are:</p>
              <TypeChips value={allStage} disabled={saving} label="Type for every picture"
                onPick={(st) => s.setDraftStage(keys, st)} />
              {hasRoute(allStage) && lines.length > 0 && (
                <label className="mt-2 block max-w-xs">
                  <span data-es className={label}>Which commodity?</span>
                  <select value={allLine} disabled={saving} className={`${field} w-full`}
                    onChange={(e) => s.setDraftLine(keys, e.target.value)}>
                    <option data-es value="">The whole load</option>
                    {lines.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          <ul className="space-y-3">
            {shown.map((d) => (
              <DraftRow key={d.key} d={d} pickupChoices={pickupChoices} deliveryChoices={deliveryChoices} />
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          {untyped > 0 && !saving && (
            <p className="mr-auto text-xs text-amber-700">
              {untyped} picture{untyped === 1 ? '' : 's'} still need{untyped === 1 ? 's' : ''} a type.
            </p>
          )}
          {confirmDiscard ? (
            <>
              <span className="text-xs text-gray-600">Discard {shown.length} unsaved picture{shown.length === 1 ? '' : 's'}?</span>
              <button data-es type="button" onClick={() => setConfirmDiscard(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Keep them</button>
              <button data-es type="button" onClick={() => { setConfirmDiscard(false); s.discardDrafts(); }}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">Discard</button>
            </>
          ) : (
            <button data-es type="button" disabled={saving}
              onClick={() => (shown.length > 1 ? setConfirmDiscard(true) : s.discardDrafts())}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Discard
            </button>
          )}
          <button type="button" onClick={s.saveDrafts}
            disabled={saving || shrinking || ready.length === 0 || untyped > 0}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : shrinking ? 'Getting pictures ready…'
              : `Save ${ready.length} picture${ready.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftRow({ d, pickupChoices, deliveryChoices }: { d: Draft; pickupChoices: string[]; deliveryChoices: string[] }) {
  const s = useLoadPhotos();
  const locked = s.saving || d.state === 'uploading';
  const route  = hasRoute(d.stage);
  const stopChoices = d.stop === 'pickup' ? pickupChoices : d.stop === 'delivery' ? deliveryChoices : [];

  const stopSelect = (title: string, value: string, choices: string[], onChange: (v: string) => void, disabled: boolean) => (
    <label className="min-w-0">
      <span data-es className={label}>{title}</span>
      <select value={value} disabled={disabled} className={`${field} w-full`} onChange={(e) => onChange(e.target.value)}>
        <option data-es value="">Not set</option>
        {choices.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <li className={`flex flex-col sm:flex-row gap-3 rounded-xl border p-3 ${d.error ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="relative h-40 w-full flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-28 sm:w-36 flex items-center justify-center">
        {d.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, never fetched
          <img src={d.preview} alt={d.name} className="h-full w-full object-cover" />
        ) : d.state === 'preparing' ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        ) : (
          <Images className="h-6 w-6 text-gray-300" />
        )}
        {d.state === 'uploading' && (
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/20">
            <span className="block h-full bg-brand-500 transition-all" style={{ width: `${d.progress}%` }} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start gap-2">
          <p className="flex-1 truncate text-xs text-gray-500">
            {d.name}
            {d.state === 'preparing' && ' · getting it ready…'}
            {d.state === 'uploading' && ` · saving ${d.progress}%`}
          </p>
          <button type="button" onClick={() => s.removeDraft(d.key)} disabled={locked}
            aria-label={`Remove ${d.name}`} title="Remove — it will not be saved"
            className="-m-1 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        {d.state === 'failed' && !d.prepared ? (
          <p className="text-xs text-red-600">{d.error}</p>
        ) : (
          <>
            <TypeChips value={d.stage} disabled={locked} label={`Type for ${d.name}`}
              onPick={(st) => { s.setDraftStage([d.key], st); if (d.error) s.updateDraft(d.key, { error: undefined }); }} />

            {route && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {s.lines.length > 0 && (
                  <label className="min-w-0">
                    <span data-es className={label}>Which commodity?</span>
                    <select value={d.commodityItemId} disabled={locked} className={`${field} w-full`}
                      onChange={(e) => s.setDraftLine([d.key], e.target.value)}>
                      <option data-es value="">The whole load</option>
                      {s.lines.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                  </label>
                )}
                {stopSelect('Picked up at', d.pickupAt, pickupChoices,
                  (v) => s.updateDraft(d.key, { pickupAt: v }), locked || d.commodityItemId !== '')}
                {stopSelect('Delivered to', d.deliverTo, deliveryChoices,
                  (v) => s.updateDraft(d.key, { deliverTo: v }), locked || d.commodityItemId !== '')}
              </div>
            )}

            {/* Proof from a stop box, on a load with several of that stop:
                which one. Nobody else is asked for a stop (hasRoute()). */}
            {d.stage === 'proof' && d.stop && stopChoices.length > 1 && (
              <label className="block max-w-sm">
                <span data-es className={label}>{d.stop === 'pickup' ? 'Which pickup?' : 'Which delivery?'}</span>
                <select value={d.location} disabled={locked} className={`${field} w-full`}
                  onChange={(e) => s.updateDraft(d.key, { location: e.target.value })}>
                  {stopChoices.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            )}

            <label className="block">
              <span data-es className={label}>Caption</span>
              <input value={d.caption} maxLength={MAX_CAPTION} disabled={locked}
                onChange={(e) => s.updateDraft(d.key, { caption: e.target.value })}
                placeholder="e.g. Strapped and tarped at the dock" className={`${field} w-full`} />
            </label>
          </>
        )}
        {d.error && d.prepared && <p className="text-xs text-red-600">{d.error}</p>}
      </div>
    </li>
  );
}

/* --------------------------------------------------------- corner card */

/**
 * What just happened, in the corner: saving progress, "saved" with Undo,
 * pictures still waiting in a closed tray, and the two messages a drop or a
 * paste can need — a document is not a picture, and press Ctrl+V.
 */
function Corner({ onOpenDocuments }: { onOpenDocuments: () => void }) {
  const s = useLoadPhotos();
  const { notice, order, trayOpen, drafts } = s;
  const waiting = drafts.filter((d) => !d.auto || d.error).length;
  const [undoing, setUndoing] = useState(false);
  if (!order) return null;
  const number = orderDisplayNumber(order);

  const card = (children: React.ReactNode, tone: 'plain' | 'ok' | 'bad' = 'plain') => (
    <div role="status"
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg bg-white ${
        tone === 'ok' ? 'border-green-200' : tone === 'bad' ? 'border-red-200' : 'border-gray-200'}`}>
      {children}
    </div>
  );
  const closeX = (
    <button type="button" onClick={s.clearNotice} aria-label="Close" className="rounded p-1 text-gray-400 hover:text-gray-700">
      <X className="h-4 w-4" />
    </button>
  );

  return (
    <div className="fixed bottom-4 right-4 z-[55] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {!trayOpen && waiting > 0 && card(
        <>
          <Images className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <span className="text-gray-800">{waiting} picture{waiting === 1 ? '' : 's'} not saved yet</span>
          <button data-es type="button" onClick={() => s.setTrayOpen(true)}
            className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700">Open</button>
        </>,
      )}
      {notice?.kind === 'saving' && card(
        <>
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-brand-600" />
          <span className="text-gray-800">
            Saving picture {Math.min(notice.done + 1, notice.of)} of {notice.of}… {notice.progress}%
          </span>
        </>,
      )}
      {notice?.kind === 'saved' && card(
        <>
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />
          <span className="text-gray-800">
            {notice.ids.length} picture{notice.ids.length === 1 ? '' : 's'} saved to {number}
          </span>
          <button type="button" disabled={undoing}
            onClick={() => { setUndoing(true); void s.undoSaved().finally(() => setUndoing(false)); }}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Undo2 className="h-3.5 w-3.5" /> <span data-es>Undo</span>
          </button>
          {closeX}
        </>, 'ok',
      )}
      {notice?.kind === 'undone' && card(
        <>
          <span className="text-gray-800">{notice.n} picture{notice.n === 1 ? '' : 's'} removed again.</span>
          {closeX}
        </>,
      )}
      {notice?.kind === 'document' && card(
        <>
          <span className="text-gray-800">
            {notice.n === 1 ? "That file isn't a picture." : `${notice.n} files aren't pictures.`}{' '}
            Documents go on the Documents tab.
          </span>
          <button data-es type="button" onClick={() => { s.clearNotice(); onOpenDocuments(); }}
            className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700">Open Documents</button>
          {closeX}
        </>,
      )}
      {notice?.kind === 'pasteHint' && card(
        <>
          <span data-es className="text-gray-800">Copy the picture, then press Ctrl+V on this page.</span>
          {closeX}
        </>,
      )}
      {notice?.kind === 'error' && card(
        <>
          <span className="text-red-700">{notice.text}</span>
          {closeX}
        </>, 'bad',
      )}
    </div>
  );
}

