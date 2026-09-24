'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown, ChevronLeft, ChevronRight, Filter, ListFilter, Pencil, Plus, Trash2,
} from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import ActionMenu, { type MenuAction } from './ActionMenu';
import {
  BUILT_IN_CHAT_FILTERS,
  chatListFilterId,
  chatListIdOf,
  chatListsInOrder,
  inChatFilter,
} from '@/types/conversation';

/**
 * The row of filter chips above the conversation list.
 *
 * Every chip is a filter over conversations the browser already holds — see
 * inChatFilter. None of them is a query, and that is the point: a person can
 * make twenty lists and press every chip in the row all morning without
 * costing a single Firestore read. A chip that had to go and fetch its own
 * conversations would be a new read on every press, on the one screen people
 * leave open all day.
 *
 * The number on a chip is how many conversations under it are unread, which is
 * what makes the row safe to use. A filter hides rooms, and a hidden room with
 * something waiting in it is the failure this feature could have: the count
 * says "there are three you are not looking at" without giving up the filter.
 */
/**
 * Roughly how much of the row an arrow covers — its icon plus the padding it
 * fades out over. Kept in step with the classes on Arrow below.
 */
const ARROW_WIDTH = 30;

export default function ChatFilterBar({
  onNewList, onRenameList,
}: {
  onNewList: () => void;
  onRenameList: (listId: string) => void;
}) {
  const {
    conversations, unreadIds, favorites, lists, chatFilter, setChatFilter, removeList,
  } = useChat();

  /** Where the overflow button is, when its menu is open. */
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);

  const ctx = { favorites, lists, unreadIds };
  const matching  = (id: string) => conversations.filter((c) => inChatFilter(c, id, ctx));
  const unreadIn  = (id: string) => matching(id).filter((c) => unreadIds.includes(c.id)).length;

  const rows = chatListsInOrder(lists);
  const selectedListId = chatListIdOf(chatFilter);

  // Built-ins that would match nothing are left out unless they are one of the
  // three that always show — see BUILT_IN_CHAT_FILTERS. The one being looked at
  // stays whatever happens, because a chip vanishing under the cursor as the
  // last load room is left would leave the column filtered by something that
  // is no longer on screen.
  const builtIns = BUILT_IN_CHAT_FILTERS.filter(
    (f) => f.always || f.id === chatFilter || matching(f.id).length > 0,
  );

  // One array behind both the row and the menu, so a chip that has scrolled
  // out of reach turns up in the menu under the same name and the same count
  // it was wearing on the row.
  const chips = [
    ...builtIns.map((f) => ({
      id:    f.id,
      label: f.label,
      // The count is left off All: it would be the same number as the Unread
      // chip beside it, on the one chip that hides nothing.
      count: f.id === 'all' ? 0 : unreadIn(f.id),
    })),
    ...rows.map(({ id, list }) => ({
      id:    chatListFilterId(id),
      label: list.name,
      count: unreadIn(chatListFilterId(id)),
    })),
  ];

  /*
   * The row scrolls sideways, and on a desktop that has to be said out loud.
   * A touch screen finds it by pushing it; a mouse has no way in — the
   * scrollbar is hidden, and a wheel over a horizontal strip scrolls the page
   * — so a chip past the right edge reads as unreachable rather than as
   * further along. The arrows are that way in, and the wheel is turned
   * sideways here so the gesture people try first does what they meant.
   */
  const scroller = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  /** Chips the row is not currently showing, in row order — for the menu. */
  const [offScreen, setOffScreen] = useState<string[]>([]);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // A pixel of slack either side: fractional widths leave scrollLeft a hair
    // short of the end, and an arrow pointing at nothing is worse than none.
    const atLeft  = el.scrollLeft > 1;
    const atRight = el.scrollLeft < max - 1;
    setOverflow({ left: atLeft, right: atRight });

    // Read off rectangles rather than offsets: the row is a flex line inside
    // a scroll container, and a rectangle is the one measurement that does not
    // depend on which ancestor happens to be positioned.
    const box = el.getBoundingClientRect();

    // Each end is pulled in by whichever arrow is over it, because a chip
    // under an arrow is as far out of reach as one past the edge — a click
    // there lands on the arrow. Those count as off screen too, which is what
    // puts the half-covered chip at the end of the row into the menu.
    const from = box.left  + (atLeft  ? ARROW_WIDTH : 0);
    const to   = box.right - (atRight ? ARROW_WIDTH : 0);

    const out: string[] = [];
    for (const node of Array.from(el.children)) {
      const id = (node as HTMLElement).dataset.chipId;
      if (!id) continue;
      const rect = node.getBoundingClientRect();
      if (rect.left < from - 1 || rect.right > to + 1) out.push(id);
    }
    // Swapped in only when it really changed. This runs on every scroll event,
    // and handing back a new array each time would rebuild the open menu
    // underneath somebody reading it.
    setOffScreen((prev) => (
      prev.length === out.length && prev.every((id, i) => id === out[i]) ? prev : out
    ));
  }, []);

  // Both things that change the answer: the column being resized, and a chip
  // appearing or going (a new list, a built-in that stopped matching). The
  // chip counts in the deps cover the second.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, chips.length]);

  // Listened for here rather than through onWheel: React binds wheel at the
  // document root and binds it passively, so preventDefault from a React
  // handler is ignored and the page scrolls along with the row.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // A trackpad already swiping sideways is doing the right thing.
      if (e.deltaX !== 0) return;
      const max = el.scrollWidth - el.clientWidth;
      // At either end the wheel goes back to the page, so a row with nothing
      // left to show does not swallow the scroll of the screen behind it.
      if (max <= 0) return;
      if (e.deltaY < 0 && el.scrollLeft <= 0) return;
      if (e.deltaY > 0 && el.scrollLeft >= max) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /**
   * Picking a filter from the menu, which is how a chip that does not fit is
   * still reachable. It is scrolled back into view as well as selected: a row
   * that answers a menu by highlighting something off its own right edge
   * looks like it ignored the click.
   */
  const chooseFilter = (id: string) => {
    setChatFilter(id);
    // After the row has re-rendered as selected, so the chip being scrolled to
    // is the one the reader is about to look at.
    requestAnimationFrame(() => {
      scroller.current
        ?.querySelector(`[data-chip-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    });
  };

  /** One press of an arrow: most of the width, so a chip stays in view. */
  const nudge = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(80, el.clientWidth * 0.75), behavior: 'smooth' });
  };

  const hiddenChips = chips.filter((c) => offScreen.includes(c.id));

  const menuActions: MenuAction[] = [
    /*
     * The chips the row has run out of room for, named in full.
     *
     * This button is already where somebody goes when the row looks like it is
     * missing something, and the arrows only move the row — they never say
     * what is along there. The count comes with them, because a filter nobody
     * can see is exactly the one whose unread number is doing the work.
     */
    ...hiddenChips.map((c, i) => ({
      key:      `chip:${c.id}`,
      label:    c.count > 0 ? `${c.label} · ${c.count > 99 ? '99+' : c.count}` : c.label,
      Icon:     chatListIdOf(c.id) ? ListFilter : Filter,
      checked:  chatFilter === c.id,
      section:  i === 0 ? 'Not on screen' : undefined,
      onSelect: () => chooseFilter(c.id),
    })),
    {
      key:   'new',
      label: 'New list…',
      Icon:  Plus,
      // A heading only when there is a group above to be told apart from.
      section: hiddenChips.length > 0 ? 'Lists' : undefined,
      onSelect: onNewList,
    },
    ...(selectedListId ? [
      {
        key:     'rename',
        label:   'Rename this list',
        Icon:    Pencil,
        section: lists[selectedListId]?.name ?? 'This list',
        onSelect: () => onRenameList(selectedListId),
      },
      {
        key:    'delete',
        label:  'Delete this list',
        Icon:   Trash2,
        danger: true,
        // No confirmation. Deleting a list takes nothing away — the chats are
        // all still in the list behind All — and a dialog asking twice about
        // something that cannot lose anything teaches people to click through
        // the ones that can.
        onSelect: () => removeList(selectedListId),
      },
    ] : []),
  ];

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-gray-200 px-3 py-2">
      {/* Scrolls sideways rather than wrapping: this sits in a 288px column in
          the popup, and a row that wraps to three lines would push the actual
          conversations below the fold. */}
      <div className="relative flex min-w-0 flex-1 items-center">
        <div
          ref={scroller}
          onScroll={measure}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chips.map((c) => (
            <Chip
              key={c.id}
              id={c.id}
              label={c.label}
              count={c.count}
              selected={chatFilter === c.id}
              onSelect={() => setChatFilter(c.id)}
            />
          ))}
        </div>

        {/* Over the ends of the row rather than beside it: this column starts
            at 288px, and two arrows holding their own space would cost it a
            chip. Each shows only while there is something that way to reach. */}
        {overflow.left  && <Arrow side="left"  onPress={() => nudge(-1)} />}
        {overflow.right && <Arrow side="right" onPress={() => nudge(1)} />}
      </div>

      <button
        type="button"
        title="Filters and lists"
        aria-label="Filters and lists"
        onClick={(e) => setMenuAt(e.currentTarget.getBoundingClientRect())}
        className="flex-shrink-0 rounded-full border border-gray-300 p-1.5 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
      >
        <ChevronDown size={14} />
      </button>

      {menuAt && (
        <ActionMenu anchor={menuAt} onClose={() => setMenuAt(null)} actions={menuActions} />
      )}
    </div>
  );
}

/**
 * The arrow at one end of the row, over a fade of the background it sits on,
 * so the chip beneath reads as carrying on rather than as cut off.
 *
 * Out of the tab order on purpose: the chips are buttons already, and tabbing
 * onto one scrolls it into view by itself — so to a keyboard these would be
 * two more stops that reach nothing new.
 */
function Arrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={onPress}
      className={`absolute top-0 flex h-full items-center from-white via-white to-transparent text-gray-500 transition hover:text-gray-900 ${
        side === 'left'
          ? 'left-0 bg-gradient-to-r pr-4'
          : 'right-0 bg-gradient-to-l pl-4'
      }`}
    >
      <Icon size={14} />
    </button>
  );
}

/**
 * One chip. The count is left off the All chip — it would be the same number
 * as the Unread chip beside it, on the one chip that hides nothing.
 */
function Chip({
  id, label, count, selected, onSelect,
}: {
  id: string;
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      // How the row works out which chips are off its edges, and how the menu
      // scrolls one back. Read straight off the element, so the answer comes
      // from where the chip actually landed rather than from a second sum.
      data-chip-id={id}
      onClick={onSelect}
      className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-medium transition ${
        selected
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      <span className="max-w-[9rem] truncate">{label}</span>
      {count > 0 && (
        <span className={`tabular-nums ${selected ? 'text-brand-600' : 'text-gray-400'}`}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
