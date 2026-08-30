'use client';

import { AtSign, Hash, MessagesSquare, Plus, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { millis } from '@/lib/chat';
import { UserAvatar } from '@/components/settings/UserAvatar';
import NotifyMenu from './NotifyMenu';
import { conversationTitle, otherMemberUid, type Conversation } from '@/types/conversation';

/**
 * The left-hand list: every conversation you are in, most recent first.
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
    nameOf, profileOf, loading, myThreads, threadReadAt,
  } = useChat();
  const myUid = user?.uid ?? '';

  // Whether the threads list is worth opening, in one dot. Counted across
  // every room, which is the thing the per-room thread marks below cannot say.
  const threadsWaiting = myThreads.some(
    (t) => millis(t.lastReplyAt) > (threadReadAt[t.rootId] ?? 0),
  );

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

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && <p className="px-2 py-3 text-sm text-gray-400">Loading…</p>}

        {!loading && conversations.length === 0 && (
          <p className="px-2 py-3 text-sm text-gray-400">
            Nothing here yet. Use + to message someone.
          </p>
        )}

        {conversations.map((c) => {
          const unread    = unreadIds.includes(c.id);
          const mentioned = mentionIds.includes(c.id);
          const answered  = threadIds.includes(c.id);
          const waiting   = unreadCounts[c.id] ?? 0;
          const title     = conversationTitle(c, myUid, nameOf);
          const other     = otherMemberUid(c, myUid);

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition ${
                activeId === c.id ? 'bg-brand-50' : 'hover:bg-gray-50'
              }`}
            >
              <Icon conversation={c} other={other} photoPath={other ? profileOf(other)?.photoPath : null} title={title} />

              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                  {title}
                </p>
                <p className="truncate text-xs text-gray-500">{preview(c, myUid)}</p>
              </div>

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
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A face for a direct thread, a symbol for a room — the fastest thing to scan. */
function Icon({
  conversation, other, photoPath, title,
}: {
  conversation: Conversation;
  other: string | null;
  photoPath: string | null | undefined;
  title: string;
}) {
  if (conversation.kind === 'direct' && other) {
    return <UserAvatar photoPath={photoPath} fallback={title.charAt(0).toUpperCase()} size={32} />;
  }
  return (
    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
      {conversation.kind === 'company' ? <Users size={15} /> : <Hash size={15} />}
    </span>
  );
}

/** The last thing said, prefixed with who said it once there is more than one of you. */
function preview(c: Conversation, myUid: string): string {
  const last = c.lastMessage;
  if (!last) return 'No messages yet';
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
