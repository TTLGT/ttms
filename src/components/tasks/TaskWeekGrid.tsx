'use client';

import { useEffect, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import {
  EVENT_TYPE_LABEL,
  formatTime,
  outcomeOf,
  repeatText,
  type PersonalTask,
  type PersonalTaskInput,
} from '@/types/task';
import { addMinutes, shiftedEnd } from '@/types/planning';
import { EVENT_ICON, NOTE_STYLE, OCCURRENCE_DRAG_TYPE, OUTCOME_ICON, OUTCOME_STYLE, TASK_DRAG_TYPE } from './taskStyle';
import type { SeriesAsk } from './SeriesChoice';

/**
 * The week as an hour grid, Google Calendar style: timed items drawn as blocks
 * as tall as they last, untimed ones in a row across the top.
 *
 * - **Pull the bottom edge** of an event (or a planning slot, the one kind of
 *   task with an end) to change how long it lasts, in quarter hours. It is
 *   saved when the pointer is let go — one write, not one per pixel.
 * - **Drag a block** to another day or time; it keeps its length. Dropped in
 *   the top row it changes day only and keeps its time.
 * - **Double-click** an empty spot to add an event there, an hour long.
 *
 * A date of a repeating event can be dragged and pulled too, but the page is
 * asked first (`onAskSeries`, which opens SeriesChoice): moving it takes it out
 * of the series, and stretching it may mean this date or all of them. A task
 * has a start time but no end, so it is drawn half an hour tall and has no
 * edge to pull.
 *
 * Desktop only. Seven hour-columns do not fit a phone, which keeps the list.
 */

/** Pixels per hour. 48 makes a quarter hour 12px — a target a mouse can hit. */
const HOUR_PX = 48;
const SNAP = 15;
/** How tall a timed task (no end) is drawn, and an event with no end. */
const NO_END_MINUTES = 30;
/** Where the grid opens, scrolled: the start of the office day. */
const FIRST_HOUR_SHOWN = 7;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (total: number) => {
  const t = Math.max(0, Math.min(total, 23 * 60 + 59));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const snap = (min: number) => Math.round(min / SNAP) * SNAP;

/** Has an end the person can pull: an event, or a planning slot. */
function stretchable(t: PersonalTask): boolean {
  return !!t.time && (t.kind === 'event' || (!!t.planning && !!t.endTime));
}

function endMinutes(t: PersonalTask): number {
  const start = minutesOf(t.time!);
  const end = t.endTime ? minutesOf(t.endTime) : start + NO_END_MINUTES;
  return end > start ? end : start + NO_END_MINUTES;
}

interface Placed { task: PersonalTask; start: number; end: number; lane: number; lanes: number }

/**
 * Side by side where they overlap: each run of overlapping blocks is split
 * into as many lanes as it needs at its busiest, and each block takes the
 * first lane free when it starts.
 */
function layOut(items: PersonalTask[], endOf: (t: PersonalTask) => number): Placed[] {
  const sorted = items
    .map((task) => ({ task, start: minutesOf(task.time!), end: endOf(task) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    for (const p of cluster) p.lanes = lanes;
    out.push(...cluster);
    cluster = [];
  };
  for (const s of sorted) {
    if (s.start >= clusterEnd && cluster.length) close();
    const laneEnds: number[] = [];
    for (const p of cluster) laneEnds[p.lane] = Math.max(laneEnds[p.lane] ?? 0, p.end);
    let lane = 0;
    while (laneEnds[lane] !== undefined && laneEnds[lane] > s.start) lane++;
    cluster.push({ ...s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  if (cluster.length) close();
  return out;
}

export default function TaskWeekGrid({
  days, today, selected, items, itemsOn, extrasOn, untimedChip, onSelect, onOpen, onUpdate, onAdd, onAskSeries, nowMinutes,
}: {
  days: string[];
  today: string;
  selected: string;
  /** Every item, to find the one being dropped. */
  items: PersonalTask[];
  itemsOn: (date: string) => PersonalTask[];
  /** Holidays and celebrations for the top row. */
  extrasOn: (date: string) => ReactNode[];
  untimedChip: (t: PersonalTask, date: string) => ReactNode;
  onSelect: (date: string) => void;
  onOpen: (t: PersonalTask) => void;
  onUpdate: (id: string, input: PersonalTaskInput) => void;
  onAdd: (initial: PersonalTaskInput) => void;
  /** A change to one date of a series, to be confirmed. Absent: series dates cannot be dragged or pulled. */
  onAskSeries?: (ask: SeriesAsk) => void;
  /** The office clock in minutes, for the red line on today. Null before mount. */
  nowMinutes: number | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Where in the block it was picked up, so a drop puts the block's top where
  // the block's top was dragged to, not where the pointer was.
  const grabOffset = useRef(0);
  const [over, setOver] = useState<string | null>(null);
  // Keyed by date as well: a series is one item on several days, and only the
  // date being pulled should grow while the pointer is down.
  const [stretch, setStretch] = useState<{ id: string; date: string; end: number } | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: FIRST_HOUR_SHOWN * HOUR_PX - 8 });
  }, []);

  const endOf = (t: PersonalTask, date: string) =>
    (stretch?.id === t.id && stretch.date === date ? stretch.end : endMinutes(t));
  const isSeries = (t: PersonalTask) => t.kind === 'event' && t.repeat !== 'none';

  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(TASK_DRAG_TYPE);

  const dropOn = (date: string, e: DragEvent<HTMLDivElement>, withTime: boolean) => {
    if (!accepts(e)) return;
    e.preventDefault();
    setOver(null);
    const t = items.find((i) => i.id === e.dataTransfer.getData(TASK_DRAG_TYPE));
    if (!t) return;
    // Which date of a series was picked up; for anything else, its own date.
    const from = e.dataTransfer.getData(OCCURRENCE_DRAG_TYPE) || t.date || date;
    if (!withTime) {
      if (isSeries(t)) {
        if (from !== date) onAskSeries?.({ kind: 'move', task: t, date: from, to: { newDate: date } });
      } else if (t.date !== date) onUpdate(t.id, { date });
      return;
    }
    const top = e.clientY - e.currentTarget.getBoundingClientRect().top - grabOffset.current;
    const length = t.time ? endMinutes(t) - minutesOf(t.time) : 60;
    const start = Math.max(0, Math.min(snap((top / HOUR_PX) * 60), 24 * 60 - Math.min(length, 24 * 60 - SNAP)));
    const time = toHhmm(start);
    if (from === date && t.time === time) return;
    // Keeps its length. A task has no end of its own; a planning slot and an
    // event do, and theirs moves with the start.
    const endTime = t.kind === 'event' || t.planning
      ? (t.time && t.endTime ? shiftedEnd(t.time, t.endTime, time) : null)
      : undefined;
    if (isSeries(t)) {
      onAskSeries?.({ kind: 'move', task: t, date: from, to: { newDate: date, time, endTime: endTime ?? null } });
      return;
    }
    onUpdate(t.id, { date, time, ...(endTime !== undefined ? { endTime } : {}) });
  };

  /** Pull the bottom edge. Pointer capture keeps the drag even when the pointer leaves the block. */
  const startStretch = (t: PersonalTask, date: string, e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startMin = minutesOf(t.time!);
    const from = endMinutes(t);
    let end = from;
    const move = (ev: globalThis.PointerEvent) => {
      end = Math.max(startMin + SNAP, Math.min(snap(from + ((ev.clientY - startY) / HOUR_PX) * 60), 24 * 60 - 1));
      setStretch({ id: t.id, date, end });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      if (end === from) { setStretch(null); return; }
      if (isSeries(t)) {
        // Asked first; whichever answer comes back is what gets drawn.
        onAskSeries?.({ kind: 'resize', task: t, date, endTime: toHhmm(end) });
        setStretch(null);
        return;
      }
      setStretch(null);
      onUpdate(t.id, { endTime: toHhmm(end) });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const cols = 'grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]';

  return (
    <div className="hidden md:block">
      {/* Day names, and the row for whatever has no time. */}
      <div className={`${cols} border-b border-gray-100`}>
        <div />
        {days.map((date) => (
          <div key={date} className={`flex items-center gap-1.5 border-l border-gray-100 px-1.5 py-1.5 ${
            date === selected ? 'bg-brand-50/60' : ''
          }`}>
            <button type="button" onClick={() => onSelect(date)} className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {WEEKDAY_SHORT[new Date(`${date}T00:00:00Z`).getUTCDay()]}
              </span>
              <span className={`flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs ${
                date === today ? 'bg-brand-600 font-semibold text-white' : 'text-gray-600'
              }`}>
                {Number(date.slice(8))}
              </span>
            </button>
            <button type="button" aria-label="Add on this day" title="Add on this day"
              onClick={() => { onSelect(date); onAdd({ date, kind: 'task' }); }}
              className="ml-auto rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700">
              <Plus size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className={`${cols} border-b border-gray-200`}>
        <div className="px-1 py-1 text-right text-[10px] text-gray-400">All day</div>
        {days.map((date) => (
          <div key={date}
            onClick={() => onSelect(date)}
            onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); setOver(`${date}-top`); } }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => dropOn(date, e, false)}
            className={`min-h-[2rem] min-w-0 space-y-1 border-l border-gray-100 p-1 ${
              over === `${date}-top` ? 'ring-2 ring-inset ring-brand-400' : ''
            }`}>
            {extrasOn(date)}
            {itemsOn(date).filter((t) => !t.time).map((t) => untimedChip(t, date))}
          </div>
        ))}
      </div>

      <div ref={scroller} className="h-[34rem] overflow-y-auto">
        <div className={`${cols} relative`} style={{ height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-gray-400" style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : formatTime(`${String(h).padStart(2, '0')}:00`).replace(':00', '')}
              </div>
            ))}
          </div>
          {days.map((date) => {
            const placed = layOut(itemsOn(date).filter((t) => !!t.time), (t) => endOf(t, date));
            return (
              <div key={date}
                className={`relative border-l border-gray-100 ${date === selected ? 'bg-brand-50/40' : ''} ${
                  over === date ? 'bg-brand-50' : ''
                }`}
                onClick={() => onSelect(date)}
                onDoubleClick={(e) => {
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  const start = Math.min(snap(Math.floor((y / HOUR_PX) * 60 / SNAP) * SNAP), 23 * 60);
                  onAdd({ date, kind: 'event', time: toHhmm(start), endTime: addMinutes(toHhmm(start), 60) });
                }}
                onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(date); } }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => dropOn(date, e, true)}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-gray-100" style={{ top: h * HOUR_PX }} />
                ))}
                {date === today && nowMinutes !== null && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                    style={{ top: (nowMinutes / 60) * HOUR_PX }} />
                )}
                {placed.map(({ task: t, start, end, lane, lanes }) => {
                  const series = isSeries(t);
                  const movable = !series || !!onAskSeries;
                  const done = t.kind === 'task' && t.status === 'done';
                  const outcome = outcomeOf(t);
                  const EventIcon = t.kind === 'event' ? EVENT_ICON[t.eventType]
                    : outcome && outcome !== 'done' ? OUTCOME_ICON[outcome] : null;
                  const height = Math.max(((end - start) / 60) * HOUR_PX, 18);
                  return (
                    <div key={t.id}
                      role="button"
                      tabIndex={0}
                      draggable={movable}
                      onDragStart={(e) => {
                        grabOffset.current = e.clientY - e.currentTarget.getBoundingClientRect().top;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
                        e.dataTransfer.setData(OCCURRENCE_DRAG_TYPE, date);
                        e.dataTransfer.setData('text/plain', t.title);
                      }}
                      onDragEnd={() => setOver(null)}
                      onClick={(e) => { e.stopPropagation(); onOpen(t); }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(t); }}
                      title={`${t.kind === 'event' ? `${EVENT_TYPE_LABEL[t.eventType]}: ` : ''}${t.title}${series ? ` (${repeatText(t)})` : ''}`}
                      className={`absolute z-10 overflow-hidden rounded border border-white/60 px-1.5 py-0.5 text-[11px] leading-tight shadow-sm ${
                        NOTE_STYLE[t.color].chip
                      } ${movable ? 'cursor-grab' : 'cursor-pointer'} ${outcome ? OUTCOME_STYLE[outcome] : ''} ${
                        stretch?.id === t.id && stretch.date === date ? 'z-30 ring-2 ring-brand-400' : ''
                      }`}
                      style={{
                        top: (start / 60) * HOUR_PX,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    >
                      <span className="flex items-center gap-1 font-medium">
                        {EventIcon && <EventIcon size={10} className="flex-shrink-0" />}
                        <span className="truncate">{t.title}</span>
                      </span>
                      {height > 28 && (
                        <span className="block truncate opacity-75">
                          {formatTime(toHhmm(start))} – {formatTime(toHhmm(end))}
                        </span>
                      )}
                      {stretchable(t) && !done && movable && (
                        <div
                          aria-label="Drag to change how long it lasts"
                          title="Drag to change how long it lasts"
                          onPointerDown={(e) => startStretch(t, date, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize hover:bg-black/10"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
