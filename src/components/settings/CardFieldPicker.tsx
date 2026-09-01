'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import {
  PEOPLE_CARD_FIELDS,
  type PeopleCardFieldControls,
} from '@/lib/peopleCardFields';

/**
 * Chooses which details the access list shows — the facts on a card, and the
 * columns in the list view. One preference behind both, so a reader who hides
 * birthdays has hidden them whichever shape they switch to.
 *
 * A menu rather than a row of chips: there are nine fields, the filter rows
 * above are already chips, and a second row of them would read as another
 * filter — something that changes *who* is listed rather than what is written
 * about them.
 *
 * Status and roles are deliberately not on the list. They are the subject of
 * this page, and what somebody is allowed to do must not be something a reader
 * can switch off and then forget they switched off.
 */
export default function CardFieldPicker({
  fields,
  customized,
  toggle,
  reset,
}: PeopleCardFieldControls) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Closes on a click anywhere else and on Escape. Both, because a menu that
  // only closes on its own button strands the reader who clicked past it.
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };

    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hidden = PEOPLE_CARD_FIELDS.filter(({ key }) => !fields[key]).length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Choose which details to show on the cards and in the list"
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          open || customized
            ? 'border-brand-200 bg-brand-50 text-brand-700'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        <SlidersHorizontal size={13} />
        Show
        {/* The count is what saves someone hunting for a field they hid last
            week and have since forgotten about. */}
        {hidden > 0 && <span className="text-brand-700">· {hidden} hidden</span>}
        <ChevronDown size={13} className={open ? 'rotate-180 transition' : 'transition'} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Details to show
          </p>

          <ul>
            {PEOPLE_CARD_FIELDS.map(({ key, label, hint }) => {
              const on = fields[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-gray-50"
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                        on
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-xs ${on ? 'text-gray-800' : 'text-gray-500'}`}>
                        {label}
                      </span>
                      {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-1 border-t border-gray-100 px-2 pt-2">
            <p className="text-[11px] text-gray-400">
              Cards and columns both. Status and roles always show — they are what this page is
              for. Only changes what you see, on this browser: everyone who can open this page
              can read all of it, and Export CSV always includes every field.
            </p>
            {customized && (
              <button
                type="button"
                onClick={reset}
                className="mt-2 text-xs font-medium text-brand-700 underline hover:text-brand-800"
              >
                Show everything again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
