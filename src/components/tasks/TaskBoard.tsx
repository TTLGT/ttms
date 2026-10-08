'use client';

import { useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { ArrowRight, Bell, CalendarDays, Check, CornerDownRight, Flag, GripVertical, ListChecks, Pencil, Plus, Repeat, StickyNote } from 'lucide-react';
import { useDragAutoScroll } from './useDragAutoScroll';
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
  stepPlacedIn,
  withStepToggled,
  type BoardColumn,
  type PersonalTask,
  type PersonalTaskInput,
  type TaskStatus,
  type TaskStep,
} from '@/types/task';
import { BOARD_STEP_DRAG_TYPE, COLUMN_DRAG_TYPE, NOTE_STYLE, PRIORITY_STYLE, TASK_DRAG_TYPE } from './taskStyle';
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
 * joined to it by a line down the left, moving with it. A step dragged to
 * another column takes that column as its own status (`TaskStep.status`) and
 * is drawn there on its own, under its task's name, until it is dragged back
 * to its task's column. Done ticks it and any other column unticks it — see
 * `stepPlacedIn()`. A finished task folds away the steps still hanging under
 * it, since the Done column is for looking back, not ticking. A placed step
 * has no order of its own: it sits below the column's tasks, in its task's
 * order.
 *
 * Columns drag too, by their header. The two drags carry different payload
 * types, so a card can never be dropped as a column or the other way round.
 *
 * Every column is as tall as the longest one, so a card picked up low in a
 * long column has somewhere to land in a short one, and the page scrolls
 * while a card is held near its top or bottom (useDragAutoScroll). Right-click
 * on a card or a step is the same move without the drag: a "Move to" menu.
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
  /** The right-click menu: where it opened, and the task or step it moves. */
  const [menu, setMenu] = useState<{ x: number; y: number; task: PersonalTask; step: TaskStep | null } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  useDragAutoScroll(boardRef);

  const visible = columns.filter((c) => !c.hidden);
  // A task whose column is hidden or gone is drawn one step back rather than
  // vanishing — see placeOf().
  const board = visible.map((c) => ({
    column: c,
    cards: tasks.filter((t) => placeOf(columns, t.status) === c.id).sort(byOrder),
  }));
  /** Whether a step hangs under its task — in the column its task is drawn in. */
  const hangs = (t: PersonalTask, s: TaskStep) =>
    s.status === null || placeOf(columns, s.status) === placeOf(columns, t.status);
  /** Steps sitting in `status` on their own, away from their tasks. */
  const looseIn = (status: TaskStatus) =>
    [...tasks].sort(byOrder).flatMap((t) => t.steps
      .map((s, i) => ({ task: t, step: s, n: i + 1 }))
      .filter(({ step }) => !hangs(t, step) && placeOf(columns, step.status!) === status));

  const acceptsCard = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE);
  const acceptsColumn = (e: DragEvent) => e.dataTransfer.types.includes(COLUMN_DRAG_TYPE);
  const acceptsStep = (e: DragEvent) => e.dataTransfer.types.includes(BOARD_STEP_DRAG_TYPE);

  const startStepDrag = (e: DragEvent, task: PersonalTask, step: TaskStep) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(BOARD_STEP_DRAG_TYPE, `${task.id}/${step.id}`);
    e.dataTransfer.setData('text/plain', step.title);
  };

  /** A step dropped anywhere in a column: only the column matters, not the spot. */
  const dropStep = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setTarget(null);
    const [taskId, stepId] = e.dataTransfer.getData(BOARD_STEP_DRAG_TYPE).split('/');
    const task = tasks.find((t) => t.id === taskId);
    const step = task?.steps.find((s) => s.id === stepId);
    if (task && step) moveStep(task, step, status);
  };

  const moveStep = (task: PersonalTask, step: TaskStep, status: TaskStatus) => {
    const next = stepPlacedIn(step, status, placeOf(columns, task.status));
    if (next.status === step.status && next.done === step.done) return;
    onUpdate(task.id, { steps: task.steps.map((s) => (s.id === step.id ? next : s)) });
  };

  /** The menu's move: to the bottom of the column, as a drop on its empty part does. */
  const moveTask = (task: PersonalTask, status: TaskStatus) => {
    if (placeOf(columns, task.status) === status) return;
    const column = board.find((c) => c.column.id === status)?.cards ?? [];
    onMove(task.id, column.filter((t) => t.id !== task.id), null, { status });
  };

  /** The column a task or step is drawn in now — the one the menu ticks. */
  const shownIn = (task: PersonalTask, step: TaskStep | null) =>
    step && !hangs(task, step) ? placeOf(columns, step.status!) : placeOf(columns, task.status);

  const openMenu = (e: ReactMouseEvent, task: PersonalTask, step: TaskStep | null = null) => {
    e.preventDefault();
    e.stopPropagation();
    // The keyboard's menu key (or Shift+F10) fires this with no pointer, at
    // 0,0; open it under the card instead of in the corner of the screen.
    let { clientX: x, clientY: y } = e;
    if (x === 0 && y === 0) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      x = r.left + 12;
      y = r.bottom;
    }
    setMenu({ x, y, task, step });
  };

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
    // items-stretch makes every column as tall as the longest, and the whole
    // column is the drop target, so a short column is never out of reach.
    <div ref={boardRef} className="flex items-stretch gap-4 overflow-x-auto pb-4">
      {board.map(({ column, cards }) => {
        const status = column.id;
        const side = dropSide(status);
        // The badge counts every card drawn in the column, steps included:
        // those hanging under their task (not drawn under a finished one,
        // so not counted there) and those moved here on their own.
        const shown = cards.length
          + cards.reduce((n, t) => n + (t.status === 'done' ? 0 : t.steps.filter((s) => hangs(t, s)).length), 0)
          + looseIn(status).length;
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
              if (!acceptsCard(e) && !acceptsStep(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (target?.status !== status || target.beforeId !== null) setTarget({ status, beforeId: null });
            }}
            onDrop={(e) => (
              acceptsColumn(e) ? dropColumn(e, status) : acceptsStep(e) ? dropStep(e, status) : drop(e, status, null)
            )}
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
              <span className="rounded-full bg-gray-200 px-1.5 text-xs text-gray-600">{shown}</span>
              <GripVertical size={14} className="ml-auto text-gray-300 opacity-0 group-hover:opacity-100" />
            </header>

            {/* Not flex-1: the add button stays under the last card, and the
                stretched space below it is still the section's drop area. */}
            <div className="space-y-2 px-2 pb-2">
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
                    onContextMenu={(e) => openMenu(e, t)}
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
                  {t.status !== 'done' && t.steps.some((s) => hangs(t, s)) && (
                    <StepCards
                      task={t}
                      shows={(s) => hangs(t, s)}
                      onStepDragStart={(e, s) => startStepDrag(e, t, s)}
                      onStepMenu={(e, s) => openMenu(e, t, s)}
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
              {looseIn(status).map(({ task: t, step: s, n }) => (
                <LooseStepCard
                  key={s.id}
                  task={t}
                  step={s}
                  n={n}
                  word={skin.step}
                  today={today}
                  look={`${NOTE_STYLE[t.color].note} ${skin.cardHover}`}
                  onOpen={() => onOpen(t)}
                  onToggle={() => onUpdate(t.id, { steps: withStepToggled(t, s.id) })}
                  onDragStart={(e) => startStepDrag(e, t, s)}
                  onContextMenu={(e) => openMenu(e, t, s)}
                />
              ))}
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

      {menu && (
        <MoveMenu
          x={menu.x}
          y={menu.y}
          title={menu.step ? menu.step.title : menu.task.title}
          columns={visible}
          current={shownIn(menu.task, menu.step)}
          onOpen={() => onOpen(menu.task)}
          onPick={(status) => (menu.step ? moveStep(menu.task, menu.step, status) : moveTask(menu.task, status))}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/**
 * The right-click menu on a card or a step: every column showing, the one it
 * is in ticked, and Open. Picking a column is exactly a drag to it — the same
 * onMove / stepPlacedIn path — so Done still ticks a step and still asks
 * nothing a drag would not.
 *
 * Fixed to the viewport, like the columns panel, because the board scrolls
 * sideways and its overflow would clip anything absolutely placed.
 */
function MoveMenu({
  x, y, title, columns, current, onOpen, onPick, onClose,
}: {
  x: number;
  y: number;
  title: string;
  columns: BoardColumn[];
  current: TaskStatus;
  onOpen: () => void;
  onPick: (status: TaskStatus) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ top: y, left: x });

  // Kept on screen: measured once drawn, then nudged up or left if it would
  // hang off the bottom or the right.
  useEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setAt({
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
    });
    box.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    };
    // Pinned to where the click was; once the page moves it points at nothing.
    const shut = () => onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', keys);
    window.addEventListener('resize', shut);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('blur', shut);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', keys);
      window.removeEventListener('resize', shut);
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('blur', shut);
    };
  }, [onClose]);

  const item = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none disabled:cursor-default disabled:hover:bg-transparent';

  return (
    <div
      ref={box}
      role="menu"
      aria-label={`Move ${title}`}
      style={{ top: at.top, left: at.left }}
      // A right-click on the menu itself should not open the browser's.
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-40 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
    >
      <p className="truncate px-2 pb-1 pt-0.5 text-xs text-gray-500" title={title}>{title}</p>
      <button type="button" role="menuitem" className={item} onClick={() => { onClose(); onOpen(); }}>
        <Pencil size={14} className="text-gray-400" /> Open
      </button>
      <div className="my-1 border-t border-gray-200" />
      <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Move to</p>
      {columns.map((c) => {
        const here = c.id === current;
        return (
          <button
            key={c.id}
            type="button"
            role="menuitem"
            disabled={here}
            onClick={() => { onClose(); onPick(c.id); }}
            className={item}
          >
            <StatusMark status={c.id} theme={null} size="sm" />
            <span className={`flex-1 truncate ${here ? 'font-medium text-gray-900' : ''}`}>{c.label}</span>
            {here ? <Check size={14} className="text-gray-400" /> : <ArrowRight size={14} className="text-gray-300" />}
          </button>
        );
      })}
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
  onContextMenu: (e: ReactMouseEvent) => void;
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
  task, shows, word, today, look, onOpen, onToggle, onStepDragStart, onStepMenu, onDragOver, onDrop,
}: {
  task: PersonalTask;
  /** The steps still hanging here; the rest are drawn in columns of their own. */
  shows: (step: TaskStep) => boolean;
  onStepDragStart: (e: DragEvent, step: TaskStep) => void;
  onStepMenu: (e: ReactMouseEvent, step: TaskStep) => void;
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
      {task.steps.map((s, i) => shows(s) && (
        <li key={s.id} className="relative">
          {/* The tick from the line to the card. */}
          <span className="absolute -left-2 top-1/2 h-0.5 w-2 bg-gray-300" />
          <div
            role="button"
            tabIndex={0}
            draggable
            onDragStart={(e) => onStepDragStart(e, s)}
            onContextMenu={(e) => onStepMenu(e, s)}
            onClick={onOpen}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
            title="Drag to another column to give it a status of its own"
            className={`flex w-full cursor-grab items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs shadow-sm hover:shadow active:cursor-grabbing ${look} ${
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

/**
 * A step sitting in a column away from its task. Its task's name on top is
 * the link back, in place of the line a hanging step has; it keeps the
 * task's colour. Dragging it to its task's column hangs it back under the task.
 */
function LooseStepCard({
  task, step, n, word, today, look, onOpen, onToggle, onDragStart, onContextMenu,
}: {
  task: PersonalTask;
  step: TaskStep;
  /** Its place in its task's list, from 1. */
  n: number;
  word: string;
  today: string;
  look: string;
  onOpen: () => void;
  onToggle: () => void;
  onDragStart: (e: DragEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
}) {
  const label = word.charAt(0).toUpperCase() + word.slice(1);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className={`flex w-full cursor-grab items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs shadow-sm hover:shadow active:cursor-grabbing ${look} ${
        step.done ? 'opacity-60' : ''
      }`}
    >
      <button
        type="button"
        aria-label={step.done ? `Untick ${step.title}` : `Tick ${step.title}`}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`mt-px flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
          step.done ? 'border-green-600 bg-green-600 text-white' : 'border-current opacity-60 hover:opacity-100'
        }`}
      >
        {step.done && <Check size={9} />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[10px] opacity-60">
          <CornerDownRight size={10} className="flex-shrink-0" />
          <span className="truncate">{task.title}</span>
        </span>
        <span className={`block ${step.done ? 'line-through' : ''}`}>{step.title}</span>
        <span className="block text-[10px] opacity-60">{label} {n} of {task.steps.length}</span>
        {step.date && !step.done && <DueChip date={step.date} today={today} className="mt-1" />}
      </span>
    </div>
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
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Escape throws the typed title away, so ask first, as the editor does.
          if (text.trim() && !window.confirm('Discard this new task? What you have typed will be lost.')) return;
          setText(''); setOpen(false);
        }}
        placeholder="Type and press Enter"
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </form>
  );
}
