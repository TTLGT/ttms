'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { ROUTE_VIEWS, type RouteView } from '@/types/userPreferences';
import { saveToAccount } from './preferences';

export type { RouteView };

/*
 * Whether the order page's Route card lists the stops as a timeline or as an
 * itinerary table (2026-11-11), remembered on the account and in the browser
 * exactly like the chat alert style (src/lib/chatAlertStyle.ts, whose notes
 * apply here line for line). Picked from the small switch beside the card's
 * Edit link. Per person: the stops are the same for everybody.
 */

// The timeline reads best for the one-pickup, one-delivery loads most of the
// book is; the table is for people working many-stop loads.
export const DEFAULT_ROUTE_VIEW: RouteView = 'timeline';

const STORAGE_KEY = 'ttms-route-view';
const LOCAL_EVENT = 'ttms-route-view';

export function storedRouteView(): RouteView | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return ROUTE_VIEWS.includes(stored as RouteView) ? (stored as RouteView) : null;
  } catch {
    return null;
  }
}

/** Remember in this browser only — PreferenceSync's way in, so it does not echo back to the account. */
export function storeRouteView(next: RouteView) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private window or blocked storage: the default shows, as for any setting.
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

function read(): RouteView {
  return storedRouteView() ?? DEFAULT_ROUTE_VIEW;
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

export function useRouteView() {
  const view = useSyncExternalStore(subscribe, read, () => DEFAULT_ROUTE_VIEW);
  const setView = useCallback((next: RouteView) => {
    storeRouteView(next);
    saveToAccount({ routeView: next });
  }, []);
  return { view, setView };
}
