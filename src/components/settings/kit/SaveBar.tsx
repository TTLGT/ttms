'use client';

import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, Undo2 } from 'lucide-react';
import { Bi } from '@/components/spanish/Es';

/**
 * One way to save, on every Settings page.
 *
 * Settings used to save three ways: some panels the moment a radio button
 * moved, some with their own Save button, some with Save and Discard. Nobody
 * could tell from looking whether a change had gone through, and leaving a
 * page with something half-typed lost it without a word.
 *
 * Now a panel holds what is being changed as a draft and registers it here
 * with `useSaveBarEntry()`. While any draft on the page differs from what is
 * saved, a bar sits at the foot of the page: "You have unsaved changes ·
 * Discard · Save". Saving runs every dirty panel's own save, in order. Once
 * saved, a note offers Undo for ten seconds, which saves the old values back
 * through the same routes — so an undo is a change like any other and lands in
 * the change log too.
 *
 * Leaving with unsaved changes asks first: a link inside TTMS opens TTMS's own
 * dialog, closing the tab or reloading gets the browser's.
 *
 * **Outside Settings there is no provider**, and `useSaveBarEntry()` reports
 * `active: false` — the Attendance page draws the same panels with their own
 * buttons. A panel must keep working both ways.
 *
 * What does not go through the bar, on purpose: actions that are not a
 * setting changing value — adding a site, inviting a person, putting somebody
 * back, uploading a photo. Each of those is one deliberate press of a button
 * that names what it does, and staging them would only add a second press.
 */

/** Puts back what a save changed. Returned by a panel's `save`, when it can. */
export type UndoFn = () => Promise<void>;

export interface SaveBarEntry {
  /** The draft differs from what is saved. */
  dirty: boolean;
  /** Why it cannot be saved as it stands — shown in the bar, and Save is off. */
  problem?: string;
  /** Saves the draft. Throws to report a failure; returns an undo when it can. */
  save: () => Promise<UndoFn | void>;
  /** Throws the draft away, back to what is saved. */
  discard: () => void;
}

interface Registered {
  dirty: boolean;
  problem: string;
  ref: { current: SaveBarEntry };
}

/**
 * Registering, kept in a context of its own whose value never changes. If it
 * shared one with the bar's state, every keystroke that changed `dirty` would
 * hand each panel a new context value, each panel would unregister and
 * register again, and that would change the state again — a loop.
 */
interface Registry {
  set: (id: string, r: Registered) => void;
  remove: (id: string) => void;
}

const RegistryContext = createContext<Registry | null>(null);

interface SaveBarApi {
  /** Goes up after every save or undo, so a page can re-read "Last changed". */
  version: number;
  // What the bar itself draws — read by SaveBarOutlet, which the layout puts
  // inside the page column while this provider wraps the whole of Settings.
  anyDirty: boolean;
  problem: string;
  error: string;
  saving: boolean;
  saveAll: () => Promise<boolean>;
  discardAll: () => void;
}

const SaveBarContext = createContext<SaveBarApi | null>(null);

/**
 * Register a panel's draft with the page's Save bar.
 *
 * `active` is false outside Settings: the panel then draws its own Save button
 * instead, as it always did.
 */
export function useSaveBarEntry(entry: SaveBarEntry): { active: boolean } {
  const api = useContext(RegistryContext);
  const id = useId();
  const ref = useRef(entry);
  ref.current = entry;

  const { dirty } = entry;
  const problem = entry.problem ?? '';
  useEffect(() => {
    api?.set(id, { dirty, problem, ref });
  }, [api, id, dirty, problem]);
  useEffect(() => () => api?.remove(id), [api, id]);

  return { active: api !== null };
}

/** Bumped after each save, for anything on the page that should re-read. */
export function useSaveVersion(): number {
  return useContext(SaveBarContext)?.version ?? 0;
}

type Toast = { kind: 'saved' | 'undone' | 'error'; text: string; undo?: UndoFn[] } | null;

export function SaveBarProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [entries, setEntries] = useState<Record<string, Registered>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast>(null);
  const [version, setVersion] = useState(0);
  const [leaving, setLeaving] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback((id: string, r: Registered) => {
    setEntries((prev) => {
      const old = prev[id];
      if (old && old.dirty === r.dirty && old.problem === r.problem && old.ref === r.ref) return prev;
      return { ...prev, [id]: r };
    });
  }, []);
  const remove = useCallback((id: string) => {
    setEntries((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const dirty = Object.values(entries).filter((e) => e.dirty);
  const anyDirty = dirty.length > 0;
  const problem = dirty.find((e) => e.problem)?.problem ?? '';

  // A failed save's message belongs to that attempt; editing again clears it.
  useEffect(() => { if (!anyDirty) setError(''); }, [anyDirty]);

  function showToast(t: Toast) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    // Ten seconds for Undo: long enough to read the page and notice, short
    // enough that nobody undoes somebody else's later change by accident.
    toastTimer.current = setTimeout(() => setToast(null), t?.undo?.length ? 10_000 : 4_000);
  }

  const saveAll = useCallback(async (): Promise<boolean> => {
    if (saving || problem) return false;
    const list = Object.values(entries).filter((e) => e.dirty);
    if (list.length === 0) return true;
    setSaving(true);
    setError('');
    const undos: UndoFn[] = [];
    try {
      // One after another, not in parallel: two panels on one page can write
      // the same document (General's three settings all do), and parallel
      // writes would race for no gain.
      for (const e of list) {
        const undo = await e.ref.current.save();
        if (undo) undos.push(undo);
      }
      setVersion((v) => v + 1);
      showToast({ kind: 'saved', text: 'Saved', undo: undos });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      if (undos.length) setVersion((v) => v + 1);
      return false;
    } finally {
      setSaving(false);
    }
  }, [entries, saving, problem]);

  const discardAll = useCallback(() => {
    for (const e of Object.values(entries)) if (e.dirty) e.ref.current.discard();
    setError('');
  }, [entries]);

  async function undo(fns: UndoFn[]) {
    setToast(null);
    try {
      for (const fn of [...fns].reverse()) await fn();
      setVersion((v) => v + 1);
      showToast({ kind: 'undone', text: 'Put back as it was' });
    } catch (e) {
      showToast({ kind: 'error', text: e instanceof Error ? e.message : 'Could not undo' });
    }
  }

  // Ctrl+S / ⌘S saves, as in every editor people already use.
  useEffect(() => {
    if (!anyDirty) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyDirty, saveAll]);

  // Closing the tab or reloading: the browser's own question, the only one a
  // page is allowed to ask at that point.
  useEffect(() => {
    if (!anyDirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [anyDirty]);

  // A link inside TTMS — the side menu, the sidebar, a "see history" link.
  // Caught on the way down, before Next's own Link handler sees the click.
  useEffect(() => {
    if (!anyDirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // A jump within the same page (an anchor) loses nothing.
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [anyDirty]);

  // A new page starts with a clean slate of messages.
  useEffect(() => { setError(''); }, [pathname]);

  const registry = useMemo<Registry>(() => ({ set, remove }), [set, remove]);
  const api = useMemo<SaveBarApi>(
    () => ({ version, anyDirty, problem, error, saving, saveAll, discardAll }),
    [version, anyDirty, problem, error, saving, saveAll, discardAll],
  );

  return (
    <RegistryContext.Provider value={registry}>
    <SaveBarContext.Provider value={api}>
      {children}

      {toast && typeof document !== 'undefined' && createPortal(
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg settings-toast ${
            toast.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-800'
          }`}
        >
          {toast.kind === 'error' ? <AlertTriangle size={15} /> : <Check size={15} className="settings-check" />}
          <span data-es>{toast.text}</span>
          {toast.undo && toast.undo.length > 0 && (
            <button
              type="button"
              data-es
              onClick={() => void undo(toast.undo!)}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-green-800 underline-offset-2 hover:underline"
            >
              <Undo2 size={13} /> Undo
            </button>
          )}
        </div>,
        document.body,
      )}

      {leaving && typeof document !== 'undefined' && createPortal(
        <LeaveDialog
          saving={saving}
          canSave={!problem}
          onStay={() => setLeaving(null)}
          onLeave={() => {
            const to = leaving;
            discardAll();
            setLeaving(null);
            router.push(to);
          }}
          onSaveAndLeave={async () => {
            const to = leaving;
            if (await saveAll()) {
              setLeaving(null);
              router.push(to);
            } else {
              setLeaving(null);
            }
          }}
        />,
        document.body,
      )}
    </SaveBarContext.Provider>
    </RegistryContext.Provider>
  );
}


/**
 * Where the bar is drawn: at the foot of the page column. Draws nothing until
 * something on the page is unsaved.
 */
export function SaveBarOutlet() {
  const api = useContext(SaveBarContext);
  if (!api || !api.anyDirty) return null;
  const { error, problem, saving, saveAll, discardAll } = api;
  return (
        /* Sticky to the foot of the scrolling page, so it is in view however
           long the page is, and part of the page's own column so it never
           covers the side menu. */
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-0 z-20 mt-6 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-brand-700 bg-brand-900 px-4 py-3 text-white shadow-[0_-8px_24px_-12px_rgba(15,31,74,0.45)] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        >
          <div className="min-w-0 flex-1 text-sm">
            {error ? (
              <span className="flex items-start gap-2 text-red-200">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </span>
            ) : problem ? (
              <span className="flex items-start gap-2 text-amber-200">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{problem}</span>
              </span>
            ) : (
              <span className="font-medium"><Bi>You have unsaved changes</Bi></span>
            )}
          </div>
          <span className="hidden text-xs text-brand-300 md:inline">Ctrl + S</span>
          <button
            type="button"
            data-es
            onClick={discardAll}
            disabled={saving}
            className="rounded-lg border border-white/30 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            data-es
            onClick={() => void saveAll()}
            disabled={saving || Boolean(problem)}
            // brand-500 rather than white: `bg-white` turns dark in dark mode,
            // and the bar itself stays dark in both.
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
  );
}

function LeaveDialog({
  saving, canSave, onStay, onLeave, onSaveAndLeave,
}: {
  saving: boolean;
  canSave: boolean;
  onStay: () => void;
  onLeave: () => void;
  onSaveAndLeave: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onStay(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStay]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={onStay}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="leave-title" className="text-lg font-semibold text-gray-900"><Bi>Leave without saving?</Bi></h2>
        <p className="mt-2 text-sm text-gray-600">
          <Bi>You changed something on this page and have not saved it. If you leave now, the change is lost.</Bi>
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={stayRef} type="button" data-es onClick={onStay}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Stay here
          </button>
          <button type="button" data-es onClick={onLeave}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            Leave without saving
          </button>
          {canSave && (
            <button type="button" data-es onClick={onSaveAndLeave} disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save and leave'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
