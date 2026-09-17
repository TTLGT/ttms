'use client';

import { useCallback, useState, type DragEvent } from 'react';

/**
 * Dragging a pinned row into a different place.
 *
 * One hook for both pinned lists — rooms and threads — because the two behave
 * identically and a second copy would drift: the feedback while a row is in
 * the air is as much a part of "can I reorder this" as the drop itself.
 *
 * Only pinned rows take part. A row that is not pinned gets no handlers at
 * all, so it cannot be picked up and nothing can be dropped onto it: the
 * unpinned half of either list is sorted by activity, and a row dropped into
 * it would have nowhere to stay. Unpinning is what the pin button is for.
 *
 * Native HTML drag and drop rather than a library. The rows are a handful,
 * they are all in one scrolling column, and the browser already draws the
 * ghost, the cursor and the escape key for free.
 */
export function usePinnedDrag(onReorder: (movedId: string, ontoId: string) => void) {
  /** The row being carried, and the row it is over. Both null when at rest. */
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const rowProps = useCallback(
    (id: string, pinned: boolean) => {
      if (!pinned) return {};
      return {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          setDragging(id);
          e.dataTransfer.effectAllowed = 'move';
          // Firefox refuses to start a drag at all without something on the
          // clipboard, even when nothing reads it back.
          e.dataTransfer.setData('text/plain', id);
        },
        onDragOver: (e: DragEvent) => {
          // Only a pinned row of this list is a target. Without the
          // preventDefault the browser refuses the drop, which is exactly what
          // should happen for anything dragged in from outside.
          if (!dragging || dragging === id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setOver(id);
        },
        onDragLeave: () => setOver((cur) => (cur === id ? null : cur)),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          const moved = dragging;
          setDragging(null);
          setOver(null);
          if (moved && moved !== id) onReorder(moved, id);
        },
        // Fires whether the drop landed or was abandoned, so the row that was
        // faded while it was in the air always comes back.
        onDragEnd: () => { setDragging(null); setOver(null); },
      };
    },
    [dragging, onReorder],
  );

  /**
   * What a row looks like mid-drag: the one being carried fades, the one it
   * would take the place of is outlined.
   */
  const dragClass = useCallback(
    (id: string) => {
      if (dragging === id) return 'opacity-40';
      if (over === id) return 'ring-2 ring-brand-300';
      return '';
    },
    [dragging, over],
  );

  return { rowProps, dragClass, dragging };
}
