'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Repeat } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  formatTime,
  isOverdue,
  placeOf,
  type BoardColumn,
  type PersonalTask,
  type PersonalTaskInput,
} from '@/types/task';
import { NOTE_STYLE, PRIORITY_STYLE } from './taskStyle';
import type { GameTheme } from '@/types/taskGame';
import XpBadge from './XpBadge';

type SortKey = 'title' | 'status' | 'priority' | 'date' | 'createdAt';

/**
 * The same tasks as rows, for somebody who wants to see everything at once
 * and sort it. Status and priority change in place; anything else opens the
 * editor.
 *
 * Tasks with no due date sort after the dated ones either way round: "sort by
 * due date" is asking what is coming up, and forty undated rows first would
 * push the answer off the screen.
 */
export default function TaskTable({
  tasks,
  columns,
  today,
  showXp = false,
  theme = null,
  onOpen,
  onUpdate,
}: {
  tasks: PersonalTask[];
  columns: BoardColumn[];
  today: string;
  /** Game mode: each row says what finishing it is worth. */
  showXp?: boolean;
  /** The game theme, for the XP badge's icon. */
  theme?: GameTheme | null;
  onOpen: (task: PersonalTask) => void;
  onUpdate: (id: string, input: PersonalTaskInput) => void;
}) {
  const { formatCalendarDate, formatDate } = useDateFormatters();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: 1 });

  const rows = useMemo(() => {
    const rank = (list: readonly string[], v: string) => list.indexOf(v);
    // Status sorts in the person's own column order, as the board reads left to right.
    const statusOrder = columns.map((c) => c.id);
    return [...tasks].sort((a, b) => {
      const { key, dir } = sort;
      if (key === 'date') {
        if (!a.date !== !b.date) return a.date ? -1 : 1;
        const byDate = ((a.date ?? '') + (a.time ?? '')).localeCompare((b.date ?? '') + (b.time ?? ''));
        return byDate * dir || a.title.localeCompare(b.title);
      }
      let c = 0;
      if (key === 'title') c = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      if (key === 'status') c = rank(statusOrder, placeOf(columns, a.status)) - rank(statusOrder, placeOf(columns, b.status));
      if (key === 'priority') c = rank(TASK_PRIORITIES, b.priority) - rank(TASK_PRIORITIES, a.priority);
      if (key === 'createdAt') c = (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
      return c * dir || a.title.localeCompare(b.title);
    });
  }, [tasks, sort, columns]);

  const header = (key: SortKey, label: string, className = '') => (
    <th className={`px-3 py-2 text-left font-medium ${className}`}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
        className="inline-flex items-center gap-1 hover:text-gray-900"
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  const select = 'rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700';

  if (rows.length === 0) {
    return <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">No tasks to show.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="w-10 px-3 py-2"><span className="sr-only">Done</span></th>
            {header('title', 'Task')}
            {header('status', 'Status')}
            {header('priority', 'Priority')}
            {header('date', 'Due')}
            {header('createdAt', 'Added', 'hidden md:table-cell')}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((t) => {
            const done = t.status === 'done';
            return (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-label={done ? 'Mark as not done' : 'Mark as done'}
                    onClick={() => onUpdate(t.id, { status: done ? 'todo' : 'done' })}
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      done ? 'border-green-600 bg-green-600 text-white' : 'border-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {done && <Check size={11} />}
                  </button>
                </td>
                <td className="max-w-md px-3 py-2">
                  <button type="button" onClick={() => onOpen(t)} className="flex w-full items-start gap-2 text-left">
                    <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${NOTE_STYLE[t.color].swatch}`} />
                    <span className="min-w-0">
                      <span className={`flex items-center gap-1 text-gray-900 hover:underline ${done ? 'line-through text-gray-500' : ''}`}>
                        <span className="truncate">{t.title}</span>
                        {t.repeat !== 'none' && <Repeat size={11} className="flex-shrink-0 text-gray-400" aria-label="Repeats" />}
                        {showXp && <XpBadge task={t} today={today} theme={theme} className="ml-1 flex-shrink-0 no-underline" />}
                      </span>
                      {t.notes && <span className="block truncate text-xs text-gray-500">{t.notes}</span>}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2">
                  <select
                    aria-label="Status"
                    value={placeOf(columns, t.status)}
                    onChange={(e) => onUpdate(t.id, { status: e.target.value as PersonalTask['status'] })}
                    className={select}
                  >
                    {columns.filter((c) => !c.hidden).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    aria-label="Priority"
                    value={t.priority}
                    onChange={(e) => onUpdate(t.id, { priority: e.target.value as PersonalTask['priority'] })}
                    className={`${select} ${PRIORITY_STYLE[t.priority]}`}
                  >
                    {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
                  </select>
                </td>
                <td className={`whitespace-nowrap px-3 py-2 ${isOverdue(t, today) ? 'font-medium text-red-700' : 'text-gray-700'}`}>
                  {t.date ? `${formatCalendarDate(t.date)}${t.time ? ` ${formatTime(t.time)}` : ''}` : '—'}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-gray-500 md:table-cell">{formatDate(t.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
