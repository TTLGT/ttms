'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, FolderPlus, Star, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  createFolder, removeSticker, setFavorite, setInFolder, useChatLibrary,
} from '@/lib/stickers';
import { MAX_FOLDER_NAME, stickerIdOf } from '@/types/sticker';
import type { GifRef } from '@/types/gif';

/**
 * Where one sticker or GIF is kept: starred or not, which folders it is in,
 * and — for a sticker, to whoever added it or holds `chat.stickers.manage` —
 * taking it off the company set.
 *
 * The same menu whether it is opened from a tile in the picker or from
 * something somebody sent, which is how "I want that one" works: click it in
 * the thread, star it.
 *
 * Positioned against the viewport like every other popover in chat, for the
 * same reason: the thread and the popup both clip.
 */
export default function StickerLibraryMenu({
  item,
  gif,
  anchor,
  onClose,
  canRemove = false,
  onRemoved,
}: {
  /** `s:<stickerId>` or `g:<slug>` — see LibraryItem. */
  item: string;
  /** Required for a GIF: its details are saved beside the lists. */
  gif?: GifRef;
  anchor: DOMRect;
  onClose: () => void;
  canRemove?: boolean;
  onRemoved?: () => void;
}) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const library = useChatLibrary(uid);
  const stickerId = stickerIdOf(item);

  const box = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);
  const [naming, setNaming] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const margin = 8;
    let left = Math.min(anchor.left, window.innerWidth - el.offsetWidth - margin);
    left = Math.max(margin, left);
    let top = anchor.bottom + 4;
    if (top + el.offsetHeight > window.innerHeight - margin) top = anchor.top - el.offsetHeight - 4;
    setPlacement({ left, top: Math.max(margin, top) });
  // Re-measured when the folder list changes height under it.
  }, [anchor, library.folders.length, naming, confirmRemove]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const starred = library.favorites.includes(item);

  function run(p: Promise<void>, failed: string) {
    setError('');
    void p.catch((e) => setError(e instanceof Error ? e.message : failed));
  }

  return (
    <>
      <div className="fixed inset-0 z-[45]" onMouseDown={onClose} />
      <div
        ref={box}
        style={{
          left: placement?.left ?? anchor.left,
          top:  placement?.top ?? anchor.bottom,
          visibility: placement ? 'visible' : 'hidden',
        }}
        className="fixed z-50 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl"
      >
        <button
          type="button"
          onClick={() => run(setFavorite(uid, item, !starred, gif), 'That did not save.')}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-gray-700 transition hover:bg-gray-50"
        >
          <Star size={15} className={starred ? 'fill-amber-400 text-amber-500' : 'text-gray-400'} />
          {starred ? 'Remove from favorites' : 'Add to favorites'}
        </button>

        <p className="mt-1 border-t border-gray-100 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Your folders
        </p>
        {library.folders.length === 0 && !naming && (
          <p className="px-3 pb-1 text-xs text-gray-400">None yet. Only you see your folders.</p>
        )}
        <div className="max-h-48 overflow-y-auto">
          {library.folders.map((f) => {
            const inIt = f.items.includes(item);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => run(setInFolder(uid, f.id, item, !inIt, gif), 'That did not save.')}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 transition hover:bg-gray-50"
              >
                <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  inIt ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-300'
                }`}>
                  {inIt && <Check size={11} />}
                </span>
                <span className="truncate">{f.name}</span>
              </button>
            );
          })}
        </div>

        {naming ? (
          <form
            className="flex items-center gap-1.5 px-3 py-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                createFolder(uid, folderName, item, gif).then(() => { setNaming(false); setFolderName(''); }),
                'That folder did not save.',
              );
            }}
          >
            <input
              autoFocus
              value={folderName}
              maxLength={MAX_FOLDER_NAME}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name"
              className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button
              type="submit"
              disabled={!folderName.trim()}
              className="rounded bg-brand-500 px-2 py-1 text-xs font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-gray-700 transition hover:bg-gray-50"
          >
            <FolderPlus size={15} className="text-gray-400" />
            New folder with this {gif ? 'GIF' : 'sticker'}
          </button>
        )}

        {canRemove && stickerId && (
          <button
            type="button"
            onClick={() => {
              // Two clicks, because it takes the sticker away from everybody's
              // picker, not only yours.
              if (!confirmRemove) { setConfirmRemove(true); return; }
              run(
                removeSticker(stickerId).then(() => { onRemoved?.(); onClose(); }),
                'That sticker could not be removed.',
              );
            }}
            className="mt-1 flex w-full items-center gap-2.5 border-t border-gray-100 px-3 py-2 text-left text-red-600 transition hover:bg-red-50"
          >
            <Trash2 size={15} />
            {confirmRemove ? 'Click again to remove it for everyone' : 'Remove from company stickers'}
          </button>
        )}

        {error && <p className="px-3 py-1.5 text-xs text-red-500">{error}</p>}
      </div>
    </>
  );
}
