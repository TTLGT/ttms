'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * How Settings → People draws the access list.
 *
 * Three shapes of the same list:
 *
 * - `cards`    the roomy card, with the portrait down its side. One person at
 *              a time — the view for reading somebody's record or editing it.
 * - `compact`  the directory-sized card, three abreast behind a small round
 *              photo. The middle ground: still a photo, but a screenful of
 *              people rather than four.
 * - `list`     one line each. The view for the question this page exists to
 *              answer — who is an admin, who never signed in, who is
 *              suspended — across everybody at once.
 *
 * Kept in this browser rather than in the address bar, which is where the
 * Directory keeps its view. The difference is deliberate: the Directory puts
 * its filters in the URL too, so a link there carries a whole state somebody
 * can send to a colleague, while this page's filters are ordinary state. A
 * view in the URL and filters that are not would be half a story, and the
 * settings search already uses the address bar to jump to one person's row.
 */

export type PeopleView = 'cards' | 'compact' | 'list';

export const DEFAULT_PEOPLE_VIEW: PeopleView = 'cards';

const STORAGE_KEY = 'ttms.people.view';

function isPeopleView(value: unknown): value is PeopleView {
  return value === 'cards' || value === 'compact' || value === 'list';
}

export function usePeopleView(): [PeopleView, (next: PeopleView) => void] {
  const [view, setView] = useState<PeopleView>(DEFAULT_PEOPLE_VIEW);

  // After mount, never during render: this page is server-rendered as well,
  // there is no localStorage there, and a first render seeded from it would
  // make the server and client markup disagree.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isPeopleView(saved)) setView(saved);
    } catch {
      // Private window or blocked storage — the default is a fine answer.
    }
  }, []);

  const choose = useCallback((next: PeopleView) => {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still holds for this session.
    }
  }, []);

  return [view, choose];
}
