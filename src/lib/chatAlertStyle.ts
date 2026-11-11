'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { CHAT_ALERT_STYLES, type ChatAlertStyle } from '@/types/userPreferences';
import { saveToAccount } from './preferences';

export type { ChatAlertStyle };

/*
 * How load updates are drawn in a room, remembered on the account and in the
 * browser exactly like the chat wallpaper (src/lib/chatWallpaper.ts, whose
 * notes apply here line for line). Picked from the same menu in the chat
 * header. Per person: the room and its messages are the same for everybody.
 */

export const CHAT_ALERT_STYLE_OPTIONS: { id: ChatAlertStyle; label: string }[] = [
  { id: 'tickets',  label: 'Tickets' },
  { id: 'cards',    label: 'Cards' },
  { id: 'timeline', label: 'Timeline' },
];

// Chosen by the office (2026-11-11) as the easiest to scan.
export const DEFAULT_CHAT_ALERT_STYLE: ChatAlertStyle = 'tickets';

const STORAGE_KEY = 'ttms-chat-alert-style';
const LOCAL_EVENT = 'ttms-chat-alert-style';

export function storedChatAlertStyle(): ChatAlertStyle | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return CHAT_ALERT_STYLES.includes(stored as ChatAlertStyle) ? (stored as ChatAlertStyle) : null;
  } catch {
    return null;
  }
}

/** Remember in this browser only — PreferenceSync's way in, so it does not echo back to the account. */
export function storeChatAlertStyle(next: ChatAlertStyle) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private window or blocked storage: the default shows, as for any setting.
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

function read(): ChatAlertStyle {
  return storedChatAlertStyle() ?? DEFAULT_CHAT_ALERT_STYLE;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) onChange(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

export function useChatAlertStyle() {
  const style = useSyncExternalStore(subscribe, read, () => DEFAULT_CHAT_ALERT_STYLE);
  const setStyle = useCallback((next: ChatAlertStyle) => {
    storeChatAlertStyle(next);
    saveToAccount({ chatAlertStyle: next });
  }, []);
  return { style, setStyle };
}
