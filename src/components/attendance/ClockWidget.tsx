'use client';

import { useEffect, useState } from 'react';
import { Coffee, LogIn, LogOut, Timer, UtensilsCrossed } from 'lucide-react';
import { useAttendance } from '@/context/AttendanceContext';
import { BREAK_LABEL, formatMinutes, officeClock } from '@/types/attendance';
import { MAX_STATUS_NOTE, USER_STATUSES, USER_STATUS_LABEL, type UserStatus } from '@/types/presence';

/**
 * Clock in and out, breaks, and the status colleagues see — at the foot of
 * the sidebar, on every page.
 *
 * The clock is the record of hours (see src/types/attendance.ts), so it is
 * somewhere nobody has to go looking for it. Drawn for the sidebar, which is
 * brand-900 in both themes, like ThemeSwitch beside it.
 *
 * On the folded rail it shrinks to one icon: Clock in when out (the one
 * action that is safe to put a single click on), and a green clock when in.
 * Clocking out from the rail would be one stray click away from a short day.
 */

/** Office time, like every attendance screen — see DayDetail. */
const time = (ms: number) => officeClock(ms);

export default function ClockWidget({ rail }: { rail: boolean }) {
  const { state, busy, error, clearError, clockIn, clockOut, startBreak, endBreak, setStatus } = useAttendance();
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState('');

  // Minute hand for the running total. Nothing is read or written.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { setNote(state?.statusNote ?? ''); }, [state?.statusNote]);

  if (!state) return null;

  const railIcon = (
    <div className={`${rail ? 'hidden lg:flex' : 'hidden'} justify-center pb-2`}>
      {state.clockedIn ? (
        <span
          title={state.onBreak ? `On ${BREAK_LABEL[state.onBreak].toLowerCase()}` : `Clocked in since ${time(state.sessionStart!)}`}
          className={`rounded-lg p-1.5 ${state.onBreak ? 'text-amber-300' : 'text-green-400'}`}
        >
          <Timer size={18} />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void clockIn()}
          disabled={busy}
          aria-label="Clock in"
          title="Clock in"
          className="rounded-lg p-1.5 text-blue-300 transition hover:bg-brand-700 hover:text-white"
        >
          <LogIn size={18} />
        </button>
      )}
    </div>
  );

  const running = state.sessionStart ? formatMinutes((now - state.sessionStart) / 60_000) : '';

  return (
    <>
      {railIcon}
      <div className={`mb-3 rounded-lg bg-brand-700/50 p-2.5 ${rail ? 'lg:hidden' : ''}`}>
        {!state.clockedIn ? (
          <>
            <button
              type="button"
              onClick={() => void clockIn()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-60"
            >
              <LogIn size={15} /> Clock in
            </button>
            {state.firstClockIn && (
              <p className="mt-1.5 text-center text-[11px] text-blue-300">
                First in today at {time(state.firstClockIn)}
              </p>
            )}
          </>
        ) : state.onBreak ? (
          <>
            <p className="text-xs text-amber-200">
              On {BREAK_LABEL[state.onBreak].toLowerCase()} since {time(state.breakStart!)}
            </p>
            <button
              type="button"
              onClick={() => void endBreak()}
              disabled={busy}
              className="mt-2 w-full rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:opacity-60"
            >
              Back from {BREAK_LABEL[state.onBreak].toLowerCase()}
            </button>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-xs text-green-300">
              <span className="h-2 w-2 rounded-full bg-green-400" aria-hidden />
              In since {time(state.sessionStart!)} · {running}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => void startBreak('break')}
                disabled={busy}
                title="Start a break"
                className="flex items-center justify-center gap-1 rounded-md bg-brand-700 px-1.5 py-1.5 text-[11px] font-medium text-blue-100 transition hover:bg-brand-600 disabled:opacity-60"
              >
                <Coffee size={12} /> Break
              </button>
              <button
                type="button"
                onClick={() => void startBreak('lunch')}
                disabled={busy}
                title="Start lunch"
                className="flex items-center justify-center gap-1 rounded-md bg-brand-700 px-1.5 py-1.5 text-[11px] font-medium text-blue-100 transition hover:bg-brand-600 disabled:opacity-60"
              >
                <UtensilsCrossed size={12} /> Lunch
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Clock out for today?')) void clockOut();
                }}
                disabled={busy}
                title="Clock out"
                className="flex items-center justify-center gap-1 rounded-md bg-red-600/80 px-1.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                <LogOut size={12} /> Out
              </button>
            </div>
          </>
        )}

        {/* What colleagues see in chat. Separate from the clock on purpose:
            "In a meeting" is something to tell people, clocking in is not. */}
        <div className="mt-2 flex items-center gap-1.5">
          <select
            aria-label="Your status"
            value={state.status ?? ''}
            disabled={busy}
            onChange={(e) => void setStatus((e.target.value || null) as UserStatus | null, note)}
            className="min-w-0 flex-1 rounded-md border-0 bg-brand-700 py-1 pl-2 pr-6 text-[11px] text-blue-100 focus:ring-1 focus:ring-brand-400"
          >
            <option value="">Available</option>
            {USER_STATUSES.map((s) => <option key={s} value={s}>{USER_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        {state.status && (
          <input
            type="text"
            value={note}
            maxLength={MAX_STATUS_NOTE}
            placeholder="Add a note (optional)"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => { if (note !== state.statusNote) void setStatus(state.status, note); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="mt-1.5 w-full rounded-md border-0 bg-brand-700 px-2 py-1 text-[11px] text-blue-100 placeholder:text-blue-300/70 focus:ring-1 focus:ring-brand-400"
          />
        )}

        {error && (
          <button type="button" onClick={clearError} className="mt-2 block w-full text-left text-[11px] text-red-300">
            {error} <span className="underline">Dismiss</span>
          </button>
        )}
      </div>
    </>
  );
}
