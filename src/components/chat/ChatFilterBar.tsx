'use client';

import { useState } from 'react';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
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

  const menuActions: MenuAction[] = [
    { key: 'new', label: 'New list…', Icon: Plus, onSelect: onNewList },
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
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {builtIns.map((f) => (
          <Chip
            key={f.id}
            label={f.label}
            count={f.id === 'all' ? 0 : unreadIn(f.id)}
            selected={chatFilter === f.id}
            onSelect={() => setChatFilter(f.id)}
          />
        ))}
        {rows.map(({ id, list }) => (
          <Chip
            key={id}
            label={list.name}
            count={unreadIn(chatListFilterId(id))}
            selected={selectedListId === id}
            onSelect={() => setChatFilter(chatListFilterId(id))}
          />
        ))}
      </div>

      <button
        type="button"
        title="Lists"
        aria-label="Manage lists"
        onClick={(e) => setMenuAt(e.currentTarget.getBoundingClientRect())}
        className="flex-shrink-0 rounded-full border border-gray-300 p-1 text-gray-400 transition hover:bg-gray-50 hover:text-gray-700"
      >
        <ChevronDown size={13} />
      </button>

      {menuAt && (
        <ActionMenu anchor={menuAt} onClose={() => setMenuAt(null)} actions={menuActions} />
      )}
    </div>
  );
}

/**
 * One chip. The count is left off the All chip — it would be the same number
 * as the Unread chip beside it, on the one chip that hides nothing.
 */
function Chip({
  label, count, selected, onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
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
