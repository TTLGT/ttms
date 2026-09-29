'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { ChatWallpaperId } from '@/types/userPreferences';
import { saveToAccount } from './preferences';

export type { ChatWallpaperId };

/*
 * Which background chat messages sit on, remembered on the account and in the
 * browser, like the colour theme — see src/types/userPreferences.ts. The
 * browser copy is what the page reads; the account copy is what PreferenceSync
 * puts back into a browser that has lost it.
 *
 * What each one looks like is in globals.css, keyed off `data-wallpaper` on
 * ChatWallpaper. The drawn ones are tiles made by
 * scripts/build-chat-wallpaper.mjs; dots is a CSS gradient and plain has no
 * pattern at all.
 */

export const CHAT_WALLPAPERS: { id: ChatWallpaperId; label: string }[] = [
  { id: 'freight',   label: 'Freight' },
  { id: 'highway',   label: 'Highway' },
  { id: 'harbour',   label: 'Harbour' },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'dots',      label: 'Dots' },
  { id: 'plain',     label: 'Plain' },
];

// The look chat shipped with, so nobody finds their screen changed until they
// ask for it.
export const DEFAULT_CHAT_WALLPAPER: ChatWallpaperId = 'freight';

const STORAGE_KEY = 'ttms-chat-wallpaper';

// A same-tab change fires no `storage` event, and a thread panel and the room
// beside it are two wallpapers on one screen — so a change is announced to
// this tab by hand as well.
const LOCAL_EVENT = 'ttms-chat-wallpaper';

/** What this browser holds, or null when it holds nothing it recognises. */
export function storedChatWallpaper(): ChatWallpaperId | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return CHAT_WALLPAPERS.some((w) => w.id === stored) ? (stored as ChatWallpaperId) : null;
  } catch {
    return null;
  }
}

/**
 * Remember a wallpaper in this browser without saving it to the account —
 * PreferenceSync's way in, so putting the account's choice back does not
 * echo it straight back to the account.
 */
export function storeChatWallpaper(next: ChatWallpaperId) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not saved, and with nowhere to read it back from, not shown either —
    // the same as a private window refusing any other setting.
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

function read(): ChatWallpaperId {
  // A value from some older or newer build that this one does not know falls
  // back to the default, the same as nothing stored.
  return storedChatWallpaper() ?? DEFAULT_CHAT_WALLPAPER;
}

function subscribe(onChange: () => void) {
  // Another tab changing it too: people here keep chat open in one tab and
  // work in another.
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) onChange(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

export function useChatWallpaper() {
  // The server snapshot is the default, so the first client render agrees with
  // the server and the stored choice lands straight after hydration.
  const wallpaper = useSyncExternalStore(subscribe, read, () => DEFAULT_CHAT_WALLPAPER);

  const setWallpaper = useCallback((next: ChatWallpaperId) => {
    storeChatWallpaper(next);
    saveToAccount({ chatWallpaper: next });
  }, []);

  return { wallpaper, setWallpaper };
}
