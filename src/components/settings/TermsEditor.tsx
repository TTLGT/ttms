'use client';

import { useEffect, useState } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import { decideTermsRequest, type TermsSaveResult } from '@/lib/agreementTerms';
import { useAuth } from '@/context/AuthContext';
import { useDateFormatters } from '@/lib/useDateFormatters';
import {
  MAX_TERMS_LENGTH, MAX_TERMS_REASON, validateTerms, type TermsChangeRequest, type TermsParty,
} from '@/types/agreementTerms';

/**
 * One set of terms in a box, with Save and Discard — shared by Settings and
 * the order. See src/types/agreementTerms.ts.
 *
 * A draft rather than save-on-type: legal wording is edited a clause at a
 * time, and saving every keystroke would send half a sentence to whoever
 * dispatch emailed in the meantime.
 *
 * Somebody who cannot approve is told, before they press it, that Save asks
 * an admin — and the button says so — because "Saved" on a change that has
 * not happened would have them telling a client the terms are new.
 */
export default function TermsEditor({
  party, saved, standard, canApprove, pending, onSave, onChanged, footer, extraActions, rows = 18,
}: {
  party: TermsParty;
  /** What is in force now. */
  saved: string;
  /** What "Start from the standard terms" puts in the box. */
  standard: string;
  canApprove: boolean;
  /** Requests waiting on an admin for this same set of terms. */
  pending: TermsChangeRequest[];
  onSave: (text: string, reason: string) => Promise<TermsSaveResult>;
  /** Called after anything that changes what the parent should re-read. */
  onChanged: () => void;
  /** The "last saved" line. */
  footer?: React.ReactNode;
  extraActions?: React.ReactNode;
  rows?: number;
}) {
  const { user } = useAuth();
  const { formatDateTime } = useDateFormatters();
  const [draft, setDraft] = useState(saved);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // A fresh read from the parent replaces the draft only when nothing is
  // being typed over it.
  useEffect(() => { setDraft(saved); }, [saved]);

  const dirty = draft !== saved;
  const checked = validateTerms(draft, party);
  const problem = dirty && 'error' in checked ? checked.error : '';

  async function save() {
    if (!dirty || problem) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await onSave(draft, reason);
      setReason('');
      setNotice(res.applied
        ? 'Saved. The next agreement sent will use these terms.'
        : 'Sent to an admin for approval. Nothing changes until it is approved.');
      if (!res.applied) setDraft(saved);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the terms');
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(id: string) {
    setError('');
    try {
      await decideTermsRequest(id, 'withdraw');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not withdraw the request');
    }
  }

  return (
    <div>
      {pending.map((r) => (
        <div key={r.id} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="flex items-center gap-1.5 font-medium">
            <Clock className="h-4 w-4" /> Waiting for an admin to approve a change
          </p>
          <p className="mt-0.5 text-xs">
            Asked by {r.requestedByName}{r.requestedAt ? `, ${formatDateTime(r.requestedAt)}` : ''}.
            {r.text === null ? ' Asks to go back to the general terms.' : ''}
            {r.reason ? ` “${r.reason}”` : ''}
          </p>
          {r.text !== null && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer">See the proposed wording</summary>
              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-sans text-gray-700">{r.text}</pre>
            </details>
          )}
          {r.requestedByUid === user?.uid && (
            <button type="button" onClick={() => void withdraw(r.id)} className="mt-1 text-xs font-semibold underline">
              Withdraw my request
            </button>
          )}
        </div>
      ))}

      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setNotice(''); }}
        rows={rows}
        spellCheck
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>{footer}</span>
        <span className={draft.length > MAX_TERMS_LENGTH ? 'text-red-600' : ''}>
          {draft.length.toLocaleString('en-US')} / {MAX_TERMS_LENGTH.toLocaleString('en-US')}
        </span>
      </div>

      {dirty && !canApprove && (
        <div className="mt-3">
          <label className="text-xs font-semibold text-gray-700" htmlFor={`reason-${party}`}>
            Why the change? <span className="font-normal text-gray-400">· optional, shown to the admin</span>
          </label>
          <input
            id={`reason-${party}`}
            value={reason}
            maxLength={MAX_TERMS_REASON}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || Boolean(problem) || saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : canApprove ? 'Save terms' : 'Ask an admin to approve'}
        </button>
        <button
          type="button"
          onClick={() => { setDraft(saved); setNotice(''); }}
          disabled={!dirty || saving}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Discard changes
        </button>
        {extraActions}
        {/* Puts the standard wording in the box; nothing is saved until Save. */}
        <button
          type="button"
          onClick={() => { setDraft(standard); setNotice(''); }}
          disabled={draft === standard || saving}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Start from the standard terms
        </button>
      </div>

      {!canApprove && (
        <p className="mt-2 text-xs text-gray-500">Changes you make here go to an admin to approve before they apply.</p>
      )}
      {problem && <p className="mt-3 text-sm text-red-600">{problem}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
    </div>
  );
}
