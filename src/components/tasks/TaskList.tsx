'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Crosshair, Flag, GripVertical, ListChecks } from 'lucide-react';
import XpBadge from './XpBadge';
import { PLAIN_SKIN, type TaskSkin } from './taskSkins';
import { TaskContactsLine } from './TaskContacts';
import { TaskOrdersLine } from './TaskOrders';
import { TaskWhen } from './TaskQueue';
import type { PersonalTask } from '@/types/task';

/**
 * The Planner's List view (step 5, 2026-11-25): every open task in the one
 * order the person keeps, dragged into place. It replaces three things the
 * old Queue had — a typed queue number, a priority box and the Up next card —
 * with one order and an Urgent flag.
 *
 * The order is the same `rank` the Queue's numbers always were (`taskQueue()`
 * / `byQueue()`), so a task moved here sits in the same place on the old page,
 * in focus mode and on the Path. A drop sends the whole queue to
 * `rankQueue()`, as the arrows did. Arrows stay beside each row for a
 * keyboard and for a phone, where native drag and drop does not work.
 *
 * Urgent is the High priority (what quick add's `!urgent` sets). It is a flag
 * on the row, never a re-sort: the order is the person's.
 */
export default function TaskList({
  queue, shown, done, today, playing, skin = PLAIN_SKIN, onOpen, onFocus, onReorder, onToggleDone,
}: {
  /** The whole open queue in order — what a drop is placed within. */
  queue: PersonalTask[];
  /** Which of them the filter lets through. */
  shown: Set<string>;
  /** Finished tasks underneath, when Show done is ticked. */
  done: PersonalTask[];
  today: string;
  playing: boolean;
  skin?: TaskSkin;
  onOpen: (task: PersonalTask) => void;
  onFocus: (task: PersonalTask) => void;
  /** The whole queue's ids in their new order. */
  onReorder: (ids: string[]) => void;
  onToggleDone: (task: PersonalTask) => void;
}) {
  const ids = queue.map((t) => t.id);
  const rows = queue.filter((t) => shown.has(t.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);

  /** `id` put just before (or after) `target`, in the whole queue — a filtered list still drops into the real order. */
  const placed = (id: string, target: string, after: boolean): string[] => {
    const rest = ids.filter((x) => x !== id);
    const at = rest.indexOf(target);
    if (at < 0) return ids;
    rest.splice(after ? at + 1 : at, 0, id);
    return rest;
  };

  const step = (id: string, by: -1 | 1) => {
    const i = ids.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    onReorder(next);
  };

  return (
    <div className="max-w-3xl" data-tour="tasks-list">
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          {queue.length === 0 ? 'Nothing to do. Add a task above.' : 'No open task matches the filter.'}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((t, i) => {
            const stepsDone = t.steps.filter((s) => s.done).length;
            const line = over?.id === t.id ? (over.after ? 'shadow-[0_2px_0_0_theme(colors.brand.500)]' : 'shadow-[0_-2px_0_0_theme(colors.brand.500)]') : '';
            return (
              <li key={t.id}
                draggable
                onDragStart={(e) => { setDragging(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); }}
                onDragEnd={() => { setDragging(null); setOver(null); }}
                onDragOver={(e) => {
                  if (!dragging || dragging === t.id) return;
                  e.preventDefault();
                  const box = e.currentTarget.getBoundingClientRect();
                  setOver({ id: t.id, after: e.clientY > box.top + box.height / 2 });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && over && dragging !== t.id) onReorder(placed(dragging, t.id, over.after));
                  setDragging(null); setOver(null);
                }}
                {...(i === 0 ? { 'data-tour': 'tasks-row' } : {})}
                className={`group flex items-center gap-2 rounded-xl border bg-white px-2 py-2.5 ${dragging === t.id ? 'opacity-40' : ''} ${
                  t.priority === 'high' ? 'border-red-200' : 'border-gray-200'} ${line}`}>
                <span className="cursor-grab text-gray-300 group-hover:text-gray-500" aria-hidden title="Drag to change the order">
                  <GripVertical size={16} />
                </span>
                <button type="button" onClick={() => onToggleDone(t)} aria-label={`Mark ${t.title} done`} title="Mark done"
                  className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border-2 border-gray-300 text-transparent hover:border-green-500 hover:text-green-500">
                  <Check size={13} strokeWidth={3} />
                </button>
                <div onClick={() => onOpen(t)} className="min-w-0 flex-1 cursor-pointer">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                    {t.priority === 'high' && <Flag size={12} className="self-center text-red-600" aria-label="Urgent" />}
                    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(t); }}
                      className="min-w-0 max-w-full truncate text-left text-sm font-semibold text-gray-900">
                      {t.title}
                    </button>
                    <TaskContactsLine contacts={t.contacts} prefix="with" className="text-xs text-gray-600" />
                    <TaskOrdersLine orders={t.orders} className="text-xs" />
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                    {!t.date && !t.dueDate && <span data-es className="text-gray-400">No day</span>}
                    <TaskWhen task={t} today={today} />
                    {t.steps.length > 0 && (
                      <span className="inline-flex items-center gap-1"><ListChecks size={12} /> {stepsDone}/{t.steps.length}</span>
                    )}
                    {playing && <XpBadge task={t} today={today} theme={skin.id} />}
                  </span>
                </div>
                <span className="flex flex-shrink-0 items-center">
                  <button type="button" onClick={() => onFocus(t)} title="Focus on this task" aria-label="Focus on this task"
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Crosshair size={15} /></button>
                  <button type="button" onClick={() => step(t.id, -1)} disabled={ids[0] === t.id} aria-label="Move up"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"><ChevronUp size={16} /></button>
                  <button type="button" onClick={() => step(t.id, 1)} disabled={ids[ids.length - 1] === t.id} aria-label="Move down"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"><ChevronDown size={16} /></button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {done.length > 0 && (
        <>
          <h3 data-es className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500">Done</h3>
          <ul className="space-y-1.5">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <button type="button" onClick={() => onToggleDone(t)} aria-label={`Reopen ${t.title}`} title="Reopen"
                  className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-green-500 text-white">
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
