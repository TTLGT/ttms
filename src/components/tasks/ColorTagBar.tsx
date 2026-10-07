'use client';

import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  COLOR_LABEL_MAX,
  EXTRA_COLORS,
  TASK_COLORS,
  TASK_COLOR_NAME,
  colorLabel,
  colorsInUse,
  isExtraColor,
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
 * "Edit colours" turns the chips into boxes. Clearing a base colour's box
 * puts its own name back; nothing about the tasks changes, because a task's
 * tag is its colour and the name is only what that colour is called.
 *
 * It is also where extra colours are added — from a fixed set of hues that
 * stay readable in every theme and clear of everything else on the calendar
 * (EXTRA_COLORS). An extra colour exists while it has a name, so removing
 * one clears it and the server moves its tasks to yellow; the save asks
 * first when any are wearing it.
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
  // A task can still be wearing an extra colour the bar would not otherwise
  // list (removed in another tab) — shown while it is, so it can be filtered.
  const shownColors = [...colorsInUse(labels), ...EXTRA_COLORS.filter((c) => !labels[c] && counts[c] > 0)];

  const chip = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm';
  const idle = 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50';
  const on = 'border-gray-400 bg-gray-100 font-semibold text-gray-900';

  if (draft) {
    // An extra colour is in the draft while its key is, even with the box
    // emptied mid-edit; it is removed by its bin, or by saving it empty.
    const draftColors = [...colorsInUse({}), ...EXTRA_COLORS.filter((c) => draft[c] !== undefined)];
    const free = EXTRA_COLORS.filter((c) => draft[c] === undefined);
    return (
      <form
        className="mb-4 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = { ...draft };
          for (const c of EXTRA_COLORS) if (next[c] !== undefined && !next[c]?.trim()) delete next[c];
          const losing = EXTRA_COLORS.filter((c) => labels[c] && !next[c] && counts[c] > 0);
          if (losing.length && !window.confirm(
            `Tasks tagged ${losing.map((c) => colorLabel(labels, c)).join(', ')} will go back to ${colorLabel(labels, 'yellow')}. Remove ${losing.length === 1 ? 'it' : 'them'}?`,
          )) return;
          onSaveLabels(next);
          setDraft(null);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {draftColors.map((c) => (
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
              {isExtraColor(c) && (
                <button
                  type="button"
                  aria-label={`Remove ${colorLabel(draft, c)}`}
                  title="Remove this colour"
                  onClick={() => { const next = { ...draft }; delete next[c]; setDraft(next); }}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </label>
          ))}
        </div>
        {free.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><Plus size={12} /> Add a colour:</span>
            {free.map((c) => (
              <button
                key={c}
                type="button"
                title={`Add ${TASK_COLOR_NAME[c]}`}
                aria-label={`Add ${TASK_COLOR_NAME[c]}`}
                // Added under its own name, which its box then lets them change.
                onClick={() => setDraft({ ...draft, [c]: TASK_COLOR_NAME[c] })}
                className={`h-6 w-6 rounded-full ${NOTE_STYLE[c].swatch} hover:ring-2 hover:ring-gray-400 hover:ring-offset-1`}
              />
            ))}
            <span>These shades read well in light, dim and dark, and never match the calendar&apos;s own colours.</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={`${chip} border-transparent bg-brand-600 font-medium text-white hover:bg-brand-700`}>
            <Check size={14} /> Save colours
          </button>
          <button type="button" onClick={() => setDraft(null)} className={`${chip} border-transparent text-gray-500 hover:bg-gray-100`}>
            <X size={14} /> Cancel
          </button>
        </div>
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
      {shownColors.map((c) => (
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
        <Pencil size={13} /> Edit colours
      </button>
    </div>
  );
}
