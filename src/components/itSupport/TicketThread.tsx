'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Clock, Download, FileText,
  Loader2, Lock, MessageSquare, RefreshCw, Send, StickyNote, XCircle,
} from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { getItTicket, replyToItTicket, updateItTicket } from '@/lib/itTickets';
import { formatFileSize } from '@/types/orderFile';
import {
  CATEGORY_LABEL,
  CATEGORY_SHORT,
  IT_STATUS_LABEL,
  IT_TICKET_CATEGORIES,
  IT_TICKET_PRIORITIES,
  IT_TICKET_STATUSES,
  MAX_TICKET_TEXT,
  PRIORITY_LABEL,
  isImageAttachment,
  ticketNumberLabel,
  type ItAttachment,
  type ItTicket,
  type ItTicketMessage,
  type ItTicketStatus,
} from '@/types/itTicket';
import { AttachButton, AttachmentTray, DropZone, useAttachmentDraft } from './AttachmentTray';
import { PriorityChip, StatusChip } from './TicketChips';
import { Bi } from '@/components/spanish/Es';

/**
 * One ticket: what was reported, the conversation, and a box to answer in.
 *
 * Shared by both sides. `desk` adds what only the IT account has — status,
 * priority and category, internal notes, and the reporter's device — and the
 * server already left internal notes out for anybody else, so nothing here
 * is hiding anything the browser was sent.
 */
export default function TicketThread({ ticketId, desk, onChanged, onBack }: {
  ticketId: string;
  desk: boolean;
  /** Anything about the ticket changed; the list should show the new state. */
  onChanged: (t: ItTicket) => void;
  /** Shown as a back arrow on narrow screens. */
  onBack?: () => void;
}) {
  const { formatDateTime } = useDateFormatters();
  const [ticket, setTicket] = useState<ItTicket | null>(null);
  const [messages, setMessages] = useState<ItTicketMessage[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await getItTicket(ticketId);
      setTicket(res.ticket);
      setMessages(res.messages);
      setError('');
      onChangedRef.current(res.ticket);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    setTicket(null);
    setMessages([]);
    void load();
  }, [load]);

  // Coming back to the tab is the moment an answer is most likely waiting.
  useEffect(() => {
    const onFocus = () => { void load(true); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const patch = async (p: Parameters<typeof updateItTicket>[1]) => {
    setBusy(true);
    try {
      await updateItTicket(ticketId, p);
      await load(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !ticket) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center">
        <Loader2 size={22} className="animate-spin text-gray-400" />
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="p-6">
        {onBack && <BackButton onBack={onBack} />}
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error || 'This ticket could not be opened.'}</p>
      </div>
    );
  }

  const closed = ticket.status === 'closed';
  const select = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-brand-500 focus:outline-none disabled:opacity-60';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 p-4">
        {onBack && <BackButton onBack={onBack} />}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-400">{ticketNumberLabel(ticket.number)}</p>
            <h2 className="text-lg font-bold leading-snug text-gray-900">{ticket.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusChip status={ticket.status} desk={desk} />
              {desk && <PriorityChip priority={ticket.priority} />}
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {CATEGORY_SHORT[ticket.category]}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {desk ? <>From <span className="font-medium text-gray-700">{ticket.reporterName}</span> ({ticket.reporterEmail}) · </> : null}
              Reported {formatDateTime(ticket.createdAt ? new Date(ticket.createdAt) : null)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            title="Check for new messages"
            aria-label="Refresh"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {desk && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              Status
              <select
                value={ticket.status}
                disabled={busy}
                onChange={(e) => void patch({ status: e.target.value as ItTicketStatus })}
                className={select}
              >
                {IT_TICKET_STATUSES.map((s) => <option key={s} value={s}>{IT_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              Priority
              <select
                value={ticket.priority}
                disabled={busy}
                onChange={(e) => void patch({ priority: e.target.value as ItTicket['priority'] })}
                className={select}
              >
                {IT_TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              Type
              <select
                value={ticket.category}
                disabled={busy}
                onChange={(e) => void patch({ category: e.target.value as ItTicket['category'] })}
                className={select}
              >
                {IT_TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_SHORT[c]}</option>)}
              </select>
            </label>
            {busy && <Loader2 size={15} className="animate-spin text-gray-400" />}
          </div>
        )}

        {desk && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              {showDetails ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Where and on what
            </button>
            {showDetails && (
              <dl className="mt-1.5 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 rounded-lg bg-gray-50 p-2.5 text-xs">
                <dt data-es className="text-gray-500">Type</dt>
                <dd className="text-gray-800">{CATEGORY_LABEL[ticket.category]}</dd>
                <dt data-es className="text-gray-500">Page</dt>
                <dd className="break-all text-gray-800">{ticket.page || '—'}</dd>
                <dt data-es className="text-gray-500">Device</dt>
                <dd className="break-all text-gray-800">{ticket.device || '—'}</dd>
              </dl>
            )}
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
        {messages.map((m) => (
          <MessageItem key={m.id} m={m} desk={desk} when={formatDateTime(m.createdAt ? new Date(m.createdAt) : null)} />
        ))}
        <div ref={bottom} />
      </div>

      {error && <p className="mx-4 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Answering */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3">
        {!desk && closed ? (
          <p className="text-center text-sm text-gray-500">
            <Bi>This ticket is closed. If something is still wrong, report a new issue.</Bi>
          </p>
        ) : (
          <Composer
            key={ticket.id}
            ticket={ticket}
            desk={desk}
            onSent={() => load(true)}
            onClose={() => patch({ status: 'closed' })}
            setError={setError}
          />
        )}
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button data-es
      type="button"
      onClick={onBack}
      className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800 lg:hidden"
    >
      <ArrowLeft size={15} /> All tickets
    </button>
  );
}

function MessageItem({ m, desk, when }: { m: ItTicketMessage; desk: boolean; when: string }) {
  if (m.kind === 'event') {
    return (
      <p className={`flex items-center justify-center gap-1.5 text-center text-xs ${m.internal ? 'text-amber-700' : 'text-gray-500'}`}>
        {m.internal ? <Lock size={11} /> : <Clock size={11} />}
        {m.text} · {when}
      </p>
    );
  }
  // Your own messages on the right, the other side's on the left — which side
  // is "yours" depends on who is reading.
  const mine = desk ? m.fromIt : !m.fromIt;
  const style = m.internal
    ? 'border-amber-200 bg-amber-50'
    : mine ? 'border-brand-200 bg-brand-50' : 'border-gray-200 bg-white';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-xl border px-3 py-2 ${style}`}>
        <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-gray-800">{m.fromIt ? 'IT support' : m.authorName}</span>
          <span className="text-gray-400">{when}</span>
          {m.internal && (
            <span data-es className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              <Lock size={10} /> Internal note — only IT sees this
            </span>
          )}
        </p>
        {m.text && <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{m.text}</p>}
        {m.attachments.length > 0 && <Attachments list={m.attachments} />}
      </div>
    </div>
  );
}

function Attachments({ list }: { list: ItAttachment[] }) {
  const images = list.filter(isImageAttachment);
  const files = list.filter((a) => !isImageAttachment(a));
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              title={`${a.name} — open full size`}
              className="block overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              {a.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not an optimisable asset
                <img src={a.url} alt={a.name} className="h-32 max-w-[240px] object-cover" />
              ) : (
                <span data-es className="flex h-32 w-32 items-center justify-center text-xs text-gray-400">Unavailable</span>
              )}
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm transition hover:bg-gray-50"
        >
          <FileText size={16} className="flex-shrink-0 text-gray-500" />
          <span className="min-w-0 flex-1 truncate text-gray-800">{a.name}</span>
          <span className="flex-shrink-0 text-xs text-gray-400">{formatFileSize(a.size)}</span>
          <Download size={14} className="flex-shrink-0 text-gray-400" />
        </a>
      ))}
    </div>
  );
}

function Composer({ ticket, desk, onSent, onClose, setError }: {
  ticket: ItTicket;
  desk: boolean;
  onSent: () => Promise<void>;
  onClose: () => Promise<void>;
  setError: (s: string) => void;
}) {
  const draft = useAttachmentDraft();
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async (status?: ItTicketStatus) => {
    if (!text.trim() && draft.uploaded().length === 0) return;
    if (draft.busy) { setError('Wait for the files to finish uploading.'); return; }
    setSending(true);
    setError('');
    try {
      await replyToItTicket(ticket.id, {
        text: text.trim(),
        attachments: draft.uploaded(),
        internal: desk && internal,
        status,
      });
      setText('');
      draft.clear();
      await onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const empty = !text.trim() && draft.uploaded().length === 0;
  const resolved = ticket.status === 'resolved';

  return (
    <DropZone draft={draft} className="space-y-2">
      {desk && (
        <div className="flex gap-1 text-sm">
          <button
            type="button"
            onClick={() => setInternal(false)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
              !internal ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <MessageSquare size={14} /> Reply to {ticket.reporterName.split(' ')[0] || 'reporter'}
          </button>
          <button
            type="button"
            onClick={() => setInternal(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
              internal ? 'bg-amber-50 text-amber-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <StickyNote size={14} /> Internal note
          </button>
        </div>
      )}
      {!desk && resolved && (
        <p className="text-xs text-gray-500"><Bi>IT marked this resolved. Still not right? Reply and it reopens.</Bi></p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={draft.onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); }
        }}
        maxLength={MAX_TICKET_TEXT}
        rows={3}
        placeholder={internal ? 'A note for IT only — the reporter never sees it' : 'Write a reply… (Ctrl+Enter sends; paste a screenshot to attach it)'}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none ${
          internal ? 'border-amber-300 bg-amber-50' : 'border-gray-300 bg-white'
        }`}
      />
      <AttachmentTray draft={draft} />
      <div className="flex flex-wrap items-center gap-2">
        <AttachButton draft={draft} label="Attach" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!desk && ticket.status !== 'closed' && (
            <button
              type="button"
              onClick={() => void onClose()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              title="Close this ticket because it is sorted"
            >
              <XCircle size={15} /> It is sorted, close it
            </button>
          )}
          {desk && !internal && (
            <>
              <button
                type="button"
                disabled={sending || empty || draft.busy}
                onClick={() => void send('waiting')}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                title="Send, and mark the ticket as waiting on the reporter"
              >
                Send and wait for answer
              </button>
              <button
                type="button"
                disabled={sending || empty || draft.busy}
                onClick={() => void send('resolved')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50"
              >
                <CheckCircle2 size={15} /> Send and resolve
              </button>
            </>
          )}
          <button
            type="button"
            disabled={sending || empty || draft.busy}
            onClick={() => void send()}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
              internal ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : internal ? <StickyNote size={15} /> : <Send size={15} />}
            {internal ? 'Save note' : 'Send'}
          </button>
        </div>
      </div>
    </DropZone>
  );
}
