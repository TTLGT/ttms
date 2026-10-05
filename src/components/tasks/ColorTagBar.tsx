'use client';

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import {
  COLOR_LABEL_MAX,
  TASK_COLORS,
  TASK_COLOR_NAME,
  colorLabel,
  type ColorLabels,
  type TaskColor,
} from '@/types/task';
import { NOTE_STYLE } from './taskStyle';

/**
 * The colours as tags, in a bar above the list — the Google Keep label
 * extension people here already use, brought into My tasks.
 *
 * Each chip is a filter: one colour at a time, clicked again (or "All") to
 * clear, as Keep's does. It filters every view, board included. The count
 * beside each is out of what the page would show without the colour filter,
 * so it matches what clicking the chip brings up.
 *
 * "Name colours" turns the chips into boxes. Clearing a box puts the colour
 * back to its own name; nothing about the tasks changes, because a task's
 * tag is its colour and the name is only what that colour is called.
 */
export default function ColorTagBar({
  labels,
  counts,
  selected,
  onSelect,
  onSaveLabels,
}: {
  labels: ColorLabels;
  counts: Record<TaskColor, number>;
  selected: TaskColor | null;
  onSelect: (color: TaskColor | null) => void;
  onSaveLabels: (next: ColorLabels) => void;
}) {
  const [draft, setDraft] = useState<ColorLabels | null>(null);
  const total = TASK_COLORS.reduce((n, c) => n + counts[c], 0);

  const chip = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm';
  const idle = 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50';
  const on = 'border-gray-400 bg-gray-100 font-semibold text-gray-900';

  if (draft) {
    return (
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSaveLabels(draft);
          setDraft(null);
        }}
      >
        {TASK_COLORS.map((c) => (
          <label key={c} className={`${chip} ${idle} py-0.5 pl-2 pr-1`}>
            <span className={`h-3.5 w-3.5 flex-shrink-0 rounded-full ${NOTE_STYLE[c].swatch}`} />
            <input
              value={draft[c] ?? ''}
              maxLength={COLOR_LABEL_MAX}
              placeholder={TASK_COLOR_NAME[c]}
              aria-label={`Name for ${TASK_COLOR_NAME[c].toLowerCase()}`}
              onChange={(e) => setDraft({ ...draft, [c]: e.target.value })}
              className="w-32 rounded-full bg-transparent px-1 py-0.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
          </label>
        ))}
        <button type="submit" className={`${chip} border-transparent bg-brand-600 font-medium text-white hover:bg-brand-700`}>
          <Check size={14} /> Save names
        </button>
        <button type="button" onClick={() => setDraft(null)} className={`${chip} border-transparent text-gray-500 hover:bg-gray-100`}>
          <X size={14} /> Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filter by colour">
      <button
        type="button"
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
        className={`${chip} ${selected === null ? on : idle}`}
      >
        All <span className="text-xs opacity-60">{total}</span>
      </button>
      {TASK_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={selected === c}
          onClick={() => onSelect(selected === c ? null : c)}
          title={selected === c ? 'Show every colour again' : `Show only ${colorLabel(labels, c)}`}
          className={`${chip} ${selected === c ? on : idle}`}
        >
          <span className={`h-3.5 w-3.5 flex-shrink-0 rounded-full ${NOTE_STYLE[c].swatch}`} />
          <span className="max-w-[12rem] truncate">{colorLabel(labels, c)}</span>
          <span className="text-xs opacity-60">{counts[c]}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => setDraft({ ...labels })}
        className={`${chip} border-dashed border-gray-300 text-gray-500 hover:bg-gray-50`}
      >
        <Pencil size={13} /> Name colours
      </button>
    </div>
  );
}
