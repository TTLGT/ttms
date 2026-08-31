'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CornerUpLeft, Link2, Lock, MessagesSquare, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  deleteMessage,
  editMessage,
  millis,
  openDirectConversation,
  pinMessage,
  sendMessage,
  toggleReaction,
  unpinMessage,
  watchMessages,
} from '@/lib/chat';
import { dayLabel, dayOf, groupsWithPrevious } from '@/lib/chatFormat';
import { copyToClipboard } from '@/lib/clipboard';
import PersonCard from './PersonCard';
import ActionMenu, { type MenuAction } from './ActionMenu';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import PinnedBar from './PinnedBar';
import SystemMessage from './SystemMessage';
import {
  isThreadUnread,
  type Attachment,
  type ChatMessage,
  type Conversation,
  type MentionCandidate,
  type MessageQuote,
} from '@/types/conversation';

/** How many messages a thread loads at a time. */
const PAGE_SIZE = 200;

/**
 * One conversation, live.
 *
 * The listener is opened here rather than in ChatContext because only one
 * thread is ever on screen: subscribing to every conversation's messages so
 * the provider could hold them all would mean reading — and paying for — every
 * message in the company on every page load.
 *
 * The bubbles and the box you write in are their own components, because a
 * thread panel draws exactly the same two things — see MessageBubble and
 * MessageComposer. What is left here is what only a room has: the window back
 * through its history, where the reader left off, and where a scroll is.
 */
export default function MessageThread({ conversation }: { conversation: Conversation }) {
  const conversationId = conversation.id;
  const { user, profile } = useAuth();
  const {
    people, lastReadAt, threadReadAt, setActiveId, setOpenThread,
    pendingReply, setPendingReply, focusMessageId, setFocusMessageId,
  } = useChat();
  const { formatDate } = useDateFormatters();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  /**
   * The name someone has clicked on, and where it sits on screen.
   *
   * The card is positioned against the viewport rather than inside the thread,
   * so the anchor has to be captured at click time — see PersonCard for why an
   * absolutely-positioned popover inside a scrolling, clipping container was
   * not an option.
   */
  const [card, setCard] = useState<{ uid: string; anchor: DOMRect } | null>(null);

  /** The message being answered, shown above the box until it is sent or dropped. */
  const [replyingTo, setReplyingTo] = useState<MessageQuote | null>(null);
  /** Briefly ringed after jumping to it from a quote, so the eye finds it. */
  const [flashId, setFlashId] = useState<string | null>(null);
  /** The bubble whose arrow was clicked, and where that arrow is on screen. */
  const [actionsFor, setActionsFor] = useState<{ messageId: string; anchor: DOMRect } | null>(null);

  /**
   * How far back this thread is loaded.
   *
   * Raised when the reader reaches the top rather than loaded all at once: a
   * room a year old holds tens of thousands of messages, and every one of them
   * is a read that gets billed whether or not anybody scrolls to it.
   */
  const [windowState, setWindowState] = useState({ id: conversationId, size: PAGE_SIZE });
  const [older, setOlder] = useState<'idle' | 'loading' | 'end'>('idle');

  // Reset during render rather than in an effect. An effect would let the
  // listener subscribe once at the old, larger size for the new conversation
  // before shrinking back — several hundred document reads, billed, for
  // messages thrown away a frame later.
  if (windowState.id !== conversationId) {
    setWindowState({ id: conversationId, size: PAGE_SIZE });
  }
  const windowSize = windowState.id === conversationId ? windowState.size : PAGE_SIZE;
  const setWindowSize = (next: (was: number) => number) =>
    setWindowState((was) => ({ id: was.id, size: next(was.size) }));

  const scroller = useRef<HTMLDivElement>(null);
  const myUid    = user?.uid ?? '';

  const senderIdentity = {
    uid:         myUid,
    displayName: profile?.displayName || user?.displayName || user?.email || 'Someone',
  };

  /** Which messages this room has pinned, read off the live conversation. */
  const pinnedHere = Object.keys(conversation.pinned ?? {});

  /* ------------------------------------------------------------ messages */

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    const stop = watchMessages(
      conversationId,
      (rows) => {
        setMessages(rows);
        setLoading(false);
        // Fewer came back than were asked for, so this is the whole history and
        // there is nothing above to go and fetch.
        setOlder(rows.length < windowSize ? 'end' : 'idle');
      },
      windowSize,
      () => { setError('These messages could not be loaded.'); setLoading(false); },
    );
    return stop;
  }, [conversationId, windowSize]);

  /* ------------------------------------------------------ new-messages line */

  /**
   * Where the reader left off, frozen at the moment they opened the thread.
   *
   * It has to be a snapshot. Opening a conversation marks it read within the
   * same second, so reading the live value would move the line to the bottom
   * before anyone could see it — which is precisely the information they came
   * back for.
   */
  const readMarks = useRef(lastReadAt);
  readMarks.current = lastReadAt;
  const [dividerAt, setDividerAt] = useState(0);

  useEffect(() => {
    setDividerAt(readMarks.current[conversationId] ?? 0);
  }, [conversationId]);

  const firstUnreadId = useMemo(() => {
    if (!dividerAt) return null;
    const first = messages.find(
      (m) => m.senderUid !== myUid && millis(m.createdAt) > dividerAt,
    );
    return first?.id ?? null;
  }, [messages, dividerAt, myUid]);

  /* ------------------------------------------------------------ scrolling */

  // Whether the reader is at the live end of the thread. Someone scrolled up
  // reading yesterday must not be yanked to the bottom because a message
  // arrived; someone at the bottom expects to follow along.
  const atBottom = useRef(true);

  /**
   * Where the thread was standing when older messages were asked for.
   *
   * Older messages arrive above what is on screen, so the content the reader
   * was looking at slides down by however tall the new batch is. Without
   * putting the scroll back, reaching the top would fling them into the middle
   * of last month.
   */
  const restoreFrom = useRef<{ height: number; top: number } | null>(null);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    // Near the top, with more behind it: fetch the next page back.
    if (el.scrollTop < 120 && older === 'idle' && !loading) {
      restoreFrom.current = { height: el.scrollHeight, top: el.scrollTop };
      setOlder('loading');
      setWindowSize((was) => was + PAGE_SIZE);
    }

    // Both hang off a fixed point on the screen and cannot follow the thing
    // they belong to. Closing beats letting them drift away from their anchor.
    setCard(null);
    setActionsFor(null);
  }, [older, loading]);

  const openedAt = useRef('');
  useEffect(() => {
    const el = scroller.current;
    if (!el || loading) return;

    // First paint of a conversation: land on the first thing they have not
    // read, not on the bottom. Jumping rather than smooth-scrolling — animating
    // a year of history past someone before they can read anything is worse
    // than simply starting in the right place.
    if (openedAt.current !== conversationId) {
      openedAt.current = conversationId;
      const target = firstUnreadId
        ? el.querySelector<HTMLElement>(`[data-message="${firstUnreadId}"]`)
        : null;
      if (target) {
        el.scrollTop = target.offsetTop - el.offsetTop - 48;
        atBottom.current = false;
      } else {
        el.scrollTop = el.scrollHeight;
        atBottom.current = true;
      }
      return;
    }

    // A page of older messages just landed. Put the reader back on the line
    // they were reading, which is now that much further down.
    const restore = restoreFrom.current;
    if (restore) {
      restoreFrom.current = null;
      el.scrollTop = el.scrollHeight - restore.height + restore.top;
      return;
    }

    if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading, conversationId, firstUnreadId]);

  /* --------------------------------------------------------------- replies */

  // Declared before the effect that claims a pending quote, so that switching
  // conversation clears the old draft reply first and the incoming one is not
  // wiped by it a moment later. Effects run in the order they are written.
  useEffect(() => { setReplyingTo(null); }, [conversationId]);

  // A quote left here by "reply privately" in another conversation. Claimed
  // once, then cleared, so returning to this thread later does not re-arm it.
  useEffect(() => {
    if (!pendingReply || pendingReply.conversationId !== conversationId) return;
    setReplyingTo(pendingReply.quote);
    setPendingReply(null);
  }, [pendingReply, conversationId, setPendingReply]);

  /** Snapshots a message as a quote. `from` is set only for a private reply. */
  const quoteOf = useCallback((m: ChatMessage): MessageQuote => ({
    messageId:  m.id,
    text:       m.text,
    senderUid:  m.senderUid,
    senderName: m.senderName,
    fromConversationId:   null,
    fromConversationName: null,
  }), []);

  /**
   * Answers a message from a room in a direct thread with whoever wrote it.
   *
   * The quote travels with you, because without it the other person gets a
   * reply to something they said an hour ago with no indication of what. Only
   * ever addressed to the message's own sender — which is what makes carrying
   * the room's name across safe, since they were plainly in that room.
   */
  async function replyPrivately(m: ChatMessage) {
    setError('');
    try {
      const id = await openDirectConversation(m.senderUid);
      setPendingReply({
        conversationId: id,
        quote: {
          ...quoteOf(m),
          fromConversationId:   conversationId,
          fromConversationName: conversation.kind === 'company'
            ? 'Everyone'
            : conversation.name,
        },
      });
      setActiveId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open a private thread.');
    }
  }

  /** A copyable address for one message. */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyMessageLink = useCallback(async (messageId: string) => {
    const url = `${window.location.origin}/dashboard/chat?c=${conversationId}&m=${messageId}`;
    const ok  = await copyToClipboard(url);
    if (ok) {
      setCopiedId(messageId);
      window.setTimeout(() => setCopiedId((was) => (was === messageId ? null : was)), 2000);
    } else {
      // The clipboard is unavailable on plain http, which is how most of the
      // office reaches this. Showing the address beats a button that lies.
      setError(url);
    }
  }, [conversationId]);

  /**
   * What the arrow on a bubble offers, for this message and this reader.
   *
   * Built per message rather than filtered in the menu, so the menu itself
   * knows nothing about who may do what.
   */
  function actionsOn(m: ChatMessage, mine: boolean): MenuAction[] {
    const actions: MenuAction[] = [
      // Replying works on anyone's message, your own included — quoting
      // yourself is how you pick a thread back up after the room has moved on.
      { key: 'reply', label: 'Reply', Icon: CornerUpLeft, onSelect: () => setReplyingTo(quoteOf(m)) },
      {
        // Separate from Reply, and worded to say where the answer lands. The
        // two solve different problems: a quote answers in the room so the
        // room sees it, a thread takes a side conversation out of the room so
        // the room does not have to.
        key:   'thread',
        label: (m.replyCount ?? 0) > 0 ? 'Open thread' : 'Reply in thread',
        Icon:  MessagesSquare,
        onSelect: () => setOpenThread({ conversationId, rootId: m.id }),
      },
      {
        key: 'link',
        label: copiedId === m.id ? 'Link copied' : 'Copy link to message',
        Icon: Link2,
        onSelect: () => void copyMessageLink(m.id),
      },
      // Anybody in the room, on anybody's message: what is worth keeping at
      // the top of a room is rarely something you said yourself.
      {
        key:   'pin',
        label: pinnedHere.includes(m.id) ? 'Unpin from room' : 'Pin to room',
        Icon:  pinnedHere.includes(m.id) ? PinOff : Pin,
        onSelect: () => {
          if (pinnedHere.includes(m.id)) {
            void unpinMessage(conversationId, m.id).catch(() => setError('That did not unpin.'));
          } else {
            void pinMessage(conversationId, m, senderIdentity, pinnedHere.length)
              .catch((e) => setError(e instanceof Error ? e.message : 'That did not pin.'));
          }
        },
      },
    ];

    // Only from a room, and only on someone else's message: a private reply is
    // addressed to whoever wrote it, so there is nobody to address on your own,
    // and a direct thread is already private.
    if (!mine && conversation.kind !== 'direct') {
      actions.push({
        key:   'private',
        label: `Reply privately to ${m.senderName.split(' ')[0]}`,
        Icon:  Lock,
        onSelect: () => void replyPrivately(m),
      });
    }

    if (mine) {
      actions.push(
        {
          key: 'edit', label: 'Edit', Icon: Pencil,
          onSelect: () => { setEditingId(m.id); setEditDraft(m.text); },
        },
        {
          key: 'delete', label: 'Delete', Icon: Trash2, danger: true,
          onSelect: () => void deleteMessage(conversationId, m.id, {
            isLastMessage: messages[messages.length - 1]?.id === m.id,
          }).catch(() => {}),
        },
      );
    }
    return actions;
  }

  /** Scrolls to the message a quote came from, and rings it briefly. */
  const jumpTo = useCallback((messageId: string) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-message="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashId(messageId);
    window.setTimeout(() => setFlashId((was) => (was === messageId ? null : was)), 1600);
  }, []);

  // A link to one message lands here once the conversation has switched and the
  // thread has drawn. Claimed and cleared, so coming back later does not jump
  // again. A message older than the loaded window simply is not found — the
  // conversation still opens, which is most of what the link was for.
  useEffect(() => {
    if (!focusMessageId || loading) return;
    if (!messages.some((m) => m.id === focusMessageId)) return;
    jumpTo(focusMessageId);
    setFocusMessageId(null);
  }, [focusMessageId, loading, messages, jumpTo, setFocusMessageId]);

  /* ------------------------------------------------------------- mentions */

  /**
   * Who can be named here. The company room has no membership list, so anyone
   * with a profile is fair game; every other conversation is limited to the
   * people actually in it — offering a name that cannot see the room would
   * produce a mention nobody ever receives.
   */
  const candidates: MentionCandidate[] = useMemo(() => {
    const pool = conversation.kind === 'company'
      ? people
      : people.filter((p) => conversation.memberUids.includes(p.uid));
    return pool
      .filter((p) => p.displayName)
      .map((p) => ({ uid: p.uid, displayName: p.displayName }));
  }, [people, conversation]);

  /* -------------------------------------------------------------- sending */

  async function handleSend(text: string, mentions: string[], attachments: Attachment[]) {
    const quote = replyingTo;
    setError('');
    setReplyingTo(null);
    try {
      await sendMessage(conversationId, text, senderIdentity, mentions, quote, attachments);
    } catch (e) {
      // Put the quote back with the draft, or the retry loses what it was
      // answering. The composer restores the rest of it off the throw.
      setReplyingTo(quote);
      throw e;
    }
  }

  async function saveEdit(message: ChatMessage) {
    const text = editDraft.trim();
    if (!text) return;
    if (text === message.text) { setEditingId(null); return; }
    try {
      await editMessage(conversationId, message.id, text, {
        isLastMessage: messages[messages.length - 1]?.id === message.id,
      });
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That edit did not save.');
    }
  }

  /* --------------------------------------------------------------- render */

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Above the scroller rather than inside it: a pin that scrolled away
          with the conversation would be a pin you have to go and look for. */}
      <PinnedBar conversation={conversation} onJump={jumpTo} />

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-gray-50 px-4 py-4 space-y-1.5"
      >
        {loading && <p className="text-sm text-gray-400">Loading…</p>}

        {!loading && older === 'loading' && (
          <p className="py-2 text-center text-xs text-gray-400">Loading earlier messages…</p>
        )}
        {!loading && older === 'end' && messages.length > 0 && (
          <p className="py-2 text-center text-[11px] text-gray-400">
            This is the beginning of the conversation.
          </p>
        )}

        {!loading && messages.length === 0 && (
          <p className="text-sm text-gray-400">
            No messages yet. Say something to start it off.
          </p>
        )}

        {messages.map((m, i) => {
          const previous = messages[i - 1];
          // A date line whenever the day changes, so a thread read in the
          // morning does not present yesterday's argument as if it were new.
          const newDay = !previous || dayOf(previous) !== dayOf(m);
          // The unread line breaks a run too — a bubble tucked under the one
          // above it would read as part of what came before the line.
          const grouped = !newDay && m.id !== firstUnreadId && groupsWithPrevious(m, previous);
          const mine    = m.senderUid === myUid;

          return (
            <div key={m.id} data-message={m.id}>
              {/* Centred pills rather than a rule across the column: on a
                  tinted ground a hairline with text in it reads as a broken
                  border, and the bubbles either side already give the eye all
                  the horizontal structure it needs. */}
              {m.id === firstUnreadId && (
                <div className="flex justify-center py-2.5">
                  <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                    New messages
                  </span>
                </div>
              )}

              {newDay && (
                <div className="flex justify-center py-2.5">
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 shadow-sm">
                    {dayLabel(m, formatDate)}
                  </span>
                </div>
              )}

              {/* A line from TTMS rather than from a person: no bubble, no
                  menu, nothing to react to. See SystemMessage. */}
              {m.system ? <SystemMessage message={m} /> : (
              <MessageBubble
                message={m}
                grouped={grouped}
                showSenderName={conversation.kind !== 'direct'}
                flashed={flashId === m.id}
                editing={editingId === m.id}
                editDraft={editDraft}
                onEditDraft={setEditDraft}
                onSaveEdit={() => void saveEdit(m)}
                onCancelEdit={() => setEditingId(null)}
                onOpenActions={(anchor) => setActionsFor({ messageId: m.id, anchor })}
                actionsOpen={actionsFor?.messageId === m.id}
                onToggleReaction={(key, add) =>
                  void toggleReaction(
                    conversationId,
                    { id: m.id, senderUid: m.senderUid, text: m.text },
                    key,
                    senderIdentity,
                    add,
                  ).catch(() => setError('That reaction did not save.'))
                }
                onOpenPerson={(uid, anchor) => setCard({ uid, anchor })}
                // Preferred over the stored copy whenever the original is still
                // in the loaded window, so a quote of something since deleted
                // stops showing the text, and an edit is reflected. A quote
                // carried in from another conversation has no original here and
                // keeps its copy.
                quoteLive={
                  m.replyTo && !m.replyTo.fromConversationId
                    ? messages.find((x) => x.id === m.replyTo?.messageId)
                    : undefined
                }
                onJumpToQuoted={m.replyTo?.fromConversationId ? undefined : jumpTo}
                thread={{
                  // The mark on the conversation is passed in because it is the
                  // only evidence that somebody pulled into this thread by an @
                  // is in it — they have neither written it nor replied yet.
                  unread: isThreadUnread(
                    m, myUid, threadReadAt, conversation.threadPings?.[myUid]?.rootId,
                  ),
                  onOpen: () => setOpenThread({ conversationId, rootId: m.id }),
                }}
              />
              )}

              {!m.system && actionsFor?.messageId === m.id && (
                <ActionMenu
                  anchor={actionsFor.anchor}
                  onClose={() => setActionsFor(null)}
                  actions={actionsOn(m, mine)}
                />
              )}
            </div>
          );
        })}
      </div>

      <MessageComposer
        conversationId={conversationId}
        candidates={candidates}
        focusKey={conversationId}
        placeholder="Write a message…  @ to name someone, *bold*, _italic_"
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        notice={error}
        onSend={handleSend}
      />

      {card && (
        <PersonCard uid={card.uid} anchor={card.anchor} onClose={() => setCard(null)} />
      )}
    </div>
  );
}
