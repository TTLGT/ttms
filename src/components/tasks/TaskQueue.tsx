'use client';

import { useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronUp, Crosshair, ListChecks, Plus, Zap } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { daysBetween } from '@/types/taskGame';
import { TASK_PRIORITY_LABEL, formatTime, type PersonalTask } from '@/types/task';
import { PRIORITY_STYLE } from './taskStyle';
import XpBadge from './XpBadge';
import { PLAIN_SKIN, type TaskSkin } from './taskSkins';

/**
 * The queue: every open task as one numbered list, DankQuest-style. #1 is
 * whatever the person put first; up and down arrows move a task, and the
 * numbers are positions, so they always read 1, 2, 3 with no gaps. The task
 * to do next (upNextTask() — the closest deadline) is marked wherever it sits.
 */
export default function TaskQueue({
  queue,
  shown,
  done,
  upNextId,
  today,
  playing,
  skin = PLAIN_SKIN,
  onOpen,
  onFocus,
  onMove,
  onToggleDone,
  onQuickAdd,
}: {
  /** The whole open queue in order — what the numbers and the arrows go by. */
  queue: PersonalTask[];
  /** Which of them the filter box and the colour tag let through. */
  shown: Set<string>;
  /** Finished tasks to list underneath, when "Show done" is ticked. */
  done: PersonalTask[];
  upNextId: string | null;
  today: string;
  playing: boolean;
  skin?: TaskSkin;
  onOpen: (task: PersonalTask) => void;
  onFocus: (task: PersonalTask) => void;
  onMove: (id: string, by: -1 | 1) => void;
  onToggleDone: (task: PersonalTask) => void;
  onQuickAdd: (title: string) => void;
}) {
  const [text, setText] = useState('');
  const rows = queue.map((t, i) => ({ t, n: i + 1 })).filter(({ t }) => shown.has(t.id));

  return (
    <div className="max-w-3xl">
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onQuickAdd(text.trim());
          setText('');
        }}
      >
        <input
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder="Quick add a task…"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button type="submit" aria-label="Add task" className={`rounded-lg px-3.5 ${skin.button}`}>
          <Plus size={18} />
        </button>
      </form>

      <h2 className={`mb-2 font-semibold text-gray-900 ${skin.heading} ${skin.columnTitleSize ?? 'text-base'}`}>{skin.queue}</h2>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          {queue.length === 0 ? 'Nothing waiting. Add a task above.' : 'Nothing in the queue matches the filter.'}
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map(({ t, n }) => (
            <QueueRow
              key={t.id}
              task={t}
              number={n}
              first={n === 1}
              last={n === queue.length}
              upNext={t.id === upNextId}
              today={today}
              playing={playing}
              skin={skin}
              onOpen={() => onOpen(t)}
              onFocus={() => onFocus(t)}
              onMove={(by) => onMove(t.id, by)}
              onToggleDone={() => onToggleDone(t)}
            />
          ))}
        </ol>
      )}

      {done.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500">Done</h3>
          <ul className="space-y-1.5">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={() => onToggleDone(t)}
                  aria-label={`Reopen ${t.title}`}
                  title="Reopen"
                  className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-green-500 text-white"
                >
                  <Check size={12} strokeWidth={3} />
                </button>
                <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 truncate text-left text-sm text-gray-500 line-through">
                  {t.title}
                </button>
                {playing && <XpBadge task={t} today={today} theme={skin.id} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function QueueRow({
  task, number, first, last, upNext, today, playing, skin, onOpen, onFocus, onMove, onToggleDone,
}: {
  task: PersonalTask;
  number: number;
  first: boolean;
  last: boolean;
  upNext: boolean;
  today: string;
  playing: boolean;
  skin: TaskSkin;
  onOpen: () => void;
  onFocus: () => void;
  onMove: (by: -1 | 1) => void;
  onToggleDone: () => void;
}) {
  const stepsDone = task.steps.filter((s) => s.done).length;
  return (
    <li
      // The up-next row wears the theme's accent; plain, the brand ring.
      className={`group flex items-center gap-3 rounded-xl border bg-white px-3 py-3 ${
        upNext ? (skin.themed ? 'border-transparent' : 'border-brand-500 ring-1 ring-brand-500') : 'border-gray-200'
      }`}
      style={upNext && skin.themed ? { boxShadow: `0 0 0 2px ${skin.accent}` } : undefined}
    >
      <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-sm font-bold ${skin.button}`}>
        #{number}
      </span>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-gray-900">{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          {task.steps.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks size={12} /> {stepsDone}/{task.steps.length} {skin.steps}
            </span>
          )}
          {task.date && <DueChip date={task.date} time={task.time} today={today} />}
          {task.priority !== 'normal' && (
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_STYLE[task.priority]}`}>
              {TASK_PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {playing && <XpBadge task={task} today={today} theme={skin.id} />}
        </span>
      </button>

      {upNext && (
        <span
          className="hidden flex-shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 sm:inline-flex"
          style={skin.themed ? { color: 'var(--tt-accent-ink)' } : undefined}
        >
          <Zap size={12} /> {skin.upNext}
        </span>
      )}

      <span className="flex flex-shrink-0 items-center gap-0.5">
        <button type="button" onClick={onFocus} title="Focus on this task" aria-label="Focus on this task" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <Crosshair size={15} />
        </button>
        <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label="Move up the queue" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30">
          <ChevronUp size={16} />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={last} aria-label="Move down the queue" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30">
          <ChevronDown size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleDone}
          aria-label={`Mark ${task.title} done`}
          title="Mark done"
          className="ml-1 grid h-6 w-6 place-items-center rounded-full border-2 border-gray-300 text-transparent hover:border-green-500 hover:text-green-500"
        >
          <Check size={13} strokeWidth={3} />
        </button>
      </span>
    </li>
  );
}

/**
 * When a task is due, said the way somebody would: "12d overdue", "Due
 * today", "Due tomorrow", "Due in 3d", and the date itself past a week.
 * `label` goes in front ("Step · Due today") where a step's date sits beside
 * its task's and the two would otherwise read the same.
 */
export function DueChip({ date, time, today, label, className = '' }: {
  date: string;
  time?: string | null;
  today: string;
  label?: string;
  className?: string;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const days = daysBetween(today, date);
  const at = time ? ` ${formatTime(time)}` : '';
  const [tone, text] = days < 0
    ? ['bg-red-50 text-red-700', `${-days}d overdue`]
    : days === 0 ? ['bg-amber-50 text-amber-700', `Due today${at}`]
    : days === 1 ? ['bg-gray-100 text-gray-600', `Due tomorrow${at}`]
    : days <= 7 ? ['bg-gray-100 text-gray-600', `Due in ${days}d`]
    : ['bg-gray-100 text-gray-600', `Due ${formatCalendarDate(date)}`];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${tone} ${className}`}>
      <CalendarDays size={10} /> {label && `${label} · `}{text}
    </span>
  );
}
