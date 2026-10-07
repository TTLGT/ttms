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
 */

const ROW = 40;

export default function TimeWheel<T extends string | number>({
  options, value, onChange, label, render = String,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  render?: (v: T) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, options.indexOf(value));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only when it is somewhere else: a scroll that has just settled on this
    // row must not be yanked a pixel back to it.
    if (Math.round(el.scrollTop / ROW) !== index) el.scrollTo({ top: index * ROW });
  }, [index]);

  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  const go = (i: number) => {
    const at = Math.min(options.length - 1, Math.max(0, i));
    ref.current?.scrollTo({ top: at * ROW, behavior: 'smooth' });
    if (options[at] !== value) onChange(options[at]);
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      aria-activedescendant={`${label}-${index}`}
      tabIndex={0}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop;
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(() => {
          const i = Math.min(options.length - 1, Math.max(0, Math.round(top / ROW)));
          if (options[i] !== value) onChange(options[i]);
        }, 90);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); go(index - 1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); go(index + 1); }
      }}
      className="relative w-16 snap-y snap-mandatory overflow-y-scroll rounded-md text-center outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ height: ROW * 3, paddingTop: ROW, paddingBottom: ROW }}
    >
      {options.map((o, i) => (
        <div
          key={String(o)}
          id={`${label}-${i}`}
          role="option"
          aria-selected={i === index}
          onClick={() => go(i)}
          className={`snap-center cursor-pointer select-none tabular-nums transition-colors ${
            i === index ? 'text-xl font-semibold text-gray-900' : 'text-base text-gray-400'
          }`}
          style={{ height: ROW, lineHeight: `${ROW}px` }}
        >
          {render(o)}
        </div>
      ))}
    </div>
  );
}
