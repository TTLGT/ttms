'use client';

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { db, storage } from './firebase';
import { readableSize } from './chatUploads';
import {
  CHAT_LIBRARIES_COLLECTION,
  EMPTY_LIBRARY,
  MAX_FOLDER_NAME,
  MAX_FOLDERS,
  MAX_LIBRARY_ITEMS,
  MAX_STICKER_BYTES,
  MAX_STICKER_NAME,
  STICKER_EDGE,
  STICKER_PREFIX,
  STICKERS_COLLECTION,
  type ChatLibrary,
  type LibraryFolder,
  type Sticker,
} from '@/types/sticker';

/**
 * Stickers: the company shelf, adding to it, and each person's own favourites
 * and folders. See src/types/sticker.ts for the shape and the two owners.
 *
 * Read and written from the browser under the rules, like the rest of chat.
 * That is safe for the same reason chat is: neither collection crosses an
 * ownership boundary. The shelf is one list every staff account may read, and
 * a library is one document addressed by the caller's own uid.
 */

/* ------------------------------------------------------------------- shelf */

/**
 * The company set is read whole — it is a shelf of pictures, not a table of
 * records, and the picker shows all of it. Kept for a few minutes rather than
 * watched live: every open of the picker re-reading every sticker would cost
 * one read per sticker per open, for a list that changes a few times a week.
 * Adding or removing one here updates the copy straight away, so the person
 * who made the change always sees it.
 */
const SHELF_TTL_MS = 5 * 60 * 1000;
let shelf: { at: number; stickers: Promise<Sticker[]> } | null = null;

export function listStickers(): Promise<Sticker[]> {
  if (shelf && Date.now() - shelf.at < SHELF_TTL_MS) return shelf.stickers;
  const stickers = getDocs(
    query(collection(db, STICKERS_COLLECTION), orderBy('createdAt', 'desc')),
  )
    .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sticker))
    .catch((e) => {
      shelf = null;
      throw e;
    });
  shelf = { at: Date.now(), stickers };
  return stickers;
}

async function patchShelf(change: (list: Sticker[]) => Sticker[]): Promise<void> {
  if (!shelf) return;
  const list = await shelf.stickers.catch(() => null);
  if (list) shelf = { at: shelf.at, stickers: Promise.resolve(change(list)) };
}

/** A picture made ready to be a sticker — resized, re-encoded, measured. */
interface Prepared {
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
  animated: boolean;
}

/**
 * Shrinks a picture to sticker size.
 *
 * A still picture is redrawn at no more than STICKER_EDGE on its longest side
 * and saved as WebP (PNG where the browser cannot write WebP), keeping any
 * transparency. A 4 MB phone photo comes out at tens of kilobytes, which
 * matters because every sticker in a thread is downloaded by everyone reading
 * it.
 *
 * A GIF goes up exactly as it came, because redrawing it on a canvas keeps the
 * first frame and throws the animation away. That is why the size cap is
 * really about GIFs.
 */
async function prepare(file: File): Promise<Prepared> {
  if (!file.type.startsWith('image/')) throw new Error('Pick a picture — PNG, JPG, WebP or GIF.');

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That picture could not be opened.');
  });
  try {
    if (file.type === 'image/gif') {
      if (file.size > MAX_STICKER_BYTES) {
        throw new Error(`That GIF is ${readableSize(file.size)}. A sticker can be at most ${readableSize(MAX_STICKER_BYTES)}.`);
      }
      return { blob: file, contentType: 'image/gif', width: bitmap.width, height: bitmap.height, animated: true };
    }

    const scale  = Math.min(1, STICKER_EDGE / Math.max(bitmap.width, bitmap.height));
    const width  = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize pictures.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob) throw new Error('That picture could not be converted.');
    // A browser that cannot write WebP hands back a PNG instead, and says so
    // in the blob's type — which is what gets stored, so the two always agree.
    const contentType = blob.type === 'image/webp' ? 'image/webp' : 'image/png';
    if (blob.size > MAX_STICKER_BYTES) {
      throw new Error(`That picture is still ${readableSize(blob.size)} after shrinking. Try a simpler one.`);
    }
    return { blob, contentType, width, height, animated: false };
  } finally {
    bitmap.close();
  }
}

export function cleanStickerName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_STICKER_NAME);
}

/**
 * Adds a sticker to the company set.
 *
 * The document id is chosen first and used as the file name, so the picture
 * and its record can always be matched up by eye in the Console. If the record
 * fails to save after the upload, the picture stays in the bucket with nothing
 * pointing at it — the rules let nobody delete from that prefix (see
 * storage.rules), and a few stray kilobytes are a better failure than a
 * sticker that can be removed from under every message it was sent in.
 */
export async function createSticker(
  file: File,
  name: string,
  creator: { uid: string; displayName: string },
): Promise<Sticker> {
  const clean = cleanStickerName(name);
  if (!clean) throw new Error('Give the sticker a name, so people can search for it.');

  const prepared = await prepare(file);
  const record = doc(collection(db, STICKERS_COLLECTION));
  const ext = prepared.contentType.split('/')[1];
  const path = `${STICKER_PREFIX}${record.id}.${ext}`;

  await uploadBytes(ref(storage, path), prepared.blob, {
    contentType: prepared.contentType,
    // Written once to a path with a random id and never replaced, so a
    // browser may keep it for good — a room full of the same sticker then
    // costs one download, not one per message.
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const data = {
    name:          clean,
    path,
    contentType:   prepared.contentType,
    width:         prepared.width,
    height:        prepared.height,
    animated:      prepared.animated,
    createdByUid:  creator.uid,
    createdByName: creator.displayName,
    createdAt:     serverTimestamp(),
  };
  await setDoc(record, data);

  // The shelf copy gets the browser's clock in place of the server's; it only
  // orders the list, and the next read replaces it.
  const sticker: Sticker = { id: record.id, ...data, createdAt: null };
  await patchShelf((list) => [sticker, ...list]);
  return sticker;
}

/**
 * Takes a sticker off the company set. The rules allow the person who added
 * it, or anybody holding `chat.stickers.manage`.
 *
 * The picture itself stays — see "Taking one off the shelf does not unsend it"
 * in src/types/sticker.ts. Favourites and folders that held it simply stop
 * showing it; they are not rewritten, because they belong to other people and
 * this write cannot reach them.
 */
export async function removeSticker(stickerId: string): Promise<void> {
  await deleteDoc(doc(db, STICKERS_COLLECTION, stickerId));
  await patchShelf((list) => list.filter((s) => s.id !== stickerId));
}

/* ----------------------------------------------------------------- library */

/*
 * One person's favourites and folders, watched live while something that shows
 * them is on screen — the picker, or the menu on a sticker in the thread — so
 * starring a sticker in one place shows in the other at once.
 *
 * One shared listener however many of those are open, started by the first
 * and stopped by the last. It is the AuthContext argument, narrower still: one
 * document, addressed by the caller's own uid, that no rule has to query.
 */
let libraryUid: string | null = null;
let libraryValue: ChatLibrary = EMPTY_LIBRARY;
let libraryStop: Unsubscribe | null = null;
const libraryListeners = new Set<(lib: ChatLibrary) => void>();

function libraryRef(uid: string) {
  return doc(db, CHAT_LIBRARIES_COLLECTION, uid);
}

export function watchLibrary(uid: string, onChange: (lib: ChatLibrary) => void): () => void {
  if (libraryUid !== uid) {
    libraryStop?.();
    libraryStop = null;
    libraryUid = uid;
    libraryValue = EMPTY_LIBRARY;
  }
  libraryListeners.add(onChange);
  onChange(libraryValue);

  libraryStop ??= onSnapshot(
    libraryRef(uid),
    (snap) => {
      const d = snap.data();
      libraryValue = {
        favorites: Array.isArray(d?.favorites) ? d.favorites : [],
        folders:   Array.isArray(d?.folders) ? d.folders : [],
      };
      libraryListeners.forEach((fn) => fn(libraryValue));
    },
    // A library that will not load is an empty one. The picker still works;
    // it just has nothing starred to show.
    () => {},
  );

  return () => {
    libraryListeners.delete(onChange);
    if (libraryListeners.size === 0) {
      libraryStop?.();
      libraryStop = null;
    }
  };
}

/** The signed-in person's library, live while the calling component is mounted. */
export function useChatLibrary(uid: string | null | undefined): ChatLibrary {
  const [lib, setLib] = useState<ChatLibrary>(EMPTY_LIBRARY);
  useEffect(() => (uid ? watchLibrary(uid, setLib) : undefined), [uid]);
  return lib;
}

/**
 * Stars or un-stars something. `arrayUnion` / `arrayRemove`, not a read and
 * a put back, so starring in two tabs at once does not lose one of them.
 */
export async function setFavorite(uid: string, item: string, on: boolean): Promise<void> {
  if (on && libraryValue.favorites.length >= MAX_LIBRARY_ITEMS) {
    throw new Error(`You can keep ${MAX_LIBRARY_ITEMS} favorites. Remove one first.`);
  }
  await setDoc(
    libraryRef(uid),
    { favorites: on ? arrayUnion(item) : arrayRemove(item), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Folders are rewritten whole. They are a list of objects, which arrayUnion
 * cannot edit in place, and the only person who can write them is the one
 * person they belong to — the worst a race can do is lose a click made in
 * another tab at the same instant.
 */
async function writeFolders(uid: string, change: (folders: LibraryFolder[]) => LibraryFolder[]) {
  const folders = change(libraryValue.folders.map((f) => ({ ...f, items: [...f.items] })));
  await setDoc(libraryRef(uid), { folders, updatedAt: serverTimestamp() }, { merge: true });
}

function cleanFolderName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME);
  if (!clean) throw new Error('Give the folder a name.');
  return clean;
}

export async function createFolder(uid: string, name: string, firstItem?: string): Promise<void> {
  const clean = cleanFolderName(name);
  if (libraryValue.folders.length >= MAX_FOLDERS) {
    throw new Error(`You can have ${MAX_FOLDERS} folders. Delete one first.`);
  }
  await writeFolders(uid, (folders) => [
    ...folders,
    { id: crypto.randomUUID(), name: clean, items: firstItem ? [firstItem] : [] },
  ]);
}

export async function renameFolder(uid: string, folderId: string, name: string): Promise<void> {
  const clean = cleanFolderName(name);
  await writeFolders(uid, (folders) =>
    folders.map((f) => (f.id === folderId ? { ...f, name: clean } : f)));
}

/** Deletes the folder only. Whatever was in it stays on the shelf. */
export async function deleteFolder(uid: string, folderId: string): Promise<void> {
  await writeFolders(uid, (folders) => folders.filter((f) => f.id !== folderId));
}

export async function setInFolder(
  uid: string,
  folderId: string,
  item: string,
  on: boolean,
): Promise<void> {
  const folder = libraryValue.folders.find((f) => f.id === folderId);
  if (on && folder && folder.items.length >= MAX_LIBRARY_ITEMS) {
    throw new Error(`A folder can hold ${MAX_LIBRARY_ITEMS} stickers.`);
  }
  await writeFolders(uid, (folders) =>
    folders.map((f) => {
      if (f.id !== folderId) return f;
      const rest = f.items.filter((i) => i !== item);
      // Newest first, the same order as favourites and the shelf.
      return { ...f, items: on ? [item, ...rest] : rest };
    }));
}

/* ------------------------------------------------------------------ recent */

/* Kept in the browser, like recent emoji — one person's habit on one machine. */
const RECENT_KEY = 'ttms.stickers.recent';
const MAX_RECENT = 16;

export function recentStickerIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberSticker(id: string): void {
  try {
    const next = [id, ...recentStickerIds().filter((x) => x !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not remembered; the sticker was still sent.
  }
}
