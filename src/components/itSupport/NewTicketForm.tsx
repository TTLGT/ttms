'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { createItTicket, deviceSummary, lastPage } from '@/lib/itTickets';
import {
  CATEGORY_LABEL,
  IT_TICKET_CATEGORIES,
  MAX_TICKET_TEXT,
  MAX_TICKET_TITLE,
  PRIORITY_QUESTION,
  type ItTicket,
  type ItTicketCategory,
  type ItTicketPriority,
} from '@/types/itTicket';
import { AttachButton, AttachmentTray, DropZone, useAttachmentDraft } from './AttachmentTray';
import { Bi } from '@/components/spanish/Es';

/** In the order people read them: least to most stuck. */
const PRIORITY_CHOICES: ItTicketPriority[] = ['low', 'normal', 'high', 'urgent'];

/**
 * "Report an issue". Asks the few things IT always needs — what, where, how
 * stuck — and works out the rest (browser, screen size) itself. The page they
 * were on is filled in from the sidebar's memory and can be changed.
 */
export default function NewTicketForm({ onCreated, onCancel }: {
  onCreated: (t: ItTicket) => void;
  onCancel?: () => void;
}) {
  const draft = useAttachmentDraft();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ItTicketCategory>('problem');
  const [priority, setPriority] = useState<ItTicketPriority>('normal');
  const [page, setPage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Read in an effect: sessionStorage does not exist during the server render.
  useEffect(() => { setPage(lastPage()); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('Give the problem a short title.'); return; }
    if (!text.trim())  { setError('Say what happened.'); return; }
    if (draft.busy)    { setError('Wait for the files to finish uploading.'); return; }
    setSaving(true);
    try {
      const ticket = await createItTicket({
        title: title.trim(),
        text: text.trim(),
        category,
        priority,
        page: page.trim(),
        device: deviceSummary(),
        attachments: draft.uploaded(),
      });
      draft.clear();
      onCreated(ticket);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none';

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900"><Bi>Report an issue</Bi></h2>
        <p className="mt-0.5 text-sm text-gray-500">
          <Bi>This goes to IT and nobody else. You will see the answer here and in your chat.</Bi>
        </p>
      </div>

      <label className="block">
        <span data-es className="mb-1 block text-sm font-medium text-gray-700">What is the problem?</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TICKET_TITLE}
          placeholder="For example: the BOL button does nothing"
          className={field}
          autoFocus
        />
      </label>

      <label className="block">
        <span data-es className="mb-1 block text-sm font-medium text-gray-700">What kind of problem is it?</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as ItTicketCategory)} className={field}>
          {IT_TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </label>

      <fieldset>
        <legend data-es className="mb-1 block text-sm font-medium text-gray-700">How much is it getting in your way?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PRIORITY_CHOICES.map((p) => (
            <label
              key={p}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                priority === p ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="priority"
                value={p}
                checked={priority === p}
                onChange={() => setPriority(p)}
                className="accent-brand-600"
              />
              {PRIORITY_QUESTION[p]}
            </label>
          ))}
        </div>
      </fieldset>

      <DropZone draft={draft}>
        <label className="block">
          <span data-es className="mb-1 block text-sm font-medium text-gray-700">What happened?</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={draft.onPaste}
            maxLength={MAX_TICKET_TEXT}
            rows={6}
            placeholder={'What were you trying to do, and what happened instead? Any error message helps.\n\nTip: press Print Screen, then Ctrl+V here to attach a screenshot.'}
            className={field}
          />
        </label>
      </DropZone>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <AttachButton draft={draft} label="Attach pictures or documents" />
          <span className="text-xs text-gray-500">Or paste a screenshot, or drop files on the box above. Up to 25 MB each.</span>
        </div>
        <AttachmentTray draft={draft} />
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Where in TTMS did it happen? <span className="font-normal text-gray-400">(optional)</span>
        </span>
        <input
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="The page you were on, if it was in TTMS"
          className={field}
        />
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button data-es
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving || draft.busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving || draft.busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {draft.busy ? 'Uploading…' : 'Send to IT'}
        </button>
      </div>
    </form>
  );
}
