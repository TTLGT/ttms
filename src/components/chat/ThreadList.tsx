'use client';

import { ArrowLeft, AtSign, MessagesSquare, Pin, PinOff, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { dismissThread, millis } from '@/lib/chat';
import { whenLabel } from '@/lib/chatFormat';
import { conversationTitle } from '@/types/conversation';

/**
 * Every thread you are in, across every room, newest reply first.
 *
 * The room list answers "where is everyone talking"; this answers "what was I
 * asked". They are different questions, and after threads landed the second
 * one had no answer at all — a reply lives under a message, so finding the
 * conversation you were pulled into meant remembering which room it was in and
 * scrolling until you saw the reply count change.
 *
 * Reads the list rather than working it out. Why it has to be written down at
 * all is in CHAT_THREADS_COLLECTION.
 */
export default function ThreadList({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const {
    myThreads, conversations, threadReadAt, nameOf, setActiveId, setOpenThread,
    pinnedThreads, togglePinnedThread,
  } = useChat();
  const { formatDate } = useDateFormatters();

  const myUid = user?.uid ?? '';

  // A row naming a room that is no longer in the list is dropped rather than
  // drawn greyed out. Its room is one this user has been removed from — or a
  // direct thread with somebody since deactivated — so opening it would fail
  // at the rules, and a row that cannot be clicked is worse than no row. This
  // is the same reason ThreadEntry does not copy the room's name: it is
  // resolved here, from rooms already on screen, or the thread is not shown.
  const rows = myThreads.flatMap((entry) => {
    const conversation = conversations.find((c) => c.id === entry.conversationId);
    return conversation ? [{ entry, conversation }] : [];
  });

  // Pinned threads first, in the order they were pinned, then the rest by
  // newest reply — the same bargain the room list makes. A thread is pinned
  // precisely because it matters more than its last reply time says: the load
  // you are working on is often the one nobody has answered about yet.
  const pinnedRank = new Map(pinnedThreads.map((rootId, i) => [rootId, i]));
  const ordered = [
    ...rows
      .filter((r) => pinnedRank.has(r.entry.rootId))
      .sort((a, b) => (pinnedRank.get(a.entry.rootId) ?? 0) - (pinnedRank.get(b.entry.rootId) ?? 0)),
    ...rows.filter((r) => !pinnedRank.has(r.entry.rootId)),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          title="Back to conversations"
          className="-ml-1 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Threads
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {ordered.length === 0 && (
          <p className="px-2 py-3 text-sm text-gray-400">
            No threads yet. Answering under a message puts it here.
          </p>
        )}

        {ordered.map(({ entry, conversation }) => {
          // Measured against this thread's own read mark, the same one the
          // room list uses for its thread dot, so opening a thread in either
          // place clears it in both.
          const unread = millis(entry.lastReplyAt) > (threadReadAt[entry.rootId] ?? 0);
          // The stored flag is about the last reply, and stays true after it
          // has been read. Amber is for something still wanting an answer, so
          // the two are shown together or not at all.
          const named  = entry.mention && unread;

          const room  = conversationTitle(conversation, myUid, nameOf);
          const under = entry.rootSenderUid === myUid
            ? 'your message'
            : `${nameOf(entry.rootSenderUid).split(' ')[0]}’s message`;
          const who   = entry.lastReplyByUid === myUid
            ? 'You'
            : entry.lastReplyByName.split(' ')[0];
          const pinned = pinnedThreads.includes(entry.rootId);

          return (
            <div
              key={entry.rootId}
              className="group relative mb-0.5 flex w-full items-start gap-2.5 rounded-lg px-2 py-2 transition hover:bg-gray-50"
            >
              <span
                className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  named ? 'bg-amber-400 text-brand-900' : 'bg-brand-100 text-brand-700'
                }`}
              >
                {named ? <AtSign size={15} strokeWidth={2.5} /> : <MessagesSquare size={15} />}
              </span>

              {/* The row opens the room and the thread together. Both are
                  needed: ChatPanel will not draw a thread panel whose
                  conversation is not the one on screen, which is what stops a
                  thread outliving the room it belongs to. */}
              <button
                type="button"
                onClick={() => {
                  setActiveId(entry.conversationId);
                  setOpenThread({ conversationId: entry.conversationId, rootId: entry.rootId });
                }}
                className="min-w-0 flex-1 text-left"
              >
                <p className="flex items-center gap-1.5">
                  {pinned && <Pin size={10} className="flex-shrink-0 text-gray-400" />}
                  <span className={`truncate text-sm ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                    {/* A blank title means a row written before rootLabel
                        existed — an attachment-only message stored as ''. It
                        rewrites itself on the next reply. Never say 'deleted'
                        here: rootLabel says that itself when it is true. */}
                    {entry.rootText || 'Message'}
                  </span>
                </p>
                <p className="truncate text-xs text-gray-500">
                  {who}: {entry.lastReplyText || 'Reply deleted'}
                </p>
                <p className="truncate text-[11px] text-gray-400">
                  {room} · under {under} · {whenLabel(millis(entry.lastReplyAt), formatDate)}
                </p>
              </button>

              {unread && !named && (
                <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" />
              )}

              {/* Keeps the row at the top of this list, for this person only.
                  Unlike a pinned message, which is the room's, this decides
                  nothing for anybody else — see pinnedThreads in ChatReads. */}
              <button
                type="button"
                onClick={() => togglePinnedThread(entry.rootId)}
                title={pinned ? 'Unpin this thread' : 'Pin to the top of this list'}
                className={`rounded-lg p-1 transition hover:bg-gray-200 hover:text-gray-600 focus:opacity-100 ${
                  pinned
                    ? 'text-gray-500 opacity-100'
                    : 'text-gray-300 opacity-0 group-hover:opacity-100'
                }`}
              >
                {pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>

              {/* Takes the row off the list. Not "leave the thread" — a later
                  reply puts it back, which is the point; see dismissThread. */}
              <button
                type="button"
                onClick={() => { if (myUid) void dismissThread(myUid, entry.rootId); }}
                title="Remove from this list"
                className="rounded-lg p-1 text-gray-300 opacity-0 transition hover:bg-gray-200 hover:text-gray-600 focus:opacity-100 group-hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
