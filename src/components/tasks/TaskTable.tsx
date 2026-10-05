'use client';

import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Repeat } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  formatTime,
  isOverdue,
  placeOf,
  withStepToggled,
  type BoardColumn,
  type PersonalTask,
  type PersonalTaskInput,
} from '@/types/task';
import { NOTE_STYLE, PRIORITY_STYLE } from './taskStyle';
import type { GameTheme } from '@/types/taskGame';
import XpBadge from './XpBadge';
import { DueChip } from './TaskQueue';
import { TaskContactsLine } from './TaskContacts';

type SortKey = 'title' | 'contact' | 'status' | 'priority' | 'date' | 'createdAt';

/**
 * The same tasks as rows, for somebody who wants to see everything at once
 * and sort it. Status and priority change in place; anything else opens the
 * editor.
 *
 * A task with steps opens them underneath when its row is clicked, as rows of
 * their own that tick in place. The title still opens the editor, and the
 * selects and boxes keep their own clicks. Which rows are open is not saved.
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
  stepWord = 'step',
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
  /** The theme's word for a step, lower case — see taskSkins.ts. */
  stepWord?: string;
  onOpen: (task: PersonalTask) => void;
  onUpdate: (id: string, input: PersonalTaskInput) => void;
}) {
  const { formatCalendarDate, formatDate } = useDateFormatters();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: 1 });
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const stepLabel = stepWord.charAt(0).toUpperCase() + stepWord.slice(1);
  const toggleOpen = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
      // Like the due date, tasks with nobody on them go last either way round.
      if (key === 'contact') {
        if (!a.contacts.length !== !b.contacts.length) return a.contacts.length ? -1 : 1;
        const c = (a.contacts[0]?.name ?? '').localeCompare(b.contacts[0]?.name ?? '', undefined, { sensitivity: 'base' });
        return c * dir || a.title.localeCompare(b.title);
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
            {header('contact', 'With')}
            {header('status', 'Status')}
            {header('priority', 'Priority')}
            {header('date', 'Due')}
            {header('createdAt', 'Added', 'hidden md:table-cell')}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((t) => {
            const done = t.status === 'done';
            const hasSteps = t.steps.length > 0;
            const expanded = hasSteps && open.has(t.id);
            return (
              <Fragment key={t.id}>
              <tr
                onClick={(e) => {
                  // The row's own controls keep their clicks.
                  if (!hasSteps || (e.target as HTMLElement).closest('button, select, a, input')) return;
                  toggleOpen(t.id);
                }}
                className={`hover:bg-gray-50 ${hasSteps ? 'cursor-pointer' : ''} ${expanded ? 'bg-gray-50' : ''}`}
              >
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
                  <div className="flex items-start gap-1">
                  {hasSteps ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? 'Hide' : 'Show'} ${stepWord}s`}
                      onClick={() => toggleOpen(t.id)}
                      className="-ml-1 mt-0.5 flex flex-shrink-0 items-center rounded text-gray-400 hover:text-gray-700"
                    >
                      <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                  ) : (
                    <span className="-ml-1 w-[14px] flex-shrink-0" />
                  )}
                  <button type="button" onClick={() => onOpen(t)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                    <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${NOTE_STYLE[t.color].swatch}`} />
                    <span className="min-w-0">
                      <span className={`flex items-center gap-1 text-gray-900 hover:underline ${done ? 'line-through text-gray-500' : ''}`}>
                        <span className="truncate">{t.title}</span>
                        {t.repeat !== 'none' && <Repeat size={11} className="flex-shrink-0 text-gray-400" aria-label="Repeats" />}
                        {showXp && <XpBadge task={t} today={today} theme={theme} className="ml-1 flex-shrink-0 no-underline" />}
                      </span>
                      {t.notes && <span className="block truncate text-xs text-gray-500">{t.notes}</span>}
                      {hasSteps && (
                        <span className="block text-xs text-gray-500">
                          {t.steps.filter((x) => x.done).length}/{t.steps.length} {stepWord}s
                        </span>
                      )}
                    </span>
                  </button>
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-700">
                  {t.contacts.length > 0 ? <TaskContactsLine contacts={t.contacts} /> : <span className="text-gray-400">—</span>}
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
              {expanded && t.steps.map((st, n) => (
                <tr key={st.id} className="bg-gray-50">
                  <td />
                  <td colSpan={6} className="py-1.5 pl-8 pr-3">
                    {/* The line down the left joins the steps to their task, as on the board. */}
                    <div className="flex items-center gap-2 border-l-2 border-gray-300 pl-3">
                      <button
                        type="button"
                        aria-label={st.done ? `Untick ${st.title}` : `Tick ${st.title}`}
                        onClick={() => onUpdate(t.id, { steps: withStepToggled(t, st.id) })}
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                          st.done ? 'border-green-600 bg-green-600 text-white' : 'border-gray-400 hover:border-gray-600'
                        }`}
                      >
                        {st.done && <Check size={11} />}
                      </button>
                      <span className="flex-shrink-0 whitespace-nowrap text-xs text-gray-400">{stepLabel} {n + 1}</span>
                      <span className={`min-w-0 truncate ${st.done ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{st.title}</span>
                      {st.date && !st.done && <DueChip date={st.date} today={today} className="flex-shrink-0" />}
                    </div>
                  </td>
                </tr>
              ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
