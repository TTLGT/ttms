'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, Award, Cake, Megaphone, PartyPopper, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { previewCelebrations, type CelebrationRun } from '@/lib/appSettings';
import { officeToday } from '@/types/celebration';

/**
 * "Today is Ana's birthday — TTMS will congratulate her at 8am": a card in the
 * middle of the screen, the first time somebody who holds
 * `celebrations.manage` (admin and HR) opens TTMS on a day with a birthday or
 * a work anniversary.
 *
 * It exists so the automatic post is never a surprise to the people who own
 * its wording: they see what it will say before the company does, with a
 * door to the wording in Settings, and the choice to be asked again later in
 * the day instead of now.
 *
 * - **What it shows is the cron's own preview** (`POST /api/chat/celebrations`,
 *   which writes nothing), so it lists exactly who will be named — anybody who
 *   opted out of being announced is not on it, and it does not say who did.
 *   That route is `celebrations.manage`, the same permission this checks
 *   before asking, so nobody else ever sends the request.
 * - **Dealt with, or put off, per browser** (localStorage, shared between tabs
 *   through the `storage` event), like the break reminders. Nothing is
 *   recorded: it is a heads-up, not a task. A private window asks again on
 *   every load, which is harmless.
 * - **Reads only while there is something to ask about**: once today is
 *   dismissed it stops; while snoozed it waits for the time without reading.
 */

const STORE_KEY = 'ttms.celebrationHeadsUp';
const TICK_MS = 60_000;

interface Stored {
  /** The office day this is about, `YYYY-MM-DD`. Anything else is a fresh day. */
  date: string;
  /** Dealt with for that day. */
  done?: boolean;
  /** Snoozed: ask again from this time (ms). */
  snoozeUntil?: number;
}

function load(today: string): Stored {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (s && s.date === today) {
      return { date: today, done: s.done === true, snoozeUntil: typeof s.snoozeUntil === 'number' ? s.snoozeUntil : undefined };
    }
  } catch {
    // Unreadable or blocked: treated as a fresh day.
  }
  return { date: today };
}

function save(s: Stored): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // Private window: the choice still holds until this tab reloads.
  }
}

/** The "later" choices, in minutes from now. */
const LATER = [
  { label: 'In 1 hour', minutes: 60 },
  { label: 'In 2 hours', minutes: 120 },
  { label: 'In 4 hours', minutes: 240 },
];

/** Today at `HH:MM` in this browser's clock, or null if that time has passed. */
function todayAt(hhmm: string): number | null {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const at = new Date();
  at.setHours(h, m, 0, 0);
  return at.getTime() > Date.now() ? at.getTime() : null;
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function CelebrationHeadsUp() {
  const { can } = useAuth();
  const allowed = can('celebrations.manage');

  const [run, setRun] = useState<CelebrationRun | null>(null);
  const [open, setOpen] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  const [customTime, setCustomTime] = useState('');
  const [timeError, setTimeError] = useState('');

  /** Decides whether the card is due now, fetching today's preview only if it is. */
  const check = useCallback(async () => {
    if (!allowed) return;
    const today = officeToday();
    const s = load(today);
    if (s.done || (s.snoozeUntil && s.snoozeUntil > Date.now())) {
      setOpen(false);
      return;
    }
    try {
      // Refetched when the day has turned, never more than once a day otherwise.
      const current = run && run.date === today ? run : await previewCelebrations();
      setRun(current);
      const somebody = current.celebrations.length > 0
        && (current.outcome === 'preview' || current.outcome === 'already-posted');
      if (somebody) setOpen(true);
      else save({ date: today, done: true }); // Nothing today: stop asking.
    } catch {
      // A failed preview is not worth an error over a heads-up; the next tick tries again.
    }
  }, [allowed, run]);

  useEffect(() => {
    if (!allowed) return;
    void check();
    const timer = window.setInterval(() => void check(), TICK_MS);
    // Dealt with in another tab: close here too.
    const onStorage = (e: StorageEvent) => { if (e.key === STORE_KEY) void check(); };
    window.addEventListener('storage', onStorage);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', onStorage); };
  }, [allowed, check]);

  if (!open || !run) return null;

  const close = (s: Stored) => {
    save(s);
    setOpen(false);
    setLaterOpen(false);
    setCustomTime('');
    setTimeError('');
  };
  const done = () => close({ date: run.date, done: true });
  const snooze = (until: number) => close({ date: run.date, snoozeUntil: until });

  const pickTime = () => {
    const at = todayAt(customTime);
    if (!at) { setTimeError('Pick a time later today.'); return; }
    snooze(at);
  };

  const posted = run.outcome === 'already-posted';
  const birthdays = run.celebrations.filter((c) => c.kind === 'birthday');
  const anniversaries = run.celebrations.filter((c) => c.kind === 'anniversary');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true"
      aria-labelledby="celebration-heads-up-title">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <PartyPopper size={22} className="mt-0.5 shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <h2 id="celebration-heads-up-title" className="text-base font-semibold text-gray-900">
              Celebrations today
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              {posted
                ? 'TTMS has already posted the congratulations in the Everyone room this morning.'
                : 'TTMS will post the congratulations in the Everyone room automatically at 8:00 AM Guatemala time.'}
            </p>
          </div>
          <button type="button" onClick={done} aria-label="Close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <ul className="mt-4 space-y-1.5">
          {birthdays.map((c) => (
            <li key={`b-${c.name}`} className="flex items-center gap-2 text-sm text-gray-800">
              <Cake size={15} className="shrink-0 text-pink-500" />
              <span className="font-medium">{c.name}</span>
              <span className="text-gray-500">— birthday</span>
            </li>
          ))}
          {anniversaries.map((c) => (
            <li key={`a-${c.name}`} className="flex items-center gap-2 text-sm text-gray-800">
              <Award size={15} className="shrink-0 text-amber-500" />
              <span className="font-medium">{c.name}</span>
              <span className="text-gray-500">— {c.years} {c.years === 1 ? 'year' : 'years'} with the company</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Megaphone size={13} /> {posted ? 'What was posted' : 'What will be posted'}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{run.message}</p>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          {posted
            ? 'A change to the wording applies from the next celebration.'
            : 'You can change the wording in Settings before then. People who chose not to be announced are not listed.'}
        </p>

        {laterOpen && (
          <div className="mt-4 rounded-lg border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-700">Remind me again</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LATER.map((o) => (
                <button key={o.minutes} type="button" onClick={() => snooze(Date.now() + o.minutes * 60_000)}
                  className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:border-brand-400 hover:bg-brand-50">
                  {o.label}
                  <span className="ml-1 text-gray-400">({timeOf(Date.now() + o.minutes * 60_000)})</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="celebration-later-time" className="text-xs text-gray-600">At</label>
              <input id="celebration-later-time" type="time" value={customTime}
                onChange={(e) => { setCustomTime(e.target.value); setTimeError(''); }}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-brand-500 focus:ring-brand-500" />
              <button type="button" onClick={pickTime} disabled={!customTime}
                className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                Set
              </button>
            </div>
            {timeError && <p className="mt-1 text-xs text-red-600">{timeError}</p>}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Link href="/dashboard/settings/operations#celebrations" onClick={done}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Change the wording
          </Link>
          {!laterOpen && (
            <button type="button" onClick={() => setLaterOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <AlarmClock size={14} /> Remind me later
            </button>
          )}
          <button type="button" onClick={done}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
