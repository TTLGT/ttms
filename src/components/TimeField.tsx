'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import TimeWheel from '@/components/planning/TimeWheel';
import { formatTime } from '@/types/task';

/**
 * A box for a time of day that can be typed into, with a clock button that
 * opens the planning card's wheels.
 *
 * This replaces `<input type="time">` where it was used for tasks. The browser's
 * own picker drops down two columns that a mouse wheel flings through several
 * rows a notch, so people kept sailing past the time they wanted, and its
 * typing is segment by segment — few people realised it could be typed into at
 * all. `TimeWheel` moves one row per notch, and the text half takes a time
 * written any ordinary way.
 *
 * The value in and out is `HH:MM` (24-hour), or '' for none — the same contract
 * the native input had, so nothing downstream knows the difference. Typing is
 * only committed on blur or Enter, not per keystroke: "7" on its way to "7:45"
 * is already a readable time, and committing it would move an end time that
 * follows the start back and forth while somebody types.
 */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const HALVES = ['AM', 'PM'] as const;

function toHHMM(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Reads "7:55", "7:55 am", "755", "7am", "7 p.m.", "19:30", "1930".
 *
 * Without an AM or PM, 13–23 and 0 are read as the 24-hour clock, and 1–6 as
 * the afternoon: nobody here plans work for 3 in the morning, and "3:00"
 * typed into a task means 3 PM far more often than not. 7–11 are the morning
 * and 12 is noon. The box is rewritten as "3:00 PM" on blur, so what was
 * understood is on screen before anything is saved.
 */
export function parseTimeInput(raw: string): { ok: true; hhmm: string } | { ok: false; empty: boolean } {
  const s = raw.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
  if (!s) return { ok: false, empty: true };
  const m = s.match(/^(\d{1,4})(?::|h)?(\d{2})?(am?|pm?)?$/);
  if (!m) return { ok: false, empty: false };
  let hour: number;
  let minute: number;
  if (m[2] !== undefined) {
    hour = Number(m[1]);
    minute = Number(m[2]);
  } else if (m[1].length >= 3) {
    // "755" and "1930" — the last two digits are the minutes.
    hour = Number(m[1].slice(0, -2));
    minute = Number(m[1].slice(-2));
  } else {
    hour = Number(m[1]);
    minute = 0;
  }
  if (minute > 59) return { ok: false, empty: false };
  const half = m[3]?.[0];
  if (half) {
    if (hour < 1 || hour > 12) return { ok: false, empty: false };
    hour = (hour % 12) + (half === 'p' ? 12 : 0);
  } else {
    if (hour > 23) return { ok: false, empty: false };
    if (hour >= 1 && hour <= 6) hour += 12;
  }
  return { ok: true, hhmm: toHHMM(hour, minute) };
}

interface TimeFieldProps {
  /** `HH:MM`, or '' for empty. */
  value: string;
  /** Called with `HH:MM`, or '' when the box is emptied or unreadable. */
  onChange: (value: string) => void;
  /** The classes the native input carried, so each form keeps its own look. */
  className?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}

export default function TimeField({ value, onChange, className = '', disabled = false, id, ariaLabel }: TimeFieldProps) {
  const [text, setText] = useState(formatTime(value));
  const [focused, setFocused] = useState(false);
  const [problem, setProblem] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Redraw from the stored value when it changes underneath — the wheels, the
  // end following the start — but never mid-typing.
  useEffect(() => {
    if (!focused) setText(formatTime(value));
  }, [value, focused]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  // Closes on a click anywhere else, and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  function commit() {
    const parsed = parseTimeInput(text);
    if (parsed.ok) {
      setText(formatTime(parsed.hhmm));
      setProblem('');
      if (parsed.hhmm !== value) onChange(parsed.hhmm);
      return;
    }
    if (parsed.empty) {
      setProblem('');
      if (value) onChange('');
      return;
    }
    // Leave the typing on screen so it can be fixed, and store nothing, so a
    // mistyped time is never saved as if it were meant.
    setProblem('Not a time TTMS can read. Try 7:45 AM or 3 pm.');
    if (value) onChange('');
  }

  // What the wheels show while there is no time yet. Nothing is stored until
  // one of them is moved.
  const [h, mm] = (value || '09:00').split(':').map(Number);
  const half = h < 12 ? 'AM' : 'PM';
  const pick = (next: string) => { setProblem(''); onChange(next); };

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        type="text"
        inputMode="text"
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={problem ? true : undefined}
        placeholder="--:-- --"
        onChange={(e) => { setText(e.target.value); setProblem(''); }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={(e) => {
          // Commit rather than submit: a form reading state in the same tick
          // would see the time from before the Enter.
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
        }}
        className={`${className} pr-9`}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        aria-label="Choose a time"
        aria-expanded={open}
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:text-gray-300"
      >
        <Clock className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg">
          <div className="relative flex items-center justify-center gap-1">
            {/* The middle row, marked the way a phone's picker marks it. */}
            <div className="pointer-events-none absolute inset-x-1 top-1/2 h-10 -translate-y-1/2 border-y border-gray-200" />
            <TimeWheel label="Hour" options={HOURS} value={h} loop
              render={(v) => String(v % 12 || 12)}
              onChange={(v) => pick(toHHMM(v, mm))} />
            <span className="text-xl font-semibold text-gray-900">:</span>
            <TimeWheel label="Minutes" options={MINUTES} value={mm} loop
              render={(v) => String(v).padStart(2, '0')}
              onChange={(v) => pick(toHHMM(h, v))} />
            <TimeWheel label="AM or PM" options={HALVES} value={half}
              onChange={(v) => pick(toHHMM((h % 12) + (v === 'PM' ? 12 : 0), mm))} />
          </div>
          <div className="mt-1 flex justify-end">
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-gray-50">
              Done
            </button>
          </div>
        </div>
      )}
      {problem && <p className="mt-1 text-[11px] text-amber-700">{problem}</p>}
    </div>
  );
}
