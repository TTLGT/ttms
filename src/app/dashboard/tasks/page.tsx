'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Columns3, Gamepad2, Lock, Plus, Search, StickyNote, Table2, X } from 'lucide-react';
import { usePersonalTasks } from '@/lib/personalTasks';
import TaskBoard from '@/components/tasks/TaskBoard';
import TaskNotes from '@/components/tasks/TaskNotes';
import TaskTable from '@/components/tasks/TaskTable';
import TaskEditor from '@/components/tasks/TaskEditor';
import { GameBar, GameFeedback } from '@/components/tasks/TaskGame';
import { pageStyleFor, skinFor } from '@/components/tasks/taskSkins';
import { THEME_FONT_VARS } from '@/components/tasks/themeFonts';
import { calendarToday, type PersonalTask, type PersonalTaskInput } from '@/types/task';

/**
 * My tasks: the signed-in person's own to-do list, three ways.
 *
 * Open to everybody with no permission of its own — it shows only the
 * caller's own list, served by /api/me/tasks. See src/types/task.ts.
 */

type View = 'board' | 'notes' | 'table';

const VIEWS: { id: View; label: string; Icon: typeof Columns3 }[] = [
  { id: 'board', label: 'Board',        Icon: Columns3 },
  { id: 'notes', label: 'Sticky notes', Icon: StickyNote },
  { id: 'table', label: 'Table',        Icon: Table2 },
];

/** Per browser, like a remembered tab anywhere else: which view somebody likes is not worth a write. */
const VIEW_KEY = 'ttms.tasks.view';

export default function MyTasksPage() {
  const {
    tasks, settings, columns, game, notices, error, setError,
    create, update, remove, clearDone, move, saveColumns, saveGameOptions, dismissNotice,
  } = usePersonalTasks();
  const playing = !!game?.enabled;
  // The theme is the game's costume, and it dresses the whole page: a dark
  // room in the theme's colours, with the banner on top and its accent on the
  // board. With the game off the page is the plain one. See taskSkins.ts.
  const skin = skinFor(playing ? game?.theme : null);
  const [view, setView] = useState<View>('board');
  const [query, setQuery] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<{ task: PersonalTask | null; initial?: PersonalTaskInput } | null>(null);
  // Read after mount: the server has no idea what day it is where the viewer is.
  const [today, setToday] = useState('');

  useEffect(() => {
    setToday(calendarToday());
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === 'board' || saved === 'notes' || saved === 'table') setView(saved);
    } catch { /* private window: the board it is */ }
  }, []);

  const choose = (v: View) => {
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* not worth telling anyone */ }
  };

  const onlyTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tasks ?? []).filter((t) =>
      t.kind === 'task'
      && (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)));
  }, [tasks, query]);

  // The board always has its Done column; the notes and the table hide
  // finished work unless asked, because those two have nowhere to park it.
  const shown = view === 'board' || showDone ? onlyTasks : onlyTasks.filter((t) => t.status !== 'done');
  const doneCount = onlyTasks.filter((t) => t.status === 'done').length;

  const save = async (input: PersonalTaskInput) => {
    if (editing?.task) await update(editing.task.id, input);
    else await create(input);
    setEditing(null);
  };

  return (
    <div
      className={`min-h-full p-4 sm:p-6 lg:p-8 ${THEME_FONT_VARS} ${skin.themed ? `ttms-dark-scope ${skin.body}` : ''}`}
      style={skin.themed ? (pageStyleFor(skin) as React.CSSProperties) : undefined}
    >
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className={`text-2xl font-bold text-gray-900 ${skin.heading}`}>My tasks</h1>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
            <Lock size={12} /> Only you can see this list.
            <Link
              href="/dashboard/calendar"
              className="ml-2 inline-flex items-center gap-1 text-brand-700 hover:underline"
              style={skin.themed ? { color: skin.accent } : undefined}
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
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
            // On a themed page, a quiet outline that does not compete with
            // the accent-filled Add task beside it.
            playing ? 'border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.06)] text-white hover:bg-[rgba(255,255,255,0.12)]' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Gamepad2 size={16} /> Game mode{playing ? ' on' : ''}
        </button>
        <button
          type="button"
          onClick={() => setEditing({ task: null })}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium ${skin.button}`}
        >
          <Plus size={16} /> Add task
        </button>
      </div>

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
              <Icon size={14} /> {label}
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

        {view !== 'board' && (
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show done ({doneCount})
          </label>
        )}

        {doneCount > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete all ${doneCount} finished tasks? Appointments are kept.`)) clearDone();
            }}
            className="ml-auto text-sm text-gray-500 hover:text-red-600"
          >
            Clear done
          </button>
        )}
      </div>

      {playing && game && (
        <GameBar game={game} skin={skin} onAddSuggestion={(input) => { create(input); }} onOptions={saveGameOptions} />
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {tasks === null || !today ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : view === 'board' ? (
        <TaskBoard
          tasks={shown}
          columns={columns}
          skin={skin}
          today={today}
          // Every task in the column, not just what the filter box lets
          // through — a hide moves all of them.
          countIn={(status) => (tasks ?? []).filter((t) => t.kind === 'task' && t.status === status).length}
          onColumnsChange={saveColumns}
          onOpen={(task) => setEditing({ task })}
          onMove={move}
          onQuickAdd={(input) => { create(input); }}
        />
      ) : view === 'notes' ? (
        <TaskNotes
          tasks={shown}
          columns={columns}
          today={today}
          onOpen={(task) => setEditing({ task })}
          onMove={move}
          onToggleDone={(t) => update(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
          onAdd={() => setEditing({ task: null })}
        />
      ) : (
        <TaskTable
          tasks={shown}
          columns={columns}
          today={today}
          onOpen={(task) => setEditing({ task })}
          onUpdate={update}
        />
      )}

      <GameFeedback notices={notices} theme={game?.theme ?? 'freight'} onDismiss={dismissNotice} />

      {editing && (
        <TaskEditor
          task={editing.task}
          initial={editing.initial}
          columns={columns}
          noChannel={!settings.email && !settings.chat}
          onSave={save}
          onDelete={editing.task ? () => { remove(editing.task!.id); setEditing(null); } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
