'use client';

import { useCallback, useEffect, useState } from 'react';
import { DARK_QUERY, THEME_STORAGE_KEY as STORAGE_KEY } from './themeBoot';

/*
 * Light or dark, chosen per browser.
 *
 * The choice lives in localStorage rather than on `users/{uid}`, on purpose:
 * it is a preference about a screen, not about a person — the same somebody
 * can want dark on the office monitor and light on a phone in the sun — and
 * keeping it off Firestore means no read, no write, no rule and no field on
 * the profile every signed-in user can see.
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

export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_CHOICES: ThemeChoice[] = ['light', 'dark', 'system'];

function readChoice(): ThemeChoice {
  // A private window or blocked site data throws on access rather than
  // returning null; either way the answer is the default.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'system' ? stored : 'light';
  } catch {
    return 'light';
  }
}

function prefersDark(choice: ThemeChoice): boolean {
  return choice === 'dark' || (choice === 'system' && window.matchMedia(DARK_QUERY).matches);
}

function apply(choice: ThemeChoice) {
  document.documentElement.classList.toggle('dark', prefersDark(choice));
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
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not saved, but still applied for as long as this page stays open.
    }
    setChoiceState(next);
    apply(next);
  }, []);

  return { choice, setChoice };
}
