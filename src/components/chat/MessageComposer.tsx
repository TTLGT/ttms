'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { discardAttachment, readableSize, uploadAttachment } from '@/lib/chatUploads';
import { UserAvatar } from '@/components/settings/UserAvatar';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_LENGTH,
  findMentions,
  type Attachment,
  type MentionCandidate,
  type MessageQuote,
} from '@/types/conversation';

/**
 * The box you write in.
 *
 * Pulled out of MessageThread when threads arrived. A reply written in a thread
 * has to be able to do everything a message can — name a colleague with an @,
 * carry a photo of a BOL, take a pasted screenshot, be sent with Enter — and
 * the alternative was a second, quietly worse composer that would have drifted
 * from this one on the first change to either.
 *
 * It owns the draft, the files waiting to go with it, and the name menu.
 * Everything about *where* the message goes is the caller's business: `onSend`
 * is handed the finished parts and is expected to throw if the write fails, at
 * which point the draft and its files come back so nothing typed is lost.
 */

/** A file uploading, or uploaded and waiting for the message it belongs to. */
interface PendingFile {
  /** Local id — the storage path does not exist until the upload finishes. */
  id: string;
  name: string;
  size: number;
  percent: number;
  attachment: Attachment | null;
  error?: string;
  cancel: () => void;
}

export default function MessageComposer({
  conversationId,
  candidates,
  placeholder,
  focusKey,
  replyingTo,
  onCancelReply,
  notice,
  onSend,
}: {
  /** Where attachments are uploaded to. A thread shares its room's folder. */
  conversationId: string;
  /** Who can be named with an @ here. */
  candidates: MentionCandidate[];
  placeholder: string;
  /**
   * Changing this puts the cursor back in the box. It is the conversation, or
   * the thread — whatever switching would leave the caret in the wrong place.
   */
  focusKey: string;
  /** The message being answered, shown above the box. Rooms only. */
  replyingTo?: MessageQuote | null;
  onCancelReply?: () => void;
  /** Something the caller wants said here — a failed reaction, a copied link. */
  notice?: string;
  onSend: (text: string, mentions: string[], attachments: Attachment[]) => Promise<void>;
}) {
  const { user } = useAuth();
  const { profileOf } = useChat();
  const myUid = user?.uid ?? '';

  const [draft, setDraft]     = useState('');
  const [error, setError]     = useState('');
  const [sending, setSending] = useState(false);

  /** Files already uploaded and waiting to go with the next message. */
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);
  const composer   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { composer.current?.focus(); }, [focusKey]);

  /**
   * A draft belongs to where it was typed. Carrying it across would put half a
   * sentence meant for one room into another, or a reply meant for one thread
   * into the next one opened.
   *
   * Anything already uploaded goes with it. A file dropped here and then
   * abandoned by switching away is a file nothing points at and nothing in this
   * app can ever reach again, so it is cancelled and removed rather than
   * quietly left in the bucket.
   *
   * Deliberately not run on unmount, only on a real change of `focusKey`: a
   * send clears these files a moment before the component may be torn down,
   * and a cleanup that fired then would race to delete the very attachments the
   * message it just sent points at.
   */
  const filesRef = useRef(pendingFiles);
  filesRef.current = pendingFiles;
  const lastKey = useRef(focusKey);

  useEffect(() => {
    if (lastKey.current === focusKey) return;
    lastKey.current = focusKey;
    for (const f of filesRef.current) {
      f.cancel();
      if (f.attachment) void discardAttachment(f.attachment.path);
    }
    setDraft('');
    setError('');
    setPendingFiles([]);
  }, [focusKey]);

  /* ----------------------------------------------------------- attachments */

  /**
   * Starts uploading whatever was dropped, pasted or picked.
   *
   * Files go up as soon as they are chosen rather than when Send is pressed, so
   * that a 12 MB photo of a BOL is already in the bucket by the time the caption
   * is typed. The message itself carries only the finished records.
   */
  const attachFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setError('');

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name} is larger than 25 MB. Send it as a link instead.`);
        continue;
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const { promise, handle } = uploadAttachment(conversationId, file, (percent) => {
        setPendingFiles((was) => was.map((f) => (f.id === id ? { ...f, percent } : f)));
      });

      setPendingFiles((was) => [...was, {
        id, name: file.name, size: file.size, percent: 0, attachment: null,
        cancel: handle.cancel,
      }]);

      void promise
        .then((attachment) => {
          setPendingFiles((was) =>
            was.map((f) => (f.id === id ? { ...f, attachment, percent: 100 } : f)));
        })
        .catch((e: Error) => {
          setPendingFiles((was) =>
            was.map((f) => (f.id === id ? { ...f, error: e.message || 'Upload failed' } : f)));
        });
    }
  }, [conversationId]);

  /** Drops a file from the tray, and from the bucket if it already got there. */
  const removePending = useCallback((id: string) => {
    setPendingFiles((was) => {
      const going = was.find((f) => f.id === id);
      going?.cancel();
      // Nothing points at it yet, and nothing ever will — an abandoned upload
      // left behind is a file no screen in this app can reach.
      if (going?.attachment) void discardAttachment(going.attachment.path);
      return was.filter((f) => f.id !== id);
    });
  }, []);

  /* -------------------------------------------------------------- mentions */

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

  /* --------------------------------------------------------------- sending */

  async function handleSend() {
    const text  = draft.trim();
    const ready = pendingFiles.filter((f) => f.attachment).map((f) => f.attachment!);
    // A photo on its own is a message; an empty box with nothing on it is not.
    if ((!text && ready.length === 0) || !user || sending) return;
    // Still uploading. Sending now would drop the file the caption is about.
    if (pendingFiles.some((f) => !f.attachment && !f.error)) {
      setError('Wait for the upload to finish.');
      return;
    }
    setSending(true);
    setError('');
    // Cleared before the write, not after: the message is going to appear from
    // the listener anyway, and a box that stays full while the network thinks
    // about it invites the same thing being sent twice.
    const files = pendingFiles;
    setDraft('');
    setMentionQuery(null);
    setPendingFiles([]);
    try {
      await onSend(text, findMentions(text, candidates), ready);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That message did not send.');
      // Everything goes back with the text, or the retry loses the files it
      // was carrying.
      setDraft(text);
      setPendingFiles(files);
    } finally {
      setSending(false);
    }
  }

  const shown = notice || error;

  return (
    <div
      className="relative flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3"
      // Dropping anywhere over the composer counts. Aiming at a small target
      // while dragging a file is a nuisance nobody needs.
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => {
        // Only when the pointer has actually left the footer, not when it
        // crosses onto a child element inside it.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        attachFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-brand-400 bg-brand-50/90">
          <span className="text-sm font-medium text-brand-700">Drop to attach</span>
        </div>
      )}

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

      {shown && <p className="mb-2 break-all text-xs text-red-500">{shown}</p>}

      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pendingFiles.map((f) => (
            <div
              key={f.id}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${
                f.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <Paperclip size={12} className="flex-shrink-0 text-gray-400" />
              <span className="max-w-[10rem] truncate font-medium text-gray-700">{f.name}</span>
              <span className="text-[10px] text-gray-400">
                {f.error
                  ? f.error
                  : f.attachment
                    ? readableSize(f.size)
                    : `${f.percent}%`}
              </span>
              <button
                type="button"
                onClick={() => removePending(f.id)}
                title="Remove this file"
                className="rounded p-0.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

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
            onClick={onCancelReply}
            title="Don't reply to this"
            className="flex-shrink-0 rounded p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={filePicker}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            attachFiles(Array.from(e.target.files ?? []));
            // Cleared so choosing the same file twice in a row still fires.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => filePicker.current?.click()}
          title="Attach a photo or file"
          className="flex-shrink-0 rounded-lg p-2.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <Paperclip size={16} />
        </button>

        <textarea
          ref={composer}
          // A screenshot pasted straight in is how a rate sheet usually
          // arrives. Only when the clipboard actually holds files — pasting
          // text has to stay ordinary pasting.
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length === 0) return;
            e.preventDefault();
            attachFiles(files);
          }}
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
          placeholder={placeholder}
          className="max-h-32 min-h-[38px] flex-1 resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={(!draft.trim() && pendingFiles.length === 0) || sending}
          title="Send"
          className="flex-shrink-0 rounded-lg bg-brand-500 p-2.5 text-white transition hover:bg-brand-600 disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
