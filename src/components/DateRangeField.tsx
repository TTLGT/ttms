'use client';

import DateField from './DateField';
import { Bi } from './spanish/Es';

/**
 * A pickup or delivery date that is a window — "pickup 13th to 15th" — with
 * the last day optional.
 *
 * Both boxes are always shown (2026-11-12). It used to be one box with a
 * "Make it a date range" link that opened the second, which hid the fact that
 * a window was possible at all; brokers asked for the range to be the
 * default. Leaving "to" empty is how somebody says "this exact day": `end` is
 * then '' and saves as null, exactly as a single day always has, so nothing
 * that reads `pickupDateEnd` / `deliveryDateEnd` sees a difference. An end
 * equal to the start is shown as one day by `formatDateRange()`.
 *
 * Same `YYYY-MM-DD` contract as DateField for both halves.
 */

interface DateRangeFieldProps {
  label: string;
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  className?: string;
}

/** Why a start/end pair cannot be saved, or '' when it can. `label` names it in the message. */
export function dateRangeProblem(label: string, start: string, end: string): string {
  if (end && !start) return `${label}: enter the first day of the window, not only the last.`;
  // ISO dates compare correctly as strings.
  if (start && end && end < start) return `${label}: the window ends before it starts.`;
  return '';
}

export default function DateRangeField({
  label,
  start,
  end,
  onStartChange,
  onEndChange,
  className = '',
}: DateRangeFieldProps) {
  const problem = dateRangeProblem(label, start, end);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <DateField value={start} onChange={onStartChange} className={className} ariaLabel={`${label}, from`} />
        </div>
        <span data-es className="pt-2 text-sm text-gray-500">to</span>
        <div className="flex-1 min-w-0">
          <DateField value={end} onChange={onEndChange} className={className} ariaLabel={`${label}, to`} />
        </div>
      </div>
      {problem
        ? <p className="text-xs text-red-600 mt-1">{problem}</p>
        : <p className="text-xs text-gray-500 mt-1"><Bi>Leave the second date empty for a single day.</Bi></p>}
    </div>
  );
}
