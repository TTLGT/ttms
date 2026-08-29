'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Columns3 } from 'lucide-react';
import type { SortKey } from '@/lib/directorySort';
import type { DirectoryColumn } from '@/lib/directoryColumns';

/**
 * Choosing which columns the directory list draws.
 *
 * The full table is wider than a laptop screen once the admin columns are on
 * it, and most of the time somebody scanning it wants two of them — the
 * extension and the office, say. Switching the rest off is quicker than
 * scrolling sideways past them all day.
 *
 * It only appears over the list. The cards have no columns to choose between,
 * and a control that did nothing where it stood would be worse than none.
 *
 * Nothing here decides what a viewer is allowed to see: it is handed the
 * columns to offer, and the payroll ones are already absent from that list for
 * anyone who is not admin or HR.
 */
export default function ColumnPicker({
  columns, hidden, onToggle, onShowAll,
}: {
  /** The switchable columns, already narrowed to what this viewer can see. */
  columns: DirectoryColumn[];
  hidden: Set<SortKey>;
  onToggle: (key: SortKey) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Same closing behaviour as the party picker: a click anywhere else, or
  // Escape, puts it away. A menu that can only be closed by the button that
  // opened it traps the pointer in a corner of the screen.
  useEffect(() => {
    if (!open) return;

    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const offCount = columns.filter((c) => hidden.has(c.key)).length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Choose which columns to show"
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
          // A count rather than a dot: "2 off" says how much of the table is
          // missing, which is the question somebody asks when a column they
          // expected is not there.
          offCount > 0
            ? 'border-brand-200 bg-brand-50 font-medium text-brand-700'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        <Columns3 size={15} />
        Columns
        {offCount > 0 && <span className="text-xs">· {offCount} off</span>}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {columns.map((c) => {
            const shown = !hidden.has(c.key);
            return (
              <button
                key={c.key}
                role="menuitemcheckbox"
                aria-checked={shown}
                onClick={() => onToggle(c.key)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                {/* The tick sits in a box that is always there, so the labels
                    stay in one column whether they are ticked or not. */}
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    shown ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-300'
                  }`}
                >
                  {shown && <Check size={11} strokeWidth={3} />}
                </span>
                {c.label}
              </button>
            );
          })}

          {/* Only worth offering once there is something to undo. */}
          {offCount > 0 && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={onShowAll}
                className="w-full px-3 py-1.5 text-left text-sm text-brand-700 hover:bg-gray-50"
              >
                Show every column
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
