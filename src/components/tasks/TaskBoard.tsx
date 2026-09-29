'use client';

import { useState, type DragEvent } from 'react';
import { CalendarDays, Plus, StickyNote } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  byOrder,
  formatTime,
  isOverdue,
  orderBetween,
  type PersonalTask,
  type PersonalTaskInput,
  type TaskStatus,
} from '@/types/task';
import { NOTE_STYLE, PRIORITY_STYLE, STATUS_DOT, TASK_DRAG_TYPE } from './taskStyle';

/**
 * The Kanban board: one column per status, cards dragged between them.
 *
 * Native HTML drag and drop, as the pinned chat lists do — a column is a
 * handful of cards and the browser already draws the ghost and handles
 * Escape. A drop onto a card puts the dragged one before it; a drop onto the
 * empty part of a column puts it at the bottom.
 */
export default function TaskBoard({
  tasks,
  today,
  onOpen,
  onMove,
  onQuickAdd,
}: {
  /** Tasks only — events never reach the board. */
  tasks: PersonalTask[];
  today: string;
  onOpen: (task: PersonalTask) => void;
  onMove: (id: string, column: PersonalTask[], beforeId: string | null, patch: PersonalTaskInput) => void;
  onQuickAdd: (input: PersonalTaskInput) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  /** Where the card would land: the column, and the card it would go before. */
  const [target, setTarget] = useState<{ status: TaskStatus; beforeId: string | null } | null>(null);

  const columns = TASK_STATUSES.map((status) => ({
    status,
    cards: tasks.filter((t) => t.status === status).sort(byOrder),
  }));

  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE);

  const drop = (e: DragEvent, status: TaskStatus, beforeId: string | null) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    setDragging(null);
    setTarget(null);
    if (!id || id === beforeId) return;

    const card = tasks.find((t) => t.id === id);
    if (!card) return;
    const column = columns.find((c) => c.status === status)!.cards;
    // Dropped straight back where it was: nothing to save.
    const rest = column.filter((t) => t.id !== id);
    const nextId = beforeId ?? null;
    const wasNext = column[column.findIndex((t) => t.id === id) + 1]?.id ?? null;
    if (card.status === status && column.some((t) => t.id === id) && nextId === wasNext) return;

    onMove(id, rest, beforeId, card.status === status ? {} : { status });
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(({ status, cards }) => (
        <section
          key={status}
          onDragOver={(e) => {
            if (!accepts(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (target?.status !== status || target.beforeId !== null) setTarget({ status, beforeId: null });
          }}
          onDrop={(e) => drop(e, status, null)}
          className={`flex w-72 flex-shrink-0 flex-col rounded-xl border bg-gray-50 ${
            target?.status === status ? 'border-brand-400' : 'border-gray-200'
          }`}
        >
          <header className="flex items-center gap-2 px-3 py-2.5">
            <span className={`h-3 w-3 rounded-full border-2 ${STATUS_DOT[status]}`} />
            <h3 className="text-sm font-semibold text-gray-900">{TASK_STATUS_LABEL[status]}</h3>
            <span className="rounded-full bg-gray-200 px-1.5 text-xs text-gray-600">{cards.length}</span>
          </header>

          <div className="flex-1 space-y-2 px-2 pb-2">
            {cards.map((t) => (
              <div key={t.id}>
                {target?.status === status && target.beforeId === t.id && dragging !== t.id && (
                  <div className="mb-2 h-1 rounded-full bg-brand-400" />
                )}
                <Card
                  task={t}
                  today={today}
                  dragging={dragging === t.id}
                  onOpen={() => onOpen(t)}
                  onDragStart={(e) => {
                    setDragging(t.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
                    // Firefox will not start a drag without a plain-text payload.
                    e.dataTransfer.setData('text/plain', t.title);
                  }}
                  onDragEnd={() => { setDragging(null); setTarget(null); }}
                  onDragOver={(e) => {
                    if (!accepts(e)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (target?.status !== status || target.beforeId !== t.id) setTarget({ status, beforeId: t.id });
                  }}
                  onDrop={(e) => drop(e, status, t.id)}
                />
              </div>
            ))}
            {target?.status === status && target.beforeId === null && dragging && (
              <div className="h-1 rounded-full bg-brand-400" />
            )}
          </div>

          <QuickAdd
            onAdd={(title) => {
              const last = cards[cards.length - 1];
              onQuickAdd({ title, status, order: orderBetween(last?.order ?? null, null) ?? Date.now() });
            }}
          />
        </section>
      ))}
    </div>
  );
}

function Card({
  task,
  today,
  dragging,
  onOpen,
  ...drag
}: {
  task: PersonalTask;
  today: string;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const overdue = isOverdue(task, today);
  return (
    <button
      type="button"
      draggable
      onClick={onOpen}
      {...drag}
      className={`block w-full cursor-grab rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm hover:border-gray-300 active:cursor-grabbing ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${NOTE_STYLE[task.color].swatch}`} />
        <span className={`flex-1 text-sm text-gray-900 ${task.status === 'done' ? 'line-through text-gray-500' : ''}`}>
          {task.title}
        </span>
      </div>
      {task.notes && (
        <p className="mt-1 line-clamp-2 pl-[1.125rem] text-xs text-gray-500">
          <StickyNote size={10} className="mr-1 inline" />{task.notes}
        </p>
      )}
      {(task.date || task.priority !== 'normal') && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[1.125rem]">
          {task.date && (
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
              overdue ? 'bg-red-50 text-red-700' : task.date === today ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
            }`}>
              <CalendarDays size={10} />
              {task.date === today ? 'Today' : formatCalendarDate(task.date)}
              {task.time && ` ${formatTime(task.time)}`}
            </span>
          )}
          {task.priority !== 'normal' && (
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_STYLE[task.priority]}`}>
              {TASK_PRIORITY_LABEL[task.priority]}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="m-2 mt-0 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
      >
        <Plus size={14} /> Add a task
      </button>
    );
  }
  return (
    <form
      className="m-2 mt-0"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAdd(text.trim());
        // Stays open for the next one: adding three tasks in a row is the
        // common case, and reopening the box each time is two extra clicks.
        setText('');
      }}
    >
      <input
        autoFocus
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (!text.trim()) setOpen(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setText(''); setOpen(false); } }}
        placeholder="Type and press Enter"
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </form>
  );
}
