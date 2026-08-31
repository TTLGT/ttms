'use client';

import { Check, ChevronDown, MessagesSquare, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { clock } from '@/lib/chatFormat';
import { formatMessage } from '@/lib/messageFormat';
import { UserAvatar } from '@/components/settings/UserAvatar';
import MessageAttachments from './MessageAttachments';
import OrderCards from './OrderCards';
import ReactionBar from './ReactionBar';
import {
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
  type MessageQuote,
} from '@/types/conversation';

/**
 * One message, drawn.
 *
 * Pulled out of MessageThread when threads arrived, because a reply is the same
 * object said in a narrower place: it is edited, deleted, quoted and reacted to
 * exactly like a message, and two copies of two hundred lines of bubble would
 * have started disagreeing about one of those within a week.
 *
 * It knows nothing about where its message came from. Everything that differs
 * between a room and a thread — whether a name is shown, what the arrow menu
 * offers, whether there is a thread to open underneath — arrives as a prop.
 */
export default function MessageBubble({
  message,
  grouped,
  showSenderName,
  flashed,
  editing,
  editDraft,
  onEditDraft,
  onSaveEdit,
  onCancelEdit,
  onOpenActions,
  actionsOpen,
  onToggleReaction,
  onOpenPerson,
  quoteLive,
  onJumpToQuoted,
  thread,
}: {
  message: ChatMessage;
  /** Drawn as a continuation of the message above: no avatar, no name, no tail. */
  grouped: boolean;
  /** Rooms show who is speaking; a direct thread's two columns already say it. */
  showSenderName: boolean;
  /** Briefly ringed after being jumped to, so the eye finds it. */
  flashed: boolean;
  editing: boolean;
  editDraft: string;
  onEditDraft: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onOpenActions: (anchor: DOMRect) => void;
  actionsOpen: boolean;
  onToggleReaction: (key: string, add: boolean) => void;
  onOpenPerson: (uid: string, anchor: DOMRect) => void;
  /** The quoted original as it stands now, when it is still on screen. */
  quoteLive?: ChatMessage;
  onJumpToQuoted?: (messageId: string) => void;
  /**
   * The thread under this message. Absent inside a thread — a reply cannot
   * itself be replied under, which is the one rule that keeps a thread a
   * thread rather than the start of a tree nobody can read.
   */
  thread?: { unread: boolean; onOpen: () => void };
}) {
  const { user } = useAuth();
  const { nameOf, profileOf } = useChat();
  const myUid = user?.uid ?? '';
  const mine  = message.senderUid === myUid;

  return (
    <div className={`group flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>
      {/* The avatar belongs to the other person only, and only on the first
          bubble of a run. Yours is redundant — the side of the column already
          says who is speaking. The spacer keeps a grouped bubble lined up
          under the one above it. */}
      {!mine && (
        <div className="w-7 flex-shrink-0 self-end">
          {!grouped && (
            <UserAvatar
              photoPath={profileOf(message.senderUid)?.photoPath}
              fallback={(message.senderName || '?').charAt(0).toUpperCase()}
              size={28}
            />
          )}
        </div>
      )}

      <div
        className={`relative min-w-0 max-w-[78%] rounded-2xl px-3 py-2 pr-7 shadow-sm transition ${
          // The ring goes on the bubble, not the row: on a right-aligned
          // message a ring around the full row would outline mostly empty
          // column.
          flashed ? 'ring-2 ring-amber-400' : ''
        } ${
          // Both bubbles are tinted away from the ground rather than one of
          // them being white. White on a near-white ground is about a two
          // percent step in lightness, which the eye reads as a shadow rather
          // than as an object with an edge. The two are told apart by hue —
          // neutral against blue — not by lightness, so neither side dominates
          // the column.
          mine ? 'bg-brand-100 text-gray-900' : 'bg-gray-200 text-gray-800'
        } ${
          // The tail only on the first of a run, with the matching corner
          // squared off so the two read as one shape.
          grouped
            ? ''
            : mine
              ? 'bubble-tail bubble-tail-right rounded-tr-none'
              : 'bubble-tail bubble-tail-left rounded-tl-none'
        }`}
      >
        {!grouped && !mine && showSenderName && (
          <p className="mb-0.5 text-xs font-semibold text-brand-700">
            {/* The name stored on the message, unless the sender is someone we
                can name now — a profile renamed since should read as the
                person you know today. */}
            {nameOf(message.senderUid) !== 'Someone' ? nameOf(message.senderUid) : message.senderName}
          </p>
        )}

        {message.replyTo && (
          <QuotedBlock
            quote={message.replyTo}
            live={quoteLive}
            myUid={myUid}
            onJump={onJumpToQuoted}
          />
        )}

        {editing ? (
          <div className="py-0.5">
            <textarea
              autoFocus
              value={editDraft}
              onChange={(e) => onEditDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit(); }
                if (e.key === 'Escape') onCancelEdit();
              }}
              rows={2}
              className="w-full resize-y rounded-lg border border-brand-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <div className="mt-1 flex items-center justify-end gap-1">
              <button
                type="button" title="Cancel" onClick={onCancelEdit}
                className="rounded p-1 text-gray-400 transition hover:bg-black/5"
              >
                <X size={14} />
              </button>
              <button
                type="button" title="Save" onClick={onSaveEdit}
                className="rounded p-1 text-brand-600 transition hover:bg-black/5"
              >
                <Check size={14} />
              </button>
            </div>
          </div>
        ) : (
          <>
            {!message.deletedAt && message.attachments && message.attachments.length > 0 && (
              <MessageAttachments attachments={message.attachments} />
            )}

            {(message.text || message.deletedAt) && (
              <p
                className={`whitespace-pre-wrap break-words text-sm ${
                  message.deletedAt ? 'italic text-gray-400' : ''
                }`}
              >
                {message.deletedAt
                  ? 'Message deleted'
                  : (
                    <MessageText
                      message={message}
                      myUid={myUid}
                      nameOf={nameOf}
                      onOpenPerson={onOpenPerson}
                    />
                  )}
              </p>
            )}

            {/* The loads this message names, if the reader is allowed to see
                them. Under the text rather than replacing the number in it:
                what somebody typed stays exactly as they typed it, and the
                card is TTMS answering the question the number asks. */}
            {!message.deletedAt && message.text && <OrderCards text={message.text} />}

            {/* The clock sits inside the bubble, under the text, which is where
                a chat has trained everyone to look for it — and it costs no
                vertical space of its own. */}
            <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] leading-none text-gray-400">
              {message.editedAt && !message.deletedAt && <span>edited</span>}
              <span>{clock(message)}</span>
            </p>

            {!message.deletedAt && (
              <ReactionBar
                reactions={message.reactions}
                myUid={myUid}
                onToggle={onToggleReaction}
              />
            )}

            {/* A message whose thread has been answered keeps its way in even
                after the message itself was taken back: the replies under it
                are other people's, and they are still there to read. */}
            {thread && (message.replyCount ?? 0) > 0 && (
              <ThreadLine message={message} unread={thread.unread} onOpen={thread.onOpen} />
            )}

            {/* One arrow on the bubble, opening a named menu. The row of bare
                icons this replaced sat at the far right of the thread — a long
                way from a two-word message. */}
            {!message.deletedAt && (
              <button
                type="button"
                title="Message options"
                aria-label="Message options"
                onClick={(e) => onOpenActions(e.currentTarget.getBoundingClientRect())}
                className={`absolute right-1 top-1 rounded p-0.5 text-gray-400 transition hover:bg-black/5 hover:text-gray-700 focus-visible:opacity-100 ${
                  actionsOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <ChevronDown size={14} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The way into a thread, under the message it hangs off.
 *
 * Deliberately part of the bubble rather than a row of its own: the count
 * belongs to that message, and a line floating under the column would have to
 * say which message it meant. The faces are there because a thread is worth
 * opening mainly on the strength of who is already in it.
 */
function ThreadLine({
  message, unread, onOpen,
}: {
  message: ChatMessage;
  unread: boolean;
  onOpen: () => void;
}) {
  const { nameOf, profileOf } = useChat();
  const count = message.replyCount ?? 0;
  // Three faces at most. Past that the row is wider than the reply count it is
  // meant to annotate, and the faces stop being individually readable anyway.
  const faces = (message.replyUids ?? []).slice(0, 3);

  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open this thread"
      className={`mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-xs font-semibold transition ${
        unread
          ? 'bg-brand-500/10 text-brand-800 hover:bg-brand-500/20'
          : 'text-brand-700 hover:bg-black/[0.05]'
      }`}
    >
      {faces.length > 0 ? (
        <span className="flex flex-shrink-0 -space-x-1.5">
          {faces.map((uid) => (
            <UserAvatar
              key={uid}
              photoPath={profileOf(uid)?.photoPath}
              fallback={nameOf(uid).charAt(0).toUpperCase()}
              size={18}
            />
          ))}
        </span>
      ) : (
        <MessagesSquare size={13} className="flex-shrink-0" />
      )}

      <span className="truncate">
        {count} {count === 1 ? 'reply' : 'replies'}
      </span>

      {/* A dot, not a count. How many of the replies are new would be a second
          aggregation against every message in the room, for a number nobody
          acts on differently from "there is something in here you have not
          read". */}
      {unread && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />}
    </button>
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

  return (
    <>
      {formatMessage(message.text, named).map((run, i) => {
        if (run.mentionUid) {
          return (
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
          );
        }

        if (run.href) {
          return (
            <a
              key={i}
              href={run.href}
              target="_blank"
              // noreferrer as well as noopener: these are addresses somebody
              // pasted into a chat, and none of them need to be told where the
              // click came from.
              rel="noopener noreferrer"
              className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              {run.text}
            </a>
          );
        }

        if (run.mark === 'code') {
          return (
            <code key={i} className="rounded bg-black/[0.07] px-1 font-mono text-[0.85em]">
              {run.text}
            </code>
          );
        }

        return (
          <span
            key={i}
            className={
              run.mark === 'bold'   ? 'font-semibold'
              : run.mark === 'italic' ? 'italic'
              : run.mark === 'strike' ? 'line-through opacity-70'
              : undefined
            }
          >
            {run.text}
          </span>
        );
      })}
    </>
  );
}
