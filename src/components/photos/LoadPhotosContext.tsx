'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteLoadPhoto,
  listOrderPhotos,
  prepareLoadPhoto,
  setOrderCover,
  uploadLoadPhoto,
  fetchChatPicture,
  type PreparedPhoto,
} from '@/lib/loadPhotos';
import {
  commodityLineChoices,
  hasRoute,
  photoLocationChoices,
  type CommodityLineChoice,
  type LoadPhoto,
  type PhotoStage,
} from '@/types/loadPhoto';
import type { Order } from '@/types/order';
import { CHAT_PICTURE_EVENT, CHAT_PICTURE_KEY, type ChatPictureDetail } from '@/lib/chatPictureHandoff';

/*
 * Every way a picture gets onto a load from the order page goes through here
 * (2026-11-16): the Add pictures button, the header tile, dropping or pasting
 * anywhere on the page, the boxes on the Pictures tab, a freight line's own
 * button, and a picture handed over from the load's chat. Before this there
 * were two upload paths — the Pictures tab's tray and the freight line's
 * direct upload — and a fix to one did not reach the other.
 *
 * It lives at the page, not in the Pictures tab, for a second reason: the tab
 * is taken off the page when somebody switches to Details, and with it went
 * any picture chosen but not yet saved.
 *
 * The one rule carried over unchanged: **a picture is never saved without a
 * type somebody chose.** A preset counts as choosing — pressing "Add picture"
 * on a freight line, or dropping into the Truck box, is choosing — so those
 * save at once (`auto`). Everything else waits in the tray for a type.
 */

/** What the place a picture came in through already says about it. */
export interface PhotoPreset {
  stage?: PhotoStage;
  /** Proof only: the end of the trip it was taken at — see PICTURE_BOXES. */
  stop?: 'pickup' | 'delivery';
  /** A freight line's id ('' for the whole load) — commodity only. */
  commodityItemId?: string;
  /** The line's description, sent as the label like the old line button did. */
  commodity?: string;
  pickupAt?: string;
  deliverTo?: string;
}

/**
 * A picture that has been chosen but not saved. Shrunk and previewed in the
 * browser; nothing is sent until it has a type and is saved.
 */
export interface Draft {
  key: string;
  /**
   * The load it was chosen on. Uploads go here, never to whatever load is on
   * screen by the time the queue reaches it.
   */
  orderId: string;
  name: string;
  state: 'preparing' | 'ready' | 'uploading' | 'failed';
  prepared?: PreparedPhoto;
  /** Object URL of the thumbnail; revoked when the draft leaves. */
  preview?: string;
  progress: number;
  error?: string;
  /** '' until somebody picks one. */
  stage: PhotoStage | '';
  /** Commodity only — see hasRoute(). */
  pickupAt: string;
  deliverTo: string;
  commodityItemId: string;
  commodity: string;
  /** Proof from a stop box only; '' otherwise — nobody else is asked. */
  stop: '' | 'pickup' | 'delivery';
  location: string;
  caption: string;
  /** Save as soon as it is ready — everything it needs was given. */
  auto: boolean;
}

/** The little card in the corner: what just happened, and a way back. */
export type PhotoNotice =
  | { kind: 'saving'; done: number; of: number; progress: number }
  | { kind: 'saved'; ids: string[] }
  | { kind: 'undone'; n: number }
  | { kind: 'document'; n: number }
  | { kind: 'pasteHint' }
  | { kind: 'error'; text: string };

export interface LoadPhotosStore {
  order: Order | null;
  photos: LoadPhoto[];
  /** True once the list is known — read, or known empty without reading. */
  loaded: boolean;
  loadError: string;
  /** Pictures on the load, counting those added and removed on this visit. */
  count: number;
  coverId: string | null;
  lines: CommodityLineChoice[];
  pickupChoices: string[];
  deliveryChoices: string[];

  drafts: Draft[];
  trayOpen: boolean;
  setTrayOpen: (open: boolean) => void;
  notice: PhotoNotice | null;
  clearNotice: () => void;
  saving: boolean;

  addFiles: (files: File[], preset?: PhotoPreset) => void;
  choose: (preset?: PhotoPreset) => void;
  camera: (preset?: PhotoPreset) => void;
  pasteFromClipboard: (preset?: PhotoPreset) => Promise<void>;
  updateDraft: (key: string, patch: Partial<Draft>) => void;
  setDraftStage: (keys: string[] | 'all', stage: PhotoStage | '') => void;
  setDraftLine: (keys: string[] | 'all', lineId: string) => void;
  removeDraft: (key: string) => void;
  discardDrafts: () => void;
  saveDrafts: () => void;
  undoSaved: () => Promise<void>;

  /** After the lightbox saved a picture's tags. */
  replaced: (photo: LoadPhoto) => void;
  remove: (photo: LoadPhoto) => Promise<void>;
  setCover: (photo: LoadPhoto) => Promise<void>;

  /** The two hidden inputs, rendered once by PhotoAdderLayer. */
  pickRef: React.RefObject<HTMLInputElement | null>;
  cameraRef: React.RefObject<HTMLInputElement | null>;
  onPicked: (files: File[]) => void;
}

const Ctx = createContext<LoadPhotosStore | null>(null);
export const LoadPhotosProvider = Ctx.Provider;

export function useLoadPhotos(): LoadPhotosStore {
  const store = useContext(Ctx);
  if (!store) throw new Error('useLoadPhotos needs a LoadPhotosProvider');
  return store;
}

/** For pieces drawn both on the order page and elsewhere. */
export function useOptionalLoadPhotos(): LoadPhotosStore | null {
  return useContext(Ctx);
}

export function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name);
}

/** How long Undo is offered after a save. */
const UNDO_MS = 12_000;


/**
 * The page's picture store. Called by the order page — before its early
 * returns, so `order` may still be null — and handed to LoadPhotosProvider.
 *
 * `wantList` says whether anything on screen needs the list right now; it is
 * read once and then kept, so switching tabs never reads it again.
 */
export function useLoadPhotoStore(
  order: Order | null,
  opts: { wantList: boolean; onCoverChange: (coverId: string | null, thumbUrl: string | null) => void },
): LoadPhotosStore {
  const orderId = order?.id ?? '';
  const [photos, setPhotos]     = useState<LoadPhoto[]>([]);
  const photosRef = useRef<LoadPhoto[]>([]);
  photosRef.current = photos;
  const [loaded, setLoaded]     = useState(false);
  const [loadError, setLoadError] = useState('');
  // Added minus removed while the list was not read, so the count is right
  // without reading it.
  const [delta, setDelta]       = useState(0);
  // The load whose list is being read, so a slow answer for the previous
  // load neither lands here nor blocks reading this one.
  const loading = useRef<string | null>(null);

  const [drafts, setDrafts]     = useState<Draft[]>([]);
  const draftsRef = useRef<Draft[]>([]);
  draftsRef.current = drafts;
  const [trayOpen, setTrayOpen] = useState(false);
  const [notice, setNotice]     = useState<PhotoNotice | null>(null);
  const [saving, setSaving]     = useState(false);

  const pickRef   = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  // What the file picker was opened for, until it answers — and, separately,
  // what a "Paste picture" press was for, until the Ctrl+V it asked for. Kept
  // apart so a picker somebody cancelled cannot tag a later paste.
  const pickPreset  = useRef<{ preset?: PhotoPreset; until: number } | null>(null);
  const pastePreset = useRef<{ preset?: PhotoPreset; until: number } | null>(null);

  const orderRef = useRef(order);
  orderRef.current = order;
  const coverChange = useRef(opts.onCoverChange);
  coverChange.current = opts.onCoverChange;

  const lines           = useMemo(() => (order ? commodityLineChoices(order) : []), [order]);
  const pickupChoices   = useMemo(() => (order ? photoLocationChoices(order, ['pickup']) : []), [order]);
  const deliveryChoices = useMemo(() => (order ? photoLocationChoices(order, ['delivery']) : []), [order]);
  const choicesRef = useRef({ lines, pickupChoices, deliveryChoices });
  choicesRef.current = { lines, pickupChoices, deliveryChoices };

  // A load that had no pictures when it was opened has a known, empty list:
  // nothing to read, and anything added from here on is the whole list.
  const knownEmpty = !!order && !(Number(order.photoCount) > 0);
  useEffect(() => {
    if (!orderId || loaded || loading.current === orderId) return;
    if (knownEmpty) { setLoaded(true); return; }
    if (!opts.wantList) return;
    const asked = orderId;
    loading.current = asked;
    listOrderPhotos(orderId)
      .then(({ photos: list }) => {
        if (orderRef.current?.id !== asked) return;
        setPhotos(list); setDelta(0); setLoaded(true);
      })
      .catch((e) => { if (orderRef.current?.id === asked) setLoadError(e instanceof Error ? e.message : 'Could not load pictures'); })
      .finally(() => { if (loading.current === asked) loading.current = null; });
  }, [orderId, loaded, knownEmpty, opts.wantList]);

  /*
   * Another load opened in the same page (the order page stays mounted when
   * only its id changes): start again. Pictures waiting for this load are
   * dropped rather than carried — they were chosen for a different load —
   * and anything already uploading still goes to its own (Draft.orderId).
   */
  const [forId, setForId] = useState(orderId);
  if (forId !== orderId) {
    setForId(orderId);
    setPhotos([]);
    setLoaded(false);
    setLoadError('');
    setDelta(0);
    setNotice(null);
    setTrayOpen(false);
    for (const d of draftsRef.current) if (d.preview && d.state !== 'uploading') URL.revokeObjectURL(d.preview);
    draftsRef.current = draftsRef.current.filter((d) => d.state === 'uploading');
    setDrafts(draftsRef.current);
  }

  const count = loaded ? photos.length : Math.max(0, (Number(order?.photoCount) || 0) + delta);
  const coverId = order?.coverPhotoId ?? null;

  // Previews hold the image in memory until revoked.
  useEffect(() => () => {
    for (const d of draftsRef.current) if (d.preview) URL.revokeObjectURL(d.preview);
  }, []);

  // Pictures waiting to be saved are lost if the page closes.
  const unsaved = drafts.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // The Undo offer goes away by itself; nothing else does.
  useEffect(() => {
    if (notice?.kind !== 'saved' && notice?.kind !== 'undone' && notice?.kind !== 'pasteHint') return;
    const t = window.setTimeout(() => setNotice((n) => (n === notice ? null : n)), notice.kind === 'saved' ? UNDO_MS : 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const writeDrafts = useCallback((next: (list: Draft[]) => Draft[]) => {
    // Written to the ref as well as state, so the two loops below, which read
    // the ref, see a change before React has rendered.
    draftsRef.current = next(draftsRef.current);
    setDrafts(draftsRef.current);
  }, []);

  const updateDraft = useCallback((key: string, patch: Partial<Draft>) => {
    writeDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }, [writeDrafts]);

  /*
   * A new type, and the stops that go with it: each kept when it still fits
   * the type, filled in when the load has only one stop it could mean.
   * Only a commodity has a route, and only proof from a stop box has a stop.
   */
  const withStage = useCallback((d: Draft, stage: PhotoStage | ''): Draft => {
    const { pickupChoices: pc, deliveryChoices: dc } = choicesRef.current;
    const pick = (current: string, choices: string[]) =>
      choices.includes(current) ? current : choices.length === 1 ? choices[0] : '';
    if (hasRoute(stage)) {
      return { ...d, stage, stop: '', location: '', pickupAt: pick(d.pickupAt, pc), deliverTo: pick(d.deliverTo, dc) };
    }
    const keepStop = stage === 'proof' && d.stop !== '';
    return {
      ...d, stage, pickupAt: '', deliverTo: '', commodityItemId: '', commodity: '',
      stop: keepStop ? d.stop : '', location: keepStop ? d.location : '',
    };
  }, []);

  /**
   * Linking a picture to a freight line takes the line's own stops with it —
   * what the line says is where that piece goes. Unlinking leaves the stops
   * as they are, to change by hand.
   */
  const withLine = useCallback((d: Draft, id: string): Draft => {
    const line = choicesRef.current.lines.find((l) => l.id === id);
    return line
      ? { ...d, commodityItemId: id, pickupAt: line.pickupAt, deliverTo: line.deliverTo }
      : { ...d, commodityItemId: '' };
  }, []);

  const setDraftStage = useCallback((keys: string[] | 'all', stage: PhotoStage | '') => {
    writeDrafts((list) => list.map((d) =>
      (d.state !== 'uploading' && (keys === 'all' || keys.includes(d.key)) ? withStage(d, stage) : d)));
  }, [writeDrafts, withStage]);

  const setDraftLine = useCallback((keys: string[] | 'all', lineId: string) => {
    writeDrafts((list) => list.map((d) =>
      (d.state !== 'uploading' && (keys === 'all' || keys.includes(d.key)) ? withLine(d, lineId) : d)));
  }, [writeDrafts, withLine]);

  const removeDraft = useCallback((key: string) => {
    const d = draftsRef.current.find((x) => x.key === key);
    if (!d || d.state === 'uploading') return;
    if (d.preview) URL.revokeObjectURL(d.preview);
    writeDrafts((list) => list.filter((x) => x.key !== key));
  }, [writeDrafts]);

  /* ------------------------------------------------------------ saving */

  // One upload at a time, in the order they were saved, so the first
  // picture a load gets is the one that becomes its profile picture.
  const uploadQueue = useRef<string[]>([]);
  const uploading   = useRef(false);
  const batch       = useRef<{ ids: string[]; of: number }>({ ids: [], of: 0 });

  const runUploads = useCallback(async () => {
    if (uploading.current) return;
    uploading.current = true;
    setSaving(true);
    try {
      while (uploadQueue.current.length > 0) {
        const key = uploadQueue.current.shift()!;
        const d = draftsRef.current.find((x) => x.key === key);
        if (!d || !d.prepared || !d.stage) continue;
        const here = () => orderRef.current?.id === d.orderId;
        const done = batch.current.ids.length;
        setNotice({ kind: 'saving', done, of: batch.current.of, progress: 0 });
        updateDraft(key, { state: 'uploading', progress: 0, error: undefined });
        try {
          const { photo, coverPhotoId } = await uploadLoadPhoto(
            d.orderId, d.prepared,
            {
              caption: d.caption, stage: d.stage, commodity: d.commodity,
              location: d.location, pickupAt: d.pickupAt, deliverTo: d.deliverTo,
              // A load from before freight lines has one made-up line,
              // 'legacy', which is not a real id to link to.
              commodityItemId: d.commodityItemId === 'legacy' ? '' : d.commodityItemId,
            },
            (progress) => {
              updateDraft(key, { progress });
              setNotice({ kind: 'saving', done, of: batch.current.of, progress });
            },
          );
          // Saved to a load that is no longer on screen: it is there, and
          // this page has nothing of it to show or undo.
          if (here()) {
            batch.current.ids.push(photo.id);
            setPhotos((list) => [...list, photo]);
            setDelta((n) => n + 1);
            if (coverPhotoId === photo.id) coverChange.current(coverPhotoId, photo.thumbUrl);
          }
          if (d.preview) URL.revokeObjectURL(d.preview);
          writeDrafts((list) => list.filter((x) => x.key !== key));
        } catch (e) {
          // Back to the tray, tags and all, so Save tries it again.
          updateDraft(key, { state: 'ready', progress: 0, auto: false, error: e instanceof Error ? e.message : 'Upload failed' });
          setTrayOpen(true);
        }
      }
    } finally {
      uploading.current = false;
      setSaving(false);
      const ids = batch.current.ids;
      batch.current = { ids: [], of: 0 };
      setNotice(ids.length ? { kind: 'saved', ids } : null);
    }
  }, [updateDraft, writeDrafts]);

  const queue = useCallback((keys: string[]) => {
    const fresh = keys.filter((k) => !uploadQueue.current.includes(k));
    if (fresh.length === 0) return;
    uploadQueue.current.push(...fresh);
    batch.current.of += fresh.length;
    void runUploads();
  }, [runUploads]);

  const saveDrafts = useCallback(() => {
    const ready = draftsRef.current.filter((d) => d.prepared && d.state === 'ready');
    const untyped = ready.filter((d) => !d.stage);
    if (untyped.length) {
      for (const d of untyped) updateDraft(d.key, { error: 'Choose a type for this picture.' });
      return;
    }
    queue(ready.map((d) => d.key));
  }, [queue, updateDraft]);

  /* --------------------------------------------------------- preparing */

  // Shrunk one at a time: each is decoded to full size in memory first, and a
  // phone handed twenty of those at once runs out.
  const toPrepare = useRef<{ key: string; file: File }[]>([]);
  const preparing = useRef(false);

  const runPrepare = useCallback(async () => {
    if (preparing.current) return;
    preparing.current = true;
    try {
      while (toPrepare.current.length > 0) {
        const { key, file } = toPrepare.current.shift()!;
        if (!draftsRef.current.some((d) => d.key === key)) continue;
        try {
          const prepared = await prepareLoadPhoto(file);
          const preview  = URL.createObjectURL(prepared.thumb);
          const d = draftsRef.current.find((x) => x.key === key);
          if (!d) { URL.revokeObjectURL(preview); continue; }
          updateDraft(key, { state: 'ready', prepared, preview });
          if (d.auto) queue([key]);
        } catch (e) {
          updateDraft(key, { state: 'failed', auto: false, error: e instanceof Error ? e.message : 'Could not open that picture' });
          setTrayOpen(true);
        }
      }
    } finally {
      preparing.current = false;
    }
  }, [queue, updateDraft]);

  const addFiles = useCallback((files: File[], preset?: PhotoPreset) => {
    const images = files.filter(isImageFile);
    const others = files.length - images.length;
    if (others > 0) setNotice({ kind: 'document', n: others });
    if (images.length === 0) return;

    const { lines: ls, pickupChoices: pc, deliveryChoices: dc } = choicesRef.current;
    const stage = preset?.stage ?? '';
    const stop  = stage === 'proof' && preset?.stop ? preset.stop : '';
    const stopChoices = stop === 'pickup' ? pc : stop === 'delivery' ? dc : [];
    const lineId = preset?.commodityItemId ?? '';
    /*
     * Saved at once only when there is nothing left to ask: a type, plus —
     * for a commodity on a load with several lines — which line, and for
     * proof at a stop on a load with several of that stop — which one.
     */
    const auto = stage !== ''
      && (stage !== 'commodity' || ls.length === 0 || preset?.commodityItemId !== undefined)
      && (stop === '' || stopChoices.length <= 1);

    const forOrder = orderRef.current?.id;
    if (!forOrder) return;
    const stamp = Date.now();
    const fresh: Draft[] = images.map((f, i) => {
      let d: Draft = {
        key: `${stamp}-${i}-${f.name}`, orderId: forOrder, name: f.name || 'Pasted picture', state: 'preparing', progress: 0,
        stage: '', pickupAt: '', deliverTo: '', commodityItemId: '', commodity: '',
        stop: '', location: '', caption: '', auto,
      };
      if (stage) d = withStage(d, stage);
      if (stop) d = { ...d, stop, location: stopChoices[0] ?? '' };
      if (stage === 'commodity') {
        if (lineId && lineId !== 'legacy') d = withLine(d, lineId);
        d = {
          ...d,
          commodity: preset?.commodity ?? '',
          pickupAt:  preset?.pickupAt  ?? d.pickupAt,
          deliverTo: preset?.deliverTo ?? d.deliverTo,
          commodityItemId: lineId || d.commodityItemId,
        };
      }
      return d;
    });
    writeDrafts((list) => [...list, ...fresh]);
    if (!auto) setTrayOpen(true);
    toPrepare.current.push(...images.map((file, i) => ({ key: fresh[i].key, file })));
    void runPrepare();
  }, [runPrepare, withLine, withStage, writeDrafts]);

  const discardDrafts = useCallback(() => {
    const keep = draftsRef.current.filter((d) => d.state === 'uploading');
    for (const d of draftsRef.current) if (d.state !== 'uploading' && d.preview) URL.revokeObjectURL(d.preview);
    toPrepare.current = [];
    writeDrafts(() => keep);
    if (keep.length === 0) setTrayOpen(false);
  }, [writeDrafts]);

  /* ----------------------------------------------------- the ways in */

  const choose = useCallback((preset?: PhotoPreset) => {
    pickPreset.current = { preset, until: Date.now() + 10 * 60_000 };
    pickRef.current?.click();
  }, []);

  const camera = useCallback((preset?: PhotoPreset) => {
    pickPreset.current = { preset, until: Date.now() + 10 * 60_000 };
    cameraRef.current?.click();
  }, []);

  const onPicked = useCallback((files: File[]) => {
    const p = pickPreset.current;
    pickPreset.current = null;
    addFiles(files, p && p.until > Date.now() ? p.preset : undefined);
  }, [addFiles]);

  /**
   * "Paste picture" from a menu. Reads the clipboard where the browser lets a
   * button do that (it asks the first time); where it does not, says to press
   * Ctrl+V, and the paste listener picks it up with the same preset.
   */
  const pasteFromClipboard = useCallback(async (preset?: PhotoPreset) => {
    pastePreset.current = { preset, until: Date.now() + 60_000 };
    try {
      if (!navigator.clipboard?.read) throw new Error('no clipboard');
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `Pasted picture.${type.split('/')[1] || 'png'}`, { type }));
      }
      if (files.length === 0) throw new Error('no picture');
      pastePreset.current = null;
      addFiles(files, preset);
    } catch {
      setNotice({ kind: 'pasteHint' });
    }
  }, [addFiles]);

  // Ctrl+V anywhere on the order page — except into a box being typed in,
  // or something that already took the paste (the chat composer).
  useEffect(() => {
    if (!orderId) return;
    function onPaste(e: ClipboardEvent) {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'))) return;
      const files = [...(e.clipboardData?.files ?? [])].filter(isImageFile);
      if (files.length === 0) return;
      e.preventDefault();
      const p = pastePreset.current;
      pastePreset.current = null;
      addFiles(files, p && p.until > Date.now() ? p.preset : undefined);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [orderId, addFiles]);

  /* -------------------------------------------- a picture from the chat */

  const fromChat = useCallback(async (path: string, name: string) => {
    if (!orderId) return;
    try {
      const file = await fetchChatPicture(orderId, path, name);
      addFiles([file]);
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'That picture could not be brought over' });
    }
  }, [orderId, addFiles]);

  useEffect(() => {
    if (!orderId) return;
    function onEvent(e: Event) {
      const detail = (e as CustomEvent<ChatPictureDetail>).detail;
      if (!detail || detail.orderId !== orderId) return;
      detail.handled = true;
      void fromChat(detail.path, detail.name);
    }
    window.addEventListener(CHAT_PICTURE_EVENT, onEvent);
    // Handed over from a chat opened on another page, which then came here.
    try {
      const raw = sessionStorage.getItem(CHAT_PICTURE_KEY);
      const pending = raw ? JSON.parse(raw) as ChatPictureDetail : null;
      if (pending?.orderId === orderId) {
        sessionStorage.removeItem(CHAT_PICTURE_KEY);
        void fromChat(pending.path, pending.name);
      }
    } catch { /* storage blocked: the person can press the button again */ }
    return () => window.removeEventListener(CHAT_PICTURE_EVENT, onEvent);
  }, [orderId, fromChat]);

  /* ------------------------------------------------ after the fact */

  const replaced = useCallback((photo: LoadPhoto) => {
    setPhotos((list) => list.map((x) => (x.id === photo.id ? photo : x)));
  }, []);

  const removeOne = useCallback(async (photoId: string) => {
    const o = orderRef.current;
    if (!o) return;
    const nextCover = await deleteLoadPhoto(o.id, photoId);
    const rest = photosRef.current.filter((x) => x.id !== photoId);
    photosRef.current = rest;
    setPhotos(rest);
    setDelta((n) => n - 1);
    if (nextCover !== o.coverPhotoId) {
      coverChange.current(nextCover, nextCover ? (rest.find((x) => x.id === nextCover)?.thumbUrl ?? null) : null);
    }
  }, []);

  const remove = useCallback((photo: LoadPhoto) => removeOne(photo.id), [removeOne]);

  const undoSaved = useCallback(async () => {
    if (notice?.kind !== 'saved') return;
    const ids = notice.ids;
    setNotice(null);
    let n = 0;
    try {
      // Newest first, so the profile picture falls back the way it would
      // have had they never been added.
      for (const id of [...ids].reverse()) { await removeOne(id); n += 1; }
      setNotice({ kind: 'undone', n });
    } catch (e) {
      setNotice({ kind: 'error', text: `${n} of ${ids.length} removed. ${e instanceof Error ? e.message : ''}`.trim() });
    }
  }, [notice, removeOne]);

  const setCover = useCallback(async (photo: LoadPhoto) => {
    const o = orderRef.current;
    if (!o) return;
    const id = await setOrderCover(o.id, photo.id);
    coverChange.current(id, id === photo.id ? photo.thumbUrl : null);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  return {
    order, photos, loaded, loadError, count, coverId, lines, pickupChoices, deliveryChoices,
    drafts, trayOpen, setTrayOpen, notice, clearNotice, saving,
    addFiles, choose, camera, pasteFromClipboard, updateDraft, setDraftStage, setDraftLine,
    removeDraft, discardDrafts, saveDrafts, undoSaved,
    replaced, remove, setCover,
    pickRef, cameraRef, onPicked,
  };
}
