'use client';

import { useCallback, useEffect, useState } from 'react';
import { DARK_QUERY, THEME_STORAGE_KEY as STORAGE_KEY } from './themeBoot';
import { THEME_CHOICES, type ThemeChoice } from '@/types/userPreferences';
import { saveToAccount } from './preferences';

export { THEME_CHOICES, type ThemeChoice };

// A same-tab change fires no `storage` event, and PreferenceSync changes the
// theme from outside the switch — so it is announced to this tab by hand.
const LOCAL_EVENT = 'ttms-theme';

/*
 * Light, dim or dark, remembered on the account and in the browser.
 *
 * It was per browser alone once, and people found it forgotten the next
 * morning; it now follows the person — see src/types/userPreferences.ts. The
 * browser copy stays, because the boot script in <head> reads it before
 * anybody is signed in, and it is the only thing that can paint the first
 * frame the right colour. PreferenceSync refills it from the account on a
 * browser that lost it.
 *
 * The default is light, not "follow the system". A company switching over
 * should find nothing changed until somebody asks for it; and the public
 * signing page, which carriers open on their own machines, stays exactly as
 * it was for anybody who has never picked.
 *
 * How the colours actually change is in tailwind.config.ts: the `dark` class
 * on <html> swaps what `bg-white`, `text-gray-700` and friends resolve to, so
 * no screen needs `dark:` classes of its own.
 */

/*
 * Dim is dark mode with lighter grounds, for people who found dark too heavy.
 * On <html> it is `dark` *plus* `dim`, never `dim` alone: the inks, the
 * browser's own controls and every `html.dark` rule are shared, and only the
 * grounds move — see tailwind.config.ts. "Match this computer" picks dark,
 * not dim, because the operating system only knows two answers.
 */
/** What this browser holds, or null when it holds nothing it recognises. */
export function storedTheme(): ThemeChoice | null {
  // A private window or blocked site data throws on access rather than
  // returning null; either way there is nothing stored.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEME_CHOICES.includes(stored as ThemeChoice) ? (stored as ThemeChoice) : null;
  } catch {
    return null;
  }
}

function readChoice(): ThemeChoice {
  return storedTheme() ?? 'light';
}

function prefersDark(choice: ThemeChoice): boolean {
  return choice === 'dark' || choice === 'dim' || (choice === 'system' && window.matchMedia(DARK_QUERY).matches);
}

function apply(choice: ThemeChoice) {
  document.documentElement.classList.toggle('dark', prefersDark(choice));
  document.documentElement.classList.toggle('dim', choice === 'dim');
}

/**
 * Apply a theme and remember it in this browser, without saving it to the
 * account. PreferenceSync uses this to put the account's choice back; saving
 * it again from there would only echo it.
 */
export function storeTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not saved here, but still applied for as long as this page stays open.
  }
  apply(choice);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

export function useTheme() {
  // Starts at 'light' on the server and on the first client render so the two
  // agree; the real value is read in the effect. The page itself is already
  // the right colour by then — the boot script saw to that — so only the
  // switch's own highlight can lag, for one frame.
  const [choice, setChoiceState] = useState<ThemeChoice>('light');

  useEffect(() => {
    setChoiceState(readChoice());

    // Another tab changing the setting. People here keep chat open in one tab
    // and work in another, and two tabs in two themes looks like a fault.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readChoice();
      setChoiceState(next);
      apply(next);
    };
    const onLocal = () => setChoiceState(readChoice());
    window.addEventListener('storage', onStorage);
    window.addEventListener(LOCAL_EVENT, onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LOCAL_EVENT, onLocal);
    };
  }, []);

  // "System" has to follow the operating system while the page is open, which
  // on a laptop set to switch at sunset is a real event, not a theoretical one.
  useEffect(() => {
    if (choice !== 'system') return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    storeTheme(next);
    setChoiceState(next);
    saveToAccount({ theme: next });
  }, []);

  return { choice, setChoice };
}
