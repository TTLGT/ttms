'use client';

import type { ColumnWidthControls } from '@/lib/useColumnWidths';

interface Props {
  /** Key into the table's width map — must match the key used in `defaults`. */
  columnKey: string;
  label: string;
  controls: ColumnWidthControls;
  /** Trailing action columns have nothing meaningful to size, so they get no handle. */
  resizable?: boolean;
  align?: 'left' | 'right';
}

/** How far one arrow-key press moves a column edge. */
const KEY_STEP = 16;

/**
 * A table header cell with a drag handle on its right edge.
 *
 * The handle is a real focusable separator rather than a decorative div so the
 * columns can also be sized from the keyboard — brokers work these tables all
 * day and some of them never touch the mouse.
 */
export default function ResizableTh({ columnKey, label, controls, resizable = true, align = 'left' }: Props) {
  return (
    <th
      scope="col"
      className={`relative px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <span className="block truncate">{label}</span>

      {resizable && (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label || 'column'} column`}
          tabIndex={0}
          onPointerDown={(e) => controls.startResize(columnKey, e)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft')  { e.preventDefault(); controls.nudge(columnKey, -KEY_STEP); }
            if (e.key === 'ArrowRight') { e.preventDefault(); controls.nudge(columnKey,  KEY_STEP); }
          }}
          // Sits half over the border so the grab target is centred on the line
          // the user is actually aiming at, and is wider than the 1px it looks.
          className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize touch-none
                     before:absolute before:inset-y-1 before:left-1/2 before:w-px before:bg-transparent
                     hover:before:bg-brand-400 focus:before:bg-brand-500 focus:outline-none"
        />
      )}
    </th>
  );
}
