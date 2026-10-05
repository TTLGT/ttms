'use client';

import { useState } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import DateField from '@/components/DateField';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { MAX_STEP_TITLE, MAX_TASK_STEPS, calendarToday, newStepId, type TaskStep } from '@/types/task';
import { DueChip } from './TaskQueue';

/**
 * A task's steps as a checklist: tick, add, rename, move, remove. Every
 * change hands back the whole list — the editor holds it until Save, the
 * focus screen saves it at once.
 *
 * `one` and `many` are what the steps are called under the person's theme
 * (stops, incantations…) — see taskSkins.ts. Only the words change.
 *
 * A step can carry a due date of its own: the calendar button opens a date
 * box under the step, and a dated step shows when it is due in the same words
 * a task does. It is a label — see `TaskStep.date`.
 *
 * A step due after the task itself is warned about, not refused: the date
 * still saves, because the person may be about to move the task's date, and
 * the editor's date box sits above this list where that is one click away.
 * The warning stays on the step until one of the two dates changes.
 */
export default function StepList({
  steps,
  onChange,
  one = 'step',
  many = 'steps',
  large = false,
  taskDate = null,
}: {
  steps: TaskStep[];
  onChange: (next: TaskStep[]) => void;
  one?: string;
  many?: string;
  /** The focus screen's bigger rows. */
  large?: boolean;
  /** The task's own due date, `YYYY-MM-DD`, to warn about a step due after it. */
  taskDate?: string | null;
}) {
  const [text, setText] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  /** The step whose date box is open. */
  const [dating, setDating] = useState<string | null>(null);
  const today = calendarToday();
  const { formatCalendarDate } = useDateFormatters();
  // Plain string order is date order for YYYY-MM-DD.
  const late = (s: TaskStep) => !s.done && !!s.date && !!taskDate && s.date > taskDate;
  const setDate = (id: string, date: string) =>
    onChange(steps.map((s) => (s.id === id ? { ...s, date: date || null } : s)));
  const done = steps.filter((s) => s.done).length;
  const full = steps.length >= MAX_TASK_STEPS;

  const add = () => {
    const title = text.trim();
    if (!title || full) return;
    onChange([...steps, { id: newStepId(), title, done: false, date: null, xp: 0, everDone: false }]);
    setText('');
  };

  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const rename = () => {
    if (!renaming) return;
    const title = renaming.title.trim();
    if (title) onChange(steps.map((s) => (s.id === renaming.id ? { ...s, title } : s)));
    setRenaming(null);
  };

  return (
    <div>
      {steps.length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.round((done / steps.length) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{done}/{steps.length} {many}</span>
        </div>
      )}

      <ul className={large ? 'space-y-1.5' : 'space-y-1'}>
        {steps.map((s, i) => (
          <li key={s.id} className={`group rounded-lg border border-gray-200 bg-white ${large ? 'px-3 py-2.5' : 'px-2 py-1.5'}`}>
          <div className="flex items-center gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={s.done}
                aria-label={s.done ? `Untick ${s.title}` : `Tick ${s.title}`}
                onClick={() => onChange(steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                className={`grid flex-shrink-0 place-items-center rounded border-2 ${large ? 'h-6 w-6' : 'h-5 w-5'} ${
                  s.done ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-green-500'
                }`}
              >
                {s.done && <Check size={large ? 15 : 12} strokeWidth={3} />}
              </button>

              {renaming?.id === s.id ? (
                <input
                  autoFocus
                  value={renaming.title}
                  maxLength={MAX_STEP_TITLE}
                  onChange={(e) => setRenaming({ id: s.id, title: e.target.value })}
                  onBlur={rename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); rename(); }
                    if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); }
                  }}
                  className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setRenaming({ id: s.id, title: s.title })}
                  title="Click to rename"
                  className={`min-w-0 flex-1 truncate text-left ${large ? 'text-base' : 'text-sm'} ${
                    s.done ? 'text-gray-400 line-through' : 'text-gray-800'
                  }`}
                >
                  {s.title}
                </button>
              )}

              {s.date && !s.done && (
                <button type="button" onClick={() => setDating(dating === s.id ? null : s.id)} title="Change the due date" className="flex-shrink-0">
                  <DueChip date={s.date} today={today} />
                </button>
              )}
              {late(s) && (
                <AlertTriangle
                  size={14}
                  className="flex-shrink-0 text-amber-500"
                  aria-label={`Due after the task (${formatCalendarDate(taskDate!)})`}
                />
              )}

              <span className="flex flex-shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => setDating(dating === s.id ? null : s.id)}
                  aria-label={s.date ? `Change the due date of ${s.title}` : `Give ${s.title} a due date`}
                  aria-expanded={dating === s.id}
                  className={`rounded p-0.5 hover:text-gray-700 ${dating === s.id ? 'text-brand-600' : 'text-gray-400'}`}
                >
                  <CalendarDays size={14} />
                </button>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                  <ChevronUp size={14} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down" className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(steps.filter((x) => x.id !== s.id))}
                  aria-label={`Remove ${s.title}`}
                  className="rounded p-0.5 text-gray-400 hover:text-red-600"
                >
                  <X size={14} />
                </button>
              </span>
          </div>
          {late(s) && (
            <p role="alert" className="mt-1.5 rounded-md bg-amber-50 py-1 pl-7 pr-2 text-xs text-amber-800">
              This {one} is due {formatCalendarDate(s.date!)}, after the task itself ({formatCalendarDate(taskDate!)}).
              Move the {one} earlier or the task later.
            </p>
          )}
          {dating === s.id && (
            <div className="mt-1.5 flex items-center gap-2 pl-7">
              <span className="text-xs text-gray-500">Due</span>
              <DateField
                value={s.date ?? ''}
                onChange={(v) => setDate(s.id, v)}
                ariaLabel={`Due date of ${s.title}`}
                className="w-36 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
              />
              {s.date && (
                <button type="button" onClick={() => setDate(s.id, '')} className="text-xs text-gray-500 hover:text-red-600">
                  Clear
                </button>
              )}
              <button type="button" onClick={() => setDating(null)} className="ml-auto text-xs text-gray-500 hover:text-gray-800">
                Close
              </button>
            </div>
          )}
          </li>
        ))}
      </ul>

      {/* Its own little form would nest inside the editor's, which HTML does
          not allow — so Enter is caught here instead. */}
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={text}
          maxLength={MAX_STEP_TITLE}
          disabled={full}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={full ? `That is the most ${many} a task can have` : `Add a ${one}, then press Enter`}
          className={`min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${large ? 'py-2' : 'py-1.5'}`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!text.trim() || full}
          aria-label={`Add ${one}`}
          className="rounded-lg border border-gray-300 bg-white px-2.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
