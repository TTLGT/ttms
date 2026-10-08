'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Columns3, Gamepad2, ListOrdered, Lock, Plus, Route, Search, StickyNote, Table2, X } from 'lucide-react';
import { usePersonalTasks } from '@/lib/personalTasks';
import { useTaskDirectory } from '@/lib/taskContacts';
import { TaskDirectoryProvider } from '@/components/tasks/TaskContacts';
import TaskBoard from '@/components/tasks/TaskBoard';
import TaskNotes from '@/components/tasks/TaskNotes';
import TaskTable from '@/components/tasks/TaskTable';
import TaskEditor from '@/components/tasks/TaskEditor';
import { GameBar, GameFeedback } from '@/components/tasks/TaskGame';
import { ROOM_CLASS, roomCss, skinFor } from '@/components/tasks/taskSkins';
import { THEME_FONT_VARS } from '@/components/tasks/themeFonts';
import ColorTagBar from '@/components/tasks/ColorTagBar';
import TaskQueue from '@/components/tasks/TaskQueue';
import TaskFocus from '@/components/tasks/TaskFocus';
import TaskPath from '@/components/tasks/TaskPath';
import { StreakCard, UpNextCard } from '@/components/tasks/UpNext';
import {
  TASK_COLORS, calendarToday, nextStepOf, placeInQueue, stepWithDone, taskQueue, upNextTask,
  type PersonalTask, type PersonalTaskInput, type TaskColor,
} from '@/types/task';

/**
 * My tasks: the signed-in person's own to-do list, five ways, with the one
 * task to do next always at the top and a focus mode that shrinks the page
 * to a single task.
 *
 * Open to everybody with no permission of its own — it shows only the
 * caller's own list, served by /api/me/tasks. See src/types/task.ts.
 */

type View = 'queue' | 'path' | 'board' | 'notes' | 'table';

const VIEWS: { id: View; label: string; Icon: typeof Columns3 }[] = [
  { id: 'queue', label: 'Queue',        Icon: ListOrdered },
  { id: 'path',  label: 'Path',         Icon: Route },
  { id: 'board', label: 'Board',        Icon: Columns3 },
  { id: 'notes', label: 'Sticky notes', Icon: StickyNote },
  { id: 'table', label: 'Table',        Icon: Table2 },
];

/** Per browser, like a remembered tab anywhere else: which view somebody likes is not worth a write. */
const VIEW_KEY = 'ttms.tasks.view';
/** The task in focus, per browser too, so a reload lands back in focus. Cleared on leaving. */
const FOCUS_KEY = 'ttms.tasks.focus';

export default function MyTasksPage() {
  const {
    tasks, settings, columns, colorLabels, game, streak, notices, error, setError,
    create, update, reschedule, remove, clearDone, move, rankQueue, saveColumns, saveColorLabels, saveGameOptions, dismissNotice,
  } = usePersonalTasks();
  const playing = !!game?.enabled;
  // The theme is the game's costume, and it dresses the whole page: a room
  // in the theme's colours, light, dim or dark to match the app theme, with
  // the banner on top and its accent on the board. With the game off the page is the plain one. See taskSkins.ts.
  const skin = skinFor(playing ? game?.theme : null);
  const [view, setView] = useState<View>('queue');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showDone, setShowDone] = useState(false);
  // The colour tag being filtered on. Not remembered between visits on
  // purpose: a filter that quietly comes back next morning reads as tasks
  // that have gone missing.
  const [tag, setTag] = useState<TaskColor | null>(null);
  const [editing, setEditing] = useState<{ task: PersonalTask | null; initial?: PersonalTaskInput } | null>(null);
  // Read after mount: the server has no idea what day it is where the viewer is.
  const [today, setToday] = useState('');
  // The directory, for the "with @Name" contacts: only once something needs it.
  const { people } = useTaskDirectory(!!editing || (tasks ?? []).some((t) => t.contacts.length > 0));

  useEffect(() => {
    setToday(calendarToday());
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === 'queue' || saved === 'path' || saved === 'board' || saved === 'notes' || saved === 'table') setView(saved);
      setFocusId(window.localStorage.getItem(FOCUS_KEY));
    } catch { /* private window: the queue it is */ }
  }, []);

  const choose = (v: View) => {
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* not worth telling anyone */ }
  };

  const focus = (id: string | null) => {
    setFocusId(id);
    window.scrollTo({ top: 0 });
    try {
      if (id) window.localStorage.setItem(FOCUS_KEY, id);
      else window.localStorage.removeItem(FOCUS_KEY);
    } catch { /* not worth telling anyone */ }
  };

  const onlyTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    // "Clear done" archives rather than deletes: gone from here, still on the calendar.
    return (tasks ?? []).filter((t) =>
      t.kind === 'task' && !t.archived
      && (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)
        || t.steps.some((s) => s.title.toLowerCase().includes(q))
        || t.contacts.some((c) => c.name.toLowerCase().includes(q))
        || t.orders.some((o) => o.number.toLowerCase().includes(q))));
  }, [tasks, query]);

  // The board always has its Done column; the other views hide finished
  // work unless asked, because they have nowhere to park it.
  const visible = view === 'board' || showDone ? onlyTasks : onlyTasks.filter((t) => t.status !== 'done');
  const doneCount = onlyTasks.filter((t) => t.status === 'done').length;
  // Counted before the colour filter, so each chip says what clicking it shows.
  const tagCounts = useMemo(() => {
    const out = Object.fromEntries(TASK_COLORS.map((c) => [c, 0])) as Record<TaskColor, number>;
    for (const t of visible) out[t.color]++;
    return out;
  }, [visible]);
  const shown = tag ? visible.filter((t) => t.color === tag) : visible;

  // The queue is every open task, whatever the filters say: its numbers are
  // positions in the whole of it, and the arrows move a task among all of them.
  const queue = useMemo(() => taskQueue(tasks ?? []), [tasks]);
  const queueIds = queue.map((t) => t.id);
  const placeOf = (id: string) => { const i = queueIds.indexOf(id); return i < 0 ? null : i + 1; };
  const upNext = useMemo(() => upNextTask(tasks ?? []), [tasks]);
  const focused = focusId ? (tasks ?? []).find((t) => t.id === focusId && t.kind === 'task') ?? null : null;

  /**
   * The Done button on the up-next card and in focus: ticks the next step,
   * and on the last one finishes the task with it — one save, so the step
   * and the task land together. With no steps it just finishes the task.
   */
  const advance = (t: PersonalTask) => {
    const step = nextStepOf(t);
    if (!step) { update(t.id, { status: 'done' }); return; }
    const steps = t.steps.map((s) => (s.id === step.id ? stepWithDone(s, true) : s));
    update(t.id, steps.every((s) => s.done) ? { steps, status: 'done' } : { steps });
  };

  const moveInQueue = (id: string, by: -1 | 1) => {
    const i = queueIds.indexOf(id);
    if (i < 0) return;
    rankQueue(placeInQueue(queueIds, id, i + 1 + by));
  };

  const toggleDone = (t: PersonalTask) => update(t.id, { status: t.status === 'done' ? 'todo' : 'done' });

  const save = async (input: PersonalTaskInput, place: number | null) => {
    if (editing?.task) {
      const id = editing.task.id;
      await update(id, input);
      if (place) rankQueue(placeInQueue(queueIds, id, place));
    } else {
      const made = await create(input);
      if (made && place && made.kind === 'task' && made.status !== 'done') {
        rankQueue(placeInQueue([...queueIds, made.id], made.id, place));
      }
    }
    setEditing(null);
  };

  const editor = editing && (
    <TaskEditor
      task={editing.task}
      initial={editing.initial}
      columns={columns}
      colorLabels={colorLabels}
      noChannel={!settings.email && !settings.chat}
      stepWords={{ one: skin.step, many: skin.steps }}
      playing={playing}
      queuePlace={editing.task ? placeOf(editing.task.id) : null}
      queueSize={queue.length}
      onSave={save}
      onDelete={editing.task ? () => { remove(editing.task!.id); setEditing(null); } : undefined}
      onReschedule={editing.task ? async (date, time) => {
        await reschedule(editing.task!.id, { date, time });
        setEditing(null);
      } : undefined}
      onClose={() => setEditing(null)}
    />
  );

  const room = `min-h-full p-4 sm:p-6 lg:p-8 ${THEME_FONT_VARS} ${skin.themed ? `${ROOM_CLASS} ${skin.body}` : ''}`;

  const errorBar = error && (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span className="flex-1">{error}</span>
      <button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );

  // Focus mode: the page is this one task and nothing else until they leave.
  // A task deleted or cleared while in focus simply drops back to the list.
  if (focused && today) {
    return (
      <TaskDirectoryProvider people={people}>
      <div className={room}>
        {skin.themed && <style>{roomCss(skin)}</style>}
        <div className="mx-auto max-w-2xl">{errorBar}</div>
        <TaskFocus
          task={focused}
          number={placeOf(focused.id)}
          today={today}
          columns={columns}
          playing={playing}
          skin={skin}
          upNext={upNext && upNext.id !== focused.id ? upNext : null}
          onUpdate={(input) => update(focused.id, input)}
          onAdvance={advance}
          onEdit={() => setEditing({ task: focused })}
          onExit={() => focus(null)}
          onFocus={(t) => focus(t.id)}
        />
        <GameFeedback notices={notices} theme={game?.theme ?? 'freight'} onDismiss={dismissNotice} />
        {editor}
      </div>
      </TaskDirectoryProvider>
    );
  }

  return (
    <TaskDirectoryProvider people={people}>
    <div className={room}>
      {skin.themed && <style>{roomCss(skin)}</style>}
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className={`${skin.pageTitleSize ?? 'text-2xl'} font-bold text-gray-900 ${skin.heading}`}>My tasks</h1>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
            <Lock size={12} /> Only you can see this list.
            <Link
              href="/dashboard/calendar"
              className="ml-2 inline-flex items-center gap-1 text-brand-700 hover:underline"
              style={skin.themed ? { color: 'var(--tt-accent-ink)' } : undefined}
            >
              <CalendarDays size={13} /> Open the calendar
            </Link>
          </p>
        </div>
        <button
          type="button"
          aria-pressed={playing}
          onClick={() => saveGameOptions({ enabled: !playing })}
          title={playing ? 'Turn game mode off' : 'Earn XP and levels for finishing tasks. Only you see it.'}
          // A quiet outline that does not compete with the accent-filled Add
          // task beside it. The same classes on a themed page: the room
          // retints them, in light, dim and dark alike.
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Gamepad2 size={16} /> Game mode{playing ? ' on' : ''}
        </button>
        <button
          type="button"
          // While a tag is picked, a new task starts in that colour — otherwise
          // it would be saved straight out of sight.
          onClick={() => setEditing({ task: null, initial: tag ? { color: tag } : undefined })}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium ${skin.button}`}
        >
          <Plus size={16} /> Add task
        </button>
      </div>

      {playing && game && (
        <GameBar game={game} skin={skin} onAddSuggestion={(input) => { create(input); }} onOptions={saveGameOptions} />
      )}

      {/* The next thing to do, above every view, so it is the first thing
          anybody sees. The streak sits beside it in both modes — the game's
          own count with game mode on (see StreakCard). */}
      {tasks !== null && today && (
        <div className="mb-5 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <UpNextCard
              task={upNext}
              number={upNext ? placeOf(upNext.id) : null}
              today={today}
              playing={playing}
              skin={skin}
              onAdvance={advance}
              onFocus={(t) => focus(t.id)}
              onOpen={(t) => setEditing({ task: t })}
            />
          </div>
          <StreakCard streak={streak} game={playing ? game : null} skin={skin} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {VIEWS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => choose(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
                view === id ? skin.button : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={14} /> {id === 'queue' ? skin.queue : label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tasks"
            className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {view !== 'board' && view !== 'path' && (
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show done ({doneCount})
          </label>
        )}

        {doneCount > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Clear ${doneCount} finished task${doneCount === 1 ? '' : 's'} off My tasks? They stay on your calendar, on their day.`)) clearDone();
            }}
            className="ml-auto text-sm text-gray-500 hover:text-red-600"
          >
            Clear done
          </button>
        )}
      </div>

      {errorBar}

      <ColorTagBar
        labels={colorLabels}
        counts={tagCounts}
        selected={tag}
        onSelect={setTag}
        onSaveLabels={saveColorLabels}
      />

      {tasks === null || !today ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : view === 'queue' ? (
        <TaskQueue
          queue={queue}
          shown={new Set(shown.map((t) => t.id))}
          done={shown.filter((t) => t.status === 'done')}
          upNextId={upNext?.id ?? null}
          today={today}
          playing={playing}
          skin={skin}
          onOpen={(task) => setEditing({ task })}
          onFocus={(t) => focus(t.id)}
          onMove={moveInQueue}
          onToggleDone={toggleDone}
          onQuickAdd={(title) => { create(tag ? { title, color: tag } : { title }); }}
        />
      ) : view === 'path' ? (
        <TaskPath
          queue={queue}
          columns={columns}
          shown={new Set(shown.map((t) => t.id))}
          upNextId={upNext?.id ?? null}
          today={today}
          playing={playing}
          skin={skin}
          onOpen={(task) => setEditing({ task })}
          onFocus={(t) => focus(t.id)}
          onUpdate={update}
        />
      ) : view === 'board' ? (
        <TaskBoard
          tasks={shown}
          columns={columns}
          skin={skin}
          today={today}
          // Every task in the column, not just what the filter box lets
          // through — a hide moves all of them.
          countIn={(status) => (tasks ?? []).filter((t) => t.kind === 'task' && !t.archived && t.status === status).length}
          onColumnsChange={saveColumns}
          onOpen={(task) => setEditing({ task })}
          onMove={move}
          onUpdate={update}
          onQuickAdd={(input) => { create(tag ? { ...input, color: tag } : input); }}
        />
      ) : view === 'notes' ? (
        <TaskNotes
          tasks={shown}
          columns={columns}
          today={today}
          showXp={playing}
          theme={skin.id}
          stepWord={skin.step}
          onOpen={(task) => setEditing({ task })}
          onMove={move}
          onUpdate={update}
          onToggleDone={toggleDone}
          onAdd={() => setEditing({ task: null, initial: tag ? { color: tag } : undefined })}
        />
      ) : (
        <TaskTable
          tasks={shown}
          columns={columns}
          today={today}
          showXp={playing}
          theme={skin.id}
          stepWord={skin.step}
          onOpen={(task) => setEditing({ task })}
          onUpdate={update}
        />
      )}

      <GameFeedback notices={notices} theme={game?.theme ?? 'freight'} onDismiss={dismissNotice} />

      {editor}
    </div>
    </TaskDirectoryProvider>
  );
}
