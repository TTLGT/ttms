'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { CalendarClock, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  TASK_STATUS_LABEL,
  byTime,
  formatTime,
  isOverdue,
  type PersonalTask,
  type PersonalTaskInput,
} from '@/types/task';
import { NOTE_STYLE, TASK_DRAG_TYPE } from './taskStyle';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Items drawn in a month square before it says "+N more". The week view draws them all. */
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

/**
 * The calendar: every dated task on its due day and every appointment on its
 * day, by month or by week. Dragging an item to another day moves its date;
 * clicking a day lists it beside the calendar, with a button to add to it.
 *
 * The week view is the month's row made tall: every item is drawn, where a
 * month square stops at three, and on a phone the days stack instead of
 * squeezing seven columns into one screen.
 *
 * Undated tasks are not here — they have no day to sit on. They are on the
 * board, and the board is one click away.
 */
export default function TaskCalendar({
  items,
  today,
  onOpen,
  onAdd,
  onUpdate,
}: {
  items: PersonalTask[];
  today: string;
  onOpen: (task: PersonalTask) => void;
  onAdd: (initial: PersonalTaskInput) => void;
  onUpdate: (id: string, input: PersonalTaskInput) => void;
}) {
  const { formatCalendarDate } = useDateFormatters();
  const [mode, setMode] = useState<Mode>('month');
  const [cursor, setCursor] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today));
  const [selected, setSelected] = useState<string>(today);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(MODE_KEY) === 'week') setMode('week');
    } catch { /* private window: month it is */ }
  }, []);

  /**
   * Switching keeps you where you were: the week of the selected day, or the
   * month that week starts in — not back to today.
   */
  const choose = (m: Mode) => {
    setMode(m);
    if (m === 'week') setWeekStart(weekStartOf(selected));
    else setCursor({ year: Number(selected.slice(0, 4)), month: Number(selected.slice(5, 7)) });
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
    setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
    setWeekStart(weekStartOf(today));
    setSelected(today);
  };

  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE);

  /** What makes any day — a month square or a week column — a place to drop onto. */
  const dayTarget = (date: string) => ({
    onClick: () => setSelected(date),
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

  const chip = (t: PersonalTask, roomy: boolean) => (
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
      title={t.title}
      className={`flex w-full cursor-grab rounded text-left font-medium ${
        roomy ? 'flex-col gap-0.5 px-2 py-1.5 text-xs' : 'items-center gap-1 truncate px-1.5 py-0.5 text-[11px]'
      } ${NOTE_STYLE[t.color].chip} ${t.status === 'done' && t.kind === 'task' ? 'line-through opacity-60' : ''} ${
        isOverdue(t, today) ? 'ring-1 ring-red-400' : ''
      }`}
    >
      {roomy ? (
        <>
          {(t.time || t.kind === 'event') && (
            <span className="flex items-center gap-1 text-[11px] font-normal opacity-75">
              {t.kind === 'event' && <CalendarClock size={10} className="flex-shrink-0" />}
              {t.time ? `${formatTime(t.time)}${t.endTime ? ` – ${formatTime(t.endTime)}` : ''}` : 'All day'}
            </span>
          )}
          <span className="line-clamp-3 break-words">{t.title}</span>
        </>
      ) : (
        <>
          {t.kind === 'event' && <CalendarClock size={10} className="flex-shrink-0" />}
          {t.time && <span className="flex-shrink-0 opacity-70">{formatTime(t.time).replace(':00', '')}</span>}
          <span className="truncate">{t.title}</span>
        </>
      )}
    </button>
  );

  const title = mode === 'month'
    ? monthTitle(cursor.year, cursor.month)
    : `${formatCalendarDate(weekDays[0])} – ${formatCalendarDate(weekDays[6])}`;

  const dayItems = byDay.get(selected) ?? [];
  // Beside the month only: the week view already is this list, drawn wide.
  const selectedWeek = Array.from({ length: 7 }, (_, i) => addDays(weekStartOf(selected), i));
  const thisWeek = selectedWeek.filter((d) => (byDay.get(d) ?? []).length > 0);
  const isCurrentWeek = weekStartOf(selected) === weekStartOf(today);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
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

        {mode === 'month' ? (
          <>
            <div className="grid grid-cols-7 border-b border-gray-100 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                const here = date ? byDay.get(date) ?? [] : [];
                return (
                  <div
                    key={date ?? `blank-${i}`}
                    {...(date ? dayTarget(date) : {})}
                    className={`min-h-[6rem] border-b border-r border-gray-100 p-1 ${
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
                          {here.slice(0, PER_DAY).map((t) => chip(t, false))}
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
            {weekDays.map((date, i) => {
              const here = byDay.get(date) ?? [];
              return (
                <div
                  key={date}
                  {...dayTarget(date)}
                  className={`flex min-h-[5rem] cursor-pointer flex-col border-b border-gray-100 p-1.5 hover:bg-gray-50 md:min-h-[28rem] md:border-b-0 ${
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
                      title="Add a task on this day"
                      onClick={(e) => { e.stopPropagation(); setSelected(date); onAdd({ date, kind: 'task' }); }}
                      className="ml-auto rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <div className="space-y-1.5">{here.map((t) => chip(t, true))}</div>
                </div>
              );
            })}
          </div>
        )}

        <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          Drag an item to another day to move it.
        </p>
      </section>

      <aside className="h-fit space-y-4">
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
              <Plus size={12} /> Appointment
            </button>
          </div>

          {dayItems.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing on this day.</p>
          ) : (
            <ItemList items={dayItems} onOpen={onOpen} onUpdate={onUpdate} />
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
                      onClick={() => setSelected(d)}
                      className={`mb-1 text-xs font-medium hover:underline ${
                        d === today ? 'text-brand-700' : 'text-gray-500'
                      }`}
                    >
                      {WEEKDAYS[selectedWeek.indexOf(d)]} · {d === today ? 'Today' : formatCalendarDate(d)}
                    </button>
                    <ItemList items={byDay.get(d) ?? []} onOpen={onOpen} onUpdate={onUpdate} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

/** One day's items as a list: a tick box for tasks, a clock for appointments. */
function ItemList({
  items,
  onOpen,
  onUpdate,
}: {
  items: PersonalTask[];
  onOpen: (task: PersonalTask) => void;
  onUpdate: (id: string, input: PersonalTaskInput) => void;
}) {
  return (
    <ul className="space-y-2">
      {items.map((t) => {
        const done = t.kind === 'task' && t.status === 'done';
        return (
          <li key={t.id} className="flex items-start gap-2">
            {t.kind === 'task' ? (
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
            ) : (
              <CalendarClock size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
            )}
            <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
              <span className={`block text-sm text-gray-900 hover:underline ${done ? 'line-through text-gray-500' : ''}`}>
                {t.title}
              </span>
              <span className="block text-xs text-gray-500">
                {t.time
                  ? `${formatTime(t.time)}${t.endTime ? ` – ${formatTime(t.endTime)}` : ''}`
                  : t.kind === 'event' ? 'All day' : 'Any time'}
                {t.kind === 'task' && ` · ${TASK_STATUS_LABEL[t.status]}`}
              </span>
            </button>
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${NOTE_STYLE[t.color].swatch}`} />
          </li>
        );
      })}
    </ul>
  );
}
