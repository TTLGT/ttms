'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, CornerUpLeft, Lock, Pencil, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  deleteMessage,
  editMessage,
  millis,
  openDirectConversation,
  sendMessage,
  watchMessages,
} from '@/lib/chat';
import { UserAvatar } from '@/components/settings/UserAvatar';
import PersonCard from './PersonCard';
import MessageActions, { type MessageAction } from './MessageActions';
import {
  MAX_MESSAGE_LENGTH,
  findMentions,
  splitOnMentions,
  type ChatMessage,
  type Conversation,
  type MentionCandidate,
  type MessageQuote,
} from '@/types/conversation';

/**
 * One conversation, live.
 *
 * The listener is opened here rather than in ChatContext because only one
 * thread is ever on screen: subscribing to every conversation's messages so
 * the provider could hold them all would mean reading — and paying for — every
 * message in the company on every page load.
 */
export default function MessageThread({ conversation }: { conversation: Conversation }) {
  const conversationId = conversation.id;
  const { user, profile } = useAuth();
  const {
    nameOf, profileOf, people, lastReadAt, setActiveId, pendingReply, setPendingReply,
  } = useChat();
  const { formatDate } = useDateFormatters();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [draft, setDraft]       = useState('');
  const [error, setError]       = useState('');
  const [sending, setSending]   = useState(false);

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

  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const myUid    = user?.uid ?? '';

  /* ------------------------------------------------------------ messages */

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    const stop = watchMessages(
      conversationId,
      (rows) => { setMessages(rows); setLoading(false); },
      200,
      () => { setError('These messages could not be loaded.'); setLoading(false); },
    );
    return stop;
  }, [conversationId]);

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
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    // Both hang off a fixed point on the screen and cannot follow the thing
    // they belong to. Closing beats letting them drift away from their anchor.
    setCard(null);
    setActionsFor(null);
  }, []);

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

    if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading, conversationId, firstUnreadId]);

  useEffect(() => { composer.current?.focus(); }, [conversationId]);

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
    composer.current?.focus();
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

  function startReply(m: ChatMessage) {
    setReplyingTo(quoteOf(m));
    composer.current?.focus();
  }

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

  /**
   * What the arrow on a bubble offers, for this message and this reader.
   *
   * Built per message rather than filtered in the menu, so the menu itself
   * knows nothing about who may do what.
   */
  function actionsOn(m: ChatMessage, mine: boolean): MessageAction[] {
    const actions: MessageAction[] = [
      // Replying works on anyone's message, your own included — quoting
      // yourself is how you pick a thread back up after the room has moved on.
      { key: 'reply', label: 'Reply', Icon: CornerUpLeft, onSelect: () => startReply(m) },
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

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPick, setMentionPick]   = useState(0);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return candidates
      .filter((c) => c.uid !== myUid && c.displayName.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [mentionQuery, candidates, myUid]);

  // Closes itself as soon as nothing matches, which is what lets a name with a
  // space in it work: the menu simply stays open while the typing still names
  // somebody, and disappears the moment it does not.
  const menuOpen = mentionQuery !== null && mentionMatches.length > 0;

  const readMentionQuery = useCallback((value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match  = before.match(/@([^\n@]{0,30})$/);
    setMentionQuery(match ? match[1] : null);
    setMentionPick(0);
  }, []);

  const applyMention = useCallback((choice: MentionCandidate) => {
    const el = composer.current;
    if (!el) return;
    const caret  = el.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@([^\n@]{0,30})$/, '');
    const after  = draft.slice(caret);
    const next   = `${before}@${choice.displayName} ${after}`;
    setDraft(next.slice(0, MAX_MESSAGE_LENGTH));
    setMentionQuery(null);
    // The caret belongs after the name just inserted, not back where it was.
    const at = before.length + choice.displayName.length + 2;
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at, at);
    });
  }, [draft]);

  /* -------------------------------------------------------------- sending */

  async function handleSend() {
    const text = draft.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setError('');
    // Cleared before the write, not after: the message is going to appear in
    // the thread from the listener anyway, and a box that stays full while the
    // network thinks about it invites the same thing being sent twice.
    setDraft('');
    setMentionQuery(null);
    const quote = replyingTo;
    setReplyingTo(null);
    try {
      await sendMessage(
        conversationId,
        text,
        {
          uid:         user.uid,
          displayName: profile?.displayName || user.displayName || user.email || 'Someone',
        },
        findMentions(text, candidates),
        quote,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That message did not send.');
      setDraft(text);
      // Put the quote back with the text, or the retry loses what it answered.
      setReplyingTo(quote);
    } finally {
      setSending(false);
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
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-gray-50 px-4 py-4 space-y-1.5"
      >
        {loading && <p className="text-sm text-gray-400">Loading…</p>}

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
          // Consecutive messages from one person are grouped under a single
          // name and avatar. Repeating both on every line turns a fast
          // back-and-forth into a wall of headshots.
          const grouped = !newDay
            && m.id !== firstUnreadId
            // A reply carries a quote above it and needs the name back, or the
            // quote appears to belong to whoever spoke last.
            && !m.replyTo
            && previous?.senderUid === m.senderUid
            && millis(m.createdAt) - millis(previous.createdAt) < 5 * 60 * 1000;

          const mine    = m.senderUid === myUid;
          const editing = editingId === m.id;

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

              <div className={`group flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>
                {/* The avatar belongs to the other person only, and only on the
                    first bubble of a run. Yours is redundant — the side of the
                    column already says who is speaking. The spacer keeps a
                    grouped bubble lined up under the one above it. */}
                {!mine && (
                  <div className="w-7 flex-shrink-0 self-end">
                    {!grouped && (
                      <UserAvatar
                        photoPath={profileOf(m.senderUid)?.photoPath}
                        fallback={(m.senderName || '?').charAt(0).toUpperCase()}
                        size={28}
                      />
                    )}
                  </div>
                )}

                <div
                  className={`relative min-w-0 max-w-[78%] rounded-2xl px-3 py-2 pr-7 shadow-sm transition ${
                    // The ring goes on the bubble, not the row: on a
                    // right-aligned message a ring around the full row would
                    // outline mostly empty column.
                    flashId === m.id ? 'ring-2 ring-amber-400' : ''
                  } ${
                    // Both bubbles are tinted away from the ground rather than
                    // one of them being white. White on a near-white ground is
                    // about a two percent step in lightness, which the eye
                    // reads as a shadow rather than as an object with an edge.
                    // The two are told apart by hue — neutral against blue —
                    // not by lightness, so neither side dominates the column.
                    mine
                      ? 'bg-brand-100 text-gray-900'
                      : 'bg-gray-200 text-gray-800'
                  } ${
                    // The tail only on the first of a run, with the matching
                    // corner squared off so the two read as one shape.
                    grouped
                      ? ''
                      : mine
                        ? 'bubble-tail bubble-tail-right rounded-tr-none'
                        : 'bubble-tail bubble-tail-left rounded-tl-none'
                  }`}
                >
                  {/* Who said it, inside the bubble — and only in a room. In a
                      direct thread the two sides of the column are the whole
                      answer, and a name on every bubble is noise. */}
                  {!grouped && !mine && conversation.kind !== 'direct' && (
                    <p className="mb-0.5 text-xs font-semibold text-brand-700">
                      {/* The name stored on the message, unless the sender is
                          someone we can name now — a profile renamed since
                          should read as the person you know today. */}
                      {nameOf(m.senderUid) !== 'Someone' ? nameOf(m.senderUid) : m.senderName}
                    </p>
                  )}

                  {m.replyTo && (
                    <QuotedBlock
                      quote={m.replyTo}
                      // Preferred over the stored copy whenever the original is
                      // still in the loaded window, so a quote of something
                      // since deleted stops showing the text, and an edit is
                      // reflected. A quote carried in from another conversation
                      // has no original here and keeps its copy.
                      live={
                        m.replyTo.fromConversationId
                          ? undefined
                          : messages.find((x) => x.id === m.replyTo?.messageId)
                      }
                      myUid={myUid}
                      onJump={m.replyTo.fromConversationId ? undefined : jumpTo}
                    />
                  )}

                  {editing ? (
                    <div className="py-0.5">
                      <textarea
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit(m); }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        rows={2}
                        className="w-full resize-y rounded-lg border border-brand-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <button
                          type="button" title="Cancel" onClick={() => setEditingId(null)}
                          className="rounded p-1 text-gray-400 transition hover:bg-black/5"
                        >
                          <X size={14} />
                        </button>
                        <button
                          type="button" title="Save" onClick={() => void saveEdit(m)}
                          className="rounded p-1 text-brand-600 transition hover:bg-black/5"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p
                        className={`whitespace-pre-wrap break-words text-sm ${
                          m.deletedAt ? 'italic text-gray-400' : ''
                        }`}
                      >
                        {m.deletedAt
                          ? 'Message deleted'
                          : (
                            <MessageText
                              message={m}
                              myUid={myUid}
                              nameOf={nameOf}
                              onOpenPerson={(uid, anchor) => setCard({ uid, anchor })}
                            />
                          )}
                      </p>

                      {/* The clock sits inside the bubble, under the text,
                          which is where a chat has trained everyone to look
                          for it — and it costs no vertical space of its own. */}
                      <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] leading-none text-gray-400">
                        {m.editedAt && !m.deletedAt && <span>edited</span>}
                        <span>{clock(m)}</span>
                      </p>

                      {/* One arrow on the bubble, opening a named menu. The row
                          of bare icons this replaced sat at the far right of
                          the thread — a long way from a two-word message. */}
                      {!m.deletedAt && (
                        <button
                          type="button"
                          title="Message options"
                          aria-label="Message options"
                          onClick={(e) =>
                            setActionsFor({
                              messageId: m.id,
                              anchor: e.currentTarget.getBoundingClientRect(),
                            })
                          }
                          className={`absolute right-1 top-1 rounded p-0.5 text-gray-400 transition hover:bg-black/5 hover:text-gray-700 focus-visible:opacity-100 ${
                            actionsFor?.messageId === m.id
                              ? 'opacity-100'
                              : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <ChevronDown size={14} />
                        </button>
                      )}

                      {actionsFor?.messageId === m.id && (
                        <MessageActions
                          anchor={actionsFor.anchor}
                          onClose={() => setActionsFor(null)}
                          actions={actionsOn(m, mine)}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3">
        {menuOpen && (
          <div className="absolute bottom-full left-4 right-4 mb-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
            {mentionMatches.map((c, i) => (
              <button
                key={c.uid}
                type="button"
                // onMouseDown, not onClick: a click would blur the composer
                // first, and the caret position the insert depends on is gone
                // by the time the handler runs.
                onMouseDown={(e) => { e.preventDefault(); applyMention(c); }}
                onMouseEnter={() => setMentionPick(i)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                  i === mentionPick ? 'bg-brand-50 text-brand-800' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <UserAvatar
                  photoPath={profileOf(c.uid)?.photoPath}
                  fallback={c.displayName.charAt(0).toUpperCase()}
                  size={24}
                />
                <span className="truncate font-medium">{c.displayName}</span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

        {replyingTo && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border-l-2 border-brand-400 bg-gray-50 py-1.5 pl-2.5 pr-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-brand-700">
                Replying to {replyingTo.senderUid === myUid ? 'yourself' : replyingTo.senderName}
                {replyingTo.fromConversationName && (
                  <span className="font-normal text-gray-500">
                    {' '}· from {replyingTo.fromConversationName}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-gray-500">
                {replyingTo.text || 'Message deleted'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              title="Don't reply to this"
              className="flex-shrink-0 rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={composer}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
              readMentionQuery(e.target.value, e.target.selectionStart ?? 0);
            }}
            onClick={(e) => readMentionQuery(draft, e.currentTarget.selectionStart ?? 0)}
            onBlur={() => setMentionQuery(null)}
            onKeyDown={(e) => {
              // While the name menu is open it owns the arrow keys and Enter —
              // otherwise picking a colleague would send the half-typed line.
              if (menuOpen) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionPick((p) => (p + 1) % mentionMatches.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionPick((p) => (p - 1 + mentionMatches.length) % mentionMatches.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  applyMention(mentionMatches[mentionPick]);
                  return;
                }
                if (e.key === 'Escape') { setMentionQuery(null); return; }
              }
              // Enter sends, Shift+Enter starts a new line — the convention
              // everyone already has in their fingers from every other chat.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder="Write a message…  @ to name someone"
            className="max-h-32 min-h-[38px] flex-1 resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!draft.trim() || sending}
            title="Send"
            className="flex-shrink-0 rounded-lg bg-brand-500 p-2.5 text-white transition hover:bg-brand-600 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {card && (
        <PersonCard uid={card.uid} anchor={card.anchor} onClose={() => setCard(null)} />
      )}
    </div>
  );
}

/**
 * The message being answered, shown above the reply.
 *
 * Two lines at most. A quote that runs as long as the reply stops being a
 * quote and turns the thread into everything said twice.
 */
function QuotedBlock({
  quote, live, myUid, onJump,
}: {
  quote: MessageQuote;
  /** The original as it stands now, when it is still in the loaded thread. */
  live?: ChatMessage;
  myUid: string;
  /** Absent for a quote from another conversation — there is nothing to jump to. */
  onJump?: (messageId: string) => void;
}) {
  const gone = live?.deletedAt != null;
  const body = gone ? 'Message deleted' : (live?.text || quote.text);
  const who  = quote.senderUid === myUid ? 'You' : quote.senderName;

  const inner = (
    <>
      <p className="text-[11px] font-semibold text-gray-500">
        {who}
        {quote.fromConversationName && (
          <span className="font-normal"> · in {quote.fromConversationName}</span>
        )}
      </p>
      <p className={`line-clamp-2 text-xs ${gone ? 'italic text-gray-400' : 'text-gray-500'}`}>
        {body}
      </p>
    </>
  );

  if (!onJump) {
    return (
      <div className="mb-1.5 rounded border-l-2 border-brand-400 bg-black/[0.04] py-1 pl-2 pr-2">
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onJump(quote.messageId)}
      title="Go to this message"
      className="mb-1.5 block w-full rounded border-l-2 border-brand-400 bg-black/[0.04] py-1 pl-2 pr-2 text-left transition hover:bg-black/[0.07]"
    >
      {inner}
    </button>
  );
}

/**
 * Message text with the names in it picked out.
 *
 * Only names the sender actually resolved to a colleague are highlighted —
 * writing "send it to @carrier" has not named anybody, and colouring it as
 * though it had would teach people to distrust the highlight. Your own name
 * gets the stronger treatment, because that is the one worth spotting from
 * across a scrolling room.
 */
function MessageText({
  message, myUid, nameOf, onOpenPerson,
}: {
  message: ChatMessage;
  myUid: string;
  nameOf: (uid: string) => string;
  onOpenPerson: (uid: string, anchor: DOMRect) => void;
}) {
  const named = (message.mentions ?? []).map((uid) => ({ uid, displayName: nameOf(uid) }));
  if (named.length === 0) return <>{message.text}</>;

  return (
    <>
      {splitOnMentions(message.text, named).map((run, i) =>
        run.mentionUid === null ? (
          <span key={i}>{run.text}</span>
        ) : (
          <button
            key={i}
            type="button"
            title={`About ${run.text.slice(1)}`}
            onClick={(e) => onOpenPerson(run.mentionUid!, e.currentTarget.getBoundingClientRect())}
            // A background only for your own name. A tinted pill behind every
            // mention fights the bubble it sits in — and on your own bubble,
            // which is already tinted, it disappears entirely. Colour and
            // weight are enough to mark somebody else's name.
            className={`rounded font-semibold transition hover:underline ${
              run.mentionUid === myUid
                ? 'bg-amber-200 px-1 text-amber-900 hover:bg-amber-300'
                : 'text-brand-700 hover:text-brand-800'
            }`}
          >
            {run.text}
          </button>
        ),
      )}
    </>
  );
}

/** The calendar day a message falls on, for grouping. '' before it stamps. */
function dayOf(m: ChatMessage): string {
  const ms = millis(m.createdAt);
  return ms ? new Date(ms).toDateString() : '';
}

/**
 * The separator between days. Today and yesterday are named rather than dated,
 * because working out that 08/28 was yesterday is a small tax on every read.
 * Everything older goes through the company date format like every other date
 * in TTMS.
 */
function dayLabel(m: ChatMessage, formatDate: (v: Date) => string): string {
  const ms = millis(m.createdAt);
  if (!ms) return 'Sending…';
  const day   = new Date(ms).toDateString();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (day === today)     return 'Today';
  if (day === yesterday) return 'Yesterday';
  return formatDate(new Date(ms));
}

/**
 * The time of day beside a name.
 *
 * Not run through dateFormat.ts: that setting decides how a *date* is written,
 * and has nothing to say about a clock. An unstamped message is one the server
 * has not acknowledged yet, which lasts a fraction of a second.
 */
function clock(m: ChatMessage): string {
  const ms = millis(m.createdAt);
  if (!ms) return 'Sending…';
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
