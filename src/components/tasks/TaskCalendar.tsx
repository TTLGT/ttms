'use client';

import { useMemo, useState, type DragEvent } from 'react';
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
/** Items drawn in a day's square before it says "+N more". */
const PER_DAY = 3;

/** "September 2026" — a month, not a date, so not the company date setting's business. */
function monthTitle(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * The month: every dated task on its due day and every appointment on its
 * day. Dragging an item to another square moves its date; clicking a square
 * lists that day beside the calendar, with a button to add to it.
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
  const [cursor, setCursor] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const [selected, setSelected] = useState<string>(today);
  const [over, setOver] = useState<string | null>(null);

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

  const shiftMonth = (by: number) => setCursor((c) => {
    const index = c.year * 12 + (c.month - 1) + by;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });

  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE);

  const dropOn = (e: DragEvent, date: string) => {
    if (!accepts(e)) return;
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    const item = items.find((t) => t.id === id);
    if (item && item.date !== date) onUpdate(id, { date });
  };

  const dragProps = (t: PersonalTask) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
      e.dataTransfer.setData('text/plain', t.title);
    },
    onDragEnd: () => setOver(null),
  });

  const dayItems = byDay.get(selected) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <section className="min-w-0 rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
            <ChevronLeft size={18} />
          </button>
          <h2 className="min-w-[10rem] text-center text-base font-semibold text-gray-900">
            {monthTitle(cursor.year, cursor.month)}
          </h2>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
              setSelected(today);
            }}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Today
          </button>
          <p className="ml-auto hidden text-xs text-gray-400 sm:block">Drag an item to another day to move it.</p>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const here = date ? byDay.get(date) ?? [] : [];
            return (
              <div
                key={date ?? `blank-${i}`}
                onClick={() => date && setSelected(date)}
                onDragOver={(e) => {
                  if (!date || !accepts(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (over !== date) setOver(date);
                }}
                onDrop={(e) => date && dropOn(e, date)}
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
                      {here.slice(0, PER_DAY).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          {...dragProps(t)}
                          onClick={(e) => { e.stopPropagation(); onOpen(t); }}
                          title={t.title}
                          className={`flex w-full cursor-grab items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${
                            NOTE_STYLE[t.color].chip
                          } ${t.status === 'done' && t.kind === 'task' ? 'line-through opacity-60' : ''} ${
                            isOverdue(t, today) ? 'ring-1 ring-red-400' : ''
                          }`}
                        >
                          {t.kind === 'event' && <CalendarClock size={10} className="flex-shrink-0" />}
                          {t.time && <span className="flex-shrink-0 opacity-70">{formatTime(t.time).replace(':00', '')}</span>}
                          <span className="truncate">{t.title}</span>
                        </button>
                      ))}
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
      </section>

      {/* ── The chosen day ─────────────────────────────────────────── */}
      <aside className="h-fit rounded-xl border border-gray-200 bg-white p-4">
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
          <ul className="space-y-2">
            {dayItems.map((t) => {
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
        )}
      </aside>
    </div>
  );
}
