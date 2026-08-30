'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { deleteMessage, millis, sendMessage, watchMessages } from '@/lib/chat';
import { UserAvatar } from '@/components/settings/UserAvatar';
import { MAX_MESSAGE_LENGTH, type ChatMessage } from '@/types/conversation';

/**
 * One conversation, live.
 *
 * The listener is opened here rather than in ChatContext because only one
 * thread is ever on screen: subscribing to every conversation's messages so
 * the provider could hold them all would mean reading — and paying for — every
 * message in the company on every page load.
 */
export default function MessageThread({ conversationId }: { conversationId: string }) {
  const { user, profile } = useAuth();
  const { nameOf, profileOf } = useChat();
  const { formatDate } = useDateFormatters();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [draft, setDraft]       = useState('');
  const [error, setError]       = useState('');
  const [sending, setSending]   = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

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

  // Pinned to the bottom, which is where a conversation is read from. Jumping
  // rather than smooth-scrolling on the first load: animating a year of
  // history past someone before they can read the newest line is worse than
  // simply starting at the end.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, conversationId]);

  // A new conversation should be typeable without a click to find the box.
  useEffect(() => { composer.current?.focus(); }, [conversationId]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setError('');
    // Cleared before the write, not after: the message is going to appear in
    // the thread from the listener anyway, and a box that stays full while the
    // network thinks about it invites the same thing being sent twice.
    setDraft('');
    try {
      await sendMessage(conversationId, text, {
        uid:         user.uid,
        displayName: profile?.displayName || user.displayName || user.email || 'Someone',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That message did not send.');
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-1">
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
            && previous?.senderUid === m.senderUid
            && millis(m.createdAt) - millis(previous.createdAt) < 5 * 60 * 1000;

          return (
            <div key={m.id}>
              {newDay && (
                <div className="flex items-center gap-3 py-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {dayLabel(m, formatDate)}
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
              )}

              <div className="group flex gap-3">
                <div className="w-9 flex-shrink-0">
                  {!grouped && (
                    <UserAvatar
                      photoPath={profileOf(m.senderUid)?.photoPath}
                      fallback={(m.senderName || '?').charAt(0).toUpperCase()}
                      size={36}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {/* The name stored on the message, unless the sender is
                            someone we can name now — a profile renamed since
                            should read as the person you know today. */}
                        {nameOf(m.senderUid) !== 'Someone' ? nameOf(m.senderUid) : m.senderName}
                      </span>
                      <span className="text-[11px] text-gray-400">{clock(m)}</span>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <p
                      className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-sm ${
                        m.deletedAt ? 'italic text-gray-400' : 'text-gray-700'
                      }`}
                    >
                      {m.deletedAt ? 'Message deleted' : m.text}
                    </p>

                    {/* Only your own, and only until you have deleted it. */}
                    {!m.deletedAt && m.senderUid === user?.uid && (
                      <button
                        type="button"
                        title="Delete this message"
                        onClick={() => void deleteMessage(conversationId, m.id).catch(() => {})}
                        className="flex-shrink-0 rounded p-1 text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3">
        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={composer}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            // Enter sends, Shift+Enter starts a new line — the convention
            // everyone already has in their fingers from every other chat.
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder="Write a message…"
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
    </div>
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
