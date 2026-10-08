'use client';

import { useEffect, useRef } from 'react';

/**
 * A scroll wheel for one part of a time — the hour, the minutes, AM/PM —
 * like a phone's alarm picker. Three of them side by side make the planning
 * card's time picker.
 *
 * The wheel is a plain scrolling list with snap points; what is in the middle
 * row is the value. It is scrolled to the value on mount and whenever the
 * value changes from outside, and reports a new value once the scrolling has
 * settled rather than on every pixel. Arrow keys and clicking a row work too,
 * so it never depends on a scroll gesture.
 *
 * A mouse wheel is taken over rather than left to the browser: one notch is
 * about 100px in Chrome and Edge, which is two or three rows here, so people
 * kept overshooting the time they wanted. Each notch now moves one row, and a
 * trackpad moves one row per row's height of finger travel.
 *
 * `loop` makes it go round, as a phone's does: 59 is followed by 00 rather
 * than by the end of the list. A scrolling list has ends, so the options are
 * drawn several times over and, each time the scrolling settles, the wheel
 * jumps without animation to the same row in the middle copy. The rows are
 * identical, so the jump cannot be seen, and there is always a long run of
 * rows left in either direction. There are enough copies that a fast fling on
 * a phone (native momentum, not the wheel handler) does not reach an end
 * before it settles.
 */

const ROW = 40;
// Rows kept on each side of the middle copy when looping.
const LOOP_BUFFER_ROWS = 100;

export default function TimeWheel<T extends string | number>({
  options, value, onChange, label, render = String, loop = false,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  render?: (v: T) => string;
  loop?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const n = options.length;
  const copies = loop ? 2 * Math.ceil(LOOP_BUFFER_ROWS / n) + 1 : 1;
  const mid = (copies - 1) / 2;
  const total = n * copies;
  const index = Math.max(0, options.indexOf(value));
  // Rows are positions in the drawn list; wrap() turns one back into an option.
  const wrap = (row: number) => ((row % n) + n) % n;
  // The row a wheel step or a key press is gliding to. The value is reported
  // at once, so until the glide lands the scroll position is behind it and
  // must not be "corrected" with a jump, nor read back as a new value.
  const aim = useRef<number | null>(null);
  const placed = useRef(false);
  const latest = useRef({ options, value, onChange, n, mid, total });
  latest.current = { options, value, onChange, n, mid, total };

  const rowAt = () => Math.round((ref.current?.scrollTop ?? 0) / ROW);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aim.current !== null && wrap(aim.current) === index) return;
    // Only when it shows something else: a scroll that has just settled on
    // this value must not be yanked a pixel back to it. The first time, it is
    // placed in the middle copy whatever it shows, or a looping wheel would
    // start against its top end.
    if (!placed.current || wrap(rowAt()) !== index) el.scrollTo({ top: (mid * n + index) * ROW });
    placed.current = true;
    // wrap and rowAt read only n and the element.
  }, [index, mid, n]);

  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  const go = (row: number) => {
    const { options, value, onChange, n, total } = latest.current;
    const at = Math.min(total - 1, Math.max(0, row));
    aim.current = at;
    ref.current?.scrollTo({ top: at * ROW, behavior: 'smooth' });
    const v = options[((at % n) + n) % n];
    if (v !== value) onChange(v);
  };

  // Listened for here rather than through onWheel: React binds wheel as a
  // passive listener, which cannot preventDefault the browser's own scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let travel = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Pixel deltas add up (a trackpad sends many small ones); line and page
      // deltas (Firefox, some mice) are one notch each.
      travel += e.deltaMode === 0 ? e.deltaY : Math.sign(e.deltaY) * ROW;
      if (Math.abs(travel) < ROW) return;
      const step = Math.sign(travel);
      travel = 0;
      go((aim.current ?? Math.round(el.scrollTop / ROW)) + step);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // go reads everything it needs through refs.
  }, []);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      aria-activedescendant={`${label}-${mid * n + index}`}
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget;
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(() => {
          aim.current = null;
          const { options, value, onChange, n, mid, total } = latest.current;
          const row = Math.min(total - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
          const i = ((row % n) + n) % n;
          // Back to the middle copy, unseen. It scrolls, so this runs once
          // more and finds the wheel already there.
          if (Math.floor(row / n) !== mid) el.scrollTo({ top: (mid * n + i) * ROW });
          if (options[i] !== value) onChange(options[i]);
        }, 90);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); go((aim.current ?? rowAt()) - 1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); go((aim.current ?? rowAt()) + 1); }
      }}
      className="relative w-16 snap-y snap-mandatory overflow-y-scroll rounded-md text-center outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ height: ROW * 3, paddingTop: ROW, paddingBottom: ROW }}
    >
      {Array.from({ length: total }, (_, row) => {
        const o = options[row % n];
        const chosen = row % n === index;
        // Only the middle copy is the list a screen reader is given; the
        // others are there to be scrolled through.
        const real = Math.floor(row / n) === mid;
        return (
          <div
            key={row}
            id={real ? `${label}-${row}` : undefined}
            role={real ? 'option' : undefined}
            aria-selected={real ? chosen : undefined}
            aria-hidden={real ? undefined : true}
            onClick={() => go(row)}
            className={`snap-center cursor-pointer select-none tabular-nums transition-colors ${
              chosen ? 'text-xl font-semibold text-gray-900' : 'text-base text-gray-400'
            }`}
            style={{ height: ROW, lineHeight: `${ROW}px` }}
          >
            {render(o)}
          </div>
        );
      })}
    </div>
  );
}
