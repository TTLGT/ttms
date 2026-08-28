'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { dateInputExample, parseDateInput } from '@/lib/dateFormat';
import { useDateFormatters } from '@/lib/useDateFormatters';

/**
 * A box for typing a date, written in whatever format the company has set.
 *
 * This exists because `<input type="date">` cannot be told what format to
 * show. The browser picks it from its own language setting, so the same field
 * read 03/04/2020 to one person and 04/03/2020 to the next while every date
 * TTMS printed around it said something else again.
 *
 * So the text half is ours and the calendar half is still the browser's: the
 * button opens the real native picker, which is the part people actually like.
 * The value handed in and out stays `YYYY-MM-DD` — the same contract the native
 * input had, so nothing downstream knows the difference.
 */

interface DateFieldProps {
  /** `YYYY-MM-DD`, or '' for empty. */
  value: string;
  /** Called with `YYYY-MM-DD`, or '' when the box is empty or unreadable. */
  onChange: (value: string) => void;
  /** The classes the native input carried, so each form keeps its own look. */
  className?: string;
  disabled?: boolean;
  /** For a field whose label is not wrapped around it. */
  ariaLabel?: string;
}

export default function DateField({
  value,
  onChange,
  className = '',
  disabled = false,
  ariaLabel,
}: DateFieldProps) {
  const { dateFormat, formatCalendarDate } = useDateFormatters();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [focused, setFocused] = useState(false);
  const nativeRef = useRef<HTMLInputElement>(null);

  /**
   * Redraw from the stored value whenever it changes underneath us — a form
   * loading its record, the calendar button, an admin changing the format.
   * Never while the box has focus: rewriting what someone is halfway through
   * typing is the classic way to make a field feel broken.
   */
  useEffect(() => {
    if (!focused) setText(formatCalendarDate(value));
  }, [value, dateFormat, focused, formatCalendarDate]);

  function handleTyping(raw: string) {
    setText(raw);
    // A complaint while someone is still typing is just noise — the text is
    // unreadable for most of the time it takes to write a date. Wait for blur.
    setProblem('');

    const parsed = parseDateInput(raw, dateFormat);
    // Anything not yet a real date stores nothing, so a half-typed or mistyped
    // date can never be saved as if it were meant.
    onChange(parsed.ok ? parsed.iso : '');
  }

  function handleBlur() {
    setFocused(false);
    const parsed = parseDateInput(text, dateFormat);
    const example = dateInputExample(dateFormat);

    if (parsed.ok) {
      // Tidy "4/3/2020" into the company's own way of writing it, so what is
      // left on screen is exactly what was understood.
      setText(formatCalendarDate(parsed.iso));
      setProblem('');
      return;
    }
    if (parsed.reason === 'empty') {
      setText('');
      setProblem('');
      return;
    }
    // Leave the text where it is. Clearing someone's typing to explain that it
    // was wrong takes away the thing they need to see to fix it.
    setProblem(
      parsed.reason === 'ambiguous'
        ? `That could be two different days. Write the month by name — for example ${example}.`
        : `Not a date TTMS can read. Try ${example}.`,
    );
  }

  function openPicker() {
    const el = nativeRef.current;
    if (!el || disabled) return;
    // showPicker is how a button opens the native calendar. Chrome and Edge —
    // what this office runs — have had it for years; anything older, and any
    // browser that refuses the call, just gets the field focused so it can
    // still be typed into. A throw here would be an uncaught error on a click.
    try {
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  }

  return (
    <>
      <div className="relative">
        <input
          type="text"
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={dateInputExample(dateFormat)}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={problem ? true : undefined}
          className={`${className} pr-9`}
        />
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          aria-label="Choose from a calendar"
          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400 hover:text-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          <CalendarDays className="w-4 h-4" />
        </button>
        {/*
          The real date input, kept in the page but out of sight: showPicker
          only opens a picker that belongs to a rendered element. It is out of
          the tab order because the text box above is the one people type in.
        */}
        <input
          ref={nativeRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-2 h-px w-px opacity-0"
        />
      </div>
      {problem && <p className="mt-1 text-[11px] text-amber-700">{problem}</p>}
    </>
  );
}
