'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Coffee, PersonStanding, UtensilsCrossed, X } from 'lucide-react';
import { useAttendance } from '@/context/AttendanceContext';
import { showMessageNotification } from '@/lib/chatNotify';
import { SNOOZE_MINUTES, dueReminder, type DueReminder } from '@/types/breakReminders';
import { PAUSE_SAFETY } from '@/types/pauseExercises';
import { officeDateOf } from '@/types/attendance';

/**
 * The clock-in, break, lunch and active-pause reminders: a card in the corner of every
 * page, and a desktop notification when the browser allows one. Both can
 * start the break in one click — clicking the notification itself does it,
 * because a notification raised by a page (rather than a service worker)
 * cannot carry buttons.
 *
 * What is due is decided by `dueReminder()` from the clock state this tab
 * already holds; nothing here reads Firestore. What has been dismissed lives
 * in this browser only and is shared between its tabs through the `storage`
 * event, so dealing with it in one tab clears the card in the others.
 */

const STORE_KEY = 'ttms.breakReminders';
const TICK_MS = 30_000;
const STALE_RELOAD_MS = 30 * 60_000;

interface Stored {
  /** Reminder key → when it may show again. */
  snoozed: Record<string, number>;
  /** Reminder keys already sent to the desktop, so three tabs do not notify three times. */
  notified: Record<string, number>;
}

const EMPTY: Stored = { snoozed: {}, notified: {} };
const DAY_MS = 24 * 60 * 60_000;

function load(): Stored {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return EMPTY;
    const s = JSON.parse(raw) as Partial<Stored>;
    return {
      snoozed: s.snoozed && typeof s.snoozed === 'object' ? s.snoozed : {},
      notified: s.notified && typeof s.notified === 'object' ? s.notified : {},
    };
  } catch {
    return EMPTY;
  }
}

function save(s: Stored): void {
  // Dropped once a day old, so the store never grows past a day's reminders.
  const now = Date.now();
  const fresh = (m: Record<string, number>) =>
    Object.fromEntries(Object.entries(m).filter(([, t]) => t > now - DAY_MS));
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ ...s, snoozed: fresh(s.snoozed), notified: fresh(s.notified) }));
  } catch {
    // Private window: the choice still holds in this tab.
  }
}

const ICON = { clockIn: Clock, break: Coffee, lunch: UtensilsCrossed, activePause: PersonStanding } as const;

export default function BreakReminder() {
  const { state, startBreak, clockIn, refresh, busy } = useAttendance();
  const [stored, setStored] = useState<Stored>(EMPTY);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setStored(load());
    const onStorage = (e: StorageEvent) => { if (e.key === STORE_KEY) setStored(load()); };
    window.addEventListener('storage', onStorage);
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => { window.removeEventListener('storage', onStorage); window.clearInterval(id); };
  }, []);

  const update = useCallback((fn: (s: Stored) => Stored) => {
    setStored((prev) => { const next = fn(prev); save(next); return next; });
  }, []);

  // A tab left open overnight still holds yesterday's clock, which cannot
  // say whether today is a workday or whether somebody has clocked in
  // (perhaps on their phone), so the clock-in reminder waits for a fresh one.
  // Read again while the state is for an earlier day — every half hour, not
  // once: a session left open last night keeps the state on yesterday until
  // the 3am close, and a single read at midnight would see only that.
  const today = officeDateOf(now);
  const lastReload = useRef(0);
  useEffect(() => {
    if (!state || state.date === today || Date.now() - lastReload.current < STALE_RELOAD_MS) return;
    lastReload.current = Date.now();
    void refresh();
  }, [state, today, now, refresh]);

  const due: DueReminder | null = useMemo(
    () => (state ? dueReminder(state, now, stored.snoozed) : null),
    [state, now, stored],
  );

  /** Dealt with: gone for the day. */
  const finish = useCallback((r: DueReminder) => {
    update((s) => ({
      ...s,
      snoozed: { ...s.snoozed, [r.key]: Date.now() + DAY_MS },
    }));
  }, [update]);

  const later = useCallback((r: DueReminder) => {
    update((s) => ({ ...s, snoozed: { ...s.snoozed, [r.key]: Date.now() + SNOOZE_MINUTES * 60_000 } }));
  }, [update]);

  const act = useCallback((r: DueReminder) => {
    finish(r);
    if (r.kind === 'clockIn') void clockIn();
    else if (r.starts) void startBreak(r.starts);
  }, [finish, startBreak, clockIn]);

  // Once per reminder per browser. The tag is the reminder's key, so a second
  // tab racing the first replaces its notification rather than adding one.
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    if (!due || stored.notified[due.key]) return;
    update((s) => ({ ...s, notified: { ...s.notified, [due.key]: Date.now() } }));
    // A desktop notification has room for a few lines, so an active pause
    // names the day's exercises in both languages and leaves the steps to the card.
    const body = due.exercises
      ? [due.exercises.map((x) => x.name.en).join(', '), due.exercises.map((x) => x.name.es).join(', '), 'Click to see the steps.'].join('\n')
      : `${due.body}\n${due.kind === 'clockIn' ? 'Click to clock in.' : due.starts ? `Click to start your ${due.starts}.` : 'Click when you are done.'}`;
    showMessageNotification({
      title: due.title,
      body,
      tag: `ttms-reminder-${due.key}`,
      requireInteraction: true,
      // A pause's click only brings TTMS forward: the steps are on the card,
      // and marking it done before reading them would hide them.
      onClick: () => { if (due.starts || due.kind === 'clockIn') actRef.current(due); },
    });
  }, [due, stored.notified, update]);

  if (!due) return null;
  const Icon = ICON[due.kind];
  const pauseMinutes = state?.reminders.activePause.minutes ?? 5;

  return (
    <div role="status" aria-live="polite"
      className={`fixed bottom-20 right-5 z-50 flex max-h-[calc(100vh-7rem)] flex-col rounded-xl border border-brand-200 bg-white p-4 shadow-lg ${
        due.exercises ? 'w-[min(28rem,calc(100vw-2.5rem))]' : 'w-[min(22rem,calc(100vw-2.5rem))]'}`}>
      <div className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5 flex-shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{due.title}</p>
          <p className="mt-1 text-sm text-gray-600">{due.body}</p>
          {due.exercises && (
            <p lang="es" data-learn-skip className="text-sm text-gray-500">
              Toma {pauseMinutes} minuto{pauseMinutes === 1 ? '' : 's'} para los ejercicios de hoy.
            </p>
          )}
        </div>
        <button type="button" aria-label="Dismiss for today" title="Dismiss"
          onClick={() => finish(due)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>
      {due.exercises && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <ol className="space-y-3">
            {due.exercises.map((x, i) => (
              <li key={x.id} className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-900">
                  {i + 1}. {x.name.en}
                  <span lang="es" data-learn-skip className="font-normal text-gray-500"> · {x.name.es}</span>
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
                  {x.steps.en.map((s) => <li key={s}>{s}</li>)}
                </ul>
                <ul lang="es" data-learn-skip className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-gray-500">
                  {x.steps.es.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-gray-500">
            {PAUSE_SAFETY.en} <span lang="es" data-learn-skip>{PAUSE_SAFETY.es}</span>
          </p>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => later(due)}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
          In {SNOOZE_MINUTES} minutes{due.exercises ? ` · En ${SNOOZE_MINUTES} minutos` : ''}
        </button>
        <button type="button" disabled={busy} onClick={() => act(due)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {due.kind === 'clockIn' ? 'Clock in' : due.starts === 'lunch' ? 'Start lunch' : due.starts === 'break' ? 'Start break' : 'Done · Listo'}
        </button>
      </div>
    </div>
  );
}
