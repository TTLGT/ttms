'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, CalendarClock, Trash2, X } from 'lucide-react';
import DateField from '@/components/DateField';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  colorsInUse,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_REPEATS,
  TASK_REPEAT_LABEL,
  NTH_LABEL,
  NTH_LAST,
  WEEKDAY_NAMES,
  HISTORY_AFTER_DAYS,
  REPEAT_ADVICE,
  calendarToday,
  oneMonthAfter,
  repeatsTooLong,
  nthOf,
  outcomeOf,
  type TaskOutcome,
  nthPatternLabel,
  weekdayNumberOf,
  colorLabel,
  leadsFor,
  placeOf,
  reminderInstants,
  reminderLeadLabel,
  type BoardColumn,
  type ColorLabels,
  type EventType,
  type PersonalTask,
  type PersonalTaskInput,
  type TaskKind,
  type TaskContact,
  type TaskOrder,
  type TaskReminderLead,
  type TaskRepeat,
  type TaskStep,
} from '@/types/task';
import { shiftedEnd } from '@/types/planning';
import { EVENT_ICON, NOTE_STYLE } from './taskStyle';
import StepList from './StepList';
import { TaskContactPicker } from './TaskContacts';
import { TaskOrderPicker } from './TaskOrders';

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
  columns,
  colorLabels = {},
  noChannel,
  stepWords = { one: 'step', many: 'steps' },
  queuePlace = null,
  queueSize = 0,
  onSave,
  onDelete,
  onReschedule,
  onClose,
}: {
  /** The item being edited; null to add one. */
  task: PersonalTask | null;
  /** Starting values for a new item — the column or the day it was added from. */
  initial?: PersonalTaskInput;
  /** The person's board columns: the choices in the status box. */
  columns: BoardColumn[];
  /** The person's names for the colours — they are tags. */
  colorLabels?: ColorLabels;
  /** Both reminder channels are off, so a reminder set here would never arrive. */
  noChannel?: boolean;
  /** What the steps are called under the person's theme. */
  stepWords?: { one: string; many: string };
  /** Where an open task sits in the queue now (1-based); null for a new or finished one. */
  queuePlace?: number | null;
  /** How many open tasks the queue holds, not counting a new one. */
  queueSize?: number;
  /** `place` is a new spot in the queue when the person typed one, otherwise null. */
  onSave: (input: PersonalTaskInput, place: number | null) => Promise<void> | void;
  onDelete?: () => void;
  /**
   * Move an open task to another day, leaving it on this one marked
   * Rescheduled. Absent where the page cannot (and for a new task).
   */
  onReschedule?: (date: string, time: string | null) => Promise<void> | void;
  onClose: () => void;
}) {
  const start = task ?? initial ?? {};
  const readOnly = !!task?.fromHistory;
  const [kind, setKind]           = useState<TaskKind>(start.kind ?? 'task');
  const [eventType, setEventType] = useState<EventType>(start.eventType ?? 'call');
  const [title, setTitle]         = useState(start.title ?? '');
  const [notes, setNotes]         = useState(start.notes ?? '');
  const [location, setLocation]   = useState(start.location ?? '');
  const [status, setStatus]       = useState(placeOf(columns, start.status ?? 'todo'));
  // How a closed task ended; see TASK_OUTCOMES. The status box carries it as
  // two extra choices beside the board's columns.
  const [outcome, setOutcome]     = useState<TaskOutcome | null>(task ? outcomeOf(task) : null);
  const [moveTo, setMoveTo]       = useState<{ date: string; time: string } | null>(null);
  const { formatCalendarDate } = useDateFormatters();
  const [priority, setPriority]   = useState(start.priority ?? 'normal');
  const [color, setColor]         = useState(start.color ?? 'yellow');
  const [date, setDate]           = useState(start.date ?? '');
  const [time, setTime]           = useState(start.time ?? '');
  const [endTime, setEndTime]     = useState(start.endTime ?? '');
  // The deadline, apart from the planned day above. A task saved before the
  // two were separate opens with none here, and its planned day still counts
  // as the deadline until one is given (deadlineOf()).
  const [dueDate, setDueDate]     = useState(start.dueDate ?? '');
  const [dueTime, setDueTime]     = useState(start.dueTime ?? '');
  const [reminders, setReminders] = useState<TaskReminderLead[]>(start.reminders ?? []);
  const [repeat, setRepeat]       = useState<TaskRepeat>(start.repeat ?? 'none');
  // monthlyNth: the weekday and which of them. Seeded from the date when the
  // item has none yet, so picking the pattern on the 9th offers "2nd …day".
  const [repeatWeekday, setRepeatWeekday] = useState<number | null>(start.repeatWeekday ?? null);
  const [repeatNths, setRepeatNths]       = useState<number[]>(start.repeatNths ?? []);
  // Every repeat ends. A repeating item from before ends existed opens with a
  // month from its date (or today), the same the server would give it.
  const [repeatUntil, setRepeatUntil]     = useState(
    start.repeatUntil
      ?? (start.repeat && start.repeat !== 'none' ? oneMonthAfter(start.date ?? calendarToday()) : ''),
  );
  const [steps, setSteps]         = useState<TaskStep[]>(start.steps ?? []);
  const [contacts, setContacts]   = useState<TaskContact[]>(start.contacts ?? []);
  const [orders, setOrders]       = useState<TaskOrder[]>(start.orders ?? []);
  // Blank means "leave it where it is" — or, for a new task, the end of the queue.
  const [place, setPlace]         = useState(queuePlace ? String(queuePlace) : '');
  const [problem, setProblem]     = useState('');
  const [saving, setSaving]       = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Everything the person can type or pick, as one string. The first render's
  // copy is what the dialog opened with — the day or column it was added
  // from, or a suggestion's wording — so only what they changed counts.
  const draft = JSON.stringify([
    kind, eventType, title, notes, location, status, priority, color, date, time, endTime,
    dueDate, dueTime, reminders, repeat, repeatWeekday, repeatNths, repeatUntil, steps,
    contacts, orders, place,
  ]);
  const [opened] = useState(draft);

  // Closing without saving throws away whatever was typed, with nothing to
  // undo, and a click outside the window is easy to make by accident. So
  // every way out — outside, Escape, the X and Cancel — asks first once
  // anything has changed. Saving closes through the page, not through here.
  const dismiss = () => {
    if (!readOnly && draft !== opened && !window.confirm(task
      ? 'Discard your changes? This item will stay as it was.'
      : 'Discard this new item? What you have entered will be lost.')) return;
    onClose();
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hasTime = !!time;
  // A planning slot is a task that keeps an end — the length picked on the
  // planning card — so it gets the Ends box an event has. The PATCH route
  // takes an end after the start and otherwise keeps the slot's length.
  const hasEnd = kind === 'event' || (kind === 'task' && !!task?.planning);
  const leads = leadsFor(hasTime);
  // Which of the ticked reminders are already in the past, so the box can say
  // so rather than letting somebody believe a reminder is on its way.
  const instants = reminderInstants({
    kind, status: kind === 'event' ? 'todo' : status, date: date || null, time: time || null, reminders,
    repeat, repeatDay: null, repeatWeekday, repeatNths,
  }, Date.now());
  const nthWeekday = repeatWeekday ?? (date ? weekdayNumberOf(date) : 1);
  const nths = repeatNths.length ? repeatNths : date ? [nthOf(date)] : [1];
  const now = Date.now();

  const toggleLead = (lead: TaskReminderLead, on: boolean) =>
    setReminders((r) => (on ? [...r, lead] : r.filter((l) => l !== lead)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!title.trim()) { setProblem('Give it a title.'); return; }
    if (kind === 'event' && !date) { setProblem('An event needs a date.'); return; }
    if (kind === 'task' && repeat !== 'none' && !date) { setProblem('A repeating task needs a planned date to repeat from.'); return; }
    if (repeat === 'monthlyNth' && !nths.length) { setProblem('Pick at least one week of the month.'); return; }
    if (repeat !== 'none' && !repeatUntil) { setProblem('Pick the day it stops repeating. Nothing repeats for ever.'); return; }
    if (repeat !== 'none' && date && repeatUntil < date) { setProblem('It stops repeating before it starts.'); return; }
    if (hasEnd && time && endTime && endTime <= time) {
      setProblem('The end time is before the start time.');
      return;
    }
    const placeNum = Number(place);
    const placeAt = kind === 'task' && status !== 'done' && place.trim() && Number.isInteger(placeNum) && placeNum >= 1
      && placeNum !== queuePlace ? placeNum : null;
    setSaving(true);
    await onSave({
      kind,
      eventType: kind === 'event' ? eventType : 'other',
      title: title.trim(),
      notes,
      location: location.trim(),
      status: kind === 'event' ? 'todo' : status,
      // A rescheduled one keeps saying so unless the box is changed; only the
      // reschedule button makes one.
      ...(kind === 'task' && status === 'done' && outcome !== 'rescheduled' ? { outcome: outcome ?? 'done' } : {}),
      priority,
      color,
      date: date || null,
      time: time || null,
      endTime: hasEnd ? (endTime || null) : null,
      dueDate: kind === 'task' ? (dueDate || null) : null,
      dueTime: kind === 'task' && dueDate ? (dueTime || null) : null,
      repeat,
      repeatWeekday: repeat === 'monthlyNth' ? nthWeekday : null,
      repeatNths: repeat === 'monthlyNth' ? nths : [],
      repeatUntil: repeat !== 'none' ? repeatUntil : null,
      // Only the leads that apply to what is being saved: a "15 minutes
      // before" ticked while a time was set means nothing once it is cleared.
      reminders: date ? reminders.filter((l) => leads.includes(l)) : [],
      contacts,
      orders,
      ...(kind === 'task' ? { steps } : {}),
    }, placeAt);
    setSaving(false);
  };

  const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
  const label = 'mb-1 block text-xs font-medium text-gray-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={dismiss}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={task ? 'Edit item' : 'Add item'}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        // The window wears the colour picked below, the same classes the board
        // card and the sticky note use, so choosing one previews the card.
        // The inputs keep their own plain ground and stay easy to read on it.
        className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border shadow-xl transition-colors ${NOTE_STYLE[color].note}`}
      >
        {/* The header and footer inherit the window's colour and edge. */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-inherit bg-inherit px-5 py-4">
          <h2 className="flex-1 text-base font-semibold">
            {task ? 'Edit' : 'Add'} {kind === 'event' ? EVENT_TYPE_LABEL[eventType].toLowerCase() : 'task'}
          </h2>
          <button type="button" onClick={dismiss} aria-label="Close" className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </header>

        {/* History is a record: everything shown, nothing changeable. A
            disabled fieldset turns off every control inside it at once. */}
        <fieldset disabled={readOnly} className="min-w-0">
        <div className="space-y-4 px-5 py-4">
          {readOnly && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              From your history — over {HISTORY_AFTER_DAYS} days ago — so it can be read but not changed.
            </p>
          )}
          {/* A task is something to finish; an event is something to turn
              up to. Only tasks go on the board. */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm">
            {(['task', 'event'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-md px-3 py-1 ${kind === k ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {k === 'task' ? 'Task' : 'Event'}
              </button>
            ))}
          </div>

          {kind === 'event' && (
            <div>
              <span className={label}>What sort of event</span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {EVENT_TYPES.map((t) => {
                  const Icon = EVENT_ICON[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={eventType === t}
                      onClick={() => setEventType(t)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                        eventType === t
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon size={13} /> {EVENT_TYPE_LABEL[t]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Events show on your calendar only, not on the board.</p>
            </div>
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

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className={label}>{kind === 'event' ? 'Date' : 'Planned for'}</span>
              <DateField value={date} onChange={setDate} className={input} ariaLabel={kind === 'event' ? 'Date' : 'Planned date'} />
            </div>
            <div>
              <label className={label} htmlFor="task-time">{kind === 'event' ? 'Starts' : 'Time'}</label>
              <input
                id="task-time"
                type="time"
                value={time}
                onChange={(e) => {
                  // The end moves with the start, keeping the length — the
                  // same as dragging the block on the calendar.
                  const next = e.target.value;
                  if (hasEnd && time && endTime && next) setEndTime(shiftedEnd(time, endTime, next) ?? endTime);
                  setTime(next);
                }}
                className={input}
              />
            </div>
            {hasEnd && (
              <div>
                <label className={label} htmlFor="task-end">Ends</label>
                <input id="task-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={input} />
              </div>
            )}
          </div>
          {kind === 'task' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <span className={label}>Due by</span>
                <DateField value={dueDate} onChange={setDueDate} className={input} ariaLabel="Due date" />
              </div>
              <div>
                <label className={label} htmlFor="task-due-time">Due time</label>
                <input id="task-due-time" type="time" value={dueTime} disabled={!dueDate}
                  onChange={(e) => setDueTime(e.target.value)} className={`${input} disabled:opacity-50`} />
              </div>
            </div>
          )}
          <p className="-mt-2 text-xs text-gray-400">
            {kind === 'task'
              ? 'Planned is when you will work on it — it goes on your calendar and reminders count from it. Due is the deadline. With no due date, the planned day counts as the deadline. Times are Guatemala office time.'
              : 'Times are Guatemala office time.'}
          </p>

          {kind === 'event' && (
            <div>
              <label className={label} htmlFor="task-location">
                {eventType === 'online' ? 'Meeting link' : eventType === 'call' ? 'Phone number or who to call' : 'Where'}
              </label>
              <input
                id="task-location"
                value={location}
                maxLength={500}
                onChange={(e) => setLocation(e.target.value)}
                className={input}
                placeholder={eventType === 'online' ? 'https://meet.google.com/…' : ''}
              />
            </div>
          )}

          <div>
            <label className={label} htmlFor="task-notes">Notes</label>
            <textarea
              id="task-notes"
              value={notes}
              maxLength={4000}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
              className={input}
            />
          </div>

          {/* Who it is with, so their number is one click from the task. */}
          <div>
            <span className={label}>With</span>
            <TaskContactPicker value={contacts} onChange={setContacts} inputClass={input} />
          </div>

          {/* The load it is about, so the order is one click from the task. */}
          <div>
            <span className={label}>Order</span>
            <TaskOrderPicker value={orders} onChange={setOrders} inputClass={input} />
          </div>

          {kind === 'task' && (
            <div>
              <span className={`${label} capitalize`}>{stepWords.many}</span>
              <StepList steps={steps} onChange={setSteps} one={stepWords.one} many={stepWords.many} taskDate={dueDate || date || null} />
            </div>
          )}

          {/* ── Reminders ───────────────────────────────────────── */}
          <div>
            <span className={`${label} flex items-center gap-1`}><Bell size={12} /> Remind me</span>
            {!date ? (
              <p className="text-xs text-gray-500">{kind === 'task' ? 'Give it a planned date to set a reminder.' : 'Give it a date to set a reminder.'}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {leads.map((lead) => {
                    const on = reminders.includes(lead);
                    const past = instants[lead] !== undefined && instants[lead]! <= now;
                    return (
                      <button
                        key={lead}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleLead(lead, !on)}
                        title={past ? 'That time has already passed, so this one will not be sent.' : undefined}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                          on
                            ? past ? 'border-gray-300 bg-gray-100 text-gray-500 line-through' : 'border-brand-500 bg-brand-600 text-white'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {reminderLeadLabel(lead, hasTime)}
                      </button>
                    );
                  })}
                </div>
                {kind === 'task' && status === 'done' && reminders.length > 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">A finished task sends no reminders.</p>
                )}
                {noChannel && reminders.length > 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Email and chat are both off for your reminders, so nothing will be sent. Turn one on beside the calendar.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {kind === 'task' && (
              <div>
                <label className={label} htmlFor="task-status">Status</label>
                <select
                  id="task-status"
                  value={status === 'done' && outcome && outcome !== 'done' ? `__${outcome}` : status}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__notdone') { setStatus('done'); setOutcome('notdone'); return; }
                    if (v === '__rescheduled') return;
                    setStatus(v as typeof status);
                    setOutcome(v === 'done' ? 'done' : null);
                  }}
                  className={input}
                >
                  {columns.filter((c) => !c.hidden).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  {/* Closed, but not done: kept on the calendar as a record of the day. */}
                  {task && <option value="__notdone">Not done</option>}
                  {outcome === 'rescheduled' && <option value="__rescheduled" disabled>Rescheduled</option>}
                </select>
                {status === 'done' && outcome === 'notdone' && (
                  <p className="mt-1 text-xs text-gray-500">Closed and kept on your calendar as not done. In game mode it costs XP.</p>
                )}
                {status === 'done' && outcome === 'rescheduled' && task?.rescheduledTo && (
                  <p className="mt-1 text-xs text-gray-500">Moved to {formatCalendarDate(task.rescheduledTo)}; this one stays on its day as a record.</p>
                )}
              </div>
            )}
            <div>
              <label className={label} htmlFor="task-priority">Priority</label>
              <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className={input}>
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
            {kind === 'task' && status !== 'done' && (
              <div>
                <label className={label} htmlFor="task-place">Priority number (place in queue)</label>
                <input
                  id="task-place"
                  type="number"
                  min={1}
                  max={queueSize + (task ? 0 : 1)}
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder={task ? '' : `${queueSize + 1} (the end)`}
                  className={input}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={label} htmlFor="task-repeat">Repeats</label>
              <select
                id="task-repeat"
                value={repeat}
                onChange={(e) => {
                  const next = e.target.value as TaskRepeat;
                  setRepeat(next);
                  // A month, offered every time a repeat is switched on.
                  if (next !== 'none' && !repeatUntil) setRepeatUntil(oneMonthAfter(date || calendarToday()));
                  // A repeat counts on from the planned date, so it needs one;
                  // today is the date somebody setting one up nearly always means.
                  if (next !== 'none' && !date) setDate(calendarToday());
                }}
                className={input}
              >
                {TASK_REPEATS.map((r) => <option key={r} value={r}>{TASK_REPEAT_LABEL[r]}</option>)}
              </select>
              {repeat === 'monthlyNth' && (
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Which weeks">
                    {[1, 2, 3, 4, NTH_LAST].map((n) => {
                      const on = nths.includes(n);
                      return (
                        <button key={n} type="button" aria-pressed={on}
                          onClick={() => setRepeatNths(on ? nths.filter((x) => x !== n) : [...nths, n].sort((a, b) => a - b))}
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                            on ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                          }`}>
                          {NTH_LABEL[n]}
                        </button>
                      );
                    })}
                    <select value={nthWeekday} onChange={(e) => setRepeatWeekday(Number(e.target.value))}
                      aria-label="Weekday" className="ml-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs">
                      {WEEKDAY_NAMES.map((name, i) => <option key={name} value={i}>{name}</option>)}
                    </select>
                  </div>
                  {nths.length > 0 && (
                    <p className="mt-1.5 text-xs text-gray-600">On {nthPatternLabel(nthWeekday, nths)}.</p>
                  )}
                </div>
              )}
              {repeat !== 'none' && (
                <div className="mt-2">
                  <span className={label}>Stops repeating after</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <DateField ariaLabel="Stops repeating after" value={repeatUntil} onChange={setRepeatUntil} className={`${input} max-w-[12rem]`} />
                    {date && repeatsTooLong(date, repeatUntil) && (
                      <button type="button" onClick={() => setRepeatUntil(oneMonthAfter(date))}
                        className="text-xs font-medium text-brand-700 hover:underline">
                        Set it to one month
                      </button>
                    )}
                  </div>
                  {date && repeatsTooLong(date, repeatUntil) ? (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                      <span>{REPEAT_ADVICE}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">
                      Nothing repeats for ever. A month is the most we suggest — renew it then if it still matters.
                    </p>
                  )}
                </div>
              )}
              {repeat !== 'none' && (
                <p className="mt-1.5 text-xs text-gray-500">
                  {kind === 'task'
                    ? 'When you mark it Done, the next one is added to To do with its new planned date, and its due date moves by the same amount.'
                    : 'It shows on every date in the series, starting from the date above. Changes and deleting apply to all of them.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <span className={label}>Colour · <span className="font-semibold">{colorLabel(colorLabels, color)}</span></span>
            <div className="flex flex-wrap gap-2">
              {/* The person's colours, plus the one this task wears if it has since been removed. */}
              {[...colorsInUse(colorLabels), ...(colorsInUse(colorLabels).includes(color) ? [] : [color])].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={colorLabel(colorLabels, c)}
                  title={colorLabel(colorLabels, c)}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ${NOTE_STYLE[c].swatch} ${
                    color === c ? 'ring-2 ring-brand-600 ring-offset-2 ring-offset-transparent' : ''
                  }`}
                />
              ))}
            </div>
          </div>

          {task && onReschedule && !readOnly && kind === 'task' && task.status !== 'done' && (
            <div className="rounded-lg border border-gray-200 p-3">
              {moveTo ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <span className={label}>Move to</span>
                    <DateField ariaLabel="Move to" value={moveTo.date} onChange={(v) => setMoveTo({ ...moveTo, date: v })} className={input} />
                  </div>
                  <div>
                    <label className={label} htmlFor="task-move-time">Time</label>
                    <input id="task-move-time" type="time" value={moveTo.time}
                      onChange={(e) => setMoveTo({ ...moveTo, time: e.target.value })} className={input} />
                  </div>
                  <button type="button" disabled={!moveTo.date || saving}
                    onClick={async () => {
                      setSaving(true);
                      await onReschedule(moveTo.date, moveTo.time || null);
                      setSaving(false);
                    }}
                    className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                    Reschedule
                  </button>
                  <button type="button" onClick={() => setMoveTo(null)}
                    className="rounded-lg px-2 py-2 text-sm text-gray-500 hover:bg-gray-100">
                    Cancel
                  </button>
                  <p className="w-full text-xs text-gray-500">
                    It stays on {task.date ? 'its current day' : 'your calendar'} marked Rescheduled, and carries on from the new day with its steps.
                  </p>
                </div>
              ) : (
                <button type="button" onClick={() => setMoveTo({ date: '', time: time })}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                  <CalendarClock size={14} /> Reschedule to another day
                </button>
              )}
            </div>
          )}

          {problem && <p className="text-sm text-red-600">{problem}</p>}
        </div>
        </fieldset>

        <footer className="flex items-center gap-2 border-t border-inherit px-5 py-3">
          {task && onDelete && !readOnly && (
            <button
              type="button"
              onClick={() => { if (window.confirm(`Delete "${task.title}"?`)) onDelete(); }}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={dismiss} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : task ? 'Save' : 'Add'}
              </button>
            )}
          </div>
        </footer>
      </form>
    </div>
  );
}
