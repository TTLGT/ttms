'use client';

import { useState } from 'react';
import {
  ArrowDown, ArrowUp, AtSign, Bell, BellOff, ListPlus, LogOut, MessagesSquare, MoreVertical,
  Pin, PinOff, Plus, Search, Star, StarOff, Tag, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { leaveConversation, millis } from '@/lib/chat';
import { usePinnedDrag } from '@/lib/usePinnedDrag';
import ActionMenu, { type MenuAction } from './ActionMenu';
import ChatFilterBar from './ChatFilterBar';
import ChatListDialog from './ChatListDialog';
import RoomAvatar from './RoomAvatar';
import NotifyMenu from './NotifyMenu';
import {
  chatListIdOf,
  chatListsInOrder,
  conversationTitle,
  inChatFilter,
  notifyLevel,
  MAX_CHAT_LISTS,
  SYSTEM_SENDER_UID,
  type ChatFilterId,
  type ChatList,
  type Conversation,
  type ConversationNotify,
} from '@/types/conversation';

/**
 * The left-hand list: every conversation you are in, pinned ones first and the
 * rest by whoever spoke last.
 *
 * Shared by the full page and the popup, so it takes no layout of its own
 * beyond filling whatever it is put in.
 */
export default function ConversationList({
  onNew, onShowThreads,
}: {
  onNew: () => void;
  onShowThreads: () => void;
}) {
  const { user } = useAuth();
  const {
    conversations, unreadIds, mentionIds, threadIds, unreadCounts, activeId, setActiveId,
    nameOf, loading, myThreads, threadReadAt,
    searchQuery, setSearchQuery, search, runSearch, clearSearch,
    notify, setNotifyFor, pinnedConversations, togglePinnedConversation,
    movePinnedConversation, dropPinnedConversation,
    chatFilter, favorites, toggleFavorite, lists, addChatList, renameList, setInList,
  } = useChat();
  const myUid = user?.uid ?? '';

  // Dragging a pinned room to a different place. The arrows in the menu below
  // do the same thing without a mouse, and both go through the same helper, so
  // a room dropped one place up and a room moved up once land identically.
  const { rowProps, dragClass } = usePinnedDrag(dropPinnedConversation);

  /** The room whose menu is open, and where its button is on screen. */
  const [menuFor, setMenuFor] = useState<{ id: string; anchor: DOMRect } | null>(null);

  /**
   * The list dialog, when it is open: naming a new list - with the chat it was
   * started from, if it came off a row's menu - or renaming one that exists.
   */
  const [listDialog, setListDialog] = useState<
    | { mode: 'create'; seedId?: string }
    | { mode: 'rename'; listId: string }
    | null
  >(null);

  // What the chip row is showing. Rooms that fall outside it are only hidden,
  // not unwatched: they are the same live conversations, and the chip they sit
  // under carries their unread count.
  //
  // The conversation being read stays whatever the filter says. Opening one
  // marks it read on the spot, so under Unread its own row would slide out of
  // the column the moment it was clicked — taking its menu with it, and
  // leaving "Nothing unread" printed beside a thread that is plainly open. The
  // same goes for unticking a list from inside it. It drops out as soon as
  // attention moves elsewhere, which is the moment it stops being disorienting.
  /*
   * What is typed in the search box, as words.
   *
   * Names are matched by prefix here, unlike the words inside messages, which
   * are matched whole. The two are different questions: a room list is a
   * couple of dozen short strings the browser already holds, so narrowing it
   * on every keystroke costs nothing and "viv" finding Vivian is the whole
   * point. Searching what was *said* goes to the server against every room,
   * where per-keystroke prefix matching is neither free nor indexable.
   */
  const nameWords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);

  /** A room's name, and the names of the people in it. */
  const searchableName = (c: Conversation): string =>
    [conversationTitle(c, myUid, nameOf), ...c.memberUids.map(nameOf)].join(' ').toLowerCase();

  const shown = nameWords.length > 0
    // While there is something in the box it decides the list, chips and all.
    // A chip that went on hiding rooms matching what somebody had just typed
    // would read as the search being broken rather than as a filter being on.
    ? conversations.filter((c) => {
        const haystack = searchableName(c).split(/[^a-z0-9]+/).filter(Boolean);
        return nameWords.every((w) => haystack.some((word) => word.startsWith(w)));
      })
    : conversations.filter(
        (c) => c.id === activeId || inChatFilter(c, chatFilter, { favorites, lists, unreadIds }),
      );
  const listRows = chatListsInOrder(lists);

  // Whether the threads list is worth opening, in one dot. Counted across
  // every room, which is the thing the per-room thread marks below cannot say.
  const threadsWaiting = myThreads.some(
    (t) => millis(t.lastReplyAt) > (threadReadAt[t.rootId] ?? 0),
  );

  /**
   * What the menu on a room offers.
   *
   * The three notification levels are listed as choices with the current one
   * ticked rather than hidden behind a submenu: there are three of them, they
   * are the whole point of the menu, and a submenu in a 288px column has
   * nowhere to open to.
   */
  function actionsOn(c: Conversation): MenuAction[] {
    const pinned = pinnedConversations.includes(c.id);
    const rank   = pinnedConversations.indexOf(c.id);
    const level  = notifyLevel(notify, c.id);

    const levelAction = (value: ConversationNotify, label: string, Icon: typeof Bell): MenuAction => ({
      key:     `notify-${value}`,
      label,
      Icon,
      checked: level === value,
      onSelect: () => setNotifyFor(c.id, value),
    });

    const actions: MenuAction[] = [
      {
        key:   'pin',
        label: pinned ? 'Unpin from top' : 'Pin to top',
        Icon:  pinned ? PinOff : Pin,
        onSelect: () => togglePinnedConversation(c.id),
      },
      // Favourite and pin sit together and do different things, the way they
      // do in WhatsApp: a pin holds a room at the top of the whole list, a
      // favourite puts it behind a chip. Somebody with four pinned rooms has
      // used up the top of their list; somebody with a Favorites chip has not.
      {
        key:   'favorite',
        label: favorites.includes(c.id) ? 'Remove from Favorites' : 'Add to Favorites',
        Icon:  favorites.includes(c.id) ? StarOff : Star,
        onSelect: () => toggleFavorite(c.id),
      },
      // The keyboard's way of doing what the drag does. Each one is left out
      // when it would do nothing — an unpinned room has no place in the order,
      // and the room at the top of the pins has no further up to go — because
      // a menu item that is present and inert reads as broken.
      ...(pinned && rank > 0 ? [{
        key:   'move-up',
        label: 'Move up',
        Icon:  ArrowUp,
        onSelect: () => movePinnedConversation(c.id, -1),
      }] : []),
      ...(pinned && rank > -1 && rank < pinnedConversations.length - 1 ? [{
        key:   'move-down',
        label: 'Move down',
        Icon:  ArrowDown,
        onSelect: () => movePinnedConversation(c.id, 1),
      }] : []),
      // Each list as a tick rather than a submenu, for the reason the notify
      // levels are: a 288px column has nowhere for a submenu to open to. The
      // last item is what somebody filing the first chat of a new category
      // actually wants, and saves them making the list and then coming back
      // here to put this chat in it.
      ...listRows.map(({ id, list }, i): MenuAction => ({
        key:     `list-${id}`,
        label:   list.name,
        Icon:    Tag,
        checked: list.conversationIds.includes(c.id),
        ...(i === 0 ? { section: 'Lists' } : {}),
        onSelect: () => setInList(id, c.id, !list.conversationIds.includes(c.id)),
      })),
      {
        key:     'new-list',
        label:   'New list with this chat…',
        Icon:    ListPlus,
        ...(listRows.length === 0 ? { section: 'Lists' } : {}),
        onSelect: () => setListDialog({ mode: 'create', seedId: c.id }),
      },
      { ...levelAction('all', 'All messages', Bell), section: 'Notify me about' },
      levelAction('mentions', 'Only when named', AtSign),
      levelAction('none', 'Nothing — mute', BellOff),
    ];

    // A record room is the one kind nobody was invited to, so it is the one
    // kind with no settings dialog to leave from — and the one most likely to
    // pile up, since every load somebody has ever discussed stays in the list.
    // Pressing Discuss on that order puts it straight back, which is why this
    // needs no confirmation that leaving a named room does.
    if (c.kind === 'record') {
      actions.push({
        key:   'leave',
        label: 'Leave this room',
        Icon:  LogOut,
        section: 'This load',
        onSelect: () => {
          // Cleared first: the room is about to leave the list, and a thread
          // still pointing at it would sit on messages the rules have just
          // stopped allowing.
          if (activeId === c.id) setActiveId(null);
          void leaveConversation(c.id).catch(() => {});
        },
      });
    }

    return actions;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Conversations
        </span>
        <div className="flex items-center gap-0.5">
          {/* Threads are answers addressed to you, which is a different
              question from which room is busy — so its own way in, rather than
              a filter over the list below. */}
          <button
            type="button"
            onClick={onShowThreads}
            title="Threads you are in"
            className="relative rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <MessagesSquare size={16} />
            {threadsWaiting && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-500" />
            )}
          </button>
          <NotifyMenu />
          <button
            type="button"
            onClick={onNew}
            title="Start a conversation"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Above the chips rather than below them, because it overrules them:
          anything typed here decides what the list shows. */}
      <div className="px-2 pb-1.5">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            // Enter is what sends it to the server. The list below has already
            // narrowed as they typed — see the note on nameWords — so Enter is
            // for the other question: not which room, but what was said in it.
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
              if (e.key === 'Escape') clearSearch();
            }}
            placeholder="Search rooms, people, messages"
            aria-label="Search chat"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-8 text-xs text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-200"
          />
          {(searchQuery || search) && (
            <button
              type="button"
              onClick={clearSearch}
              title="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {/* Said rather than left to be discovered. Pressing Enter is the only
            way to search what was said, and a box that had already narrowed
            the list looks finished. */}
        {searchQuery.trim() !== '' && !search && (
          <p className="px-0.5 pt-1 text-[11px] text-gray-400">
            Press Enter to search what was said.
          </p>
        )}
      </div>

      {/* Hidden while the box is in use: the chips filter the same list the
          box has just taken over, so leaving them on screen would offer two
          contradictory answers to what the column is showing. */}
      {nameWords.length === 0 && (
        <ChatFilterBar
          onNewList={() => setListDialog({ mode: 'create' })}
          onRenameList={(listId) => setListDialog({ mode: 'rename', listId })}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && <p className="px-2 py-3 text-sm text-gray-400">Loading…</p>}

        {!loading && shown.length === 0 && (
          <p className="px-2 py-3 text-sm text-gray-400">
            {nameWords.length > 0
              // Never a dead end: no room by that name does not mean nothing
              // was said by it, and the search that answers that is one key
              // away.
              ? 'No room or person by that name. Press Enter to search what was said.'
              : emptyText(chatFilter, lists, conversations.length === 0)}
          </p>
        )}

        {shown.map((c) => {
          const unread    = unreadIds.includes(c.id);
          const mentioned = mentionIds.includes(c.id);
          const answered  = threadIds.includes(c.id);
          const waiting   = unreadCounts[c.id] ?? 0;
          const title     = conversationTitle(c, myUid, nameOf);
          const pinned    = pinnedConversations.includes(c.id);
          const level     = notifyLevel(notify, c.id);

          return (
            <div
              key={c.id}
              // Only a pinned row is draggable, and only onto another pinned
              // row — see usePinnedDrag. The rest of the list is sorted by who
              // spoke last, so there is nothing there for a row to hold on to.
              {...rowProps(c.id, pinned)}
              className={`group relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition ${
                activeId === c.id ? 'bg-brand-50' : 'hover:bg-gray-50'
              } ${pinned ? 'cursor-grab active:cursor-grabbing' : ''} ${dragClass(c.id)}`}
            >
              <RoomAvatar conversation={c} size={32} />

              <button
                type="button"
                onClick={() => setActiveId(c.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="flex items-center gap-1">
                  {pinned && <Pin size={10} className="flex-shrink-0 text-gray-400" />}
                  <span
                    className={`truncate text-sm ${
                      unread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'
                    } ${
                      // A muted room is drawn quieter than the rest, which is
                      // the only way somebody who muted it a month ago finds
                      // out why it never says anything.
                      level === 'none' ? 'text-gray-400' : ''
                    }`}
                  >
                    {title}
                  </span>
                  {level === 'none' && <BellOff size={10} className="flex-shrink-0 text-gray-400" />}
                </p>
                <p className="truncate text-xs text-gray-500">{preview(c, myUid)}</p>
              </button>

              {/* A thread you are in has been answered. Its own mark, beside
                  the ordinary one rather than folded into it, because the two
                  are cleared by different things: this one stays until the
                  thread itself is opened, and glancing at the room will not
                  take it away. Amber when the reply named you. */}
              {answered && (
                <span
                  title="A thread you are in has a new reply"
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                    c.threadPings?.[myUid]?.mention
                      ? 'bg-amber-400 text-brand-900'
                      : 'bg-brand-100 text-brand-700'
                  }`}
                >
                  <MessagesSquare size={11} strokeWidth={2.5} />
                </span>
              )}

              {/* Being named outranks everything else unread, so it keeps a
                  mark of its own — amber and an @ — rather than looking like
                  twenty routine messages. That is the entire point of a
                  mention; the number rides along inside it. */}
              {mentioned ? (
                <span
                  title="You were mentioned"
                  className="flex h-5 flex-shrink-0 items-center gap-0.5 rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-brand-900"
                >
                  <AtSign size={11} strokeWidth={3} />
                  {waiting > 0 && <span className="tabular-nums">{badgeCount(waiting)}</span>}
                </span>
              ) : (
                unread && (
                  waiting > 0 ? (
                    <span
                      title={`${waiting} unread`}
                      className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold tabular-nums text-white"
                    >
                      {badgeCount(waiting)}
                    </span>
                  ) : (
                    /* The count is a separate lookup and lands a moment after
                       the message does. A dot in the meantime, because a badge
                       that appears empty first reads as a glitch. */
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" />
                  )
                )
              )}

              {/* Kept out of the way until the row is hovered or the menu is
                  open, so a list of twelve rooms is not a column of twelve
                  identical buttons. */}
              <button
                type="button"
                title="Room options"
                aria-label={`Options for ${title}`}
                onClick={(e) => setMenuFor({ id: c.id, anchor: e.currentTarget.getBoundingClientRect() })}
                className={`-mr-1 flex-shrink-0 rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700 focus-visible:opacity-100 ${
                  menuFor?.id === c.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <MoreVertical size={14} />
              </button>

              {menuFor?.id === c.id && (
                <ActionMenu
                  anchor={menuFor.anchor}
                  onClose={() => setMenuFor(null)}
                  actions={actionsOn(c)}
                />
              )}
            </div>
          );
        })}
      </div>

      {listDialog && (
        <ChatListDialog
          mode={listDialog.mode}
          initialName={listDialog.mode === 'rename' ? lists[listDialog.listId]?.name ?? '' : ''}
          atCap={listRows.length >= MAX_CHAT_LISTS}
          onSubmit={(name) => {
            if (listDialog.mode === 'rename') renameList(listDialog.listId, name);
            else addChatList(name, listDialog.seedId ? [listDialog.seedId] : []);
          }}
          onClose={() => setListDialog(null)}
        />
      )}
    </div>
  );
}

/**
 * What an empty column says, which depends entirely on why it is empty.
 *
 * A filter with nothing under it is the one moment somebody can be looking at
 * a chat list that does not have their chats in it, so each of these has to
 * say which filter is doing the hiding and how a room gets in.
 */
function emptyText(
  filter: ChatFilterId,
  lists: Record<string, ChatList>,
  noConversationsAtAll: boolean,
): string {
  if (noConversationsAtAll) return 'Nothing here yet. Use + to message someone.';
  switch (filter) {
    case 'favorites':
      return 'No favorites yet. Open the menu on a chat and choose Add to Favorites.';
    case 'unread':
      return 'Nothing unread.';
    case 'rooms':
      return 'You are not in any rooms yet.';
    case 'loads':
      return 'No load rooms yet. Press Discuss on an order to start one.';
    default: {
      const listId = chatListIdOf(filter);
      const name = listId ? lists[listId]?.name : null;
      return name
        ? `Nothing in ${name} yet. Open the menu on a chat and tick ${name}.`
        : 'Nothing here.';
    }
  }
}

/** The last thing said, prefixed with who said it once there is more than one of you. */
function preview(c: Conversation, myUid: string): string {
  const last = c.lastMessage;
  if (!last) return 'No messages yet';

  // The server's own lines carry no prefix. They already say what they are
  // ("Status moved to Delivered", "Happy birthday to Tom Reed"), and the
  // first-word shortening below reads as somebody's name — which for the
  // celebrations post, signed "Total Transport Logistics", would put "Total:"
  // in front of it.
  if (last.senderUid === SYSTEM_SENDER_UID) return last.text || 'Message deleted';

  const who = last.senderUid === myUid ? 'You' : last.senderName.split(' ')[0];
  const body = last.text || 'Message deleted';
  return c.kind === 'direct' && last.senderUid !== myUid ? body : `${who}: ${body}`;
}

/**
 * Past 99 the exact number stops being information — "a lot, go and look" is
 * the whole message — and a four-digit badge would push the conversation name
 * out of a 288px column.
 */
function badgeCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}
