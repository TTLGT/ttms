'use client';

import { useEffect, useState } from 'react';

/**
 * Tailwind's `lg` breakpoint, as a number a media query can be built from.
 *
 * The same value the dashboard shell uses to decide whether the sidebar is a
 * column or a drawer. Anything that has to make that decision in JavaScript
 * rather than in a class has to agree with it, so it is written once here.
 */
export const LG_BREAKPOINT = 1024;

/**
 * Is the viewport narrower than a given breakpoint?
 *
 * For the handful of places where a layout choice cannot be made in CSS —
 * where the two layouts are different component trees rather than the same
 * tree styled differently. Chat is the one that needs it: side by side is a
 * list beside a thread, and narrow is one of them at a time with a back
 * button, and no set of classes turns one into the other.
 *
 * Reach for a `lg:` class first. This costs a re-render on resize and, because
 * the server has no viewport, it renders `false` on the first paint and
 * corrects itself immediately after — which is only acceptable when what it
 * decides is a layout and not what the reader is allowed to see.
 */
export function useIsNarrow(maxWidth: number = LG_BREAKPOINT): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [maxWidth]);

  return narrow;
}
