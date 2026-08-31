'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The little menu that hangs off a thing you clicked.
 *
 * Named actions, not a row of bare icons. The icons this replaced on message
 * bubbles sat at the far right of the thread — a long way from a two-word
 * message — and asked people to work out that a padlock meant "reply
 * privately". A short labelled list answers both: it opens against the thing
 * it belongs to, and it says what each item does.
 *
 * It started as the message menu and is now also the menu on a room in the
 * list and on a row in the threads list. Kept as one component rather than
 * three, because all three want the same behaviour of opening against a
 * viewport rectangle and closing on the same three events — and because a
 * second copy would drift within a week.
 *
 * Positioned against the viewport rather than inside its list, for the same
 * reason as PersonCard: both lists scroll and clip, so a menu anchored inside
 * one would be cut off at the top and bottom of the column.
 */

export interface MenuAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  onSelect: () => void;
  /** Drawn in red. Only Delete uses it. */
  danger?: boolean;
  /**
   * Drawn with a tick and in brand colour — for an item that is a setting
   * rather than a verb, like which notification level a room is on. A menu
   * that offers three choices and shows none of them as current is a menu you
   * have to try in order to read.
   */
  checked?: boolean;
  /** A small heading above this item, naming the group it starts. */
  section?: string;
}

const MENU_WIDTH = 210;

export default function ActionMenu({
  actions,
  anchor,
  onClose,
}: {
  actions: MenuAction[];
  /** Where the thing that opened it sits on screen, so the menu can hang off it. */
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
      {actions.map(({ key, label, Icon, onSelect, danger, checked, section }) => (
        <div
          key={key}
          // The rule belongs to the wrapper rather than to the heading, so the
          // first group in a menu does not open with a line above nothing.
          className={section ? 'mt-1 border-t border-gray-100 pt-1 first:mt-0 first:border-t-0 first:pt-0' : ''}
        >
          {section && (
            <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {section}
            </p>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { onSelect(); onClose(); }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
              danger
                ? 'text-red-600 hover:bg-red-50'
                : checked
                  ? 'font-medium text-brand-700 hover:bg-brand-50'
                  : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon size={14} className={`flex-shrink-0 ${checked ? '' : 'opacity-60'}`} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {checked && <Check size={13} className="flex-shrink-0" />}
          </button>
        </div>
      ))}
    </div>
  );
}
