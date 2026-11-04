'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The little month at the top of the Calendar's side column, Google style:
 * page through months with its own arrows, click a day to take the big
 * calendar there in whatever view it is in (month, week, four days, day).
 *
 * It follows the big calendar — page the big one and this pages with it —
 * but paging this one moves nothing until a day is clicked. Weeks start on
 * Sunday, like the month grid beside it. Pure display: everything it knows
 * comes in as props, so it costs no reads.
 */

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function monthTitle(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

/** The 42 days (six weeks, from a Sunday) that show the month — always six rows, so the box never jumps. */
export function miniMonthDays(year: number, month: number): string[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export default function MiniMonth({
  today, selected, shownFrom, shownTo, follow, hasItems, onPick,
}: {
  today: string;
  selected: string;
  /** The days the big calendar has on screen, shaded here. */
  shownFrom: string;
  shownTo: string;
  /** Any date in the month the big calendar is on; when it changes, this pages to it. */
  follow: string;
  /** Whether to put a dot under a day: something of the person's own is on it. */
  hasItems?: (date: string) => boolean;
  onPick: (date: string) => void;
}) {
  const [view, setView] = useState({ year: Number(follow.slice(0, 4)), month: Number(follow.slice(5, 7)) });
  const followMonth = follow.slice(0, 7);
  useEffect(() => {
    setView({ year: Number(followMonth.slice(0, 4)), month: Number(followMonth.slice(5, 7)) });
  }, [followMonth]);

  const page = (by: number) => setView((v) => {
    const i = v.year * 12 + (v.month - 1) + by;
    return { year: Math.floor(i / 12), month: (i % 12) + 1 };
  });

  const days = miniMonthDays(view.year, view.month);
  const thisMonth = `${view.year}-${String(view.month).padStart(2, '0')}`;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3" aria-label="Jump to a date">
      <div className="mb-1 flex items-center gap-1">
        <p className="flex-1 pl-1 text-sm font-semibold text-gray-900">{monthTitle(view.year, view.month)}</p>
        <button type="button" onClick={() => page(-1)} aria-label="Previous month"
          className="rounded-full p-1 text-gray-600 hover:bg-gray-100">
          <ChevronLeft size={16} />
        </button>
        <button type="button" onClick={() => page(1)} aria-label="Next month"
          className="rounded-full p-1 text-gray-600 hover:bg-gray-100">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {LETTERS.map((l, i) => (
          <span key={i} className="py-1 text-[11px] font-medium text-gray-500">{l}</span>
        ))}
        {days.map((d) => {
          const outside = d.slice(0, 7) !== thisMonth;
          const isToday = d === today;
          const isSelected = d === selected;
          const shown = d >= shownFrom && d <= shownTo;
          const dot = hasItems?.(d);
          return (
            <div key={d} className={`py-0.5 ${shown ? 'bg-brand-50' : ''} ${
              shown && (d === shownFrom || new Date(`${d}T00:00:00Z`).getUTCDay() === 0) ? 'rounded-l-full' : ''
            } ${shown && (d === shownTo || new Date(`${d}T00:00:00Z`).getUTCDay() === 6) ? 'rounded-r-full' : ''}`}>
              <button type="button" onClick={() => onPick(d)}
                aria-label={d}
                aria-current={isToday ? 'date' : undefined}
                className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums ${
                  isToday
                    ? 'bg-brand-600 font-semibold text-white hover:bg-brand-700'
                    : isSelected
                      ? 'bg-brand-200 font-semibold text-brand-900'
                      : outside
                        ? 'text-gray-400 hover:bg-gray-100'
                        : 'text-gray-800 hover:bg-gray-100'
                }`}>
                {Number(d.slice(8, 10))}
                {dot && !isToday && (
                  <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand-500" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
