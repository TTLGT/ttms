'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, CheckCircle2, Circle, Clock, CornerDownLeft, Flag, Hash, Inbox, Plus, Search, Sun, User, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePersonalTasks } from '@/lib/personalTasks';
import { useReminderEmails } from '@/lib/appSettings';
import { useTaskDirectory } from '@/lib/taskContacts';
import { getMyPlanningDay } from '@/lib/planning';
import { loadOrderCard } from '@/lib/orderCards';
import { useDateFormatters } from '@/lib/useDateFormatters';
import TaskEditor from '@/components/tasks/TaskEditor';
import { TaskDirectoryProvider } from '@/components/tasks/TaskContacts';
import { GameFeedback } from '@/components/tasks/TaskGame';
import { Bi } from '@/components/spanish/Es';
import { SalesTargetsCard } from './SalesTargets';
import {
  calendarToday, deadlineDay, duplicateInput, formatTime, isOverdue, occursOn,
  type PersonalTask, type PersonalTaskInput, type TaskContact, type TaskOrder,
} from '@/types/task';
import { parseQuickAdd } from '@/types/quickAdd';
import {
  MAX_TODAY_PICKS, canPickForToday, inboxTasks, picksIn, tasksForToday,
} from '@/types/planner';
import type { PlanningDay } from '@/types/planning';
import type { DirectoryPerson } from '@/lib/directory';

/**
 * The Planner's Today tab: the day on one screen.
 *
 *  - **At a glance** — Today's 3 done so far, due today, late, meetings.
 *  - **Today's 3** — the three things that matter most, picked by the person
 *    (src/types/planner.ts). Ticking one off finishes the task itself.
 *  - **Quick add** — one line of plain words, read by parseQuickAdd(), with
 *    chips showing what was understood before anything is saved.
 *  - **The timeline** — working hours (the same shift the planning card
 *    uses) with every timed item on them and a line for now. Worked out from
 *    the list already on screen, so it moves the moment a task does.
 *  - **The inbox** — open tasks with no day, each one tap from having one.
 *
 * Everything is the person's own list through /api/me/tasks; nothing here
 * reads anybody else's. The `data-tour` attributes are what PlannerTour lights.
 */
export default function TodayTab() {
  const store = usePersonalTasks();
  const { tasks, columns, colorLabels, settings, game, notices, dismissNotice, error, setError, create, update, remove, reschedule, todayPicks, saveTodayPicks } = store;
  const { profile } = useAuth();
  const emailsAllowed = useReminderEmails();
  const { formatCalendarDate } = useDateFormatters();
  const [today, setToday] = useState('');
  const [editing, setEditing] = useState<{ task: PersonalTask | null; initial?: PersonalTaskInput; copyOf?: PersonalTask } | null>(null);
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState<PlanningDay | null>(null);
  const [mentionsWanted, setMentionsWanted] = useState(false);
  const { people } = useTaskDirectory(!!editing || mentionsWanted || (tasks ?? []).some((t) => t.contacts.length > 0));

  // The browser's day, read after mount like every task view.
  useEffect(() => { setToday(calendarToday()); }, []);

  // The working hours only: one request, the same the planning card makes.
  useEffect(() => {
    if (!today) return;
    let live = true;
    getMyPlanningDay(today).then((d) => { if (live) setDay(d); }).catch(() => { /* the timeline falls back to the items alone */ });
    return () => { live = false; };
  }, [today]);

  const list = useMemo(() => tasks ?? [], [tasks]);
  const picks = useMemo(() => (today ? picksIn(list, todayPicks, today) : []), [list, todayPicks, today]);
  const inbox = useMemo(() => inboxTasks(list), [list]);
  const dueNow = useMemo(() => (today ? tasksForToday(list, today) : []), [list, today]);
  const lateCount = dueNow.filter((t) => isOverdue(t, today)).length;
  const meetings = useMemo(
    () => (today ? list.filter((t) => t.kind === 'event' && !t.archived && t.inviteResponse !== 'declined' && occursOn(t, today)) : []),
    [list, today],
  );

  const pickIds = picks.map((t) => t.id);
  const setPicks = (ids: string[]) => saveTodayPicks({ date: today, ids });
  const addPick = (id: string) => {
    if (pickIds.includes(id) || pickIds.length >= MAX_TODAY_PICKS) return;
    setPicks([...pickIds, id]);
  };

  const first = profile?.firstName || profile?.displayName?.split(' ')[0] || '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const editor = editing && (
    <TaskEditor
      key={editing.task?.id ?? (editing.copyOf ? `copy-${editing.copyOf.id}` : 'new')}
      task={editing.task}
      initial={editing.initial}
      copyOf={editing.copyOf?.title}
      columns={columns}
      colorLabels={colorLabels}
      noChannel={!(settings.email && emailsAllowed !== false) && !settings.chat}
      playing={!!game?.enabled}
      items={list}
      onSave={async (input) => {
        if (editing.task) await update(editing.task.id, input);
        else await create(input);
        setEditing(null);
      }}
      onDelete={editing.task ? () => { remove(editing.task!.id); setEditing(null); } : undefined}
      onDuplicate={editing.task ? () => setEditing({ task: null, initial: duplicateInput(editing.task!), copyOf: editing.task! }) : undefined}
      onReschedule={editing.task ? async (date, time) => { await reschedule(editing.task!.id, { date, time }); setEditing(null); } : undefined}
      onOpenItem={(t) => setEditing({ task: t })}
      onClose={() => setEditing(null)}
    />
  );

  if (tasks === null || !today) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const doneOfPicks = picks.filter((t) => t.status === 'done').length;

  return (
    <TaskDirectoryProvider people={people}>
      <div className="px-4 pb-8 pt-2 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button>
          </div>
        )}

        {/* At a glance */}
        <div data-tour="glance" className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-gray-200 bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-500">{formatCalendarDate(today)}</p>
            <h2 className="text-2xl font-bold text-gray-900">{greeting}{first ? `, ${first}` : ''}</h2>
          </div>
          <Glance label="Today's 3" value={`${doneOfPicks} of ${picks.length || MAX_TODAY_PICKS}`} tone={picks.length > 0 && doneOfPicks === picks.length ? 'green' : 'brand'} />
          <Glance label="For today" value={String(dueNow.length - lateCount)} tone="brand" />
          <Glance label="Late" value={String(lateCount)} tone={lateCount ? 'red' : 'gray'} />
          <Glance label="Meetings" value={String(meetings.length)} tone="gray" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <QuickAdd today={today} people={people} onWantPeople={() => setMentionsWanted(true)} onAdd={create} />

            {/* Today's 3 */}
            <section data-tour="today3" className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sun size={16} className="text-amber-500" />
                <h3 className="flex-1 text-base font-semibold text-gray-900"><Bi>Today&rsquo;s 3</Bi></h3>
                {picks.length > 0 && picks.length < MAX_TODAY_PICKS && (
                  <button type="button" onClick={() => setPicking(true)} className="text-sm font-medium text-brand-700 hover:underline">
                    Pick another
                  </button>
                )}
              </div>
              {picks.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-gray-200 px-4 py-6 text-center">
                  <p className="text-sm text-gray-600"><Bi>What are the three things that matter most today?</Bi></p>
                  <button type="button" onClick={() => setPicking(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                    <Plus size={15} /> Pick today&rsquo;s 3
                  </button>
                </div>
              ) : (
                <ol className="space-y-2">
                  {picks.map((t, i) => (
                    <PickRow key={t.id} n={i + 1} task={t} today={today}
                      onToggle={() => update(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
                      onOpen={() => setEditing({ task: t })}
                      onRemove={() => setPicks(pickIds.filter((id) => id !== t.id))}
                    />
                  ))}
                  {Array.from({ length: MAX_TODAY_PICKS - picks.length }, (_, i) => (
                    <li key={`empty-${i}`}>
                      <button type="button" onClick={() => setPicking(true)}
                        className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-gray-200 px-3 py-2.5 text-left text-sm text-gray-400 hover:border-brand-300 hover:text-brand-700">
                        <span className="font-semibold">{picks.length + i + 1}</span> Pick one
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {picks.length === MAX_TODAY_PICKS && doneOfPicks === MAX_TODAY_PICKS && (
                <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                  <Bi>All three done. Whatever you do next is a bonus.</Bi>
                </p>
              )}
            </section>

            {/* Inbox */}
            <section data-tour="inbox" className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-1 flex items-center gap-2">
                <Inbox size={16} className="text-gray-500" />
                <h3 className="flex-1 text-base font-semibold text-gray-900"><Bi>Inbox</Bi></h3>
                <span className="text-sm text-gray-400">{inbox.length}</span>
              </div>
              <p className="mb-3 text-sm text-gray-500"><Bi>Tasks with no day yet. Give each one a day so it doesn’t get lost.</Bi></p>
              {inbox.length === 0 ? (
                <p className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500"><Bi>Nothing waiting. Everything you’ve written down has a day.</Bi></p>
              ) : (
                <ul className="space-y-1.5">
                  {inbox.slice(0, 30).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                      <button type="button" onClick={() => setEditing({ task: t })} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-800 hover:underline">
                        {t.title}
                      </button>
                      <div className="flex gap-1">
                        <InboxButton onClick={() => update(t.id, { date: today })}>Today</InboxButton>
                        <InboxButton onClick={() => update(t.id, { date: addDays(today, 1) })}>Tomorrow</InboxButton>
                        {pickIds.length < MAX_TODAY_PICKS && (
                          <InboxButton onClick={() => { update(t.id, { date: today }); addPick(t.id); }}>Today&rsquo;s 3</InboxButton>
                        )}
                      </div>
                    </li>
                  ))}
                  {inbox.length > 30 && (
                    <li className="px-1 pt-1 text-sm text-gray-500">
                      And {inbox.length - 30} more on the <Link href="/dashboard/planner?tab=tasks" className="text-brand-700 hover:underline">Tasks tab</Link>.
                    </li>
                  )}
                </ul>
              )}
            </section>
          </div>

          <div className="min-w-0 space-y-5 self-start">
            <Timeline today={today} day={day} items={list} onOpen={(t) => setEditing({ task: t })} />
            {/* Brokers and Sales Managers only — it draws nothing for anybody else. */}
            <SalesTargetsCard />
          </div>
        </div>

        {picking && (
          <PickDialog
            today={today}
            tasks={list}
            picked={pickIds}
            onPick={(t) => {
              const ids = [...pickIds, t.id];
              setPicks(ids);
              if (ids.length >= MAX_TODAY_PICKS) setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}

        <GameFeedback notices={notices} theme={game?.theme ?? 'freight'} onDismiss={dismissNotice} />
        {editor}
      </div>
    </TaskDirectoryProvider>
  );
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}

function Glance({ label, value, tone }: { label: string; value: string; tone: 'brand' | 'green' | 'red' | 'gray' }) {
  const color = { brand: 'text-brand-700', green: 'text-green-700', red: 'text-red-600', gray: 'text-gray-700' }[tone];
  return (
    <div className="text-right">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-gray-500" data-es>{label}</p>
    </div>
  );
}

function InboxButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-medium text-gray-600 hover:border-brand-500 hover:text-brand-700">
      {children}
    </button>
  );
}

/** When a task is: its time today, its day if another, or how late it is. */
function whenOf(t: PersonalTask, today: string, fmt: (iso: string) => string): { text: string; late: boolean } | null {
  const late = isOverdue(t, today);
  const deadline = deadlineDay(t);
  if (late && deadline) {
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${deadline}T00:00:00Z`)) / 86_400_000);
    return { text: days <= 0 ? 'Due today' : days === 1 ? '1 day late' : `${days} days late`, late: days > 0 };
  }
  if (t.date === today && t.time) return { text: formatTime(t.time), late: false };
  if (t.date && t.date !== today) return { text: fmt(t.date), late: false };
  return null;
}

function PickRow({ n, task, today, onToggle, onOpen, onRemove }: {
  n: number; task: PersonalTask; today: string; onToggle: () => void; onOpen: () => void; onRemove: () => void;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const done = task.status === 'done';
  const when = whenOf(task, today, formatCalendarDate);
  return (
    <li className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${done ? 'border-transparent bg-green-50' : 'border-gray-200 bg-white'}`}>
      <span className="w-4 text-sm font-semibold text-gray-400">{n}</span>
      <button type="button" onClick={onToggle} aria-label={done ? 'Mark not done' : 'Mark done'}
        className={`shrink-0 ${done ? 'text-green-600' : 'text-gray-400 hover:text-green-600'}`}>
        {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-sm font-semibold ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{task.title}</span>
        <span className="flex flex-wrap gap-2 text-xs text-gray-500">
          {task.priority === 'high' && <span className="inline-flex items-center gap-0.5 text-red-600"><Flag size={11} /> Urgent</span>}
          {when && <span className={when.late ? 'font-semibold text-red-600' : ''}>{when.text}</span>}
          {task.orders.map((o) => <span key={o.id} className="inline-flex items-center"><Hash size={11} />{o.number}</span>)}
        </span>
      </button>
      <button type="button" onClick={onRemove} aria-label="Take out of Today's 3" title="Take out of Today's 3"
        className="text-gray-300 hover:text-gray-600"><X size={16} /></button>
    </li>
  );
}

/** Choose from the open tasks: late and due today first, then this week, then the inbox. */
function PickDialog({ today, tasks, picked, onPick, onClose }: {
  today: string; tasks: PersonalTask[]; picked: string[]; onPick: (t: PersonalTask) => void; onClose: () => void;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const [q, setQ] = useState('');
  const weekOut = addDays(today, 7);
  const groups = useMemo(() => {
    const open = tasks.filter((t) => canPickForToday(t) && !picked.includes(t.id)
      && (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase())));
    const dayOf = (t: PersonalTask) => {
      const d = deadlineDay(t);
      return t.date && d ? (t.date < d ? t.date : d) : (t.date ?? d);
    };
    const now = open.filter((t) => { const d = dayOf(t); return !!d && d <= today; });
    const soon = open.filter((t) => { const d = dayOf(t); return !!d && d > today && d <= weekOut; })
      .sort((a, b) => (dayOf(a) ?? '').localeCompare(dayOf(b) ?? ''));
    const undated = open.filter((t) => !dayOf(t));
    return [
      { title: 'Late and due today', items: now },
      { title: 'This week', items: soon },
      { title: 'No day yet', items: undated },
    ].filter((g) => g.items.length);
  }, [tasks, picked, q, today, weekOut]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <h3 className="flex-1 text-base font-semibold text-gray-900">
            Pick for Today&rsquo;s 3 <span className="font-normal text-gray-400">({picked.length} of {MAX_TODAY_PICKS})</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="border-b border-gray-200 px-4 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a task"
              className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              {q ? 'No open task matches that.' : 'No open tasks to pick. Add one with the quick-add box first.'}
            </p>
          ) : groups.map((g) => (
            <div key={g.title} className="mb-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400" data-es>{g.title}</p>
              <ul className="space-y-1.5">
                {g.items.slice(0, 40).map((t) => {
                  const when = whenOf(t, today, formatCalendarDate);
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => onPick(t)}
                        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-brand-500">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{t.title}</span>
                        {t.priority === 'high' && <Flag size={12} className="text-red-500" />}
                        {when && <span className={`shrink-0 text-xs ${when.late ? 'font-semibold text-red-600' : 'text-gray-500'}`}>{when.text}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Quick add ────────────────────────────────────────────────────────────────

function personMatch(people: Map<string, DirectoryPerson> | null, name: string): DirectoryPerson | null {
  if (!people) return null;
  const want = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.]/g, ' ').trim();
  const found = [...people.values()].filter((p) => {
    const full = p.displayName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return full === want || full.split(/\s+/).some((part) => part === want) || full.startsWith(want);
  });
  // Only an unambiguous match: two Anas is a question for the editor, not a guess.
  return found.length === 1 ? found[0] : null;
}

function QuickAdd({ today, people, onWantPeople, onAdd }: {
  today: string;
  people: Map<string, DirectoryPerson> | null;
  onWantPeople: () => void;
  onAdd: (input: PersonalTaskInput) => Promise<PersonalTask | null>;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Record<string, TaskOrder | null | 'loading'>>({});
  const input = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseQuickAdd(text, today), [text, today]);

  // The directory only once somebody types an @.
  useEffect(() => { if (parsed.mentions.length) onWantPeople(); }, [parsed.mentions.length, onWantPeople]);

  // Each #number is looked up once, through the same access-checked route
  // chat's order cards use: a load the person cannot open is never attached.
  useEffect(() => {
    for (const ref of parsed.orderRefs) {
      if (ref in orders) continue;
      setOrders((o) => ({ ...o, [ref]: 'loading' }));
      loadOrderCard({ kind: 'number', value: ref }).then((card) => {
        setOrders((o) => ({ ...o, [ref]: card ? { id: card.id, number: card.number } : null }));
      });
    }
  }, [parsed.orderRefs, orders]);

  const contacts: TaskContact[] = parsed.mentions
    .map((m) => personMatch(people, m))
    .filter((p): p is DirectoryPerson => !!p)
    .map((p) => ({ email: p.email.toLowerCase(), name: p.displayName }));
  const foundOrders = parsed.orderRefs
    .map((r) => orders[r])
    .filter((o): o is TaskOrder => !!o && o !== 'loading');

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    const made = await onAdd({
      kind: 'task',
      title: parsed.title,
      date: parsed.date,
      time: parsed.date ? parsed.time : null,
      endTime: parsed.date ? parsed.endTime : null,
      ...(parsed.urgent ? { priority: 'high' as const } : {}),
      ...(contacts.length ? { contacts } : {}),
      ...(foundOrders.length ? { orders: foundOrders } : {}),
    });
    setBusy(false);
    if (made) { setText(''); input.current?.focus(); }
  };

  const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium';
  const hasChips = !!(parsed.date || parsed.time || parsed.urgent || parsed.orderRefs.length || parsed.mentions.length);

  return (
    <section data-tour="quick-add" className="rounded-xl border border-gray-200 bg-white p-3">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex items-center gap-2">
        <Plus size={18} className="ml-1 shrink-0 text-gray-400" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task: “Call Rio Grande tomorrow 3pm !urgent”"
          aria-label="Quick add a task"
          maxLength={300}
          className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
        />
        <button type="submit" disabled={!parsed.title || busy}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
          <CornerDownLeft size={14} /> Add
        </button>
      </form>
      {text.trim() && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-1 pt-2">
          <span className="text-xs text-gray-500">{parsed.title ? <>Adds <b className="text-gray-800">{parsed.title}</b></> : 'Type what the task is'}</span>
          {parsed.date && <span className={`${chip} bg-brand-50 text-brand-700`}><CalendarDays size={11} />{parsed.date === today ? 'Today' : formatCalendarDate(parsed.date)}</span>}
          {parsed.time && parsed.date && <span className={`${chip} bg-brand-50 text-brand-700`}><Clock size={11} />{formatTime(parsed.time)}{parsed.endTime ? ` – ${formatTime(parsed.endTime)}` : ''}</span>}
          {parsed.time && !parsed.date && <span className={`${chip} bg-amber-50 text-amber-800`}><Clock size={11} />A time needs a day — add “today” or “tomorrow”</span>}
          {parsed.urgent && <span className={`${chip} bg-red-50 text-red-700`}><Flag size={11} />Urgent</span>}
          {parsed.orderRefs.map((r) => {
            const o = orders[r];
            return (
              <span key={r} className={`${chip} ${o && o !== 'loading' ? 'bg-gray-100 text-gray-700' : 'bg-amber-50 text-amber-800'}`}>
                <Hash size={11} />{o === 'loading' || o === undefined ? `${r}…` : o ? o.number : `${r} not found`}
              </span>
            );
          })}
          {parsed.mentions.map((m) => {
            const p = personMatch(people, m);
            return (
              <span key={m} className={`${chip} ${p ? 'bg-gray-100 text-gray-700' : 'bg-amber-50 text-amber-800'}`}>
                <User size={11} />{p ? p.displayName : people ? `No one called “${m}”` : `${m}…`}
              </span>
            );
          })}
          {!hasChips && parsed.title && <span className="text-xs text-gray-400">· no day, so it goes to the inbox</span>}
        </div>
      )}
    </section>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const HOUR_PX = 52;

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function Timeline({ today, day, items, onOpen }: {
  today: string; day: PlanningDay | null; items: PersonalTask[]; onOpen: (t: PersonalTask) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Everything with a time today: events on their date (repeats included),
  // tasks planned for today. Worked out from the list on screen, so a task
  // moved on another tab moves here at once.
  const blocks = useMemo(() => items
    .filter((t) => !t.archived && !!t.time && t.inviteResponse !== 'declined'
      && (t.kind === 'event' ? occursOn(t, today) : t.date === today))
    .map((t) => {
      const start = toMin(t.time!);
      const end = t.endTime && toMin(t.endTime) > start ? toMin(t.endTime) : start + 30;
      return { t, start, end };
    })
    .sort((a, b) => a.start - b.start), [items, today]);

  const shift = day?.shift ?? null;
  const from = Math.floor(Math.min(shift ? toMin(shift.start) : 9 * 60, ...blocks.map((b) => b.start)) / 60) * 60;
  const to = Math.ceil(Math.max(shift ? toMin(shift.end) : 17 * 60, ...blocks.map((b) => b.end)) / 60) * 60;
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60);
  const y = (min: number) => ((min - from) / 60) * HOUR_PX;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Side by side when two things overlap, rather than one hiding the other.
  const lanes: number[] = [];
  const placed = blocks.map((b) => {
    let lane = lanes.findIndex((endAt) => endAt <= b.start);
    if (lane < 0) { lane = lanes.length; lanes.push(b.end); } else lanes[lane] = b.end;
    return { ...b, lane };
  });
  const laneCount = Math.max(1, lanes.length);

  return (
    <section data-tour="timeline" className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock size={16} className="text-brand-600" />
        <h3 className="flex-1 text-base font-semibold text-gray-900"><Bi>Your day</Bi></h3>
        <span className="text-sm text-gray-500">
          {shift ? `${formatTime(shift.start)} – ${formatTime(shift.end)}` : day ? 'Not a working day' : ''}
        </span>
      </div>
      {blocks.length === 0 && (
        <p className="mb-2 text-sm text-gray-500"><Bi>Nothing with a time today. Give a task a time and it shows here.</Bi></p>
      )}
      <div className="relative" style={{ height: y(to) + 8 }}>
        {shift && (
          <div className="absolute left-12 right-0 rounded-md bg-brand-50/60"
            style={{ top: y(toMin(shift.start)), height: y(toMin(shift.end)) - y(toMin(shift.start)) }} />
        )}
        {hours.map((h) => (
          <div key={h} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: y(h) }}>
            <span className="absolute -top-2 left-0 bg-white pr-1 text-[11px] tabular-nums text-gray-400">{formatTime(`${String(h / 60).padStart(2, '0')}:00`).replace(':00 ', ' ')}</span>
          </div>
        ))}
        {placed.map(({ t, start, end, lane }) => {
          const done = t.kind === 'task' && t.status === 'done';
          const width = `calc((100% - 3.25rem) / ${laneCount})`;
          return (
            <button
              key={`${t.id}-${start}`}
              type="button"
              onClick={() => onOpen(t)}
              className={`absolute overflow-hidden rounded-md border-l-[3px] px-2 py-0.5 text-left text-xs font-semibold ${
                t.kind === 'event'
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : done ? 'border-green-600 bg-green-50 text-green-700 line-through' : 'border-amber-500 bg-amber-50 text-amber-800'
              }`}
              style={{ top: y(start) + 1, height: Math.max(20, y(end) - y(start) - 2), left: `calc(3.25rem + ${width} * ${lane})`, width }}
              title={`${t.title} · ${formatTime(t.time)}${t.endTime ? ` – ${formatTime(t.endTime)}` : ''}`}
            >
              <span className="block truncate">{t.title}</span>
              {y(end) - y(start) > 34 && (
                <span className="block truncate font-normal opacity-80">{formatTime(t.time)}{t.endTime ? ` – ${formatTime(t.endTime)}` : ''}</span>
              )}
            </button>
          );
        })}
        {nowMin >= from && nowMin <= to && (
          <div className="pointer-events-none absolute left-11 right-0 z-10 h-0.5 bg-red-500" style={{ top: y(nowMin) }}>
            <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-red-500" />
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Meetings in blue, tasks in amber. Drag and resize them on the <Link href="/dashboard/planner?tab=calendar" className="text-brand-700 hover:underline">Calendar tab</Link>.
      </p>
    </section>
  );
}
