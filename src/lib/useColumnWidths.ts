'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Per-user, per-table column widths for the dashboard's data tables.
 *
 * Widths are a personal display preference, not company data, so they live in
 * the browser's localStorage rather than Firestore — one broker widening the
 * Commodity column should not change what anyone else sees, and it is not worth
 * a write to the live database on every drag.
 */

export type ColumnWidths = Record<string, number>;

/** Narrower than this and a column's header text is unreadable. */
export const MIN_COLUMN_WIDTH = 60;

export interface ColumnWidthControls {
  /** Current width in px for every column key in `defaults`. */
  widths: ColumnWidths;
  /** True once the user has dragged something, so a Reset control can hide until it is useful. */
  customized: boolean;
  /** Begin a drag from a column's right-edge handle. */
  startResize: (key: string, event: React.PointerEvent) => void;
  /** Nudge one column by a pixel delta — used for keyboard resizing. */
  nudge: (key: string, delta: number) => void;
  /** Put every column back to its default width and forget the saved copy. */
  reset: () => void;
}

/**
 * @param storageKey  Unique per table, e.g. `ttms.columnWidths.orders`.
 * @param defaults    Must be a module-level constant — it is a dependency of the
 *                    load effect, and a fresh object each render would re-run it.
 */
export function useColumnWidths(storageKey: string, defaults: ColumnWidths): ColumnWidthControls {
  const [widths, setWidths] = useState<ColumnWidths>(defaults);
  const [customized, setCustomized] = useState(false);

  // The live value, for the drag handlers: they are registered once per drag and
  // would otherwise close over the widths from the render that started it.
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  // Read after mount, never during render. These pages are server-rendered as
  // well, localStorage does not exist there, and seeding initial state from it
  // would make the server and client markup disagree on first paint.
  useEffect(() => {
    let saved: ColumnWidths;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      saved = JSON.parse(raw) as ColumnWidths;
    } catch {
      return; // private window, cleared storage, or hand-edited garbage — defaults are fine
    }
    if (!saved || typeof saved !== 'object') return;

    // Only adopt keys the table still renders, so a column renamed or dropped in
    // a later release cannot bring a stale width back with it.
    const merged: ColumnWidths = { ...defaults };
    let any = false;
    for (const key of Object.keys(defaults)) {
      const value = saved[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        merged[key] = Math.max(MIN_COLUMN_WIDTH, Math.round(value));
        any = true;
      }
    }
    if (any) {
      setWidths(merged);
      setCustomized(true);
    }
  }, [storageKey, defaults]);

  const persist = useCallback((next: ColumnWidths) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Storage full or blocked — the resize still worked for this session.
    }
  }, [storageKey]);

  const startResize = useCallback((key: string, event: React.PointerEvent) => {
    // Stop the browser turning the drag into a text selection or a column-header click.
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = widthsRef.current[key] ?? defaults[key] ?? MIN_COLUMN_WIDTH;

    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX));
      setWidths((current) => (current[key] === next ? current : { ...current, [key]: next }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      persist(widthsRef.current);
      setCustomized(true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    // Keep the resize cursor and kill text selection for the whole drag, even
    // when the pointer leaves the thin handle.
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [defaults, persist]);

  const nudge = useCallback((key: string, delta: number) => {
    setWidths((current) => {
      const width = Math.max(MIN_COLUMN_WIDTH, (current[key] ?? MIN_COLUMN_WIDTH) + delta);
      const next = { ...current, [key]: width };
      persist(next);
      return next;
    });
    setCustomized(true);
  }, [persist]);

  const reset = useCallback(() => {
    setWidths(defaults);
    setCustomized(false);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing saved to remove, or storage is blocked.
    }
  }, [defaults, storageKey]);

  return { widths, customized, startResize, nudge, reset };
}
