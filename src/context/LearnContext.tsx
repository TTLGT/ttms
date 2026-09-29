'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getMyWords, saveWordActivity } from '@/lib/vocabulary';
import { saveToAccount } from '@/lib/preferences';
import type { WordRecord } from '@/types/vocabulary';

/**
 * Learn English: whether it is on, and the signed-in person's word list.
 *
 * **On or off follows the account, like the colour theme** — see
 * src/types/userPreferences.ts. This browser's copy is what is read;
 * PreferenceSync puts the account's back when the browser has lost it. It is
 * off until somebody turns it on, so nobody finds the app changed under them.
 *
 * **The word list is per person**, in `vocabulary/{uid}` through
 * /api/me/words, because it is the thing worth keeping: which words they have
 * looked up and which they now know. It follows them to another machine.
 *
 * Lookups are batched. Opening a card adds to a pending tally, and the tally
 * is sent every SAVE_EVERY_MS and when the tab is hidden — one write for a
 * burst of reading rather than one per word. The same word is counted at most
 * once a minute, so hovering back and forth over it is still one lookup.
 */

const STORAGE_KEY = 'ttms.learnEnglish';
// Announces a change made from outside the switch (PreferenceSync) to this
// tab, which gets no `storage` event of its own.
const LOCAL_EVENT = 'ttms-learn';
const SAVE_EVERY_MS = 15_000;
const RECOUNT_AFTER_MS = 60_000;

interface LearnValue {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** Null until loaded. Loaded when the mode is on, or when the words page asks. */
  words: Record<string, WordRecord> | null;
  wordsError: string | null;
  loadWords: () => void;
  recordLookup: (termId: string) => void;
  setKnown: (termId: string, known: boolean) => void;
}

const LearnContext = createContext<LearnValue | null>(null);

/** What this browser holds, or null when it holds nothing. */
export function storedLearnEnglish(): boolean | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'on' ? true : stored === 'off' ? false : null;
  } catch {
    return null;
  }
}

/** Remember the switch in this browser without saving it to the account. */
export function storeLearnEnglish(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered here; the event below still switches this page.
  }
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: on }));
}

function readEnabled(): boolean {
  return storedLearnEnglish() ?? false;
}

export function LearnProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [words, setWords] = useState<Record<string, WordRecord> | null>(null);
  const [wordsError, setWordsError] = useState<string | null>(null);

  const pending = useRef<Record<string, number>>({});
  const lastCounted = useRef(new Map<string, number>());
  const loading = useRef(false);

  useEffect(() => {
    setEnabledState(readEnabled());
    // Another tab switching it — the same reason the theme listens.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabledState(readEnabled());
    };
    // Read off the event rather than storage, so it still switches in a
    // private window that refused the write.
    const onLocal = (e: Event) => setEnabledState((e as CustomEvent<boolean>).detail);
    window.addEventListener('storage', onStorage);
    window.addEventListener(LOCAL_EVENT, onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LOCAL_EVENT, onLocal);
    };
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    storeLearnEnglish(on);
    setEnabledState(on);
    saveToAccount({ learnEnglish: on });
  }, []);

  const loadWords = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    setWordsError(null);
    getMyWords()
      .then((loaded) => {
        // Lookups made before the list arrived are already in `words` as
        // optimistic counts; the server has not seen them yet, so add them on.
        setWords((current) => {
          const merged = { ...loaded };
          for (const [id, n] of Object.entries(pending.current)) {
            const base = merged[id] ?? { count: 0, lastAt: null, known: false };
            merged[id] = { ...base, count: base.count + n, lastAt: current?.[id]?.lastAt ?? base.lastAt };
          }
          return merged;
        });
      })
      .catch((e: unknown) => setWordsError(e instanceof Error ? e.message : 'Could not load your words.'))
      .finally(() => { loading.current = false; });
  }, []);

  // The underliner needs the known words to leave them alone, so the list is
  // fetched as soon as the mode is on — one read, once per page load.
  useEffect(() => {
    if (enabled && words === null) loadWords();
  }, [enabled, words, loadWords]);

  const flush = useCallback((keepalive: boolean) => {
    const lookups = pending.current;
    if (Object.keys(lookups).length === 0) return;
    pending.current = {};
    saveWordActivity({ lookups }, keepalive).catch(() => {
      // Put them back for the next try. Lost only if the tab is closing,
      // which is the one case keepalive exists to cover.
      for (const [id, n] of Object.entries(lookups)) {
        pending.current[id] = (pending.current[id] ?? 0) + n;
      }
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => flush(false), SAVE_EVERY_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      flush(true);
    };
  }, [flush]);

  const recordLookup = useCallback((termId: string) => {
    const now = Date.now();
    const last = lastCounted.current.get(termId);
    if (last !== undefined && now - last < RECOUNT_AFTER_MS) return;
    lastCounted.current.set(termId, now);

    pending.current[termId] = (pending.current[termId] ?? 0) + 1;
    setWords((current) => {
      if (!current) return current;
      const base = current[termId] ?? { count: 0, lastAt: null, known: false };
      return { ...current, [termId]: { ...base, count: base.count + 1, lastAt: new Date(now).toISOString() } };
    });
  }, []);

  const setKnown = useCallback((termId: string, known: boolean) => {
    setWords((current) => {
      const base = current?.[termId] ?? { count: 0, lastAt: null, known: false };
      return { ...(current ?? {}), [termId]: { ...base, known } };
    });
    // Sent straight away rather than batched: it changes what is underlined,
    // and somebody who marks a word known and reloads should find it gone.
    saveWordActivity({ known: { [termId]: known } }).catch(() => {
      setWords((current) => {
        const base = current?.[termId];
        return base ? { ...current, [termId]: { ...base, known: !known } } : current;
      });
      setWordsError('Could not save that change. Try again in a moment.');
    });
  }, []);

  const value = useMemo<LearnValue>(
    () => ({ enabled, setEnabled, words, wordsError, loadWords, recordLookup, setKnown }),
    [enabled, setEnabled, words, wordsError, loadWords, recordLookup, setKnown],
  );

  return <LearnContext.Provider value={value}>{children}</LearnContext.Provider>;
}

export function useLearn(): LearnValue {
  const value = useContext(LearnContext);
  if (!value) throw new Error('useLearn must be used inside LearnProvider');
  return value;
}
