'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The menu behind the arrow on a message bubble.
 *
 * Named actions, not a row of bare icons. The icons that were here before sat
 * at the far right of the thread — a long way from a two-word message — and
 * asked people to work out that a padlock meant "reply privately". A short
 * labelled list answers both: it opens against the bubble it belongs to, and it
 * says what each thing does.
 *
 * Positioned against the viewport rather than inside the thread, for the same
 * reason as PersonCard: the message list scrolls and clips, so a menu anchored
 * inside it would be cut off at the top and bottom of the column.
 */

export interface MessageAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  onSelect: () => void;
  /** Drawn in red. Only Delete uses it. */
  danger?: boolean;
}

const MENU_WIDTH = 184;

export default function MessageActions({
  actions,
  anchor,
  onClose,
}: {
  actions: MessageAction[];
  /** Where the arrow sits on screen, so the menu can hang off it. */
  anchor: DOMRect;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const height = el.offsetHeight;
    const margin = 8;

    // Hung from the arrow's right edge, so the menu opens back across the
    // bubble it belongs to rather than out into empty space.
    let left = anchor.right - MENU_WIDTH;
    left = Math.min(left, window.innerWidth - MENU_WIDTH - margin);
    left = Math.max(margin, left);

    let top = anchor.bottom + 4;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, anchor.top - height - 4);
    }

    setPlacement({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Captured, so it closes even when the click lands on something that stops
    // the event on its way up.
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={menu}
      role="menu"
      style={{
        left: placement?.left ?? anchor.left,
        top:  placement?.top ?? anchor.bottom + 4,
        width: MENU_WIDTH,
        // Hidden for the one frame between mounting and being measured, so it
        // does not flash in the wrong place first.
        visibility: placement ? 'visible' : 'hidden',
      }}
      className="fixed z-50 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-2xl"
    >
      {actions.map(({ key, label, Icon, onSelect, danger }) => (
        <button
          key={key}
          type="button"
          role="menuitem"
          onClick={() => { onSelect(); onClose(); }}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
            danger
              ? 'text-red-600 hover:bg-red-50'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Icon size={14} className="flex-shrink-0 opacity-60" />
          {label}
        </button>
      ))}
    </div>
  );
}
