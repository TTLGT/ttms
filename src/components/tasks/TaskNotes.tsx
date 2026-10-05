'use client';

import { useState, type DragEvent } from 'react';
import { Check, Plus, Repeat } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  byOrder,
  formatTime,
  isOverdue,
  statusLabel,
  type BoardColumn,
  type PersonalTask,
  type PersonalTaskInput,
} from '@/types/task';
import { NOTE_STYLE, TASK_DRAG_TYPE } from './taskStyle';
import StatusMark from './StatusMark';
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
 * Dragged into a new place, a note keeps the same `order` the board uses, so
 * two tasks swapped here are swapped in their board column as well — one
 * position per task rather than a second ordering to keep in step.
 */
export default function TaskNotes({
  tasks,
  columns,
  today,
  showXp = false,
  onOpen,
  onMove,
  onToggleDone,
  onAdd,
}: {
  tasks: PersonalTask[];
  columns: BoardColumn[];
  today: string;
  /** Game mode: each note says what finishing it is worth. */
  showXp?: boolean;
  onOpen: (task: PersonalTask) => void;
  onMove: (id: string, group: PersonalTask[], beforeId: string | null, patch: PersonalTaskInput) => void;
  onToggleDone: (task: PersonalTask) => void;
  onAdd: () => void;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const notes = [...tasks].sort(byOrder);

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
        return (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => {
              setDragging(t.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
              e.dataTransfer.setData('text/plain', t.title);
            }}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            onDragOver={(e) => {
              if (!accepts(e)) return;
              e.preventDefault();
              e.stopPropagation();
              if (over !== t.id) setOver(t.id);
            }}
            onDrop={(e) => drop(e, t.id)}
            onClick={() => onOpen(t)}
            className={`group relative flex min-h-[6rem] cursor-grab flex-col rounded-sm border p-4 shadow-md transition-transform hover:rotate-0 hover:shadow-lg active:cursor-grabbing ${
              NOTE_STYLE[t.color].note
            } ${tilt} ${dragging === t.id ? 'opacity-40' : ''} ${
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
              {showXp && <XpBadge task={t} today={today} className="ml-auto" />}
            </div>
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
