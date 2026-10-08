'use client';

import { useEffect, type RefObject } from 'react';

/** How close to an edge, in pixels, the pointer has to be before the page moves. */
const EDGE = 60;
/** The fastest it moves, in pixels per frame, with the pointer on or past the edge. */
const MAX_SPEED = 24;
/**
 * The browser fires dragover every 50ms or so while a drag is in progress,
 * even with the pointer still. Silence longer than this means the drag ended
 * somewhere we were not told about — the source card re-rendered away before
 * its dragend, or the pointer left the window — so the scrolling stops.
 */
const STALE_MS = 400;

/**
 * Scrolls the page while something dragged out of `ref` is held near the top
 * or bottom of the visible area, and the board itself sideways near its left
 * or right edge.
 *
 * Native drag and drop does not do this reliably by itself: Chrome scrolls the
 * window, but the dashboard scrolls `<main>`, not the window, so a card picked
 * up low in a long column could never reach the top of a short one.
 *
 * The page moves faster the closer the pointer is to the edge, as in Trello
 * and Google Calendar, so a nudge creeps and a shove races.
 */
export function useDragAutoScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    let heard = 0;
    let scroller: HTMLElement | null = null;

    const speed = (distance: number) =>
      distance >= EDGE ? 0 : Math.ceil(MAX_SPEED * Math.min(1, 1 - distance / EDGE));

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const tick = () => {
      if (performance.now() - heard > STALE_MS) { stop(); return; }

      if (scroller) {
        // Only the part of the scroller that is on screen counts as its edge.
        const r = scroller.getBoundingClientRect();
        const top = Math.max(r.top, 0);
        const bottom = Math.min(r.bottom, window.innerHeight);
        if (x >= r.left && x <= r.right) {
          const up = speed(y - top);
          const down = speed(bottom - y);
          if (up) scroller.scrollTop -= up;
          else if (down) scroller.scrollTop += down;
        }
      }

      const b = root.getBoundingClientRect();
      if (y >= b.top && y <= b.bottom && root.scrollWidth > root.clientWidth) {
        const left = speed(x - Math.max(b.left, 0));
        const right = speed(Math.min(b.right, window.innerWidth) - x);
        if (left) root.scrollLeft -= left;
        else if (right) root.scrollLeft += right;
      }

      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      scroller = scrollParentOf(root);
      heard = performance.now();
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const track = (e: DragEvent) => {
      if (!frame) return;
      // Firefox reports 0,0 on some dragover events; those would read as
      // "hard against the top-left corner" and race the page upward.
      if (e.clientX === 0 && e.clientY === 0) return;
      x = e.clientX;
      y = e.clientY;
      heard = performance.now();
    };

    root.addEventListener('dragstart', start);
    document.addEventListener('dragover', track, true);
    document.addEventListener('dragend', stop, true);
    document.addEventListener('drop', stop, true);
    return () => {
      stop();
      root.removeEventListener('dragstart', start);
      document.removeEventListener('dragover', track, true);
      document.removeEventListener('dragend', stop, true);
      document.removeEventListener('drop', stop, true);
    };
  }, [ref]);
}

/** The nearest ancestor that scrolls up and down — `<main>` in the dashboard — or the page itself. */
function scrollParentOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
