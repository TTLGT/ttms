'use client';

import { useState } from 'react';
import DateField from '@/components/DateField';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { addDays } from '@/types/attendance';
import { calendarToday, weekdayNumberOf } from '@/types/task';

/**
 * A day picked in one tap: Today, Tomorrow, a weekday ahead, or any day from
 * the calendar box. The Planner's side-panel editor uses it for When and for
 * Deadline (step 5, 2026-11-25), because nearly every day anybody types is one
 * of the first three — and a date box makes every one of them six keystrokes.
 *
 * The value is the same `YYYY-MM-DD` (or '' for none) as DateField's, so it
 * drops in where one was. Office time, like every date on a task.
 */

/** The next Monday after `today` — "next week". */
export function nextMonday(today: string): string {
  const wd = weekdayNumberOf(today);
  return addDays(today, ((8 - wd) % 7) || 7);
}

/** This week's Friday, or next week's once Friday has come. */
export function comingFriday(today: string): string {
  const wd = weekdayNumberOf(today);
  return addDays(today, ((5 - wd + 7) % 7) || 7);
}

export default function DayChips({ value, onChange, noneLabel, ahead = 'nextWeek', ariaLabel }: {
  value: string;
  onChange: (day: string) => void;
  /** The chip that clears it: "No day" for When, "None" for a deadline. */
  noneLabel: string;
  /** The third chip: next Monday for planning, this Friday for a deadline. */
  ahead?: 'nextWeek' | 'friday';
  ariaLabel: string;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const today = calendarToday();
  const third = ahead === 'friday' ? comingFriday(today) : nextMonday(today);
  const chips: { day: string; label: string }[] = [
    { day: '', label: noneLabel },
    { day: today, label: 'Today' },
    { day: addDays(today, 1), label: 'Tomorrow' },
    { day: third, label: ahead === 'friday' ? 'Friday' : 'Next week' },
  ];
  const onChip = chips.some((c) => c.day === value);
  // The date box opens on "Pick a day" and stays open while it holds a day no chip names.
  const [picking, setPicking] = useState(false);
  const showBox = picking || (!!value && !onChip);

  return (
    <div role="group" aria-label={ariaLabel}>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const on = value === c.day && !(c.day === '' && showBox);
          return (
            <button key={c.label} type="button" aria-pressed={on} data-es={c.label}
              onClick={() => { onChange(c.day); setPicking(false); }}
              title={c.day ? formatCalendarDate(c.day) : undefined}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                on ? 'border-brand-500 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {c.label}
            </button>
          );
        })}
        <button type="button" aria-pressed={showBox} data-es="Pick a day"
          onClick={() => setPicking(true)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            showBox ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}>
          {showBox && value && !onChip ? formatCalendarDate(value) : 'Pick a day'}
        </button>
      </div>
      {showBox && (
        <div className="mt-2 max-w-[13rem]">
          <DateField value={value} onChange={onChange} ariaLabel={ariaLabel}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      )}
    </div>
  );
}
