'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import DateField from './DateField';

/**
 * A date that can optionally be a window — "pickup 13th to 15th".
 *
 * Most loads are one day, so the second box stays out of the way until someone
 * asks for it. Same `YYYY-MM-DD` contract as DateField for both halves; `end`
 * is '' when the date is a single day.
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
  const [open, setOpen] = useState(Boolean(end));

  // An edit form loads its record after the first render, so a saved window
  // has to open the second box when it arrives, not only on mount.
  useEffect(() => {
    if (end) setOpen(true);
  }, [end]);

  function close() {
    setOpen(false);
    onEndChange('');
  }

  const problem = dateRangeProblem(label, start, end);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {open ? (
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <DateField value={start} onChange={onStartChange} className={className} ariaLabel={`${label}, from`} />
          </div>
          <span className="pt-2 text-sm text-gray-500">to</span>
          <div className="flex-1 min-w-0">
            <DateField value={end} onChange={onEndChange} className={className} ariaLabel={`${label}, to`} />
          </div>
          <button type="button" onClick={close} title="Make it a single day"
            className="mt-1.5 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <DateField value={start} onChange={onStartChange} className={className} ariaLabel={label} />
          <button type="button" onClick={() => setOpen(true)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
            <Plus className="w-3 h-3" /> Make it a date range
          </button>
        </>
      )}
      {problem && <p className="text-xs text-red-600 mt-1">{problem}</p>}
    </div>
  );
}
