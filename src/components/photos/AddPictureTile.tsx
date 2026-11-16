'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, ClipboardPaste, ImagePlus, Images, Plus, Upload } from 'lucide-react';
import { useLoadPhotos } from './LoadPhotosContext';

/**
 * The picture beside the order number (2026-11-16).
 *
 * It used to be a grey box with a parcel in it that switched to the Pictures
 * tab — the only hint on the page that a load could have pictures, and not
 * one anybody read as a button. With no picture yet it is now a dashed tile
 * that says "Add picture"; once there is one, the picture shows as before
 * (`children`) with a small "+" on its corner. Either opens the same menu,
 * right there, and every item in it ends in the same tray.
 */
export default function AddPictureTile({ children, onOpenPictures }: {
  /** The load's picture(s), when it has any. */
  children?: ReactNode;
  onOpenPictures: () => void;
}) {
  const store = useLoadPhotos();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc  = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100';
  const run = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div ref={box} className="relative flex-shrink-0">
      {children ? (
        <div className="relative">
          {children}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
            title="Add pictures" aria-label="Add pictures"
            className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow hover:bg-brand-700">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
          title="Add pictures of this load"
          className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-brand-400 bg-brand-50 text-brand-700 transition hover:border-brand-600 hover:bg-brand-100">
          <ImagePlus className="h-5 w-5" />
          <span data-es className="text-[10px] font-semibold leading-tight">Add picture</span>
        </button>
      )}

      {open && (
        <div role="menu"
          className="absolute left-0 top-full z-30 mt-2 w-60 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
          <button type="button" role="menuitem" className={item} onClick={run(() => store.choose())}>
            <Upload className="h-4 w-4 text-gray-400" /> <span data-es>Choose from computer</span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(() => void store.pasteFromClipboard())}>
            <ClipboardPaste className="h-4 w-4 text-gray-400" />
            <span className="flex-1" data-es>Paste picture</span>
            <kbd className="text-[10px] text-gray-400">Ctrl+V</kbd>
          </button>
          {/* `capture` opens the camera on a phone and is ignored on a PC,
              where this would be a second file picker — so phones only. */}
          <button type="button" role="menuitem" className={`${item} sm:hidden`} onClick={run(() => store.camera())}>
            <Camera className="h-4 w-4 text-gray-400" /> <span data-es>Take a photo</span>
          </button>
          {store.count > 0 && (
            <button type="button" role="menuitem" className={item} onClick={run(onOpenPictures)}>
              <Images className="h-4 w-4 text-gray-400" /> <span>See all {store.count} pictures</span>
            </button>
          )}
          <p data-es className="px-3 pb-1 pt-1.5 text-[11px] leading-snug text-gray-400">
            You can also drop pictures anywhere on this page.
          </p>
        </div>
      )}
    </div>
  );
}
