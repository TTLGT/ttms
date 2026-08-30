'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  deleteMessage,
  editMessage,
  millis,
  sendThreadReply,
  toggleReaction,
  watchMessage,
  watchReplies,
} from '@/lib/chat';
import { dayLabel, dayOf, groupsWithPrevious } from '@/lib/chatFormat';
import PersonCard from './PersonCard';
import MessageActions, { type MessageAction } from './MessageActions';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import {
  type Attachment,
  type ChatMessage,
  type Conversation,
  type MentionCandidate,
} from '@/types/conversation';

/**
 * Why a thread would not load, in words somebody can act on.
 *
 * Reading a thread is the one query in chat that needs a composite index —
 * "the replies under this message, newest first" is an equality and an order on
 * two different fields, which Firestore will not serve without one. It is also
 * the first thing anybody will hit after this ships, on a database where no
 * such index exists yet, so it is worth naming rather than reporting as a
 * generic failure. Firestore puts a one-click link to create it in the browser
 * console, which is the fastest way through.
 */
function repliesError(err: Error): string {
  if (/index/i.test(err.message)) {
    return 'Threads need a Firestore index that has not been created yet. '
      + 'An admin can create it from the link in the browser console, or from '
      + 'the index list in docs/schema-guide.md.';
  }
  if (/permission/i.test(err.message)) {
    return 'Threads are not switched on yet — the security rules for them have '
      + 'not been published. An admin needs to run the rules deploy.';
  }
  return 'These replies could not be loaded.';
}

/**
 * One thread — a message, and everything said under it.
 *
 * It reads the message it hangs under from its own listener rather than being
 * handed the room's copy. The panel has to survive the room scrolling that
 * message out of its loaded window, and a message edited or taken back while
 * its thread is open has to say so at the top of the thread instead of going
 * on showing what it used to say.
 *
 * There is no thread inside a thread. A reply cannot be replied under, and
 * that is the rule that keeps this a thread rather than the root of a tree
 * nobody can read on a phone.
 */
export default function ThreadPanel({
  conversation,
  rootId,
  onClose,
}: {
  conversation: Conversation;
  rootId: string;
  onClose: () => void;
}) {
  const conversationId = conversation.id;
  const { user, profile } = useAuth();
  const { people, markThreadSeen } = useChat();
  const { formatDate } = useDateFormatters();

  const [root, setRoot]         = useState<ChatMessage | null>(null);
  const [replies, setReplies]   = useState<ChatMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [missing, setMissing]   = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [card, setCard]           = useState<{ uid: string; anchor: DOMRect } | null>(null);
  const [actionsFor, setActionsFor] =
    useState<{ messageId: string; anchor: DOMRect } | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const myUid    = user?.uid ?? '';

  const senderIdentity = {
    uid:         myUid,
    displayName: profile?.displayName || user?.displayName || user?.email || 'Someone',
  };

  /* --------------------------------------------------------------- loading */

  useEffect(() => {
    setRoot(null);
    setMissing(false);
    return watchMessage(
      conversationId,
      rootId,
      (m) => { setRoot(m); setMissing(m === null); },
      () => setError('That message could not be loaded.'),
    );
  }, [conversationId, rootId]);

  useEffect(() => {
    setLoading(true);
    setReplies([]);
    return watchReplies(
      conversationId,
      rootId,
      (rows) => { setReplies(rows); setLoading(false); },
      undefined,
      (err) => { setError(repliesError(err)); setLoading(false); },
    );
  }, [conversationId, rootId]);

  /**
   * Clearing the mark on this thread.
   *
   * Keyed on the newest reply rather than run once on open, because a reply
   * that lands while the panel is on screen has been read by definition — the
   * reader is looking straight at it. Without the second half, answering
   * somebody in real time would leave a mark behind for a conversation both
   * people just had.
   */
  const newestReplyAt = replies.length > 0 ? millis(replies[replies.length - 1].createdAt) : 0;
  useEffect(() => {
    markThreadSeen(rootId);
  }, [rootId, newestReplyAt, markThreadSeen]);

  // Follow the bottom. A thread is short and is nearly always read from the
  // end, so there is none of the window-and-restore machinery the room needs.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [replies, root]);

  /* -------------------------------------------------------------- mentions */

  /**
   * Who can be named in here — the room's membership, not the thread's.
   *
   * Everyone in the room can already read the thread, so limiting the @ menu
   * to the people who have replied would only stop somebody pulling in the one
   * colleague who could actually answer, which is the commonest reason to name
   * anybody in a thread at all.
   */
  const candidates: MentionCandidate[] = useMemo(() => {
    const pool = conversation.kind === 'company'
      ? people
      : people.filter((p) => conversation.memberUids.includes(p.uid));
    return pool
      .filter((p) => p.displayName)
      .map((p) => ({ uid: p.uid, displayName: p.displayName }));
  }, [people, conversation]);

  /* --------------------------------------------------------------- writing */

  async function handleSend(text: string, mentions: string[], attachments: Attachment[]) {
    if (!root) throw new Error('The message this thread belongs to is no longer there.');
    await sendThreadReply(conversationId, root, text, senderIdentity, mentions, attachments);
  }

  async function saveEdit(message: ChatMessage, isReply: boolean) {
    const text = editDraft.trim();
    if (!text) return;
    if (text === message.text) { setEditingId(null); return; }
    try {
      // Never the room's preview line: the root of a thread is only the last
      // message in the room by coincidence, and a reply never is at all.
      await editMessage(conversationId, message.id, text, { isLastMessage: false, isReply });
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That edit did not save.');
    }
  }

  /**
   * What the arrow offers inside a thread.
   *
   * Shorter than the room's menu on purpose. Quoting is what a thread replaces,
   * a private reply belongs to the room the message was said in, and a link to
   * one reply is a link to a place the reader would have to be told how to
   * find. Correcting and taking back your own words are the two that still
   * have to be here.
   */
  function actionsOn(m: ChatMessage, isReply: boolean): MessageAction[] {
    if (m.senderUid !== myUid) return [];
    return [
      {
        key: 'edit', label: 'Edit', Icon: Pencil,
        onSelect: () => { setEditingId(m.id); setEditDraft(m.text); },
      },
      {
        key: 'delete', label: 'Delete', Icon: Trash2, danger: true,
        onSelect: () => void deleteMessage(conversationId, m.id, {
          isLastMessage: false,
          isReply,
        }).catch(() => setError('That could not be deleted.')),
      },
    ];
  }

  /** One bubble, wired the same way whether it is the root or a reply. */
  function bubbleFor(m: ChatMessage, isReply: boolean, grouped: boolean) {
    return (
      <>
        <MessageBubble
          message={m}
          grouped={grouped}
          showSenderName={conversation.kind !== 'direct'}
          flashed={false}
          editing={editingId === m.id}
          editDraft={editDraft}
          onEditDraft={setEditDraft}
          onSaveEdit={() => void saveEdit(m, isReply)}
          onCancelEdit={() => setEditingId(null)}
          onOpenActions={(anchor) => setActionsFor({ messageId: m.id, anchor })}
          actionsOpen={actionsFor?.messageId === m.id}
          onToggleReaction={(key, add) =>
            void toggleReaction(
              conversationId,
              // `rootId` on a reply is what sends the reaction to the right
              // collection, and what sends a notification about it back here
              // rather than to a message in the room that does not exist.
              { id: m.id, senderUid: m.senderUid, text: m.text, rootId: isReply ? rootId : null },
              key,
              senderIdentity,
              add,
            ).catch(() => setError('That reaction did not save.'))
          }
          onOpenPerson={(uid, anchor) => setCard({ uid, anchor })}
        />

        {actionsFor?.messageId === m.id && (
          <MessageActions
            anchor={actionsFor.anchor}
            onClose={() => setActionsFor(null)}
            actions={actionsOn(m, isReply)}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">Thread</p>
          <p className="truncate text-xs text-gray-500">
            {/* Named so it is obvious the replies are not in the room. The
                commonest confusion a thread causes is somebody answering here
                and wondering why nobody in the room saw it. */}
            Only the people in it are told about replies
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close this thread"
          className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      </div>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-4 space-y-1.5"
      >
        {missing && (
          <p className="text-sm text-gray-400">
            The message this thread belonged to is no longer there.
          </p>
        )}

        {root && bubbleFor(root, false, false)}

        {/* A rule, not a pill: this one separates a message from its answers
            rather than marking a point in time, and the count is the thing
            worth reading in it. */}
        {root && (
          <div className="flex items-center gap-2 py-2">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {loading
                ? 'Loading replies…'
                : replies.length === 0
                  ? 'No replies yet'
                  : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
            </span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>
        )}

        {replies.map((m, i) => {
          const previous = replies[i - 1];
          const newDay   = !previous || dayOf(previous) !== dayOf(m);

          return (
            <div key={m.id}>
              {newDay && (
                <div className="flex justify-center py-2.5">
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 shadow-sm">
                    {dayLabel(m, formatDate)}
                  </span>
                </div>
              )}
              {bubbleFor(m, true, !newDay && groupsWithPrevious(m, previous))}
            </div>
          );
        })}
      </div>

      <MessageComposer
        conversationId={conversationId}
        candidates={candidates}
        // The thread, not the room: switching from one thread to another inside
        // the same room still has to clear the draft and take the caret with it.
        focusKey={`${conversationId}:${rootId}`}
        placeholder="Reply in this thread…"
        notice={error}
        onSend={handleSend}
      />

      {card && (
        <PersonCard uid={card.uid} anchor={card.anchor} onClose={() => setCard(null)} />
      )}
    </div>
  );
}
