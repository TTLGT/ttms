'use client';

import { useState, type DragEvent } from 'react';
import { Bell, CalendarDays, GripVertical, Plus, Repeat, StickyNote } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  TASK_PRIORITY_LABEL,
  TASK_REPEAT_LABEL,
  byOrder,
  formatTime,
  isOverdue,
  moveColumn,
  orderBetween,
  placeOf,
  type BoardColumn,
  type PersonalTask,
  type PersonalTaskInput,
  type TaskStatus,
} from '@/types/task';
import { COLUMN_DRAG_TYPE, NOTE_STYLE, PRIORITY_STYLE, TASK_DRAG_TYPE } from './taskStyle';
import StatusMark from './StatusMark';
import BoardColumnsMenu from './BoardColumnsMenu';
import { PLAIN_SKIN, type TaskSkin } from './taskSkins';

/**
 * The Kanban board: one column per status the person has showing, in the
 * order they arranged them, cards dragged between them.
 *
 * Native HTML drag and drop, as the pinned chat lists do — a column is a
 * handful of cards and the browser already draws the ghost and handles
 * Escape. A drop onto a card puts the dragged one before it; a drop onto the
 * empty part of a column puts it at the bottom.
 *
 * Columns drag too, by their header. The two drags carry different payload
 * types, so a card can never be dropped as a column or the other way round.
 */
export default function TaskBoard({
  tasks,
  columns,
  today,
  countIn,
  onOpen,
  onMove,
  onQuickAdd,
  onColumnsChange,
  skin = PLAIN_SKIN,
}: {
  /** Tasks only — events never reach the board. */
  tasks: PersonalTask[];
  /** The whole layout, hidden columns included. */
  columns: BoardColumn[];
  today: string;
  /** How many tasks are in a column, ignoring the filter box — for the "move back" warning. */
  countIn: (status: TaskStatus) => number;
  onOpen: (task: PersonalTask) => void;
  onMove: (id: string, column: PersonalTask[], beforeId: string | null, patch: PersonalTaskInput) => void;
  onQuickAdd: (input: PersonalTaskInput) => void;
  onColumnsChange: (next: BoardColumn[]) => void;
  /** The game theme's look — see taskSkins.ts. Changes how the board looks, never what it does. */
  skin?: TaskSkin;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  /** Where the card would land: the column, and the card it would go before. */
  const [target, setTarget] = useState<{ status: TaskStatus; beforeId: string | null } | null>(null);
  /** The column being dragged by its header, and the one it is over. */
  const [draggingColumn, setDraggingColumn] = useState<TaskStatus | null>(null);
  const [columnOver, setColumnOver] = useState<TaskStatus | null>(null);

  const visible = columns.filter((c) => !c.hidden);
  // A task whose column is hidden or gone is drawn one step back rather than
  // vanishing — see placeOf().
  const board = visible.map((c) => ({
    column: c,
    cards: tasks.filter((t) => placeOf(columns, t.status) === c.id).sort(byOrder),
  }));

  const acceptsCard = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE);
  const acceptsColumn = (e: DragEvent) => e.dataTransfer.types.includes(COLUMN_DRAG_TYPE);

  const drop = (e: DragEvent, status: TaskStatus, beforeId: string | null) => {
    if (!acceptsCard(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    setDragging(null);
    setTarget(null);
    if (!id || id === beforeId) return;

    const card = tasks.find((t) => t.id === id);
    if (!card) return;
    const column = board.find((c) => c.column.id === status)!.cards;
    // Dropped straight back where it was: nothing to save.
    const rest = column.filter((t) => t.id !== id);
    const nextId = beforeId ?? null;
    const wasNext = column[column.findIndex((t) => t.id === id) + 1]?.id ?? null;
    if (card.status === status && column.some((t) => t.id === id) && nextId === wasNext) return;

    onMove(id, rest, beforeId, card.status === status ? {} : { status });
  };

  const dropColumn = (e: DragEvent, targetId: TaskStatus) => {
    if (!acceptsColumn(e)) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(COLUMN_DRAG_TYPE);
    setDraggingColumn(null);
    setColumnOver(null);
    if (!id || id === targetId) return;
    onColumnsChange(moveColumn(columns, id, targetId));
  };

  /** Which side of `id` the drop line goes on — the side moveColumn() will put it. */
  const dropSide = (id: TaskStatus): 'left' | 'right' | null => {
    if (!draggingColumn || columnOver !== id || draggingColumn === id) return null;
    const from = visible.findIndex((c) => c.id === draggingColumn);
    const to = visible.findIndex((c) => c.id === id);
    return from < to ? 'right' : 'left';
  };

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-4">
      {board.map(({ column, cards }) => {
        const status = column.id;
        const side = dropSide(status);
        return (
          <section
            key={status}
            onDragOver={(e) => {
              if (acceptsColumn(e)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (columnOver !== status) setColumnOver(status);
                return;
              }
              if (!acceptsCard(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (target?.status !== status || target.beforeId !== null) setTarget({ status, beforeId: null });
            }}
            onDrop={(e) => (acceptsColumn(e) ? dropColumn(e, status) : drop(e, status, null))}
            // The drop target is a ring rather than a border colour, so it
            // shows over whatever border the theme draws.
            className={`relative flex w-72 flex-shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-50 ${skin.columnTop} ${
              target?.status === status ? 'ring-2 ring-brand-400' : ''
            } ${draggingColumn === status ? 'opacity-40' : ''}`}
          >
            {side && (
              <div className={`absolute inset-y-0 w-1 rounded-full bg-brand-400 ${side === 'left' ? '-left-2.5' : '-right-2.5'}`} />
            )}
            <header
              draggable
              onDragStart={(e) => {
                setDraggingColumn(status);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(COLUMN_DRAG_TYPE, status);
                e.dataTransfer.setData('text/plain', column.label);
              }}
              onDragEnd={() => { setDraggingColumn(null); setColumnOver(null); }}
              title="Drag to move this column"
              className="group flex cursor-grab items-center gap-2 px-3 py-2.5 active:cursor-grabbing"
            >
              <StatusMark status={status} theme={skin.id} />
              <h3 className={`text-sm font-semibold text-gray-900 ${skin.heading}`}>{column.label}</h3>
              <span className="rounded-full bg-gray-200 px-1.5 text-xs text-gray-600">{cards.length}</span>
              <GripVertical size={14} className="ml-auto text-gray-300 opacity-0 group-hover:opacity-100" />
            </header>

            <div className="flex-1 space-y-2 px-2 pb-2">
              {cards.map((t) => (
                <div key={t.id}>
                  {target?.status === status && target.beforeId === t.id && dragging !== t.id && (
                    <div className="mb-2 h-1 rounded-full bg-brand-400" />
                  )}
                  <Card
                    task={t}
                    look={`rounded-lg border-gray-200 bg-white ${skin.cardHover}`}
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
                      if (!acceptsCard(e)) return;
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
              label={skin.addLabel}
              onAdd={(title) => {
                const last = cards[cards.length - 1];
                onQuickAdd({ title, status, order: orderBetween(last?.order ?? null, null) ?? Date.now() });
              }}
            />
          </section>
        );
      })}

      <BoardColumnsMenu columns={columns} theme={skin.id} countIn={countIn} onChange={onColumnsChange} />
    </div>
  );
}

function Card({
  task,
  look,
  today,
  dragging,
  onOpen,
  ...drag
}: {
  task: PersonalTask;
  /** Ground, hairline, corners and hover edge — the hover edge is the theme's accent. */
  look: string;
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
      className={`block w-full cursor-grab border p-3 text-left shadow-sm hover:shadow-md active:cursor-grabbing ${look} ${
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
              {task.reminders.length > 0 && task.status !== 'done' && (
                <Bell size={10} className="ml-0.5" aria-label="Reminder set" />
              )}
              {task.repeat !== 'none' && <Repeat size={10} className="ml-0.5" aria-label={TASK_REPEAT_LABEL[task.repeat]} />}
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

function QuickAdd({ label, onAdd }: { label: string; onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="m-2 mt-0 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
      >
        <Plus size={14} /> {label}
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
