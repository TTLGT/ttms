'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { GripVertical, Lock, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  LOCKED_COLUMNS,
  MAX_COLUMN_LABEL,
  MAX_CUSTOM_COLUMNS,
  isBuiltInStatus,
  moveColumn,
  newColumnId,
  stepBackFrom,
  type BoardColumn,
  type TaskStatus,
} from '@/types/task';
import { COLUMN_DRAG_TYPE, statusDot } from './taskStyle';

/**
 * The last slot on the board: a button that opens the person's column list.
 * Tick to show, untick to hide, drag to reorder, and add, rename or delete
 * columns of their own.
 *
 * Hiding or deleting a column with tasks in it asks first and says where they
 * will go, because the move is real — the server rewrites those tasks' status
 * (see /api/me/tasks/columns). Showing the column again does not bring them
 * back; nothing records where they came from, and guessing would be worse.
 */
export default function BoardColumnsMenu({
  columns,
  countIn,
  onChange,
}: {
  columns: BoardColumn[];
  countIn: (status: TaskStatus) => number;
  onChange: (next: BoardColumn[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [dragging, setDragging] = useState<TaskStatus | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  /**
   * The row whose grip is held. Only that row is draggable, so a mouse
   * pressed in a column's name box selects text instead of dragging the row.
   */
  const [armed, setArmed] = useState<TaskStatus | null>(null);
  /**
   * Fixed to the viewport, not absolute: the board scrolls sideways, and an
   * overflow box clips anything that hangs out of it, the panel included.
   */
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Pinned to where the button was; once the page moves under it, it is
    // pointing at nothing, so it closes rather than following.
    const shut = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', shut);
    window.addEventListener('scroll', shut, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', shut);
      window.removeEventListener('scroll', shut, true);
    };
  }, [open]);

  const customCount = columns.filter((c) => !isBuiltInStatus(c.id)).length;
  const labelOf = (layout: BoardColumn[], id: TaskStatus) => layout.find((c) => c.id === id)?.label ?? 'To do';

  /** True to go ahead. Says how many tasks move and to which column, when any do. */
  const confirmMove = (verb: string, column: BoardColumn, from: BoardColumn[], next: BoardColumn[]) => {
    const n = countIn(column.id);
    if (n === 0) return verb === 'Delete' ? window.confirm(`Delete the "${column.label}" column?`) : true;
    const showing = (id: TaskStatus) => next.some((c) => c.id === id && !c.hidden);
    const to = labelOf(next, stepBackFrom(from, column.id, showing));
    return window.confirm(
      `${verb} "${column.label}"? Its ${n} task${n === 1 ? '' : 's'} will move back to "${to}".`,
    );
  };

  const toggle = (column: BoardColumn) => {
    const next = columns.map((c) => (c.id === column.id ? { ...c, hidden: !c.hidden } : c));
    if (!column.hidden && !confirmMove('Hide', column, next, next)) return;
    onChange(next);
  };

  const remove = (column: BoardColumn) => {
    const next = columns.filter((c) => c.id !== column.id);
    if (!confirmMove('Delete', column, columns, next)) return;
    onChange(next);
  };

  const rename = (column: BoardColumn, label: string) => {
    const clean = label.trim().slice(0, MAX_COLUMN_LABEL);
    if (!clean || clean === column.label) return;
    onChange(columns.map((c) => (c.id === column.id ? { ...c, label: clean } : c)));
  };

  const add = () => {
    const label = newLabel.trim().slice(0, MAX_COLUMN_LABEL);
    if (!label || customCount >= MAX_CUSTOM_COLUMNS) return;
    const column: BoardColumn = { id: newColumnId(), label, hidden: false };
    // Just before Done when Done is last, which is where somebody adding
    // "Invoiced" or "Follow up" nearly always wants it; anywhere else after
    // that is one drag away.
    const doneLast = columns[columns.length - 1]?.id === 'done';
    onChange(doneLast ? [...columns.slice(0, -1), column, columns[columns.length - 1]] : [...columns, column]);
    setNewLabel('');
  };

  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(COLUMN_DRAG_TYPE);

  return (
    <div ref={box} className="relative flex-shrink-0">
      <button
        type="button"
        ref={button}
        onClick={() => {
          const r = button.current?.getBoundingClientRect();
          if (r) setAt({ top: r.bottom + 8, left: Math.max(16, Math.min(r.left, window.innerWidth - 320 - 16)) });
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700"
      >
        <SlidersHorizontal size={14} /> Columns
      </button>

      {open && at && (
        <div
          style={{ top: at.top, left: at.left }}
          className="fixed z-30 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-1 flex items-center">
            <h3 className="flex-1 text-sm font-semibold text-gray-900">Columns</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Untick to hide a column. Its tasks move back one column. Drag to change the order.
          </p>

          <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
            {columns.map((c) => {
              const locked = LOCKED_COLUMNS.includes(c.id);
              const custom = !isBuiltInStatus(c.id);
              return (
                <li
                  key={c.id}
                  draggable={armed === c.id}
                  onDragStart={(e) => {
                    setDragging(c.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(COLUMN_DRAG_TYPE, c.id);
                    e.dataTransfer.setData('text/plain', c.label);
                  }}
                  onDragEnd={() => { setDragging(null); setOver(null); setArmed(null); }}
                  onDragOver={(e) => {
                    if (!accepts(e)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (over !== c.id) setOver(c.id);
                  }}
                  onDrop={(e) => {
                    if (!accepts(e)) return;
                    e.preventDefault();
                    const id = e.dataTransfer.getData(COLUMN_DRAG_TYPE);
                    setDragging(null);
                    setOver(null);
                    if (id && id !== c.id) onChange(moveColumn(columns, id, c.id));
                  }}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                    over === c.id && dragging !== c.id ? 'border-brand-400' : 'border-transparent'
                  } ${dragging === c.id ? 'opacity-40' : ''} hover:bg-gray-50`}
                >
                  <span
                    onMouseDown={() => setArmed(c.id)}
                    onMouseUp={() => setArmed(null)}
                    title="Drag to move"
                    className="flex-shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
                  >
                    <GripVertical size={14} />
                  </span>
                  <input
                    type="checkbox"
                    checked={!c.hidden}
                    disabled={locked}
                    onChange={() => toggle(c)}
                    aria-label={c.hidden ? `Show ${c.label}` : `Hide ${c.label}`}
                    title={locked ? 'Always shown' : undefined}
                  />
                  <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full border-2 ${statusDot(c.id)}`} />
                  {custom ? (
                    <input
                      defaultValue={c.label}
                      maxLength={MAX_COLUMN_LABEL}
                      aria-label="Column name"
                      onBlur={(e) => rename(c, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      className={`min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-gray-200 focus:border-brand-500 focus:outline-none ${
                        c.hidden ? 'text-gray-400' : 'text-gray-900'
                      }`}
                    />
                  ) : (
                    <span className={`min-w-0 flex-1 truncate px-1 text-sm ${c.hidden ? 'text-gray-400' : 'text-gray-900'}`}>
                      {c.label}
                    </span>
                  )}
                  {locked && <Lock size={12} className="flex-shrink-0 text-gray-300" aria-label="Always shown" />}
                  {custom && (
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      aria-label={`Delete ${c.label}`}
                      title="Delete this column"
                      className="flex-shrink-0 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <form
            className="mt-3 flex gap-2 border-t border-gray-100 pt-3"
            onSubmit={(e) => { e.preventDefault(); add(); }}
          >
            <input
              value={newLabel}
              maxLength={MAX_COLUMN_LABEL}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={customCount >= MAX_CUSTOM_COLUMNS ? `Limit of ${MAX_CUSTOM_COLUMNS} reached` : 'New column name'}
              disabled={customCount >= MAX_CUSTOM_COLUMNS}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={!newLabel.trim() || customCount >= MAX_CUSTOM_COLUMNS}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Plus size={14} /> Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
