'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListTodo, Lock, X } from 'lucide-react';
import { usePersonalTasks } from '@/lib/personalTasks';
import TaskCalendar from '@/components/tasks/TaskCalendar';
import TaskEditor from '@/components/tasks/TaskEditor';
import { localToday, type PersonalTask, type PersonalTaskInput } from '@/types/task';

/**
 * My calendar: the signed-in person's own appointments, and their tasks on
 * the day each is due. The same list as My tasks, drawn by date.
 *
 * Open to everybody with no permission of its own — see src/types/task.ts.
 * Not Google Calendar: nothing here is read from or sent to Google.
 */
export default function MyCalendarPage() {
  const { tasks, error, setError, create, update, remove } = usePersonalTasks();
  const [editing, setEditing] = useState<{ task: PersonalTask | null; initial?: PersonalTaskInput } | null>(null);
  const [today, setToday] = useState('');

  useEffect(() => { setToday(localToday()); }, []);

  const save = async (input: PersonalTaskInput) => {
    if (editing?.task) await update(editing.task.id, input);
    else await create(input);
    setEditing(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">My calendar</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-gray-500">
          <Lock size={12} /> Only you can see this. Your appointments, and your tasks on the day they are due.
          <Link href="/dashboard/tasks" className="ml-2 inline-flex items-center gap-1 text-brand-700 hover:underline">
            <ListTodo size={13} /> Open my tasks
          </Link>
        </p>
      </div>

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
      ) : (
        <TaskCalendar
          items={tasks}
          today={today}
          onOpen={(task) => setEditing({ task })}
          onAdd={(initial) => setEditing({ task: null, initial })}
          onUpdate={update}
        />
      )}

      {editing && (
        <TaskEditor
          task={editing.task}
          initial={editing.initial}
          onSave={save}
          onDelete={editing.task ? () => { remove(editing.task!.id); setEditing(null); } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
