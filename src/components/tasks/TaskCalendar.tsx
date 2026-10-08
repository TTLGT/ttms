'use client';

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Bell, Check, Flag, ChevronLeft, ChevronRight, ExternalLink, Plus, X, ZoomIn, ZoomOut } from 'lucide-react';
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
  occurrencesBetween,
  outcomeOf,
  repeatText,
} from '@/types/task';
import type { Holiday } from '@/types/holidays';
import type { CalendarOccurrence } from '@/types/celebrationCalendar';
import { HOLIDAY_STYLE, KIND_STYLE, holidayTitle, sameOccurrence, whatItIs } from '@/components/calendar/CelebrationPanels';
import { EVENT_ICON, NOTE_STYLE, OCCURRENCE_DRAG_TYPE, OUTCOME_ICON, OUTCOME_STYLE, TASK_DRAG_TYPE } from './taskStyle';
import OutcomeBadge from './OutcomeBadge';
import SeriesChoice, { type SeriesAsk } from './SeriesChoice';
import TaskWeekGrid, { MAX_ZOOM, ZOOM_STEPS } from './TaskWeekGrid';
import { officeNowTime } from '@/types/planning';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/**
 * The month view at each zoom step (see ZOOM_STEPS): how tall a square is, and
 * how many things it draws before it says "+N more". The hour grid draws them all.
 */
const MONTH_CELL = ['min-h-[6rem] p-1', 'min-h-[9.5rem] p-1.5', 'min-h-[12rem] p-1.5', 'min-h-[15rem] p-2'];
const PER_DAY = [3, 6, 8, 10];

type Mode = 'month' | 'week' | 'four' | 'day';
const MODES: { id: Mode; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'four', label: '4 days' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];
/** How many days the hour grid shows in each mode. */
const SPAN: Record<Exclude<Mode, 'month'>, number> = { day: 1, four: 4, week: 7 };
/** Per browser, like the task view: which one somebody likes is not worth a write. */
const MODE_KEY = 'ttms.calendar.mode';
/** The zoom step, per browser for the same reason. */
const ZOOM_KEY = 'ttms.calendar.zoom';
/** What the old Bigger/Smaller switch saved; 'roomy' becomes the second step. */
const OLD_SIZE_KEY = 'ttms.calendar.size';

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
 * The first day the hour grid shows with `date` on screen: the Sunday of its
 * week for the week view, the day itself for one or four days — Google's
 * four-day view starts on the day you are on, not on a fixed weekday.
 */
function gridStartFor(mode: Mode, date: string): string {
  return mode === 'week' ? weekStartOf(date) : date;
}

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
  onDetach,
  onRangeChange,
  holidaysOn,
  celebrationsOn,
  pickedOccurrence = null,
  onPickOccurrence,
  toolbar,
  asideTop,
  asideBottom,
  onZoomChange,
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
  /**
   * Take one date out of a repeating event as its own event, with where it
   * goes. Without it, dates of a series cannot be dragged or stretched.
   */
  onDetach?: (id: string, input: { date: string; newDate?: string; time?: string | null; endTime?: string | null }) => void;
  /** The days on screen, so the page can fetch history when they reach back that far. */
  onRangeChange?: (from: string, to: string) => void;
  holidaysOn: (date: string) => Holiday[];
  celebrationsOn?: (date: string) => CalendarOccurrence[];
  pickedOccurrence?: CalendarOccurrence | null;
  onPickOccurrence?: (o: CalendarOccurrence) => void;
  /** Drawn under the calendar's own header: the page's layer switches. */
  toolbar?: ReactNode;
  asideTop?: ReactNode;
  asideBottom?: ReactNode;
  /** The zoom step whenever it changes, so the page can widen around it. */
  onZoomChange?: (zoom: number) => void;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const [mode, setMode] = useState<Mode>('month');
  const [cursor, setCursor] = useState(() => monthOf(selected));
  // The first day of the hour grid, in the day, four-day and week views.
  const [gridStart, setGridStart] = useState(() => weekStartOf(selected));
  const [zoom, setZoom] = useState(0);
  const [over, setOver] = useState<string | null>(null);
  const [seriesAsk, setSeriesAsk] = useState<SeriesAsk | null>(null);
  // The office clock for the week grid's "now" line; read after mount and once a minute.
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => { const t = officeNowTime(); setNowMinutes(Number(t.slice(0, 2)) * 60 + Number(t.slice(3))); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_KEY);
      const m = MODES.find((x) => x.id === saved)?.id;
      if (m && m !== 'month') { setMode(m); setGridStart(gridStartFor(m, selected)); }
      const z = Number(window.localStorage.getItem(ZOOM_KEY));
      if (Number.isInteger(z) && z > 0 && z <= MAX_ZOOM) setZoom(z);
      else if (window.localStorage.getItem(OLD_SIZE_KEY) === 'roomy') setZoom(1);
    } catch { /* private window: month it is */ }
    // Once, on mount: `selected` is only the starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomBy = (by: number) => {
    const next = Math.max(0, Math.min(zoom + by, MAX_ZOOM));
    setZoom(next);
    try { window.localStorage.setItem(ZOOM_KEY, String(next)); } catch { /* not worth telling anyone */ }
  };
  // Zoomed in, the page lets go of its width cap so the calendar can grow
  // and push the side panels to the right edge. The panels stay beside it:
  // moving them below meant scrolling past the whole grid to see the day.
  useEffect(() => { onZoomChange?.(zoom); }, [zoom, onZoomChange]);
  // Month squares and the top row switch to the two-line chip (time above a
  // wrapped name) once the type is large enough to want it.
  const roomyChips = zoom > 1;

  // Follow the selected day when it is moved from outside. Only on a change
  // of `selected`, so paging away with the arrows is not undone. The grid
  // moves only when the day is off it: in the four-day view, clicking the
  // third column must not slide the view along to start there.
  useEffect(() => {
    setCursor(monthOf(selected));
    setGridStart((g) => {
      const n = mode === 'month' ? 7 : SPAN[mode];
      return selected >= g && selected <= addDays(g, n - 1) ? g : gridStartFor(mode, selected);
    });
    // Only `selected`: a change of mode places the grid itself, in choose().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /**
   * Switching keeps you where you were: the week of the selected day, or the
   * month that week starts in — not back to today.
   */
  const choose = (m: Mode) => {
    setMode(m);
    if (m === 'month') setCursor(monthOf(selected));
    else setGridStart(gridStartFor(m, selected));
    try { window.localStorage.setItem(MODE_KEY, m); } catch { /* not worth telling anyone */ }
  };

  /**
   * Every day anything is drawn on. A repeating event is one item standing for
   * its series, so it is laid out over the days on screen — the month shown,
   * the week shown, the selected day's week and today, a week either side —
   * rather than forever.
   */
  const monthStart = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-01`;
  const span = [addDays(monthStart, -7), addDays(monthStart, 38), gridStart, addDays(gridStart, 6),
    weekStartOf(selected), addDays(weekStartOf(selected), 6), today].filter(Boolean).sort();
  const rangeFrom = span[0];
  const rangeTo = span[span.length - 1];

  useEffect(() => { onRangeChange?.(rangeFrom, rangeTo); }, [onRangeChange, rangeFrom, rangeTo]);

  const byDay = useMemo(() => {
    const map = new Map<string, PersonalTask[]>();
    for (const t of items) {
      for (const date of occurrencesBetween(t, rangeFrom, rangeTo)) {
        map.set(date, [...(map.get(date) ?? []), t]);
      }
    }
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [items, rangeFrom, rangeTo]);

  // Deadlines, as a marker on their own day. A task sits on the calendar on
  // the day it is planned for; when it is due on a different day (or has no
  // planned day at all) the deadline would otherwise be nowhere on screen.
  // Open tasks only — a finished one has no deadline left to meet.
  const dueByDay = useMemo(() => {
    const map = new Map<string, PersonalTask[]>();
    for (const t of items) {
      if (t.kind !== 'task' || t.status === 'done' || !t.dueDate || t.dueDate === t.date) continue;
      if (t.dueDate < rangeFrom || t.dueDate > rangeTo) continue;
      map.set(t.dueDate, [...(map.get(t.dueDate) ?? []), t]);
    }
    return map;
  }, [items, rangeFrom, rangeTo]);

  const first  = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
  const lead   = first.getUTCDay();
  const daysIn = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) =>
      `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const gridDays = Array.from({ length: mode === 'month' ? 7 : SPAN[mode] }, (_, i) => addDays(gridStart, i));

  const shift = (by: number) => {
    if (mode !== 'month') {
      const next = addDays(gridStart, SPAN[mode] * by);
      setGridStart(next);
      // One day on screen: the day panel beside it should be that day, not
      // one the arrows have already left behind.
      if (mode === 'day') onSelect(next);
      return;
    }
    setCursor((c) => {
      const index = c.year * 12 + (c.month - 1) + by;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  };

  const goToday = () => {
    setCursor(monthOf(today));
    setGridStart(gridStartFor(mode, today));
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
      // One date of a series: asked before it is taken out of it.
      if (item && item.kind === 'event' && item.repeat !== 'none') {
        const from = e.dataTransfer.getData(OCCURRENCE_DRAG_TYPE) || item.date || date;
        if (from !== date) setSeriesAsk({ kind: 'move', task: item, date: from, to: { newDate: date } });
        return;
      }
      if (item && item.date !== date) onUpdate(id, { date });
    },
  });

  const itemChip = (t: PersonalTask, roomy: boolean, date: string) => {
    const outcome = outcomeOf(t);
    // Not done and Rescheduled carry their mark where an event carries its type.
    const EventIcon = t.kind === 'event' ? EVENT_ICON[t.eventType]
      : outcome && outcome !== 'done' ? OUTCOME_ICON[outcome] : null;
    // One date of a series can be dragged when the page can take it out of
    // the series — and asks first. Otherwise it is moved by editing the event.
    const series = t.kind === 'event' && t.repeat !== 'none';
    // History is a record: opened to read, never moved.
    const movable = !t.fromHistory && (!series || !!onDetach);
    return (
      <button
        key={t.id}
        type="button"
        draggable={movable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
          e.dataTransfer.setData(OCCURRENCE_DRAG_TYPE, date);
          e.dataTransfer.setData('text/plain', t.title);
        }}
        onDragEnd={() => setOver(null)}
        onClick={(e) => { e.stopPropagation(); onOpen(t); }}
        title={`${t.kind === 'event' ? `${EVENT_TYPE_LABEL[t.eventType]}: ${t.title}` : t.title}${series ? ` (${repeatText(t)})` : ''}`}
        className={`flex w-full ${movable ? 'cursor-grab' : 'cursor-pointer'} rounded text-left font-medium ${
          roomy ? 'flex-col gap-0.5 px-2 py-1.5 text-xs' : 'items-center gap-1 truncate px-1.5 py-0.5 text-[11px]'
        } ${NOTE_STYLE[t.color].chip} ${outcome ? OUTCOME_STYLE[outcome] : ''} ${
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

  /** A deadline marker: opens the task, and is not dragged — the task is moved by its planned day. */
  const dueChip = (t: PersonalTask) => (
    <button
      key={`due-${t.id}`}
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(t); }}
      title={`Due: ${t.title}${t.dueTime ? ` at ${formatTime(t.dueTime)}` : ''}`}
      className={`flex w-full items-center gap-1 truncate rounded border border-dashed px-1.5 py-0.5 text-left text-[11px] font-medium ${
        isOverdue(t, today) ? 'border-red-300 bg-red-50 text-red-700' : 'border-amber-300 bg-amber-50 text-amber-700'
      }`}
    >
      <Flag size={10} className="flex-shrink-0" />
      <span className="truncate">Due: {t.title}</span>
    </button>
  );

  /** Everything on a day, in layer order. */
  const dayContents = (date: string, roomy: boolean) => [
    ...holidaysOn(date).map(holidayChip),
    ...(celebrationsOn?.(date) ?? []).map(occurrenceChip),
    ...(dueByDay.get(date) ?? []).map(dueChip),
    ...(byDay.get(date) ?? []).map((t) => itemChip(t, roomy, date)),
  ];

  const title = mode === 'month'
    ? monthTitle(cursor.year, cursor.month)
    : gridDays.length === 1
      ? formatCalendarDate(gridDays[0])
      : `${formatCalendarDate(gridDays[0])} – ${formatCalendarDate(gridDays[gridDays.length - 1])}`;
  const unit = mode === 'month' ? 'month' : mode === 'week' ? 'week' : mode === 'day' ? 'day' : 'four days';
  const perDay = PER_DAY[zoom];

  // Beside the month only: the week view already is this list, drawn wide.
  const selectedWeek = Array.from({ length: 7 }, (_, i) => addDays(weekStartOf(selected), i));
  const weekHas = (d: string) =>
    (byDay.get(d) ?? []).length > 0 || (dueByDay.get(d) ?? []).length > 0
    || holidaysOn(d).length > 0 || (celebrationsOn?.(d) ?? []).length > 0;
  const thisWeek = selectedWeek.filter(weekHas);
  const isCurrentWeek = weekStartOf(selected) === weekStartOf(today);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="min-w-0 rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
          <button type="button" onClick={() => shift(-1)} aria-label={`Previous ${unit}`}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
            <ChevronLeft size={18} />
          </button>
          <h2 className="min-w-[10rem] text-center text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={() => shift(1)} aria-label={`Next ${unit}`}
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

          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-gray-200 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => zoomBy(-1)}
                disabled={zoom === 0}
                aria-label="Zoom out"
                title="Zoom out: shorter hours and smaller names"
                className="rounded-md p-1 text-gray-600 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                onClick={() => zoomBy(-zoom)}
                disabled={zoom === 0}
                title="Back to the normal size"
                className="min-w-[3rem] rounded-md px-1 py-0.5 text-center font-medium tabular-nums text-gray-600 hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                {ZOOM_STEPS[zoom].label}
              </button>
              <button
                type="button"
                onClick={() => zoomBy(1)}
                disabled={zoom === MAX_ZOOM}
                aria-label="Zoom in"
                title="Zoom in: taller hours and larger names, across the whole screen"
                className="rounded-md p-1 text-gray-600 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ZoomIn size={14} />
              </button>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
              {MODES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => choose(id)}
                  // Below md the hour grid is a list, and one day or four is
                  // the same list shorter — still worth having on a phone.
                  className={`rounded-md px-2.5 py-1 font-medium ${mode === id ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
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
                const here = date ? dayContents(date, roomyChips) : [];
                return (
                  <div
                    key={date ?? `blank-${i}`}
                    {...(date ? dayTarget(date) : {})}
                    className={`${MONTH_CELL[zoom]} min-w-0 border-b border-r border-gray-100 ${
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
                          {here.slice(0, perDay)}
                          {here.length > perDay && (
                            <p className="px-1.5 text-[11px] text-gray-500">+{here.length - perDay} more</p>
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
          <>
          <TaskWeekGrid
            days={gridDays}
            today={today}
            selected={selected}
            items={items}
            itemsOn={(d) => byDay.get(d) ?? []}
            extrasOn={(d) => [
              ...holidaysOn(d).map(holidayChip),
              ...(celebrationsOn?.(d) ?? []).map(occurrenceChip),
              ...(dueByDay.get(d) ?? []).map(dueChip),
            ]}
            untimedChip={(t, d) => itemChip(t, roomyChips, d)}
            onSelect={onSelect}
            onOpen={onOpen}
            onUpdate={onUpdate}
            onAdd={onAdd}
            onAskSeries={onDetach ? setSeriesAsk : undefined}
            nowMinutes={nowMinutes}
            zoom={zoom}
          />
          {/* A phone keeps the list: seven hour-columns do not fit it. */}
          <div className="grid grid-cols-1 md:hidden">
            {gridDays.map((date) => (
              <div
                key={date}
                {...dayTarget(date)}
                className={`flex min-h-[5rem] min-w-0 cursor-pointer flex-col border-b border-gray-100 p-1.5 hover:bg-gray-50 ${date === selected ? 'bg-brand-50/60' : ''} ${
                  over === date ? 'ring-2 ring-inset ring-brand-400' : ''
                }`}
              >
                <div className="mb-2 flex items-center gap-1.5 px-0.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}</span>
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
          </>
        )}

        <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          Drag your own tasks and events to another day to move them{mode !== 'month' ? ', or to another time. Pull the bottom edge of an event to change how long it lasts; click an empty spot to add one' : ''}. Times are Guatemala office time.
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
              due={dueByDay.get(selected) ?? []}
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
                      due={dueByDay.get(d) ?? []}
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

      {seriesAsk && onDetach && (
        <SeriesChoice
          ask={seriesAsk}
          onCancel={() => setSeriesAsk(null)}
          onThisOne={() => {
            const a = seriesAsk;
            setSeriesAsk(null);
            if (a.kind === 'move') onDetach(a.task.id, { date: a.date, ...a.to });
            else onDetach(a.task.id, { date: a.date, endTime: a.endTime });
          }}
          onAll={() => {
            const a = seriesAsk;
            setSeriesAsk(null);
            if (a.kind === 'resize') onUpdate(a.task.id, { endTime: a.endTime });
          }}
        />
      )}
    </div>
  );
}

/** One day as a list: holidays, then celebrations, then the viewer's own items. */
function DayList({
  holidays,
  occurrences,
  items,
  due,
  columns,
  onOpen,
  onUpdate,
  onPickOccurrence,
}: {
  holidays: Holiday[];
  occurrences: CalendarOccurrence[];
  items: PersonalTask[];
  /** Open tasks due this day but planned for another (or none). */
  due: PersonalTask[];
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
            <Icon size={16} className={`mt-0.5 flex-shrink-0 ${KIND_STYLE[o.kind].icon}`} />
            <button type="button" onClick={() => onPickOccurrence?.(o)} className="min-w-0 flex-1 text-left">
              <span className="block text-sm text-gray-900 hover:underline">{o.person.name}</span>
              <span className="block text-xs text-gray-500">{whatItIs(o)}</span>
            </button>
          </li>
        );
      })}

      {due.map((t) => (
        <li key={`due-${t.id}`} className="flex items-start gap-2">
          <Flag size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
            <span className="block text-sm text-gray-900 hover:underline">{t.title}</span>
            <span className="block text-xs text-gray-500">
              Due{t.dueTime ? ` by ${formatTime(t.dueTime)}` : ' this day'}{t.date ? '' : ' · not planned yet'}
            </span>
          </button>
        </li>
      ))}

      {items.map((t) => {
        const done = t.kind === 'task' && t.status === 'done';
        const outcome = outcomeOf(t);
        const EventIcon = t.kind === 'event' ? EVENT_ICON[t.eventType] : null;
        const link = t.kind === 'event' ? locationUrl(t.location) : null;
        return (
          <li key={t.id} className="flex items-start gap-2">
            {EventIcon ? (
              <EventIcon size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
            ) : (
              <button
                type="button"
                aria-label={done ? 'Reopen' : 'Mark as done'}
                title={t.fromHistory ? 'From your history — read only' : done ? 'Reopen' : 'Mark as done'}
                disabled={t.fromHistory}
                onClick={() => onUpdate(t.id, { status: done ? 'todo' : 'done' })}
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  outcome === 'notdone' ? 'border-red-500 bg-red-500 text-white'
                    : outcome === 'rescheduled' ? 'border-gray-400 bg-gray-300 text-white'
                    : done ? 'border-green-600 bg-green-600 text-white' : 'border-gray-400 hover:border-gray-600'
                }`}
              >
                {outcome === 'done' && <Check size={11} />}
                {outcome === 'notdone' && <X size={11} />}
              </button>
            )}
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onOpen(t)} className="block w-full text-left">
                <span className={`block text-sm text-gray-900 hover:underline ${
                  outcome === 'done' ? 'line-through text-gray-500' : outcome ? 'text-gray-500' : ''
                }`}>
                  {t.title}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  {t.time
                    ? `${formatTime(t.time)}${t.endTime ? ` – ${formatTime(t.endTime)}` : ''}`
                    : t.kind === 'event' ? 'All day' : 'Any time'}
                  {t.kind === 'task'
                    ? outcome && outcome !== 'done' ? <> · <OutcomeBadge task={t} /></> : ` · ${statusLabel(columns, t.status)}`
                    : ` · ${EVENT_TYPE_LABEL[t.eventType]}`}
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
