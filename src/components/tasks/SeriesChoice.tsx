'use client';

import { useEffect } from 'react';
import { Repeat } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { Bi } from '@/components/spanish/Es';
import {
  formatTime, repeatText, type PersonalTask, type PersonalTaskInput, type SeriesScope,
} from '@/types/task';

/**
 * The question a calendar asks before it changes one date of a repeating
 * item, Google Calendar style: this one, this and the ones after it, or all
 * of them (SeriesScope in src/types/task.ts says what each does). Asked the
 * same way whether the date was dragged, stretched or changed in the editor.
 *
 * A repeating **task** is offered the first two only. Its earlier copies are
 * finished tasks — the record of what was done on the day — and are never
 * moved. A change to the repeat itself (the pattern, the last day) is a
 * change to the series, so "this one" is not offered for it either.
 *
 * Nothing is asked about an item that is on its own, including a date taken
 * out of a series earlier; the calendar only opens this for one still in one.
 */
export type SeriesMove = { date: string; newDate?: string; time?: string | null; endTime?: string | null };

export type SeriesAsk = {
  /** What was done to it, for the wording: dragged, stretched, or edited. */
  kind: 'move' | 'resize' | 'edit';
  task: PersonalTask;
  /** The date it was changed on — one occurrence of an event, or a task's own day. */
  date: string;
  /** Where and when that date goes. Only what changed is set. */
  move: SeriesMove;
  /** Anything else changed in the editor, saved on whichever item the answer leaves. */
  rest?: PersonalTaskInput;
  /** The answers that make sense here, in the order drawn. */
  scopes: SeriesScope[];
};

/** Whether changing a date of this item asks first: a repeating event, or a repeating task still waiting on its next copy. */
export function asksSeries(t: PersonalTask): boolean {
  if (t.repeat === 'none' || t.fromHistory || t.invitedBy) return false;
  return t.kind === 'event' || (!t.nextId && t.status !== 'done');
}

/**
 * The question for a drag or a stretch. A move with nothing to move (dropped
 * where it was) is no question at all, and comes back null.
 */
export function seriesAsk(kind: 'move' | 'resize', task: PersonalTask, move: SeriesMove): SeriesAsk | null {
  const changed = (move.newDate !== undefined && move.newDate !== move.date)
    || (move.time !== undefined && move.time !== task.time)
    || (move.endTime !== undefined && move.endTime !== task.endTime);
  if (!changed) return null;
  return { kind, task, date: move.date, move, scopes: task.kind === 'event' ? ['this', 'following', 'all'] : ['this', 'following'] };
}

const LABEL: Record<SeriesScope, { event: string; task: string }> = {
  this:      { event: 'This event', task: 'Just this one' },
  following: { event: 'This and following events', task: 'This and the ones after it' },
  all:       { event: 'All events', task: 'All of them' },
};

export default function SeriesChoice({
  ask, onPick, onCancel,
}: {
  ask: SeriesAsk;
  onPick: (scope: SeriesScope) => void;
  onCancel: () => void;
}) {
  const { formatCalendarDate } = useDateFormatters();

  useEffect(() => {
    // Caught on the way down and stopped there: opened over the editor, an
    // Escape meant for this question must not also close the editor.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const t = ask.task;
  const isEvent = t.kind === 'event';
  const on = formatCalendarDate(ask.date);
  const pattern = repeatText(t).replace(/^On /, 'on ').replace(/^Every /, 'every ');
  const to = ask.move;
  const where = [
    to.newDate && to.newDate !== ask.date ? `to ${formatCalendarDate(to.newDate)}` : '',
    to.time ? `at ${formatTime(to.time)}` : '',
    to.endTime && ask.kind === 'resize' ? `ending at ${formatTime(to.endTime)}` : '',
  ].filter(Boolean).join(' ');
  const title = ask.kind === 'move' ? 'Move a repeating ' : ask.kind === 'resize' ? 'Change how long a repeating ' : 'Change a repeating ';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true"
      aria-labelledby="series-choice-title" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="series-choice-title" className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Repeat size={16} className="text-brand-600" />
          {title}{isEvent ? 'event' : 'task'}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium text-gray-900">{t.title}</span> repeats {pattern}.
          {' '}{ask.kind === 'edit' ? `You changed the one on ${on}.` : `You moved the one on ${on}${where ? ` ${where}` : ''}.`}
          {' '}Which should change?
        </p>
        {!isEvent && (
          <p className="mt-2 text-xs text-gray-500">
            <Bi>Copies already finished stay where they were done.</Bi>
          </p>
        )}

        <div className="mt-4 space-y-2">
          {ask.scopes.map((scope, i) => (
            <button key={scope} data-es type="button" onClick={() => onPick(scope)} autoFocus={i === 0}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${
                i === 0 ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-gray-300 text-gray-800 hover:bg-gray-50'
              }`}>
              {LABEL[scope][isEvent ? 'event' : 'task']}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button data-es type="button" onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
