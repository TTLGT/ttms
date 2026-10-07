'use client';

import { useState, type DragEvent } from 'react';
import { Bell, CalendarDays, Check, Flag, GripVertical, ListChecks, Plus, Repeat, StickyNote } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import OutcomeBadge from './OutcomeBadge';
import {
  TASK_PRIORITY_LABEL,
  byOrder,
  outcomeOf,
  repeatText,
  timeRange,
  formatTime,
  isOverdue,
  moveColumn,
  orderBetween,
  placeOf,
  withStepToggled,
  type BoardColumn,
  type PersonalTask,
  type PersonalTaskInput,
  type TaskStatus,
} from '@/types/task';
import { COLUMN_DRAG_TYPE, NOTE_STYLE, PRIORITY_STYLE, TASK_DRAG_TYPE } from './taskStyle';
import StatusMark from './StatusMark';
import type { GameTheme } from '@/types/taskGame';
import XpBadge from './XpBadge';
import BoardColumnsMenu from './BoardColumnsMenu';
import { DueChip } from './TaskQueue';
import { TaskContactsLine } from './TaskContacts';
import { TaskOrdersLine } from './TaskOrders';
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
 * A task's steps are cards of their own, hung under it in its colour and
 * joined to it by a line down the left. They have no status of their own, so
 * they sit in their task's column and move with it; a finished task folds its
 * steps away, since the Done column is for looking back, not ticking.
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
  onUpdate,
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
  /** Ticking a step on its own card. */
  onUpdate: (id: string, input: PersonalTaskInput) => void;
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
              <h3 className={`${skin.columnTitleSize ?? 'text-sm'} font-semibold text-gray-900 ${skin.heading}`}>{column.label}</h3>
              <span className="rounded-full bg-gray-200 px-1.5 text-xs text-gray-600">{cards.length}</span>
              <GripVertical size={14} className="ml-auto text-gray-300 opacity-0 group-hover:opacity-100" />
            </header>

            <div className="flex-1 space-y-2 px-2 pb-2">
              {cards.map((t, i) => (
                <div key={t.id} className={dragging === t.id ? 'opacity-40' : ''}>
                  {target?.status === status && target.beforeId === t.id && dragging !== t.id && (
                    <div className="mb-2 h-1 rounded-full bg-brand-400" />
                  )}
                  <Card
                    task={t}
                    look={`rounded-lg ${NOTE_STYLE[t.color].note} ${skin.cardHover}`}
                    today={today}
                    // Game mode is what puts a theme on the board.
                    showXp={skin.themed}
                    theme={skin.id}
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
                  {t.status !== 'done' && t.steps.length > 0 && (
                    <StepCards
                      task={t}
                      word={skin.step}
                      today={today}
                      look={`${NOTE_STYLE[t.color].note} ${skin.cardHover}`}
                      onOpen={() => onOpen(t)}
                      onToggle={(stepId) => onUpdate(t.id, { steps: withStepToggled(t, stepId) })}
                      // A drop on a step lands after the whole task, before
                      // the next one — never between a task and its steps.
                      onDragOver={(e) => {
                        if (!acceptsCard(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        const after = cards[i + 1]?.id ?? null;
                        if (target?.status !== status || target.beforeId !== after) setTarget({ status, beforeId: after });
                      }}
                      onDrop={(e) => drop(e, status, cards[i + 1]?.id ?? null)}
                    />
                  )}
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
  showXp,
  theme,
  onOpen,
  ...drag
}: {
  task: PersonalTask;
  /**
   * Ground, hairline, ink, corners and hover edge. The ground is the colour
   * the person picked for the task; the hover edge is the theme's accent.
   */
  look: string;
  today: string;
  showXp: boolean;
  theme: GameTheme | null;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const overdue = isOverdue(task, today);
  return (
    // A div acting as a button rather than a <button>, because the "@Name"
    // chips inside it are buttons of their own and a button cannot hold one.
    <div
      role="button"
      tabIndex={0}
      draggable
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      {...drag}
      className={`block w-full cursor-grab border p-3 text-left shadow-sm hover:shadow-md active:cursor-grabbing ${look}`}
    >
      <div className="flex items-start gap-2">
        {/* The card is the task's colour, so the dot is free to say where it
            stands — the same ring its column header wears. */}
        <span className="mt-1 flex">
          <StatusMark status={task.status} theme={null} size="sm" />
        </span>
        <span className={`flex-1 text-sm ${outcomeOf(task) === 'done' ? 'line-through opacity-60' : outcomeOf(task) ? 'opacity-70' : ''}`}>
          {task.title}
          <OutcomeBadge task={task} className="ml-1 align-middle" />
        </span>
      </div>
      <TaskContactsLine contacts={task.contacts} prefix="with" className="mt-0.5 pl-[1.125rem] text-xs" />
      <TaskOrdersLine orders={task.orders} className="mt-0.5 pl-[1.125rem] text-xs" />
      {task.notes && (
        <p className="mt-1 line-clamp-2 pl-[1.125rem] text-xs opacity-75">
          <StickyNote size={10} className="mr-1 inline" />{task.notes}
        </p>
      )}
      {(task.date || task.dueDate || task.priority !== 'normal' || showXp || task.steps.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[1.125rem]">
          {task.date && (
            // The planned day. Red only when there is no deadline, which is
            // when the planned day stands in for one (deadlineOf()).
            <span title="Planned for" className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
              overdue && !task.dueDate ? 'bg-red-50 text-red-700' : task.date === today ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-600'
            }`}>
              <CalendarDays size={10} />
              {task.date === today ? 'Today' : formatCalendarDate(task.date)}
              {task.time && ` ${timeRange(task)}`}
              {task.reminders.length > 0 && task.status !== 'done' && (
                <Bell size={10} className="ml-0.5" aria-label="Reminder set" />
              )}
              {task.repeat !== 'none' && <Repeat size={10} className="ml-0.5" aria-label={repeatText(task)}><title>{repeatText(task)}</title></Repeat>}
            </span>
          )}
          {task.dueDate && (
            <span title="Due by" className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
              overdue ? 'bg-red-50 text-red-700' : task.dueDate === today ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
            }`}>
              <Flag size={10} />
              Due {task.dueDate === today ? 'today' : formatCalendarDate(task.dueDate)}
              {task.dueTime && ` ${formatTime(task.dueTime)}`}
            </span>
          )}
          {task.priority !== 'normal' && (
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_STYLE[task.priority]}`}>
              {TASK_PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {task.steps.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
              <ListChecks size={10} /> {task.steps.filter((s) => s.done).length}/{task.steps.length}
            </span>
          )}
          {showXp && <XpBadge task={task} today={today} theme={theme} />}
        </div>
      )}
    </div>
  );
}

/**
 * A task's steps as small cards under it. The line down the left and the
 * shared colour are the link; each card names its place ("Step 2 of 4") in
 * the theme's own word. Ticking is the box; anywhere else opens the task,
 * where steps are added, renamed and reordered.
 */
function StepCards({
  task, word, today, look, onOpen, onToggle, onDragOver, onDrop,
}: {
  task: PersonalTask;
  today: string;
  /** The theme's word for a step, lower case — see taskSkins.ts. */
  word: string;
  look: string;
  onOpen: () => void;
  onToggle: (stepId: string) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const label = word.charAt(0).toUpperCase() + word.slice(1);
  return (
    <ol
      onDragOver={onDragOver}
      onDrop={onDrop}
      aria-label={`${label}s of ${task.title}`}
      className="ml-3 mt-1 space-y-1 border-l-2 border-gray-300 pl-2"
    >
      {task.steps.map((s, i) => (
        <li key={s.id} className="relative">
          {/* The tick from the line to the card. */}
          <span className="absolute -left-2 top-1/2 h-0.5 w-2 bg-gray-300" />
          <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
            className={`flex w-full cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs shadow-sm hover:shadow ${look} ${
              s.done ? 'opacity-60' : ''
            }`}
          >
            <button
              type="button"
              aria-label={s.done ? `Untick ${s.title}` : `Tick ${s.title}`}
              onClick={(e) => { e.stopPropagation(); onToggle(s.id); }}
              className={`mt-px flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                s.done ? 'border-green-600 bg-green-600 text-white' : 'border-current opacity-60 hover:opacity-100'
              }`}
            >
              {s.done && <Check size={9} />}
            </button>
            <span className="min-w-0 flex-1">
              <span className={`block ${s.done ? 'line-through' : ''}`}>{s.title}</span>
              <span className="block text-[10px] opacity-60">{label} {i + 1} of {task.steps.length}</span>
              {s.date && !s.done && <DueChip date={s.date} today={today} className="mt-1" />}
            </span>
          </div>
        </li>
      ))}
    </ol>
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
