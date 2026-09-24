'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  ArrowLeft, Clock, Folder, ImagePlus, LayoutGrid, Loader2, MoreHorizontal, Pencil, Search, Star, Trash2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/accessControl';
import { useStorageUrl } from '@/lib/useStorageUrl';
import { readableSize } from '@/lib/chatUploads';
import {
  cleanStickerName, createSticker, deleteFolder, listStickers, recentStickerIds, rememberSticker,
  renameFolder, setFavorite, useChatLibrary,
} from '@/lib/stickers';
import {
  MAX_FOLDER_NAME, MAX_STICKER_BYTES, MAX_STICKER_NAME, stickerIdOf, stickerItem, type Sticker,
} from '@/types/sticker';
import StickerLibraryMenu from './StickerLibraryMenu';

/**
 * The sticker picker: the company set, and this person's own favourites,
 * recent picks and folders over the top of it.
 *
 * A tab is a view of the shelf, never a copy of it. Favourites and folders
 * hold sticker ids, and anything that has since been taken off the shelf
 * simply stops appearing in them — see "Taking one off the shelf" in
 * src/types/sticker.ts.
 */

const WIDTH = 360;
const HEIGHT = 440;

type Tab = 'favorites' | 'recent' | 'all' | `folder:${string}`;

export default function StickerPicker({
  anchor,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  onPick: (sticker: Sticker) => void;
  onClose: () => void;
}) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? '';
  const mayRemoveAny = can(profile, 'chat.stickers.manage');
  const library = useChatLibrary(uid);

  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);
  const [shelf, setShelf]   = useState<Sticker[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab]       = useState<Tab | null>(null);
  const [query, setQuery]   = useState('');
  const [creating, setCreating] = useState(false);
  const [menu, setMenu]     = useState<{ sticker: Sticker; anchor: DOMRect } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const reload = useCallback(() => {
    listStickers()
      .then((list) => { setShelf(list); setFailed(false); })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    reload();
    setRecent(recentStickerIds());
  }, [reload]);

  // Opens on favourites once there are any — the whole point of starring
  // something is that it is the first thing you see next time.
  useEffect(() => {
    if (tab === null && shelf) setTab(library.favorites.length > 0 ? 'favorites' : 'all');
  }, [tab, shelf, library.favorites.length]);

  useLayoutEffect(() => {
    const margin = 8;
    let left = Math.min(anchor.left, window.innerWidth - WIDTH - margin);
    left = Math.max(margin, left);
    let top = anchor.top - HEIGHT - 6;
    if (top < margin) top = Math.min(anchor.bottom + 6, window.innerHeight - HEIGHT - margin);
    setPlacement({ left, top: Math.max(margin, top) });
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The item menu closes first; Escape again closes the picker.
      if (e.key === 'Escape' && !menu) onClose();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, menu]);

  const byId = useMemo(() => new Map((shelf ?? []).map((s) => [s.id, s])), [shelf]);

  /** Items to stickers, dropping anything no longer on the shelf. */
  const resolve = useCallback(
    (items: string[]) => items
      .map((i) => stickerIdOf(i))
      .map((id) => (id ? byId.get(id) : undefined))
      .filter((s): s is Sticker => !!s),
    [byId],
  );

  const folder = tab?.startsWith('folder:')
    ? library.folders.find((f) => f.id === tab.slice('folder:'.length)) ?? null
    : null;

  const shown: Sticker[] = useMemo(() => {
    if (!shelf) return [];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    // A search looks across the whole shelf, whichever tab it was typed on.
    if (words.length > 0) {
      return shelf.filter((s) => words.every((w) => s.name.toLowerCase().includes(w)));
    }
    if (tab === 'favorites') return resolve(library.favorites);
    if (tab === 'recent') return recent.map((id) => byId.get(id)).filter((s): s is Sticker => !!s);
    if (folder) return resolve(folder.items);
    return shelf;
  }, [shelf, query, tab, library.favorites, recent, byId, folder, resolve]);

  function pick(s: Sticker) {
    rememberSticker(s.id);
    onPick(s);
    onClose();
  }

  const emptyText =
    query ? `No stickers are called “${query}”.`
    : tab === 'favorites' ? 'Star a sticker with ⋯ to keep it here.'
    : tab === 'recent' ? 'Stickers you send will show here.'
    : folder ? 'Nothing in this folder yet. Use ⋯ on any sticker to add it.'
    : 'No stickers yet. Make the first one.';

  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-label="Stickers"
        style={{
          left: placement?.left ?? anchor.left,
          top:  placement?.top ?? anchor.top,
          width: WIDTH,
          height: HEIGHT,
          visibility: placement ? 'visible' : 'hidden',
        }}
        className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
      >
        {creating ? (
          <StickerCreator
            onBack={() => setCreating(false)}
            onCreated={(s) => {
              // Straight into their favourites: somebody who just made a
              // sticker is about to want it again.
              void setFavorite(uid, stickerItem(s.id), true).catch(() => {});
              setShelf((was) => [s, ...(was ?? []).filter((x) => x.id !== s.id)]);
              setCreating(false);
              setQuery('');
              setTab('favorites');
            }}
          />
        ) : (
          <>
            <div className="flex-shrink-0 border-b border-gray-100 p-2">
              <div className="flex items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search stickers"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2 text-sm focus:border-brand-400 focus:bg-white focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  title="Make a sticker"
                  className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-brand-600"
                >
                  <ImagePlus size={14} /> New
                </button>
              </div>

              <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5">
                <Chip active={!query && tab === 'favorites'} onClick={() => { setQuery(''); setTab('favorites'); }}>
                  <Star size={12} /> Favorites
                </Chip>
                <Chip active={!query && tab === 'recent'} onClick={() => { setQuery(''); setTab('recent'); }}>
                  <Clock size={12} /> Recent
                </Chip>
                <Chip active={!query && tab === 'all'} onClick={() => { setQuery(''); setTab('all'); }}>
                  <LayoutGrid size={12} /> All
                </Chip>
                {library.folders.map((f) => (
                  <Chip
                    key={f.id}
                    active={!query && tab === `folder:${f.id}`}
                    onClick={() => { setQuery(''); setTab(`folder:${f.id}`); }}
                  >
                    <Folder size={12} /> {f.name}
                  </Chip>
                ))}
              </div>
            </div>

            {folder && !query && (
              <FolderBar
                key={folder.id}
                uid={uid}
                folderId={folder.id}
                name={folder.name}
                onDeleted={() => setTab('favorites')}
              />
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {failed ? (
                <div className="p-4 text-center text-xs text-gray-500">
                  The stickers did not load.{' '}
                  <button type="button" onClick={reload} className="font-medium text-brand-700 hover:underline">
                    Try again
                  </button>
                </div>
              ) : !shelf ? (
                <div className="flex h-full items-center justify-center text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : shown.length === 0 ? (
                <p className="p-4 text-center text-xs text-gray-500">{emptyText}</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {shown.map((s) => (
                    <Tile
                      key={s.id}
                      sticker={s}
                      starred={library.favorites.includes(stickerItem(s.id))}
                      onPick={() => pick(s)}
                      onMenu={(at) => setMenu({ sticker: s, anchor: at })}
                    />
                  ))}
                </div>
              )}
            </div>

            <p className="flex-shrink-0 border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-400">
              Stickers are shared with everyone at TTL. Favorites and folders are yours alone.
            </p>
          </>
        )}
      </div>

      {menu && (
        <StickerLibraryMenu
          stickerId={menu.sticker.id}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          canRemove={menu.sticker.createdByUid === uid || mayRemoveAny}
          onRemoved={() => setShelf((was) => (was ?? []).filter((x) => x.id !== menu.sticker.id))}
        />
      )}
    </>
  );
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function Tile({
  sticker, starred, onPick, onMenu,
}: {
  sticker: Sticker;
  starred: boolean;
  onPick: () => void;
  onMenu: (at: DOMRect) => void;
}) {
  const url = useStorageUrl(sticker.path);
  return (
    <div className="group relative aspect-square">
      <button
        type="button"
        onClick={onPick}
        title={`Send “${sticker.name}”`}
        className="flex h-full w-full items-center justify-center rounded-lg p-1.5 transition hover:bg-gray-100"
      >
        {url ? (
          <Image
            src={url}
            alt={sticker.name}
            width={sticker.width}
            height={sticker.height}
            unoptimized
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="h-full w-full animate-pulse rounded-md bg-gray-100" />
        )}
      </button>
      {starred && (
        <Star size={11} className="pointer-events-none absolute left-1 top-1 fill-amber-400 text-amber-500" />
      )}
      <button
        type="button"
        title="Favorite, folders…"
        onClick={(e) => onMenu(e.currentTarget.getBoundingClientRect())}
        className="absolute right-0.5 top-0.5 rounded-md bg-white/90 p-0.5 text-gray-500 opacity-0 shadow-sm transition hover:text-gray-800 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}

/** Renaming and deleting the folder being looked at. */
function FolderBar({
  uid, folderId, name, onDeleted,
}: { uid: string; folderId: string; name: string; onDeleted: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  const fail = (fallback: string) => (e: unknown) => setError(e instanceof Error ? e.message : fallback);

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-xs">
      {renaming ? (
        <form
          className="flex flex-1 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            renameFolder(uid, folderId, draft).then(() => setRenaming(false)).catch(fail('That did not save.'));
          }}
        >
          <input
            autoFocus
            value={draft}
            maxLength={MAX_FOLDER_NAME}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button type="submit" className="font-medium text-brand-700 hover:underline">Save</button>
          <button type="button" onClick={() => { setRenaming(false); setDraft(name); }} className="text-gray-500 hover:underline">
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate font-medium text-gray-600">{error || name}</span>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="flex items-center gap-1 text-gray-500 transition hover:text-gray-800"
          >
            <Pencil size={12} /> Rename
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm) { setConfirm(true); return; }
              deleteFolder(uid, folderId).then(onDeleted).catch(fail('That did not delete.'));
            }}
            className="flex items-center gap-1 text-red-600 transition hover:text-red-700"
          >
            <Trash2 size={12} /> {confirm ? 'Click again — the stickers stay' : 'Delete folder'}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Making a sticker: a picture and a name.
 *
 * The name is required because it is the only way to search the shelf — a
 * hundred unnamed pictures is a shelf nobody can find anything on.
 */
function StickerCreator({
  onBack, onCreated,
}: { onBack: () => void; onCreated: (s: Sticker) => void }) {
  const { user, profile } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(f: File | undefined) {
    setError('');
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Pick a picture — PNG, JPG, WebP or GIF.'); return; }
    if (f.type === 'image/gif' && f.size > MAX_STICKER_BYTES) {
      setError(`That GIF is ${readableSize(f.size)}. A sticker can be at most ${readableSize(MAX_STICKER_BYTES)}.`);
      return;
    }
    setFile(f);
    // The file name, tidied, is usually close to what it should be called.
    if (!name) setName(cleanStickerName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')));
  }

  async function save() {
    if (!file || !user) return;
    setSaving(true);
    setError('');
    try {
      const displayName = profile?.displayName || user.displayName || user.email || 'Someone';
      onCreated(await createSticker(file, name, { uid: user.uid, displayName }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That sticker did not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="flex h-full flex-col"
      onPaste={(e) => choose(Array.from(e.clipboardData.files)[0])}
    >
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-100 px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          title="Back to stickers"
          className="rounded-md p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
        >
          <ArrowLeft size={16} />
        </button>
        <h3 className="text-sm font-semibold text-gray-800">Make a sticker</h3>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}
          className={`flex h-40 flex-shrink-0 items-center justify-center rounded-xl border-2 border-dashed transition ${
            dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
          }`}
        >
          {preview ? (
            // A plain <img>: a local blob URL has nothing for next/image to do.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-36 max-w-[90%] object-contain" />
          ) : (
            <span className="px-4 text-center text-xs text-gray-500">
              <ImagePlus size={22} className="mx-auto mb-1.5 text-gray-400" />
              Choose a picture, drop one here, or paste one.
              <br />
              PNG, JPG, WebP, or a GIF up to {readableSize(MAX_STICKER_BYTES)}.
            </span>
          )}
        </button>

        <label className="block">
          <span className="text-xs font-medium text-gray-600">Name</span>
          <input
            value={name}
            maxLength={MAX_STICKER_NAME}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
            placeholder="What people will search for — “truck loaded”"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <p className="text-[11px] leading-relaxed text-gray-500">
          Everyone at TTL will be able to send it. Pictures are shrunk to sticker size; a GIF is kept
          as it is so it still moves. You, or an admin, can remove it later.
        </p>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div className="flex flex-shrink-0 justify-end gap-2 border-t border-gray-100 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!file || !name.trim() || saving}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Add sticker
        </button>
      </div>
    </div>
  );
}
