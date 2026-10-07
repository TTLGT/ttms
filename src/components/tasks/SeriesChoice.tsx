'use client';

import { useEffect } from 'react';
import { Repeat } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { formatTime, repeatText, type PersonalTask } from '@/types/task';

/**
 * The question a calendar asks before it changes one date of a repeating
 * event, Google Calendar style.
 *
 * - **Moving** one date always takes it out of the series — a series has one
 *   time and one pattern, and a date somewhere else is not on the pattern — so
 *   the only question is "are you sure?".
 * - **Stretching** one date can mean either, so the person says which: just
 *   this one (taken out of the series, like a move) or every date in it.
 *
 * Nothing is asked about an event that is already on its own, including one
 * taken out of a series earlier; the calendar only opens this for a date that
 * is still part of one.
 */
export type SeriesAsk =
  | { kind: 'move'; task: PersonalTask; date: string; to: { newDate: string; time?: string | null; endTime?: string | null } }
  | { kind: 'resize'; task: PersonalTask; date: string; endTime: string };

export default function SeriesChoice({
  ask, onThisOne, onAll, onCancel,
}: {
  ask: SeriesAsk;
  onThisOne: () => void;
  onAll: () => void;
  onCancel: () => void;
}) {
  const { formatCalendarDate } = useDateFormatters();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const t = ask.task;
  const on = formatCalendarDate(ask.date);
  const pattern = repeatText(t).replace(/^On /, 'on ').replace(/^Every /, 'every ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true"
      aria-labelledby="series-choice-title" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="series-choice-title" className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Repeat size={16} className="text-brand-600" />
          {ask.kind === 'move' ? 'Move just this date?' : 'Change how long it lasts'}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium text-gray-900">{t.title}</span> repeats {pattern}.
        </p>
        {ask.kind === 'move' ? (
          <p className="mt-2 text-sm text-gray-600">
            Moving the one on {on} takes it out of the series and makes it a separate event. The rest of the
            series stays as it is.
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            Make it end at {formatTime(ask.endTime)} on {on} only — which takes that one out of the series — or
            on every date?
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          {ask.kind === 'resize' && (
            <button type="button" onClick={onAll}
              className="rounded-lg border border-brand-600 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
              All events
            </button>
          )}
          <button type="button" onClick={onThisOne} autoFocus
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">
            {ask.kind === 'move' ? 'Move this one' : 'Just this one'}
          </button>
        </div>
      </div>
    </div>
  );
}
