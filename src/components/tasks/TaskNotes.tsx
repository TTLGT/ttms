'use client';

import { useState, type DragEvent } from 'react';
import { Check, Plus, Repeat } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  byOrder,
  formatTime,
  isOverdue,
  statusLabel,
  withStepToggled,
  type BoardColumn,
  type PersonalTask,
  type PersonalTaskInput,
} from '@/types/task';
import { NOTE_STYLE, TASK_DRAG_TYPE } from './taskStyle';
import StatusMark from './StatusMark';
import type { GameTheme } from '@/types/taskGame';
import XpBadge from './XpBadge';

/**
 * Sticky notes: the same tasks as paper squares on a wall, in the colour
 * each was given.
 *
 * Each note is as tall as what is written on it — a one-line reminder is a
 * small square, a page of notes a tall one — rather than every note the size
 * of the longest. `items-start` is what lets them differ within a row; very
 * long notes still stop at 18 lines, so one essay cannot push the rest of
 * the wall off the screen.
 *
 * A task's steps hang under its note as smaller notes of their own, in the
 * same colour, on a dashed string from the note above — the cluster moves as
 * one. A finished task's steps are folded away, as on the board.
 *
 * Dragged into a new place, a note keeps the same `order` the board uses, so
 * two tasks swapped here are swapped in their board column as well — one
 * position per task rather than a second ordering to keep in step.
 */
export default function TaskNotes({
  tasks,
  columns,
  today,
  showXp = false,
  theme = null,
  stepWord = 'step',
  onOpen,
  onMove,
  onUpdate,
  onToggleDone,
  onAdd,
}: {
  tasks: PersonalTask[];
  columns: BoardColumn[];
  today: string;
  /** Game mode: each note says what finishing it is worth. */
  showXp?: boolean;
  /** The game theme, for the XP badge's icon. */
  theme?: GameTheme | null;
  /** The theme's word for a step, lower case — see taskSkins.ts. */
  stepWord?: string;
  onOpen: (task: PersonalTask) => void;
  onMove: (id: string, group: PersonalTask[], beforeId: string | null, patch: PersonalTaskInput) => void;
  /** Ticking a step on its own note. */
  onUpdate: (id: string, input: PersonalTaskInput) => void;
  onToggleDone: (task: PersonalTask) => void;
  onAdd: () => void;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const notes = [...tasks].sort(byOrder);
  const stepLabel = stepWord.charAt(0).toUpperCase() + stepWord.slice(1);

  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE);

  const drop = (e: DragEvent, beforeId: string | null) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    setDragging(null);
    setOver(null);
    if (!id || id === beforeId) return;
    onMove(id, notes.filter((t) => t.id !== id), beforeId, {});
  };

  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] items-start gap-4"
      onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); setOver(null); } }}
      onDrop={(e) => drop(e, null)}
    >
      {notes.map((t, i) => {
        const done = t.status === 'done';
        // A slight, fixed tilt per note: enough to read as paper on a wall,
        // and the same tilt every visit so nothing wobbles on a reload.
        const tilt = ['-rotate-1', 'rotate-1', 'rotate-0', '-rotate-[0.5deg]', 'rotate-[0.5deg]'][i % 5];
        const steps = done ? [] : t.steps;
        return (
          // The cell is the drop target, so a drop on a task's steps lands
          // before the task, never between it and its steps.
          <div
            key={t.id}
            onDragOver={(e) => {
              if (!accepts(e)) return;
              e.preventDefault();
              e.stopPropagation();
              if (over !== t.id) setOver(t.id);
            }}
            onDrop={(e) => drop(e, t.id)}
            className={dragging === t.id ? 'opacity-40' : ''}
          >
            <div
              draggable
              onDragStart={(e) => {
                setDragging(t.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
                e.dataTransfer.setData('text/plain', t.title);
              }}
              onDragEnd={() => { setDragging(null); setOver(null); }}
              onClick={() => onOpen(t)}
              className={`group relative flex min-h-[6rem] cursor-grab flex-col rounded-sm border p-4 shadow-md transition-transform hover:rotate-0 hover:shadow-lg active:cursor-grabbing ${
                NOTE_STYLE[t.color].note
              } ${tilt} ${
                over === t.id && dragging !== t.id ? 'ring-2 ring-brand-500 ring-offset-2' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                {/* The colour is the note's; the dot says where it stands, the
                    same ring its board column wears. */}
                <span className="mt-1 flex">
                  <StatusMark status={t.status} theme={null} size="sm" />
                </span>
                <p className={`flex-1 font-semibold leading-snug ${done ? 'line-through opacity-60' : ''}`}>{t.title}</p>
                <button
                  type="button"
                  aria-label={done ? 'Mark as not done' : 'Mark as done'}
                  title={done ? 'Mark as not done' : 'Mark as done'}
                  onClick={(e) => { e.stopPropagation(); onToggleDone(t); }}
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                    done ? 'border-green-600 bg-green-600 text-white' : 'border-current opacity-50 hover:opacity-100'
                  }`}
                >
                  {done && <Check size={12} />}
                </button>
              </div>
              {t.notes && (
                <p className="mt-2 line-clamp-[18] whitespace-pre-line text-sm opacity-80">{t.notes}</p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-x-2 pt-3 text-[11px] opacity-70">
                <span>{statusLabel(columns, t.status)}</span>
                {t.date && (
                  <span className={isOverdue(t, today) ? 'font-semibold text-red-700 opacity-100' : ''}>
                    · {t.date === today ? 'Today' : formatCalendarDate(t.date)}{t.time && ` ${formatTime(t.time)}`}
                  </span>
                )}
                {t.priority === 'high' && <span className="font-semibold">· High</span>}
                {t.repeat !== 'none' && <Repeat size={10} aria-label="Repeats" />}
                {t.steps.length > 0 && (
                  <span>· {t.steps.filter((x) => x.done).length}/{t.steps.length} {stepWord}s</span>
                )}
                {showXp && <XpBadge task={t} today={today} theme={theme} className="ml-auto" />}
              </div>
            </div>
            {steps.length > 0 && (
              <ol aria-label={`${stepLabel}s of ${t.title}`} className="ml-5 space-y-0">
                {steps.map((st, n) => (
                  <li key={st.id} className="flex flex-col items-start">
                    {/* The string from the note above. */}
                    <span className="ml-4 h-3 border-l-2 border-dashed border-gray-400" aria-hidden />
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpen(t)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(t); }}
                      className={`flex w-[85%] cursor-pointer items-start gap-2 rounded-sm border p-2.5 text-sm shadow hover:shadow-md ${
                        NOTE_STYLE[t.color].note
                      } ${n % 2 ? 'rotate-[0.5deg]' : '-rotate-[0.5deg]'} ${st.done ? 'opacity-60' : ''}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`block leading-snug ${st.done ? 'line-through' : ''}`}>{st.title}</span>
                        <span className="block text-[10px] opacity-60">{stepLabel} {n + 1} of {steps.length}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={st.done ? `Untick ${st.title}` : `Tick ${st.title}`}
                        onClick={(e) => { e.stopPropagation(); onUpdate(t.id, { steps: withStepToggled(t, st.id) }); }}
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                          st.done ? 'border-green-600 bg-green-600 text-white' : 'border-current opacity-50 hover:opacity-100'
                        }`}
                      >
                        {st.done && <Check size={10} />}
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        className="flex min-h-[6rem] flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50"
      >
        <Plus size={20} /> New note
      </button>
    </div>
  );
}
