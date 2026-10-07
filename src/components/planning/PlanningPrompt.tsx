'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, BellRing, CalendarCheck, CalendarClock, CalendarDays, CheckSquare, MoveRight, Repeat, Search, X,
} from 'lucide-react';
import { getMyPlanning, getMyPlanningDay, linkMyPlanning, scheduleMyPlanning, setMyPlanningPrompt } from '@/lib/planning';
import { listMyTasks, updateMyTask } from '@/lib/personalTasks';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  NTH_LABEL, calendarToday, formatTime, nthPatternLabel, oneMonthAfter, repeatText, timeRange, type PersonalTask,
} from '@/types/task';
import {
  PLANNING_ASK_EVENT,
  PLANNING_CHANGED_EVENT,
  PLANNING_COPY,
  PLANNING_DEFAULT_DURATION,
  PLANNING_DEFAULT_NTH,
  PLANNING_DEFAULT_TIME,
  PLANNING_DEFAULT_WEEKDAY,
  PLANNING_DURATIONS,
  PLANNING_FALLBACK_SHIFT,
  PLANNING_NTHS,
  PLANNING_WEEKDAYS,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  addMinutes,
  canBePlanningSlot,
  clashes,
  durationLabel,
  firstPlanningDate,
  freeStarts,
  isDailyKind,
  isPlanningKind,
  itemEnd,
  officeNowTime,
  relativeDay,
  shiftQuarterHours,
  shiftedEnd,
  type DayItem,
  type PlanningDay,
  type PlanningKind,
  type PlanningStatus,
} from '@/types/planning';
import TimeWheel from './TimeWheel';

/**
 * The planning card: "When will you plan tomorrow?", a time wheel, how long,
 * whether it repeats, and the day it lands on — with one button that puts the
 * slot on the person's own calendar with a reminder at that time. See
 * src/types/planning.ts for when it asks.
 *
 * Mounted once in the dashboard layout. It asks the server once per full page
 * load, waits a moment so it does not land on top of a page still drawing,
 * and walks through whichever kinds are due one after another, with a
 * progress bar across the top so it is clear how many there are.
 *
 * **"Your day"** is the day the slot lands on, inside the person's working
 * hours: what is already booked, whether the slot sits on top of any of it,
 * the first free time if it does, and — when nothing of that length is free —
 * a way to move things out of the way without leaving the card. Moving is an
 * ordinary save of that item; a date of a repeating event is the one thing it
 * cannot move, because that would move the whole series.
 *
 * **"Use one you have"** lists the person's own timed tasks and events and
 * links the one they pick (PUT /api/me/planning) instead of making a new
 * slot — for somebody who already put "Planeamiento diario" on their
 * calendar. They choose; nothing is recognised by its title.
 *
 * The close button hides it for the rest of the day in this browser and saves
 * nothing — somebody closing it mid-call has not said "not now" to anything.
 * "Not now" and "Don't ask again" are the answers that are kept.
 */

const CLOSED_KEY = 'ttms.planningPrompt.closed';
const SHOW_AFTER_MS = 2500;

// All 24 hours on one wheel, drawn 12-hour: scrolling on from 11 AM reaches
// 12 PM and flips the AM/PM wheel with it, instead of stopping at the end of
// a twelve-row list.
const HOURS = Array.from({ length: 24 }, (_, i) => i);
// Every minute. People plan at 7:40, not only on the quarter hour.
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const HALVES = ['AM', 'PM'] as const;

/** Today in this browser — only for "closed today", which is this browser's own business. */
function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function closedToday(): boolean {
  try { return window.localStorage.getItem(CLOSED_KEY) === localDay(); } catch { return false; }
}

function rememberClosed() {
  try { window.localStorage.setItem(CLOSED_KEY, localDay()); } catch { /* fine: it asks again next load */ }
}

function toHHMM(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** The next five-minute mark after `hhmm`, or null if that runs past midnight. */
function nextFiveMinutes(hhmm: string): string | null {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.floor((h * 60 + m) / 5) * 5 + 5;
  return total >= 24 * 60 ? null : toHHMM(Math.floor(total / 60), total % 60);
}

/** The next Monday–Friday after `date`, for "move to the next working day". */
function nextWorkday(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  let at = new Date(Date.UTC(y, m - 1, d + 1));
  while ([0, 6].includes(at.getUTCDay())) at = new Date(at.getTime() + 86_400_000);
  return at.toISOString().slice(0, 10);
}

function cadence(kind: PlanningKind, weekday: number, nth: number, everyWeekday: boolean): string {
  if (isDailyKind(kind)) return everyWeekday ? 'Every weekday' : 'Just this once';
  if (kind === 'weekly') return `Every ${WEEKDAY_LONG[weekday]}`;
  const label = nthPatternLabel(weekday, [nth]);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function PlanningPrompt() {
  const { formatCalendarDate } = useDateFormatters();
  const [queue, setQueue] = useState<PlanningKind[]>([]);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<PlanningStatus | null>(null);

  const [time, setTime] = useState(PLANNING_DEFAULT_TIME.morning);
  // Once the person has turned the wheel, their time stands; until then the
  // daily ones follow their own shift when it arrives.
  const [timeTouched, setTimeTouched] = useState(false);
  const [minutes, setMinutes] = useState(PLANNING_DEFAULT_DURATION.morning);
  const [weekday, setWeekday] = useState(PLANNING_DEFAULT_WEEKDAY);
  const [nth, setNth] = useState(PLANNING_DEFAULT_NTH);
  const [everyWeekday, setEveryWeekday] = useState(false);

  const [day, setDay] = useState<PlanningDay | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  // "Use one you have": the person's own list, read only when asked for —
  // it is the whole list, so not on every card — and kept across kinds.
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<PersonalTask[] | null>(null);
  const [filter, setFilter] = useState('');
  const [linked, setLinked] = useState<PersonalTask | null>(null);
  // Items already standing for some kind, so one is not offered twice.
  const [takenIds, setTakenIds] = useState<string[]>([]);

  const startKind = useCallback((k: PlanningKind) => {
    setTime(PLANNING_DEFAULT_TIME[k]);
    setTimeTouched(false);
    setMinutes(PLANNING_DEFAULT_DURATION[k]);
    setWeekday(PLANNING_DEFAULT_WEEKDAY);
    setNth(PLANNING_DEFAULT_NTH);
    setEveryWeekday(false);
    setDay(null);
    setMoving(null);
    setAdded(null);
    setError('');
    setPicking(false);
    setFilter('');
    setLinked(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ask = async (only: PlanningKind | null) => {
      try {
        const kinds = await getMyPlanning();
        // Asked for one from the Calendar page: that one, unless it is already
        // on the calendar, whatever the hour or a snooze would say.
        const due = only
          ? kinds.filter((k) => k.kind === only && !k.scheduled).map((k) => k.kind)
          : kinds.filter((k) => k.due).map((k) => k.kind);
        if (cancelled || !due.length || (!only && closedToday())) return;
        setTakenIds(kinds.flatMap((k) => (k.scheduled ? [k.scheduled.taskId] : [])));
        setQueue(due);
        setStep(0);
        startKind(due[0]);
        setOpen(true);
      } catch {
        // A prompt that cannot load is a prompt nobody misses. Say nothing.
      }
    };
    const timer = closedToday() ? null : setTimeout(() => ask(null), SHOW_AFTER_MS);
    const onAsk = (e: Event) => {
      const asked = (e as CustomEvent).detail;
      ask(isPlanningKind(asked) ? asked : null);
    };
    window.addEventListener(PLANNING_ASK_EVENT, onAsk);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(PLANNING_ASK_EVENT, onAsk);
    };
  }, [startKind]);

  const kind = queue[step];
  const [h, m] = time.split(':').map(Number);
  const half: 'AM' | 'PM' = h < 12 ? 'AM' : 'PM';
  const copy = kind ? PLANNING_COPY[kind] : null;

  // The day the slot lands on, worked out the same way the server will.
  const date = useMemo(
    () => (kind ? firstPlanningDate(kind, time, { weekday, nth }) : ''),
    [kind, time, weekday, nth],
  );

  const loadDay = useCallback(async (d: string) => {
    try { setDay(await getMyPlanningDay(d)); } catch { setDay(null); }
  }, []);

  useEffect(() => {
    if (!open || !date || added) return;
    loadDay(date);
  }, [open, date, added, loadDay]);

  // The daily ones start from the person's own hours: the morning review at
  // the start of the shift, tomorrow's plan just before it ends.
  useEffect(() => {
    if (!day?.shift || timeTouched || !kind || !isDailyKind(kind) || day.date !== date) return;
    let want = kind === 'morning' ? day.shift.start : addMinutes(day.shift.end, -minutes);
    // Opened after the shift has started, the start has gone by and the slot
    // would slide to the next working day — a look at "today's plan" dated
    // tomorrow. Start it in a few minutes instead, while it is still today.
    if (kind === 'morning') {
      const today = calendarToday();
      const soon = nextFiveMinutes(officeNowTime());
      if (soon && want <= officeNowTime() && firstPlanningDate(kind, soon, {}) === today) want = soon;
    }
    if (want !== time) setTime(want);
  }, [day, timeTouched, kind, date, minutes, time]);

  // Escape is the close button, as on every other thing that covers the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      rememberClosed();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !kind || !copy) return null;

  const sameDay = day && day.date === date ? day : null;
  const overlapping = sameDay ? clashes(sameDay.items, time, minutes) : [];
  const notBefore = date === calendarToday() ? officeNowTime() : null;
  const free = sameDay ? freeStarts(sameDay, minutes, notBefore) : [];
  const outsideHours = !!sameDay?.shift && (time < sameDay.shift.start || addMinutes(time, minutes) > sameDay.shift.end);
  const full = !!sameDay?.shift && free.length === 0;

  function close() {
    rememberClosed();
    setOpen(false);
  }

  function next() {
    if (step + 1 >= queue.length) { setOpen(false); return; }
    setStep(step + 1);
    startKind(queue[step + 1]);
  }

  function pickTime(t: string) {
    setTime(t);
    setTimeTouched(true);
  }

  async function add() {
    setBusy(true);
    setError('');
    try {
      setAdded(await scheduleMyPlanning({ kind, time, minutes, weekday, nth, everyWeekday }));
      window.dispatchEvent(new Event(PLANNING_CHANGED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add it to your calendar.');
    } finally {
      setBusy(false);
    }
  }

  async function openPicker() {
    setPicking(true);
    setError('');
    if (candidates) return;
    try {
      const { tasks } = await listMyTasks();
      const today = calendarToday();
      setCandidates(tasks
        .filter((t) => canBePlanningSlot(t, today))
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your list.');
      setCandidates([]);
    }
  }

  async function link(task: PersonalTask) {
    setBusy(true);
    setError('');
    try {
      setAdded(await linkMyPlanning(kind, task.id));
      setLinked(task);
      setTakenIds((ids) => [...ids, task.id]);
      window.dispatchEvent(new Event(PLANNING_CHANGED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that one.');
    } finally {
      setBusy(false);
    }
  }

  async function answer(action: 'snooze' | 'off') {
    setBusy(true);
    try {
      await setMyPlanningPrompt(kind, action);
      window.dispatchEvent(new Event(PLANNING_CHANGED_EVENT));
    } catch {
      // Not saved: it will ask again next time, which is the harmless failure.
    } finally {
      setBusy(false);
      next();
    }
  }

  /** Move one thing on the day: a new start (keeping its length), or the next working day. */
  async function move(item: DayItem, to: { time?: string; date?: string }) {
    setBusy(true);
    setError('');
    try {
      const patch = to.time
        ? { time: to.time, ...(item.kind === 'event' ? { endTime: shiftedEnd(item.time, item.endTime, to.time) } : {}) }
        : { date: to.date };
      await updateMyTask(item.id, patch);
      window.dispatchEvent(new Event(PLANNING_CHANGED_EVENT));
      setMoving(null);
      await loadDay(date);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move that.');
    } finally {
      setBusy(false);
    }
  }

  const last = step + 1 >= queue.length;
  const dayName = (d: string) => relativeDay(d) ?? formatCalendarDate(d);
  const range = `${formatTime(time)} – ${formatTime(addMinutes(time, minutes))}`;
  const chip = (on: boolean) => `rounded-lg py-1.5 text-xs font-semibold ${
    on ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true"
      aria-labelledby="planning-prompt-title">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
        {/* How many of these there are, so the second one is not a surprise. */}
        <div className="flex items-center gap-3 px-5 pt-4">
          <div className="flex flex-1 gap-1.5">
            {queue.map((k, i) => (
              <div key={k} className={`h-2 flex-1 rounded-full ${
                i < step || (i === step && added) ? 'bg-brand-500' : i === step ? 'bg-brand-100' : 'bg-gray-200'
              }`} />
            ))}
          </div>
          <button type="button" onClick={close} aria-label="Close for today"
            title="Close for today" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {added ? (
          <div className="px-6 pb-6 pt-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CalendarCheck size={28} />
            </div>
            <h2 id="planning-prompt-title" className="mt-4 text-lg font-bold text-gray-900">
              {linked ? `“${linked.title}” is your ${copy.label.toLowerCase()}` : `${copy.title} is on your calendar`}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {added.scheduled?.date && <>{dayName(added.scheduled.date)}, </>}
              {formatTime(added.scheduled?.time ?? time)}
              {added.scheduled?.endTime && <> – {formatTime(added.scheduled.endTime)}</>}
              {added.scheduled && added.scheduled.repeat !== 'none' && <>. {repeatText(added.scheduled)}</>}.
            </p>
            {added.scheduled?.repeat === 'none' && (
              <p className="mt-1 text-xs text-gray-500">
                {linked
                  ? 'It does not repeat, so you will be asked again once it has passed.'
                  : 'Just this once — you will be asked again next working day.'}
              </p>
            )}
            {added.scheduled && added.scheduled.repeat !== 'none' && added.scheduled.repeatUntil && (
              <p className="mt-1 text-xs text-gray-500">
                Until {formatCalendarDate(added.scheduled.repeatUntil)}. Then you will be asked whether to keep it — a
                month at a time keeps it worth doing.
              </p>
            )}
            {/* A linked item keeps the reminders its owner gave it; say so rather than add one. */}
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <BellRing size={13} />
              {linked && linked.reminders.length === 0
                ? 'It has no reminder. Add one on the item if you want a nudge.'
                : 'You will get a reminder when it is time.'}
            </p>
            <button type="button" onClick={next}
              className="mt-6 w-full rounded-xl bg-brand-600 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-700">
              {last ? 'Done' : 'Continue'}
            </button>
            <Link href="/dashboard/calendar" onClick={() => setOpen(false)}
              className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
              Open my calendar
            </Link>
          </div>
        ) : picking ? (
          <PickExisting
            label={copy.label}
            candidates={candidates?.filter((t) => !takenIds.includes(t.id)) ?? null}
            filter={filter}
            onFilter={setFilter}
            busy={busy}
            error={error}
            dayName={dayName}
            onPick={link}
            onBack={() => { setPicking(false); setError(''); }}
          />
        ) : (
          <div className="overflow-y-auto px-5 pb-5 pt-4">
            {/* The headline is the ask itself, large: this card interrupts the
                page, so the one thing it wants has to be read at a glance. */}
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md">
                <CalendarClock size={24} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">{copy.label}</p>
                <h2 id="planning-prompt-title" className="text-xl font-bold leading-snug text-gray-900">
                  {copy.ask}
                </h2>
                <p className="mt-0.5 text-sm text-gray-600">{copy.prompt}</p>
              </div>
            </div>
            {kind === 'morning' && (
              <p className="mt-2 text-xs text-gray-500">
                Planned today last night? Then this is a quick look over it. If not, this is when you make the plan.
              </p>
            )}

            {/* What will land on the calendar, drawn the way it will look there. */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex gap-3">
                <div className="w-1 flex-shrink-0 rounded-full bg-green-500" />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{copy.title}</p>
                  <p className="text-sm text-gray-500">{dayName(date)} · {range}</p>
                  <p className="text-xs text-gray-400">
                    {cadence(kind, weekday, nth, everyWeekday)}
                    {/* Every repeat ends — a month, like any other (REPEAT_ADVICE). */}
                    {(!isDailyKind(kind) || everyWeekday) && <>, until {formatCalendarDate(oneMonthAfter(date))}</>}
                  </p>
                </div>
              </div>

              {!isDailyKind(kind) && (
                <>
                  {kind === 'monthly' && <p className="mt-4 text-center text-xs font-semibold text-gray-400">Which one of the month</p>}
                  {kind === 'monthly' && (
                    <div className="mt-1.5 flex justify-between gap-1" role="radiogroup" aria-label="Which one of the month">
                      {PLANNING_NTHS.map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={nth === n}
                          onClick={() => setNth(n)} className={`flex-1 ${chip(nth === n)}`}>
                          {NTH_LABEL[n]}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={`${kind === 'monthly' ? 'mt-2' : 'mt-4'} flex justify-between gap-1`} role="radiogroup"
                    aria-label="Day of the week">
                    {PLANNING_WEEKDAYS.map((d) => (
                      <button key={d} type="button" role="radio" aria-checked={weekday === d}
                        onClick={() => setWeekday(d)} className={`flex-1 ${chip(weekday === d)}`}>
                        {WEEKDAY_SHORT[d]}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-4 rounded-xl border-2 border-brand-300 bg-white px-3 py-2">
                <p className="text-center text-xs font-semibold text-gray-400">Start time</p>
                <div className="relative mt-1 flex items-center justify-center gap-1">
                  {/* The middle row, marked the way a phone's picker marks it. */}
                  <div className="pointer-events-none absolute inset-x-2 top-1/2 h-10 -translate-y-1/2 border-y border-gray-200" />
                  <TimeWheel label="Hour" options={HOURS} value={h}
                    render={(v) => String(v % 12 || 12)}
                    onChange={(v) => pickTime(toHHMM(v, m))} />
                  <span className="text-xl font-semibold text-gray-900">:</span>
                  <TimeWheel label="Minutes" options={MINUTES} value={m}
                    render={(v) => String(v).padStart(2, '0')}
                    onChange={(v) => pickTime(toHHMM(h, v))} />
                  <TimeWheel label="AM or PM" options={HALVES} value={half}
                    onChange={(v) => pickTime(toHHMM((h % 12) + (v === 'PM' ? 12 : 0), m))} />
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-gray-400">Office time (Guatemala)</p>
              {/* Today would have been the day but for the clock: say so, or the jump looks like a bug. */}
              {date !== calendarToday() && firstPlanningDate(kind, time, { weekday, nth }, calendarToday(), '00:00') === calendarToday() && (
                <p className="mt-1 text-center text-xs text-amber-700">
                  {formatTime(time)} has already gone by today, so this goes on {relativeDay(date) === 'Tomorrow' ? 'tomorrow' : formatCalendarDate(date)}.
                </p>
              )}

              <p className="mt-3 text-center text-xs font-semibold text-gray-400">How long</p>
              <div className="mt-1.5 flex justify-between gap-1" role="radiogroup" aria-label="How long">
                {PLANNING_DURATIONS.map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={minutes === d}
                    onClick={() => setMinutes(d)} className={`flex-1 ${chip(minutes === d)}`}>
                    {durationLabel(d)}
                  </button>
                ))}
              </div>

              {isDailyKind(kind) && (
                <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={everyWeekday} onChange={(e) => setEveryWeekday(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <span>
                    <span className="flex items-center gap-1 font-medium"><Repeat size={13} /> Repeat every weekday at this time</span>
                    <span className="block text-xs text-gray-500">
                      Leave it off if you plan at different times — you will be asked again next working day.
                    </span>
                  </span>
                </label>
              )}
            </div>

            <DayView
              day={sameDay}
              dayLabel={dayName(date)}
              slot={{ time, minutes, title: copy.title }}
              overlapping={overlapping}
              outsideHours={outsideHours}
              full={full}
              free={free}
              moving={moving}
              busy={busy}
              onUseFree={pickTime}
              onMoving={setMoving}
              onMove={move}
              nextDay={sameDay ? nextWorkday(sameDay.date) : ''}
              nextDayLabel={sameDay ? dayName(nextWorkday(sameDay.date)) : ''}
            />

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button type="button" onClick={add} disabled={busy}
              className="mt-5 w-full rounded-xl bg-brand-600 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-700 disabled:opacity-60">
              {busy ? 'Saving…' : 'Add to calendar'}
            </button>
            <button type="button" onClick={openPicker} disabled={busy}
              className="mt-2 w-full text-center text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
              Already on your calendar? Use one you have
            </button>
            <div className="mt-3 flex items-center justify-between text-xs">
              <button type="button" onClick={() => answer('snooze')} disabled={busy}
                className="font-medium text-gray-500 hover:text-gray-700">
                Not now
              </button>
              <button type="button" onClick={() => answer('off')} disabled={busy}
                className="text-gray-400 hover:text-gray-600">
                Don&rsquo;t ask again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Use one you have": the person's own tasks and events that could stand as
 * this slot (`canBePlanningSlot()`), soonest first, with a box to narrow them
 * by title. Picking one is the whole of the recognising.
 */
function PickExisting({
  label, candidates, filter, onFilter, busy, error, dayName, onPick, onBack,
}: {
  label: string;
  candidates: PersonalTask[] | null;
  filter: string;
  onFilter: (v: string) => void;
  busy: boolean;
  error: string;
  dayName: (d: string) => string;
  onPick: (t: PersonalTask) => void;
  onBack: () => void;
}) {
  const words = filter.trim().toLowerCase();
  const shown = candidates?.filter((t) => !words || t.title.toLowerCase().includes(words)) ?? null;
  return (
    <div className="flex min-h-0 flex-col px-5 pb-5 pt-4">
      <button type="button" onClick={onBack}
        className="flex items-center gap-1 self-start text-xs font-medium text-gray-500 hover:text-gray-700">
        <ArrowLeft size={13} /> Back
      </button>
      <h2 id="planning-prompt-title" className="mt-2 text-lg font-bold text-gray-900">
        Which one is your {label.toLowerCase()}?
      </h2>
      <p className="mt-0.5 text-sm text-gray-600">
        Pick a task or event you already have. It stays as it is; you just won&rsquo;t be asked to add another.
      </p>
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-gray-300 px-2.5 py-1.5">
        <Search size={14} className="text-gray-400" />
        <input type="text" value={filter} onChange={(e) => onFilter(e.target.value)} placeholder="Search by name"
          className="w-full border-0 p-0 text-sm focus:ring-0" />
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {!shown ? (
          <p className="py-6 text-center text-xs text-gray-400">Loading your list…</p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">
            {candidates?.length
              ? 'Nothing matches that.'
              : 'Nothing to pick. Only tasks and events still to come, with a day and a time, can be used.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {shown.map((t) => (
              <li key={t.id}>
                <button type="button" disabled={busy} onClick={() => onPick(t)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-100 disabled:opacity-50">
                  {t.kind === 'event'
                    ? <CalendarDays size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                    : <CheckSquare size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-800">{t.title}</span>
                    <span className="block text-xs text-gray-500">
                      {t.repeat === 'none' ? dayName(t.date ?? '') : repeatText(t)}, {timeRange(t)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * "Your day": the working hours of the day the slot lands on, what is on it,
 * and where the slot would go. Moving something is offered on every item and
 * pressed hardest when nothing of the chosen length is free.
 */
function DayView({
  day, dayLabel, slot, overlapping, outsideHours, full, free, moving, busy,
  onUseFree, onMoving, onMove, nextDay, nextDayLabel,
}: {
  day: PlanningDay | null;
  dayLabel: string;
  slot: { time: string; minutes: number; title: string };
  overlapping: DayItem[];
  outsideHours: boolean;
  full: boolean;
  free: string[];
  moving: string | null;
  busy: boolean;
  onUseFree: (time: string) => void;
  onMoving: (id: string | null) => void;
  onMove: (item: DayItem, to: { time?: string; date?: string }) => void;
  nextDay: string;
  nextDayLabel: string;
}) {
  if (!day) {
    return <p className="mt-4 text-center text-xs text-gray-400">Looking at your day…</p>;
  }
  const items = day.items.filter((i) => !i.planning);
  const slotEnd = addMinutes(slot.time, slot.minutes);
  // The slot drawn in its place among the rest, so "where does it go" is a glance.
  const rows: ({ slot: true } | { slot: false; item: DayItem })[] = [];
  let placed = false;
  for (const item of items) {
    if (!placed && slot.time <= item.time) { rows.push({ slot: true }); placed = true; }
    rows.push({ slot: false, item });
  }
  if (!placed) rows.push({ slot: true });
  const firstFree = free.find((t) => t !== slot.time);
  const isOverlapping = (id: string) => overlapping.some((o) => o.id === id);

  return (
    <section className="mt-4 rounded-xl border border-gray-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Your day · {dayLabel}</h3>
        <span className="text-[11px] text-gray-500">
          {day.shift ? `${formatTime(day.shift.start)} – ${formatTime(day.shift.end)}` : 'Not a working day'}
        </span>
      </div>
      {!day.scheduleSet && (
        <p className="mt-0.5 text-[11px] text-gray-400">
          No work schedule is set for you, so {formatTime(PLANNING_FALLBACK_SHIFT.start)} – {formatTime(PLANNING_FALLBACK_SHIFT.end)} is assumed.
        </p>
      )}

      {(overlapping.length > 0 || outsideHours || full) && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <div>
            {full
              ? <>Nothing {durationLabel(slot.minutes)} long is free in your working hours. Move something below to make room, or pick a shorter time.</>
              : overlapping.length > 0
                ? <>This overlaps {overlapping.map((i) => i.title).join(', ')}.</>
                : <>This is outside your working hours.</>}
            {!full && firstFree && (
              <button type="button" onClick={() => onUseFree(firstFree)}
                className="ml-1 font-semibold text-amber-900 underline hover:no-underline">
                Use {formatTime(firstFree)} instead
              </button>
            )}
          </div>
        </div>
      )}

      <ul className="mt-2 space-y-1">
        {rows.map((row) => row.slot ? (
          <li key="slot" className="flex items-center gap-2 rounded-md border border-dashed border-green-500 bg-green-50 px-2 py-1 text-xs">
            <span className="w-28 flex-shrink-0 tabular-nums text-green-700">{formatTime(slot.time)} – {formatTime(slotEnd)}</span>
            <span className="truncate font-medium text-green-800">{slot.title}</span>
          </li>
        ) : (
          <li key={row.item.id} className={`rounded-md px-2 py-1 text-xs ${isOverlapping(row.item.id) ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-2">
              <span className="w-28 flex-shrink-0 tabular-nums text-gray-500">
                {formatTime(row.item.time)} – {formatTime(itemEnd(row.item))}
                {!row.item.endTime && <span title="A task with no end time is counted as about 30 minutes">*</span>}
              </span>
              <span className="min-w-0 flex-1 truncate text-gray-800">{row.item.title}</span>
              {row.item.series ? (
                <span className="flex-shrink-0 text-[10px] text-gray-400" title="Part of a repeating event — change it on the Calendar">
                  Repeats
                </span>
              ) : (
                <button type="button" disabled={busy}
                  onClick={() => onMoving(moving === row.item.id ? null : row.item.id)}
                  className={`flex flex-shrink-0 items-center gap-0.5 font-medium hover:underline ${
                    full || isOverlapping(row.item.id) ? 'text-brand-700' : 'text-gray-500'
                  }`}>
                  <MoveRight size={11} /> Move
                </button>
              )}
            </div>
            {moving === row.item.id && day.shift && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
                <label className="flex items-center gap-1 text-gray-600">
                  To
                  <select defaultValue="" disabled={busy}
                    onChange={(e) => { if (e.target.value) onMove(row.item, { time: e.target.value }); }}
                    className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs">
                    <option value="" disabled>a new time…</option>
                    {shiftQuarterHours(day.shift).filter((t) => t !== row.item.time).map((t) => (
                      <option key={t} value={t}>{formatTime(t)}</option>
                    ))}
                  </select>
                </label>
                <span className="text-gray-400">or</span>
                <button type="button" disabled={busy} onClick={() => onMove(row.item, { date: nextDay })}
                  className="rounded border border-gray-300 bg-white px-1.5 py-0.5 font-medium text-gray-700 hover:bg-gray-100">
                  {nextDayLabel}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="mt-1 text-[11px] text-gray-400">Nothing else with a time on this day.</p>
      )}
    </section>
  );
}
