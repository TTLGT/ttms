'use client';

import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import RoomAvatar from './RoomAvatar';
import { conversationTitle } from '@/types/conversation';

/**
 * A strip of room pictures down the side of the popup, one click per room.
 *
 * The popup shows one thing at a time — there is no width for the list beside
 * a thread — so without this, going from one chat to another was Back, find
 * it, open it, every time. Somebody answering three people about three loads
 * does that dozens of times an hour. A picture is all a room needs to be
 * recognised by here, and the name is on hover.
 *
 * Same order as the list (pinned first, then whoever spoke last), because it
 * is the list: `conversations` arrives already sorted from ChatContext. It
 * deliberately ignores the filter chips and the search box — those are about
 * finding a room, and this is about the rooms somebody is already juggling.
 */
export default function ChatRail() {
  const { user } = useAuth();
  const {
    conversations, activeId, setActiveId, nameOf, unreadIds, mentionIds, unreadCounts,
  } = useChat();
  const myUid = user?.uid ?? '';

  return (
    <nav
      aria-label="Conversations"
      className="flex w-14 flex-shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-gray-200 bg-gray-50 py-2"
    >
      {conversations.map((c) => {
        const title     = conversationTitle(c, myUid, nameOf);
        const active    = c.id === activeId;
        const unread    = unreadIds.includes(c.id);
        const mentioned = mentionIds.includes(c.id);
        const waiting   = unreadCounts[c.id] ?? 0;

        return (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveId(c.id)}
            title={title}
            aria-label={title}
            aria-current={active ? 'true' : undefined}
            className={`relative flex-shrink-0 rounded-full p-0.5 transition ${
              active ? 'ring-2 ring-brand-500' : 'opacity-80 hover:opacity-100'
            }`}
          >
            <RoomAvatar conversation={c} size={36} />

            {/* The same marks the list uses, shrunk: amber for a mention,
                blue for waiting messages, a dot while the count loads. */}
            {!active && (mentioned || unread) && (
              waiting > 0 || mentioned ? (
                <span
                  className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-gray-50 px-1 text-[9px] font-bold tabular-nums ${
                    mentioned ? 'bg-amber-400 text-brand-900' : 'bg-brand-500 text-white'
                  }`}
                >
                  {mentioned && waiting === 0 ? '@' : waiting > 99 ? '99+' : waiting}
                </span>
              ) : (
                <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-gray-50 bg-brand-500" />
              )
            )}
          </button>
        );
      })}
    </nav>
  );
}
