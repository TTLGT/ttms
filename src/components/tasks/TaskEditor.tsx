'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import DateField from '@/components/DateField';
import {
  TASK_COLORS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type PersonalTask,
  type PersonalTaskInput,
  type TaskKind,
} from '@/types/task';
import { NOTE_STYLE } from './taskStyle';

/**
 * Add or edit one item. The same dialog for every view, so a task means the
 * same thing wherever it was opened from.
 *
 * It is also the way to move a card on a phone: native drag and drop does not
 * work on touch screens, and the status box here does the same job.
 */
export default function TaskEditor({
  task,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  /** The item being edited; null to add one. */
  task: PersonalTask | null;
  /** Starting values for a new item — the column or the day it was added from. */
  initial?: PersonalTaskInput;
  onSave: (input: PersonalTaskInput) => Promise<void> | void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const start = task ?? initial ?? {};
  const [kind, setKind]         = useState<TaskKind>(start.kind ?? 'task');
  const [title, setTitle]       = useState(start.title ?? '');
  const [notes, setNotes]       = useState(start.notes ?? '');
  const [status, setStatus]     = useState(start.status ?? 'todo');
  const [priority, setPriority] = useState(start.priority ?? 'normal');
  const [color, setColor]       = useState(start.color ?? 'yellow');
  const [date, setDate]         = useState(start.date ?? '');
  const [time, setTime]         = useState(start.time ?? '');
  const [endTime, setEndTime]   = useState(start.endTime ?? '');
  const [problem, setProblem]   = useState('');
  const [saving, setSaving]     = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setProblem('Give it a title.'); return; }
    if (kind === 'event' && !date) { setProblem('An appointment needs a date.'); return; }
    if (kind === 'event' && time && endTime && endTime <= time) {
      setProblem('The end time is before the start time.');
      return;
    }
    setSaving(true);
    await onSave({
      kind,
      title: title.trim(),
      notes,
      status: kind === 'event' ? 'todo' : status,
      priority,
      color,
      date: date || null,
      time: time || null,
      endTime: kind === 'event' ? (endTime || null) : null,
    });
    setSaving(false);
  };

  const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
  const label = 'mb-1 block text-xs font-medium text-gray-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={task ? 'Edit item' : 'Add item'}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
      >
        <header className="sticky top-0 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-4">
          <h2 className="flex-1 text-base font-semibold text-gray-900">
            {task ? 'Edit' : 'Add'} {kind === 'event' ? 'appointment' : 'task'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {/* A task is something to finish; an appointment is something to
              turn up to. Only tasks go on the board. */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm">
            {(['task', 'event'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-md px-3 py-1 ${kind === k ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {k === 'task' ? 'Task' : 'Appointment'}
              </button>
            ))}
          </div>
          {kind === 'event' && (
            <p className="-mt-2 text-xs text-gray-500">Appointments show on your calendar only, not on the board.</p>
          )}

          <div>
            <label className={label} htmlFor="task-title">Title</label>
            <input
              id="task-title"
              ref={titleRef}
              value={title}
              maxLength={200}
              onChange={(e) => { setTitle(e.target.value); setProblem(''); }}
              className={input}
              placeholder={kind === 'event' ? 'Call with a client' : 'Send rate confirmation'}
            />
          </div>

          <div>
            <label className={label} htmlFor="task-notes">Notes</label>
            <textarea
              id="task-notes"
              value={notes}
              maxLength={4000}
              rows={4}
              onChange={(e) => setNotes(e.target.value)}
              className={input}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {kind === 'task' && (
              <div>
                <label className={label} htmlFor="task-status">Status</label>
                <select id="task-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={input}>
                  {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={label} htmlFor="task-priority">Priority</label>
              <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className={input}>
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <span className={label}>{kind === 'event' ? 'Date' : 'Due date'}</span>
              <DateField value={date} onChange={setDate} className={input} ariaLabel={kind === 'event' ? 'Date' : 'Due date'} />
            </div>
            <div>
              <label className={label} htmlFor="task-time">{kind === 'event' ? 'Starts' : 'Time'}</label>
              <input id="task-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
            </div>
            {kind === 'event' && (
              <div>
                <label className={label} htmlFor="task-end">Ends</label>
                <input id="task-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={input} />
              </div>
            )}
          </div>

          <div>
            <span className={label}>Colour</span>
            <div className="flex gap-2">
              {TASK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ${NOTE_STYLE[c].swatch} ${
                    color === c ? 'ring-2 ring-brand-600 ring-offset-2' : ''
                  }`}
                />
              ))}
            </div>
          </div>

          {problem && <p className="text-sm text-red-600">{problem}</p>}
        </div>

        <footer className="flex items-center gap-2 border-t border-gray-100 px-5 py-3">
          {task && onDelete && (
            <button
              type="button"
              onClick={() => { if (window.confirm(`Delete "${task.title}"?`)) onDelete(); }}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : task ? 'Save' : 'Add'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
