'use client';

import { useCallback, useEffect, useState } from 'react';

/*
 * How the sidebar sits on a desktop: always open, folded down to a rail of
 * icons, or a rail that opens while the pointer is over it.
 *
 * Per browser, in localStorage, for the same reasons as the theme (see
 * src/lib/theme.ts): it is about a screen, not a person — the same somebody
 * wants the room on a laptop and not on the office monitor — and it costs no
 * read, no write and no rule.
 *
 * The default is `expanded`, which is exactly the sidebar as it was. Nobody
 * should come in one morning to find their menu gone.
 *
 * Phones ignore all of this: below `lg` the sidebar is a drawer, already out
 * of the way until it is asked for.
 */

export type SidebarMode = 'expanded' | 'collapsed' | 'auto';

export const SIDEBAR_MODES: SidebarMode[] = ['expanded', 'collapsed', 'auto'];

const STORAGE_KEY = 'ttms.sidebarMode';

function readMode(): SidebarMode {
  // A private window or blocked site data throws rather than returning null.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'collapsed' || stored === 'auto' ? stored : 'expanded';
  } catch {
    return 'expanded';
  }
}

export function useSidebarMode() {
  const [mode, setModeState] = useState<SidebarMode>('expanded');
  // False until the stored choice has been read. The shell holds its width
  // transition off until then, so somebody who keeps it collapsed does not
  // watch it fold shut on every reload.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setModeState(readMode());
    setReady(true);

    // Another tab changing it — chat in one tab, work in the other.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setModeState(readMode());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMode = useCallback((next: SidebarMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not saved, but still applied for as long as this page stays open.
    }
    setModeState(next);
  }, []);

  return { mode, setMode, ready };
}
