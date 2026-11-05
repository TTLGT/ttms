'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { saveToAccount } from '@/lib/preferences';

/**
 * The Spanish switch: English stays the language of the app, and somebody who
 * turns this on gets the Spanish **as well** — a line under headings and
 * paragraphs (<Es> / <Bi>), and a bubble on hover for buttons, tabs, column
 * headings and badges (`data-es`, drawn by SpanishTips). Nothing is replaced.
 * That was the ask, and it keeps the screen the same for everybody working
 * side by side, which matters when one person talks another through it.
 *
 * **The Spanish is written by hand, into src/lib/i18n/es.ts, keyed by the
 * English it translates.** Never a translation service: those send whatever
 * is on screen to a third party and get freight words wrong — the same
 * argument as the Learn English glossary. Only the app's own words are
 * translated; what people typed (names, notes, chat) is never touched.
 *
 * Keyed by the English rather than by made-up ids so a component reads
 * exactly as it did — `<Bi>Recent Orders</Bi>` — and so a string nobody has
 * translated yet simply shows no Spanish, rather than an id or an error. The
 * cost of that choice: **rewording an English string drops its Spanish** until
 * the dictionary entry is reworded too. Quiet, but harmless.
 *
 * **The dictionary is downloaded only by people who have the switch on.** It
 * is a dynamic import, so it is its own file that an English-only browser
 * never asks for.
 *
 * On or off follows the account, like the theme and Learn English — see
 * src/types/userPreferences.ts and PreferenceSync.
 */

const STORAGE_KEY = 'ttms.spanish';
// A change made from outside the switch (PreferenceSync), announced to this
// tab, which gets no `storage` event of its own.
const LOCAL_EVENT = 'ttms-spanish';

type Dictionary = Record<string, string>;

interface SpanishValue {
  on: boolean;
  setOn: (on: boolean) => void;
  /**
   * The Spanish for an English string, or null — when the switch is off, the
   * dictionary has not arrived yet, or nobody has translated it. `vars` fill
   * `{name}`-style holes in both the key and the Spanish.
   */
  es: (english: string, vars?: Record<string, string | number>) => string | null;
}

/** Outside the provider (the login page) it is simply off. */
const OFF: SpanishValue = { on: false, setOn: () => {}, es: () => null };

const SpanishContext = createContext<SpanishValue>(OFF);

/** What this browser holds, or null when it holds nothing. */
export function storedSpanish(): boolean | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'on' ? true : stored === 'off' ? false : null;
  } catch {
    return null;
  }
}

/** Remember the switch in this browser without saving it to the account. */
export function storeSpanish(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered here; the event below still switches this page.
  }
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: on }));
}

/**
 * How a string is looked up. Spacing is collapsed, and the arrows and
 * ellipses that decorate links and buttons ("View all →", "Saving…") are
 * dropped, so the dictionary holds each phrase once however it is dressed.
 */
export function spanishKey(english: string): string {
  return english
    .replace(/\s+/g, ' ')
    .replace(/^[\s→←↗…·•]+|[\s→←↗…·•.]+$/g, '')
    .trim();
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole);
}

export function SpanishProvider({ children }: { children: React.ReactNode }) {
  const [on, setOnState] = useState(false);
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);

  useEffect(() => {
    setOnState(storedSpanish() ?? false);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setOnState(storedSpanish() ?? false);
    };
    const onLocal = (e: Event) => setOnState((e as CustomEvent<boolean>).detail);
    window.addEventListener('storage', onStorage);
    window.addEventListener(LOCAL_EVENT, onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LOCAL_EVENT, onLocal);
    };
  }, []);

  // Fetched the first time the switch is on, and kept — turning it off and
  // on again does not download it twice.
  useEffect(() => {
    if (!on || dictionary) return;
    let live = true;
    import('@/lib/i18n/es')
      .then((m) => { if (live) setDictionary(m.ES); })
      .catch(() => { /* no Spanish this page load; the English is all there */ });
    return () => { live = false; };
  }, [on, dictionary]);

  const setOn = useCallback((next: boolean) => {
    storeSpanish(next);
    setOnState(next);
    saveToAccount({ spanish: next });
  }, []);

  // The same entries keyed in lower case, for text whose capitals come from
  // somewhere else — a stored status shown as "pending", a heading drawn in
  // CSS `uppercase` that the browser still reports as typed. Exact case is
  // tried first, so "Order" and "order" can still differ when they need to.
  const lower = useMemo(() => {
    if (!dictionary) return null;
    const map: Dictionary = {};
    for (const [k, v] of Object.entries(dictionary)) {
      const key = k.toLowerCase();
      if (!(key in map)) map[key] = v;
    }
    return map;
  }, [dictionary]);

  const es = useCallback((english: string, vars?: Record<string, string | number>) => {
    if (!on || !dictionary) return null;
    const key = spanishKey(english);
    if (!key) return null;
    const found = dictionary[key] ?? lower?.[key.toLowerCase()];
    return found ? fill(found, vars) : null;
  }, [on, dictionary, lower]);

  const value = useMemo<SpanishValue>(() => ({ on, setOn, es }), [on, setOn, es]);

  return <SpanishContext.Provider value={value}>{children}</SpanishContext.Provider>;
}

export function useSpanish(): SpanishValue {
  return useContext(SpanishContext);
}
