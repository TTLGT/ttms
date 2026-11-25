'use client';

import { useEffect, useMemo, useState } from 'react';
import { Columns3, Gamepad2, List, Plus, Search, StickyNote, Table2, X } from 'lucide-react';
import { usePersonalTasks } from '@/lib/personalTasks';
import { useReminderEmails } from '@/lib/appSettings';
import { useTaskDirectory } from '@/lib/taskContacts';
import { TaskDirectoryProvider } from '@/components/tasks/TaskContacts';
import TaskBoard from '@/components/tasks/TaskBoard';
import TaskNotes from '@/components/tasks/TaskNotes';
import TaskTable from '@/components/tasks/TaskTable';
import TaskList from '@/components/tasks/TaskList';
import TaskPath from '@/components/tasks/TaskPath';
import TaskFocus from '@/components/tasks/TaskFocus';
import TaskEditor from '@/components/tasks/TaskEditor';
import ColorTagBar from '@/components/tasks/ColorTagBar';
import { GameBar, GameFeedback } from '@/components/tasks/TaskGame';
import { ROOM_CLASS, roomCss, skinFor } from '@/components/tasks/taskSkins';
import { THEME_FONT_VARS } from '@/components/tasks/themeFonts';
import QuickAdd from './QuickAdd';
import { UrgentOnlyProvider } from '@/components/tasks/UrgentOnly';
import {
  TASK_COLORS, calendarToday, duplicateInput, newBlockInput, nextStepOf, stepWithDone, taskQueue, upNextTask,
  type PersonalTask, type PersonalTaskInput, type TaskColor,
} from '@/types/task';

/**
 * The Planner's Tasks tab (step 5 of the redesign, 2026-11-25): four views of
 * the person's own list — List, Board, Sticky notes, Table — under one add box
 * and one filter, with the side-panel editor.
 *
 * What changed from My tasks, which the old page keeps unchanged:
 *  - **One add box for every view** — the Today tab's quick add, which reads
 *    days, times, `!urgent`, `#load` and `@person`. The Board's per-column add
 *    and the notes' add tile stay, since they say where the task lands.
 *  - **List replaces Queue and Path.** One order, dragged; the Urgent flag
 *    replaces the priority box; no typed queue number and no Up next card
 *    (Today's 3 is the Planner's answer to "what next"). With game mode on, the
 *    List is drawn as the Path — the same queue as a road.
 *  - **The side panel** (`TaskEditor layout="panel"`): the same fields, checks
 *    and save as the window, five things up front and the rest under More.
 *
 * Nothing about the data changed: the same `/api/me/tasks` routes, the same
 * `rank` for the order, the same `priority: 'high'` for Urgent.
 */

type View = 'list' | 'board' | 'notes' | 'table';

const VIEWS: { id: View; label: string; Icon: typeof Columns3 }[] = [
  { id: 'list',  label: 'List',         Icon: List },
  { id: 'board', label: 'Board',        Icon: Columns3 },
  { id: 'notes', label: 'Sticky notes', Icon: StickyNote },
  { id: 'table', label: 'Table',        Icon: Table2 },
];

/** Per browser, like My tasks' own (a different key, so the two pages keep their own choice). */
const VIEW_KEY = 'ttms.planner.tasks.view';
/** The same key as My tasks: a task in focus is in focus on either page. */
const FOCUS_KEY = 'ttms.tasks.focus';

export default function TasksTab() {
  const {
    tasks, settings, columns, colorLabels, game, notices, error, setError,
    create, update, reschedule, remove, clearDone, move, rankQueue, saveColumns, saveColorLabels, saveGameOptions, dismissNotice,
  } = usePersonalTasks();
  const playing = !!game?.enabled;
  const emailsAllowed = useReminderEmails();
  const skin = skinFor(playing ? game?.theme : null);
  const [view, setView] = useState<View>('list');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showDone, setShowDone] = useState(false);
  // Not remembered between visits: a filter that quietly comes back reads as tasks gone missing.
  const [tag, setTag] = useState<TaskColor | null>(null);
  const [editing, setEditing] = useState<{ task: PersonalTask | null; initial?: PersonalTaskInput; copyOf?: PersonalTask } | null>(null);
  const [today, setToday] = useState('');
  const [mentionsWanted, setMentionsWanted] = useState(false);
  const { people } = useTaskDirectory(!!editing || mentionsWanted || (tasks ?? []).some((t) => t.contacts.length > 0));

  useEffect(() => {
    setToday(calendarToday());
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'board' || saved === 'notes' || saved === 'table') setView(saved);
      setFocusId(window.localStorage.getItem(FOCUS_KEY));
    } catch { /* private window: the list it is */ }
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
    return (tasks ?? []).filter((t) =>
      t.kind === 'task' && !t.archived
      && (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)
        || t.steps.some((s) => s.title.toLowerCase().includes(q))
        || t.contacts.some((c) => c.name.toLowerCase().includes(q))
        || t.orders.some((o) => o.number.toLowerCase().includes(q))));
  }, [tasks, query]);

  // The board always has its Done column; the others hide finished work unless asked.
  const visible = view === 'board' || showDone ? onlyTasks : onlyTasks.filter((t) => t.status !== 'done');
  const doneCount = onlyTasks.filter((t) => t.status === 'done').length;
  const tagCounts = useMemo(() => {
    const out = Object.fromEntries(TASK_COLORS.map((c) => [c, 0])) as Record<TaskColor, number>;
    for (const t of visible) out[t.color]++;
    return out;
  }, [visible]);
  const shown = tag ? visible.filter((t) => t.color === tag) : visible;
  const shownIds = new Set(shown.map((t) => t.id));

  const queue = useMemo(() => taskQueue(tasks ?? []), [tasks]);
  const queueIds = queue.map((t) => t.id);
  const placeOf = (id: string) => { const i = queueIds.indexOf(id); return i < 0 ? null : i + 1; };
  const upNext = useMemo(() => upNextTask(tasks ?? []), [tasks]);
  const focused = focusId ? (tasks ?? []).find((t) => t.id === focusId && t.kind === 'task') ?? null : null;

  /** Done in focus: the next step, and on the last one the task with it, in one save. */
  const advance = (t: PersonalTask) => {
    const step = nextStepOf(t);
    if (!step) { update(t.id, { status: 'done' }); return; }
    const steps = t.steps.map((s) => (s.id === step.id ? stepWithDone(s, true) : s));
    update(t.id, steps.every((s) => s.done) ? { steps, status: 'done' } : { steps });
  };

  const toggleDone = (t: PersonalTask) => update(t.id, { status: t.status === 'done' ? 'todo' : 'done' });
  const newInitial = tag ? { color: tag } : undefined;

  const editor = editing && (
    <TaskEditor
      layout="panel"
      key={editing.task?.id ?? (editing.copyOf ? `copy-${editing.copyOf.id}` : 'new')}
      task={editing.task}
      initial={editing.initial}
      copyOf={editing.copyOf?.title}
      columns={columns}
      colorLabels={colorLabels}
      noChannel={!(settings.email && emailsAllowed !== false) && !settings.chat}
      stepWords={{ one: skin.step, many: skin.steps }}
      playing={playing}
      // The panel has no queue-number box: the List's order is dragged.
      onSave={async (input) => {
        if (editing.task) await update(editing.task.id, input);
        else await create(input);
        setEditing(null);
      }}
      onDelete={editing.task ? () => { remove(editing.task!.id); setEditing(null); } : undefined}
      onDuplicate={editing.task ? () => setEditing({ task: null, initial: duplicateInput(editing.task!), copyOf: editing.task! }) : undefined}
      onReschedule={editing.task ? async (date, time) => { await reschedule(editing.task!.id, { date, time }); setEditing(null); } : undefined}
      items={tasks ?? []}
      onScheduleBlock={editing.task?.kind === 'task'
        ? (stepId) => setEditing({ task: null, initial: newBlockInput(editing.task!, stepId, today || calendarToday()) })
        : undefined}
      onAddAndScheduleBlock={editing.task ? undefined : async (input, _place, stepId) => {
        const made = await create(input);
        if (!made || made.kind !== 'task') return;
        setEditing({ task: null, initial: newBlockInput(made, stepId, today || calendarToday()) });
      }}
      onOpenItem={(t) => setEditing({ task: t })}
      onClose={() => setEditing(null)}
    />
  );

  const room = `min-h-full px-4 pb-4 pt-2 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8 ${THEME_FONT_VARS} ${skin.themed ? `${ROOM_CLASS} ${skin.body}` : ''}`;
  const errorBar = error && (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span className="flex-1">{error}</span>
      <button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );

  if (focused && today) {
    return (
      <TaskDirectoryProvider people={people}><UrgentOnlyProvider>
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
      </UrgentOnlyProvider></TaskDirectoryProvider>
    );
  }

  return (
    <TaskDirectoryProvider people={people}><UrgentOnlyProvider>
      <div className={room}>
        {skin.themed && <style>{roomCss(skin)}</style>}
        {playing && game && (
          <GameBar game={game} skin={skin} onAddSuggestion={(input) => { create(input); }} onOptions={saveGameOptions} />
        )}

        {/* One add box above every view. */}
        <div className="mb-4 flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            {today && (
              <QuickAdd today={today} people={people} onWantPeople={() => setMentionsWanted(true)}
                onAdd={create} extra={tag ? { color: tag } : undefined} tourId="tasks-add" />
            )}
          </div>
          <button type="button" onClick={() => setEditing({ task: null, initial: newInitial })}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium ${skin.button}`}>
            <Plus size={16} /> <span data-es>Add with details</span>
          </button>
        </div>

        {/* One filter for every view. */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div data-tour="tasks-views" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {VIEWS.map(({ id, label, Icon }) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => choose(id)} data-es={label}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${view === id ? skin.button : 'text-gray-600 hover:bg-gray-50'}`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <div data-tour="tasks-filter" className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter tasks" aria-label="Filter tasks"
              className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          {view !== 'board' && (
            <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              <span data-es>Show done</span> ({doneCount})
            </label>
          )}
          <button type="button" aria-pressed={playing} onClick={() => saveGameOptions({ enabled: !playing })}
            title={!playing ? 'Earn XP and levels for finishing tasks. Only you see it.' : game?.rules === 'hard' ? 'Under Hard rules, turning it off takes effect the next working day' : 'Turn game mode off'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Gamepad2 size={15} /> <span data-es>{!playing ? 'Game mode' : game?.pendingChange?.to === 'off' ? 'Game mode (turning off)' : 'Game mode on'}</span>
          </button>
          {doneCount > 0 && (
            <button type="button" data-es
              onClick={() => {
                if (window.confirm(`Clear ${doneCount} finished task${doneCount === 1 ? '' : 's'} off your list? They stay on your calendar, on their day.`)) clearDone();
              }}
              className="ml-auto text-sm text-gray-500 hover:text-red-600">
              Clear done
            </button>
          )}
        </div>

        {errorBar}

        <ColorTagBar labels={colorLabels} counts={tagCounts} selected={tag} onSelect={setTag} onSaveLabels={saveColorLabels} />

        {tasks === null || !today ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          </div>
        ) : view === 'list' ? (
          // Game mode's look for the List is the Path: the same queue, as a road.
          playing ? (
            <div data-tour="tasks-list">
              <TaskPath queue={queue} columns={columns} shown={shownIds} upNextId={upNext?.id ?? null} today={today}
                playing={playing} skin={skin} onOpen={(task) => setEditing({ task })} onFocus={(t) => focus(t.id)} onUpdate={update} />
            </div>
          ) : (
            <TaskList queue={queue} shown={shownIds} done={shown.filter((t) => t.status === 'done')} today={today}
              playing={playing} skin={skin} onOpen={(task) => setEditing({ task })} onFocus={(t) => focus(t.id)}
              onReorder={rankQueue} onToggleDone={toggleDone} />
          )
        ) : view === 'board' ? (
          <TaskBoard
            tasks={shown}
            columns={columns}
            skin={skin}
            today={today}
            countIn={(status) => (tasks ?? []).filter((t) => t.kind === 'task' && !t.archived && t.status === status).length}
            onColumnsChange={saveColumns}
            onOpen={(task) => setEditing({ task })}
            onMove={move}
            onUpdate={update}
            onQuickAdd={(input) => { create(tag ? { ...input, color: tag } : input); }}
          />
        ) : view === 'notes' ? (
          <TaskNotes tasks={shown} columns={columns} today={today} showXp={playing} theme={skin.id} stepWord={skin.step}
            onOpen={(task) => setEditing({ task })} onMove={move} onUpdate={update} onToggleDone={toggleDone}
            onAdd={() => setEditing({ task: null, initial: newInitial })} />
        ) : (
          <TaskTable tasks={shown} columns={columns} today={today} showXp={playing} theme={skin.id} stepWord={skin.step}
            onOpen={(task) => setEditing({ task })} onUpdate={update} />
        )}

        <GameFeedback notices={notices} theme={game?.theme ?? 'freight'} onDismiss={dismissNotice} />
        {editor}
      </div>
    </UrgentOnlyProvider></TaskDirectoryProvider>
  );
}
