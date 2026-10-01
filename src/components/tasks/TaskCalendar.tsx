'use client';

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Bell, Check, ChevronLeft, ChevronRight, ExternalLink, Plus } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  EVENT_TYPE_LABEL,
  DEFAULT_BOARD_COLUMNS,
  byTime,
  formatTime,
  isOverdue,
  locationUrl,
  statusLabel,
  type BoardColumn,
  type PersonalTask,
  type PersonalTaskInput,
} from '@/types/task';
import type { Holiday } from '@/types/holidays';
import type { CalendarOccurrence } from '@/types/celebrationCalendar';
import { HOLIDAY_STYLE, KIND_STYLE, holidayTitle, sameOccurrence, whatItIs } from '@/components/calendar/CelebrationPanels';
import { EVENT_ICON, NOTE_STYLE, TASK_DRAG_TYPE } from './taskStyle';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Things drawn in a month square before it says "+N more". The week view draws them all. */
const PER_DAY = 3;

type Mode = 'month' | 'week';
/** Per browser, like the task view: which one somebody likes is not worth a write. */
const MODE_KEY = 'ttms.calendar.mode';

/** "September 2026" — a month, not a date, so not the company date setting's business. */
function monthTitle(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Day arithmetic on `YYYY-MM-DD` strings, through UTC so no time zone or
 * daylight-saving change can land a day twice or skip one.
 */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The Sunday that starts the week `date` is in — the same first day the month grid uses. */
function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return addDays(date, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

const monthOf = (date: string) => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) });

/**
 * The calendar, by month or by week. Three layers, drawn in this order in
 * every square because it is the order they matter in when planning a day:
 *
 * 1. public holidays (everybody) — whether the office and the freight are working;
 * 2. birthdays and work anniversaries (only when `celebrationsOn` is given,
 *    which the page does only for `people.view`);
 * 3. the viewer's own tasks and events, which are the only things here that
 *    can be dragged, because they are the only things here that are theirs.
 *
 * The page owns which day is selected, so something outside the calendar —
 * the "next 30 days" list — can move it; the calendar pages itself to follow.
 *
 * Undated tasks are not here — they have no day to sit on. They are on the
 * board, and the board is one click away.
 */
export default function TaskCalendar({
  items,
  columns = DEFAULT_BOARD_COLUMNS,
  today,
  selected,
  onSelect,
  onOpen,
  onAdd,
  onUpdate,
  holidaysOn,
  celebrationsOn,
  pickedOccurrence = null,
  onPickOccurrence,
  toolbar,
  asideTop,
  asideBottom,
}: {
  items: PersonalTask[];
  /** The person's board columns, for the name of a task's status. */
  columns?: BoardColumn[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  onOpen: (task: PersonalTask) => void;
  onAdd: (initial: PersonalTaskInput) => void;
  onUpdate: (id: string, input: PersonalTaskInput) => void;
  holidaysOn: (date: string) => Holiday[];
  celebrationsOn?: (date: string) => CalendarOccurrence[];
  pickedOccurrence?: CalendarOccurrence | null;
  onPickOccurrence?: (o: CalendarOccurrence) => void;
  /** Drawn under the calendar's own header: the page's layer switches. */
  toolbar?: ReactNode;
  asideTop?: ReactNode;
  asideBottom?: ReactNode;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const [mode, setMode] = useState<Mode>('month');
  const [cursor, setCursor] = useState(() => monthOf(selected));
  const [weekStart, setWeekStart] = useState(() => weekStartOf(selected));
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(MODE_KEY) === 'week') setMode('week');
    } catch { /* private window: month it is */ }
  }, []);

  // Follow the selected day when it is moved from outside. Only on a change
  // of `selected`, so paging away with the arrows is not undone.
  useEffect(() => {
    setCursor(monthOf(selected));
    setWeekStart(weekStartOf(selected));
  }, [selected]);

  /**
   * Switching keeps you where you were: the week of the selected day, or the
   * month that week starts in — not back to today.
   */
  const choose = (m: Mode) => {
    setMode(m);
    if (m === 'week') setWeekStart(weekStartOf(selected));
    else setCursor(monthOf(selected));
    try { window.localStorage.setItem(MODE_KEY, m); } catch { /* not worth telling anyone */ }
  };

  const byDay = useMemo(() => {
    const map = new Map<string, PersonalTask[]>();
    for (const t of items) {
      if (!t.date) continue;
      map.set(t.date, [...(map.get(t.date) ?? []), t]);
    }
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [items]);

  const first  = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
  const lead   = first.getUTCDay();
  const daysIn = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) =>
      `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const shift = (by: number) => {
    if (mode === 'week') {
      setWeekStart((w) => addDays(w, 7 * by));
      return;
    }
    setCursor((c) => {
      const index = c.year * 12 + (c.month - 1) + by;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  };

  const goToday = () => {
    setCursor(monthOf(today));
    setWeekStart(weekStartOf(today));
    onSelect(today);
  };

  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE);

  /** What makes any day — a month square or a week column — a place to drop onto. */
  const dayTarget = (date: string) => ({
    onClick: () => onSelect(date),
    onDragOver: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== date) setOver(date);
    },
    onDrop: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
      const item = items.find((t) => t.id === id);
      if (item && item.date !== date) onUpdate(id, { date });
    },
  });

  const itemChip = (t: PersonalTask, roomy: boolean) => {
    const EventIcon = t.kind === 'event' ? EVENT_ICON[t.eventType] : null;
    return (
      <button
        key={t.id}
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
          e.dataTransfer.setData('text/plain', t.title);
        }}
        onDragEnd={() => setOver(null)}
        onClick={(e) => { e.stopPropagation(); onOpen(t); }}
        title={t.kind === 'event' ? `${EVENT_TYPE_LABEL[t.eventType]}: ${t.title}` : t.title}
        className={`flex w-full cursor-grab rounded text-left font-medium ${
          roomy ? 'flex-col gap-0.5 px-2 py-1.5 text-xs' : 'items-center gap-1 truncate px-1.5 py-0.5 text-[11px]'
        } ${NOTE_STYLE[t.color].chip} ${t.status === 'done' && t.kind === 'task' ? 'line-through opacity-60' : ''} ${
          isOverdue(t, today) ? 'ring-1 ring-red-400' : ''
        }`}
      >
        {roomy ? (
          <>
            {(t.time || EventIcon) && (
              <span className="flex items-center gap-1 text-[11px] font-normal opacity-75">
                {EventIcon && <EventIcon size={10} className="flex-shrink-0" />}
                {t.time ? `${formatTime(t.time)}${t.endTime ? ` – ${formatTime(t.endTime)}` : ''}` : 'All day'}
                {t.reminders.length > 0 && <Bell size={9} className="ml-auto flex-shrink-0" />}
              </span>
            )}
            <span className="line-clamp-3 break-words">{t.title}</span>
          </>
        ) : (
          <>
            {EventIcon && <EventIcon size={10} className="flex-shrink-0" />}
            {t.time && <span className="flex-shrink-0 opacity-70">{formatTime(t.time).replace(':00', '')}</span>}
            <span className="truncate">{t.title}</span>
          </>
        )}
      </button>
    );
  };

  const holidayChip = (h: Holiday) => (
    <div
      key={`h-${h.country}-${h.name}`}
      title={holidayTitle(h)}
      className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] ${HOLIDAY_STYLE[h.country]}`}
    >
      <span className="flex-shrink-0 font-semibold">{h.country}</span>
      <span className="truncate">{h.name.replace(/ \(.*\)$/, '')}</span>
    </div>
  );

  const occurrenceChip = (o: CalendarOccurrence) => {
    const { Icon, chip, chipOn } = KIND_STYLE[o.kind];
    return (
      <button
        key={`c-${o.kind}-${o.person.email}`}
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect(o.date); onPickOccurrence?.(o); }}
        title={`${o.person.name} — ${whatItIs(o)}`}
        className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${
          sameOccurrence(pickedOccurrence, o) ? chipOn : chip
        }`}
      >
        <Icon size={10} className="flex-shrink-0" />
        <span className="truncate">{o.person.name.split(' ')[0]} · {o.years}</span>
      </button>
    );
  };

  /** Everything on a day, in layer order. */
  const dayContents = (date: string, roomy: boolean) => [
    ...holidaysOn(date).map(holidayChip),
    ...(celebrationsOn?.(date) ?? []).map(occurrenceChip),
    ...(byDay.get(date) ?? []).map((t) => itemChip(t, roomy)),
  ];

  const title = mode === 'month'
    ? monthTitle(cursor.year, cursor.month)
    : `${formatCalendarDate(weekDays[0])} – ${formatCalendarDate(weekDays[6])}`;

  // Beside the month only: the week view already is this list, drawn wide.
  const selectedWeek = Array.from({ length: 7 }, (_, i) => addDays(weekStartOf(selected), i));
  const weekHas = (d: string) =>
    (byDay.get(d) ?? []).length > 0 || holidaysOn(d).length > 0 || (celebrationsOn?.(d) ?? []).length > 0;
  const thisWeek = selectedWeek.filter(weekHas);
  const isCurrentWeek = weekStartOf(selected) === weekStartOf(today);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="min-w-0 rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
          <button type="button" onClick={() => shift(-1)} aria-label={mode === 'week' ? 'Previous week' : 'Previous month'}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
            <ChevronLeft size={18} />
          </button>
          <h2 className="min-w-[10rem] text-center text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={() => shift(1)} aria-label={mode === 'week' ? 'Next week' : 'Next month'}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Today
          </button>

          <div className="ml-auto inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
            {(['month', 'week'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => choose(m)}
                className={`rounded-md px-2.5 py-1 font-medium ${mode === m ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {m === 'month' ? 'Month' : 'Week'}
              </button>
            ))}
          </div>
        </div>

        {toolbar && <div className="border-b border-gray-100 px-4 py-2">{toolbar}</div>}

        {mode === 'month' ? (
          <>
            <div className="grid grid-cols-7 border-b border-gray-100 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                const here = date ? dayContents(date, false) : [];
                return (
                  <div
                    key={date ?? `blank-${i}`}
                    {...(date ? dayTarget(date) : {})}
                    className={`min-h-[6rem] min-w-0 border-b border-r border-gray-100 p-1 ${
                      date === null ? 'bg-gray-50/60' : 'cursor-pointer hover:bg-gray-50'
                    } ${i % 7 === 6 ? 'border-r-0' : ''} ${
                      date && date === selected ? 'bg-brand-50/60' : ''
                    } ${date && over === date ? 'ring-2 ring-inset ring-brand-400' : ''}`}
                  >
                    {date && (
                      <>
                        <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          date === today ? 'bg-brand-600 font-semibold text-white' : 'text-gray-500'
                        }`}>
                          {Number(date.slice(8))}
                        </div>
                        <div className="space-y-1">
                          {here.slice(0, PER_DAY)}
                          {here.length > PER_DAY && (
                            <p className="px-1.5 text-[11px] text-gray-500">+{here.length - PER_DAY} more</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-7">
            {weekDays.map((date, i) => (
              <div
                key={date}
                {...dayTarget(date)}
                className={`flex min-h-[5rem] min-w-0 cursor-pointer flex-col border-b border-gray-100 p-1.5 hover:bg-gray-50 md:min-h-[28rem] md:border-b-0 ${
                  i < 6 ? 'md:border-r' : ''
                } ${date === selected ? 'bg-brand-50/60' : ''} ${
                  over === date ? 'ring-2 ring-inset ring-brand-400' : ''
                }`}
              >
                <div className="mb-2 flex items-center gap-1.5 px-0.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{WEEKDAYS[i]}</span>
                  <span className={`flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs ${
                    date === today ? 'bg-brand-600 font-semibold text-white' : 'text-gray-600'
                  }`}>
                    {Number(date.slice(8))}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add on ${formatCalendarDate(date)}`}
                    title="Add on this day"
                    onClick={(e) => { e.stopPropagation(); onSelect(date); onAdd({ date, kind: 'task' }); }}
                    className="ml-auto rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="space-y-1.5">{dayContents(date, true)}</div>
              </div>
            ))}
          </div>
        )}

        <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          Drag your own tasks and events to another day to move them. Times are Guatemala office time.
        </p>
      </section>

      <aside className="h-fit min-w-0 space-y-4">
        {asideTop}

        {/* ── The chosen day ─────────────────────────────────────── */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold text-gray-900">
              {selected === today ? 'Today' : formatCalendarDate(selected)}
            </h3>
            <button
              type="button"
              onClick={() => onAdd({ date: selected, kind: 'task' })}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus size={12} /> Task
            </button>
            <button
              type="button"
              onClick={() => onAdd({ date: selected, kind: 'event' })}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus size={12} /> Event
            </button>
          </div>

          {weekHas(selected) ? (
            <DayList
              holidays={holidaysOn(selected)}
              occurrences={celebrationsOn?.(selected) ?? []}
              items={byDay.get(selected) ?? []}
              columns={columns}
              onOpen={onOpen}
              onUpdate={onUpdate}
              onPickOccurrence={onPickOccurrence}
            />
          ) : (
            <p className="text-sm text-gray-500">Nothing on this day.</p>
          )}
        </section>

        {/* ── The rest of that week ──────────────────────────────── */}
        {mode === 'month' && (
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="flex-1 text-sm font-semibold text-gray-900">
                {isCurrentWeek ? 'This week' : `Week of ${formatCalendarDate(selectedWeek[0])}`}
              </h3>
              <button
                type="button"
                onClick={() => choose('week')}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Open week view
              </button>
            </div>
            {thisWeek.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing this week.</p>
            ) : (
              <div className="space-y-3">
                {thisWeek.map((d) => (
                  <div key={d}>
                    <button
                      type="button"
                      onClick={() => onSelect(d)}
                      className={`mb-1 text-xs font-medium hover:underline ${
                        d === today ? 'text-brand-700' : 'text-gray-500'
                      }`}
                    >
                      {WEEKDAYS[selectedWeek.indexOf(d)]} · {d === today ? 'Today' : formatCalendarDate(d)}
                    </button>
                    <DayList
                      holidays={holidaysOn(d)}
                      occurrences={celebrationsOn?.(d) ?? []}
                      items={byDay.get(d) ?? []}
                      columns={columns}
                      onOpen={onOpen}
                      onUpdate={onUpdate}
                      onPickOccurrence={onPickOccurrence}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {asideBottom}
      </aside>
    </div>
  );
}

/** One day as a list: holidays, then celebrations, then the viewer's own items. */
function DayList({
  holidays,
  occurrences,
  items,
  columns,
  onOpen,
  onUpdate,
  onPickOccurrence,
}: {
  holidays: Holiday[];
  occurrences: CalendarOccurrence[];
  items: PersonalTask[];
  columns: BoardColumn[];
  onOpen: (task: PersonalTask) => void;
  onUpdate: (id: string, input: PersonalTaskInput) => void;
  onPickOccurrence?: (o: CalendarOccurrence) => void;
}) {
  return (
    <ul className="space-y-2">
      {holidays.map((h) => (
        <li key={`h-${h.country}-${h.name}`} className="flex items-start gap-2">
          <span className={`mt-0.5 flex-shrink-0 rounded px-1 text-[10px] font-semibold ${HOLIDAY_STYLE[h.country]}`}>
            {h.country}
          </span>
          <span className="min-w-0 flex-1 text-sm text-gray-700" title={holidayTitle(h)}>
            {h.name}
            {h.note && <span className="block text-xs text-gray-500">{h.note}</span>}
          </span>
        </li>
      ))}

      {occurrences.map((o) => {
        const { Icon } = KIND_STYLE[o.kind];
        return (
          <li key={`c-${o.kind}-${o.person.email}`} className="flex items-start gap-2">
            <Icon size={16} className={`mt-0.5 flex-shrink-0 ${o.kind === 'birthday' ? 'text-pink-500' : 'text-brand-500'}`} />
            <button type="button" onClick={() => onPickOccurrence?.(o)} className="min-w-0 flex-1 text-left">
              <span className="block text-sm text-gray-900 hover:underline">{o.person.name}</span>
              <span className="block text-xs text-gray-500">{whatItIs(o)}</span>
            </button>
          </li>
        );
      })}

      {items.map((t) => {
        const done = t.kind === 'task' && t.status === 'done';
        const EventIcon = t.kind === 'event' ? EVENT_ICON[t.eventType] : null;
        const link = t.kind === 'event' ? locationUrl(t.location) : null;
        return (
          <li key={t.id} className="flex items-start gap-2">
            {EventIcon ? (
              <EventIcon size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
            ) : (
              <button
                type="button"
                aria-label={done ? 'Mark as not done' : 'Mark as done'}
                onClick={() => onUpdate(t.id, { status: done ? 'todo' : 'done' })}
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  done ? 'border-green-600 bg-green-600 text-white' : 'border-gray-400 hover:border-gray-600'
                }`}
              >
                {done && <Check size={11} />}
              </button>
            )}
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onOpen(t)} className="block w-full text-left">
                <span className={`block text-sm text-gray-900 hover:underline ${done ? 'line-through text-gray-500' : ''}`}>
                  {t.title}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  {t.time
                    ? `${formatTime(t.time)}${t.endTime ? ` – ${formatTime(t.endTime)}` : ''}`
                    : t.kind === 'event' ? 'All day' : 'Any time'}
                  {t.kind === 'task' ? ` · ${statusLabel(columns, t.status)}` : ` · ${EVENT_TYPE_LABEL[t.eventType]}`}
                  {t.reminders.length > 0 && !done && <Bell size={10} aria-label="Reminder set" />}
                </span>
              </button>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                >
                  <ExternalLink size={11} /> {t.eventType === 'online' ? 'Join' : 'Open link'}
                </a>
              ) : t.kind === 'event' && t.location ? (
                <span className="mt-0.5 block truncate text-xs text-gray-500">{t.location}</span>
              ) : null}
            </div>
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${NOTE_STYLE[t.color].swatch}`} />
          </li>
        );
      })}
    </ul>
  );
}
