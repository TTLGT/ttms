'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, CalendarClock, Landmark, ListTodo, Mail, MessageCircle, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { usePersonalTasks, useTaskHistory } from '@/lib/personalTasks';
import { fetchHolidayOverrides } from '@/lib/attendance';
import TaskCalendar from '@/components/tasks/TaskCalendar';
import PlanningPanel from '@/components/planning/PlanningPanel';
import { PLANNING_CHANGED_EVENT } from '@/types/planning';
import TaskEditor from '@/components/tasks/TaskEditor';
import { TaskDirectoryProvider } from '@/components/tasks/TaskContacts';
import { useTaskDirectory } from '@/lib/taskContacts';
import { GameFeedback } from '@/components/tasks/TaskGame';
import {
  CelebrationDetail,
  CelebrationReminderPanel,
  KIND_STYLE,
  HOLIDAY_STYLE,
  UpcomingCelebrations,
  useCelebrationCalendar,
} from '@/components/calendar/CelebrationPanels';
import { calendarToday, type PersonalTask, type PersonalTaskInput } from '@/types/task';
import {
  HOLIDAY_COUNTRY_LABEL,
  observedHolidaysInYear,
  type Holiday,
  type HolidayCountry,
  type HolidayOverride,
} from '@/types/holidays';
import {
  occurrencesInMonth,
  type CalendarOccurrence,
  type CelebrationKind,
} from '@/types/celebrationCalendar';

/**
 * The Calendar: one page for everybody, with more on it for admin and HR.
 *
 * - Everybody: their own tasks and events (the same list as My tasks, drawn
 *   by date), public holidays in Guatemala and the US, and how their own
 *   reminders reach them.
 * - `people.view` (admin, HR): birthdays and work anniversaries on the same
 *   grid, and the reminder panels that used to be the Celebrations page. The
 *   check here only decides whether to ask; /api/celebration-calendar is
 *   what refuses everybody else. See CelebrationPanels.tsx.
 *
 * Not Google Calendar: nothing here is read from or sent to Google.
 */
export default function CalendarPage() {
  const { can } = useAuth();
  const { formatCalendarDate } = useDateFormatters();
  const { tasks, settings, columns, colorLabels, game, notices, dismissNotice, saveSettings, error, setError, create, update, detach, reschedule, remove, reload } = usePersonalTasks();
  const [editing, setEditing] = useState<{ task: PersonalTask | null; initial?: PersonalTaskInput } | null>(null);
  const [today, setToday] = useState('');
  const [selected, setSelected] = useState('');
  const [picked, setPicked] = useState<CalendarOccurrence | null>(null);
  // For the editor's "With" box. The calendar draws no contacts itself, so
  // only an open editor is worth reading the directory for.
  const { people: directory } = useTaskDirectory(!!editing);

  const hr = can('people.view');
  const celebrations = useCelebrationCalendar(hr);

  // Which layers are drawn. All on by default; turning one off is how somebody
  // gets a calendar of just their own week, or HR one of just birthdays.
  const [show, setShow] = useState({ tasks: true, events: true });
  const [countries, setCountries] = useState<Record<HolidayCountry, boolean>>({ GT: true, US: true });
  const [kinds, setKinds] = useState<Record<CelebrationKind, boolean>>({ birthday: true, anniversary: true });

  useEffect(() => {
    const t = calendarToday();
    setToday(t);
    setSelected(t);
  }, []);

  // HR's changes to the holiday list — a holiday moved to the Monday, a
  // company day off — so this calendar and attendance agree about whether the
  // office was shut. Shown without them if they fail to load: the calculated
  // list is right almost every day of the year.
  const [overrides, setOverrides] = useState<HolidayOverride[]>([]);
  useEffect(() => {
    fetchHolidayOverrides().then((r) => setOverrides(r.overrides)).catch(() => {});
  }, []);

  // Worked out a year at a time and kept, since the grid asks once per square.
  const holidaysByYear = useMemo(() => new Map<number, Map<string, Holiday[]>>(), [overrides]);
  const holidaysOn = useCallback((date: string): Holiday[] => {
    const year = Number(date.slice(0, 4));
    let byDate = holidaysByYear.get(year);
    if (!byDate) {
      byDate = new Map();
      for (const h of observedHolidaysInYear(year, overrides)) {
        byDate.set(h.date, [...(byDate.get(h.date) ?? []), h]);
      }
      holidaysByYear.set(year, byDate);
    }
    return (byDate.get(date) ?? []).filter((h) => countries[h.country]);
  }, [holidaysByYear, overrides, countries]);

  const people = celebrations.data?.people;
  const occurrencesByYear = useMemo(() => new Map<number, Map<string, CalendarOccurrence[]>>(), [people]);
  const celebrationsOn = useCallback((date: string): CalendarOccurrence[] => {
    if (!people) return [];
    const year = Number(date.slice(0, 4));
    let byDate = occurrencesByYear.get(year);
    if (!byDate) {
      byDate = new Map();
      for (let m = 1; m <= 12; m++) {
        for (const o of occurrencesInMonth(people, year, m)) {
          byDate.set(o.date, [...(byDate.get(o.date) ?? []), o]);
        }
      }
      occurrencesByYear.set(year, byDate);
    }
    return (byDate.get(date) ?? []).filter((o) => kinds[o.kind]);
  }, [people, occurrencesByYear, kinds]);

  // What has moved to history is fetched only when the calendar is paged back
  // that far; the list wins where both have something (the day of the move).
  const { history, showRange } = useTaskHistory();
  const items = useMemo(() => {
    const live = tasks ?? [];
    const ids = new Set(live.map((t) => t.id));
    return [...live, ...history.filter((t) => !ids.has(t.id))]
      .filter((t) => (t.kind === 'task' ? show.tasks : show.events));
  }, [tasks, history, show]);

  const save = async (input: PersonalTaskInput) => {
    if (editing?.task) await update(editing.task.id, input);
    else await create(input);
    setEditing(null);
  };

  const noChannel = !settings.email && !settings.chat;

  const chip = (on: boolean, extra: string) =>
    `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
      on ? extra : 'bg-gray-100 text-gray-400 line-through'
    }`;

  const toolbar = (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={show.tasks} onClick={() => setShow((s) => ({ ...s, tasks: !s.tasks }))}
        // Brand, not a task colour: tasks and events wear the colours their
        // owner gave them, so the switch for them must not look like one.
        className={chip(show.tasks, 'bg-brand-50 text-brand-700')}>
        <ListTodo size={12} /> My tasks
      </button>
      <button type="button" aria-pressed={show.events} onClick={() => setShow((s) => ({ ...s, events: !s.events }))}
        className={chip(show.events, 'bg-brand-50 text-brand-700')}>
        <CalendarClock size={12} /> My events
      </button>
      {hr && (['birthday', 'anniversary'] as const).map((kind) => {
        const { Icon, plural } = KIND_STYLE[kind];
        return (
          <button key={kind} type="button" aria-pressed={kinds[kind]}
            onClick={() => { setPicked(null); setKinds((k) => ({ ...k, [kind]: !k[kind] })); }}
            className={chip(kinds[kind], KIND_STYLE[kind].chip)}>
            <Icon size={12} /> {plural}
          </button>
        );
      })}
      {(['GT', 'US'] as const).map((country) => (
        <button key={country} type="button" aria-pressed={countries[country]}
          onClick={() => setCountries((c) => ({ ...c, [country]: !c[country] }))}
          className={chip(countries[country], HOLIDAY_STYLE[country])}>
          <Landmark size={12} /> {HOLIDAY_COUNTRY_LABEL[country]} holidays
        </button>
      ))}
    </div>
  );

  // A planning slot added from the card lands on this calendar without a reload.
  useEffect(() => {
    window.addEventListener(PLANNING_CHANGED_EVENT, reload);
    return () => window.removeEventListener(PLANNING_CHANGED_EVENT, reload);
  }, [reload]);

  const deliveryPanel = (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Bell size={15} className="text-brand-600" /> Reminders for my tasks and events
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Set them on each task or event. Only you get them.
      </p>
      <p className="mt-3 text-xs font-medium text-gray-700">Send them by</p>
      <div className="mt-2 space-y-1.5">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={settings.email}
            onChange={(e) => saveSettings({ ...settings, email: e.target.checked })}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <Mail size={14} className="text-gray-400" /> Email
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={settings.chat}
            onChange={(e) => saveSettings({ ...settings, chat: e.target.checked })}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <MessageCircle size={14} className="text-gray-400" /> A private chat message
        </label>
      </div>
      {noChannel && (
        <p className="mt-2 text-xs text-amber-700">With both off, none of your reminders are sent.</p>
      )}
    </section>
  );

  const cel = celebrations.data;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-gray-500">
          Your own tasks and events, which only you can see, and public holidays.
          {hr && ' Birthdays and work anniversaries are shown to admins and HR only.'}
          <Link href="/dashboard/tasks" className="ml-2 inline-flex items-center gap-1 text-brand-700 hover:underline">
            <ListTodo size={13} /> Open my tasks
          </Link>
        </p>
      </div>

      {(error || celebrations.notice) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="flex-1">{error || celebrations.notice}</span>
          <button type="button" onClick={() => { setError(''); celebrations.setNotice(''); }} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {tasks === null || !today ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <TaskCalendar
          items={items}
          onRangeChange={showRange}
          columns={columns}
          today={today}
          selected={selected}
          onSelect={(d) => { setSelected(d); if (picked && picked.date !== d) setPicked(null); }}
          onOpen={(task) => setEditing({ task })}
          onAdd={(initial) => setEditing({ task: null, initial })}
          onUpdate={update}
          onDetach={detach}
          holidaysOn={holidaysOn}
          celebrationsOn={hr && cel ? celebrationsOn : undefined}
          pickedOccurrence={picked}
          onPickOccurrence={hr ? (o) => { setSelected(o.date); setPicked(o); } : undefined}
          toolbar={toolbar}
          asideTop={hr && cel && picked ? (
            <CelebrationDetail
              occurrence={picked}
              today={cel.today}
              reminders={cel.reminders}
              busy={celebrations.busy}
              formatCalendarDate={formatCalendarDate}
              onAdd={(leadDays) => celebrations.addReminder(picked, leadDays)}
              onRemove={celebrations.removeReminder}
              onClose={() => setPicked(null)}
            />
          ) : null}
          asideBottom={(
            <>
              {deliveryPanel}
              <PlanningPanel />
              {hr && cel && (
                <>
                  <UpcomingCelebrations
                    data={cel}
                    showing={kinds}
                    formatCalendarDate={formatCalendarDate}
                    onPick={(o) => { setSelected(o.date); setPicked(o); }}
                  />
                  <CelebrationReminderPanel
                    data={cel}
                    busy={celebrations.busy}
                    formatCalendarDate={formatCalendarDate}
                    onSettings={celebrations.updateSettings}
                    onRemove={celebrations.removeReminder}
                  />
                </>
              )}
            </>
          )}
        />
      )}

      <GameFeedback notices={notices} theme={game?.theme ?? 'freight'} onDismiss={dismissNotice} />

      {editing && (
        <TaskDirectoryProvider people={directory}>
        <TaskEditor
          task={editing.task}
          initial={editing.initial}
          columns={columns}
          colorLabels={colorLabels}
          noChannel={noChannel}
          onSave={save}
          onDelete={editing.task ? () => { remove(editing.task!.id); setEditing(null); } : undefined}
          onReschedule={editing.task ? async (date, time) => {
            await reschedule(editing.task!.id, { date, time });
            setEditing(null);
          } : undefined}
          onClose={() => setEditing(null)}
        />
        </TaskDirectoryProvider>
      )}
    </div>
  );
}
