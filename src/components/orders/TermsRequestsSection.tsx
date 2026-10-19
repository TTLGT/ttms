'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileSignature } from 'lucide-react';
import { decideTermsRequest, listTermsRequests } from '@/lib/agreementTerms';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { useApprovals } from '@/context/ApprovalsContext';
import { termsRequestSummary, type TermsChangeRequest } from '@/types/agreementTerms';

/**
 * Proposed changes to the agreement terms, on the Approvals screen. An admin
 * sees every one and decides them here; anybody else sees their own and how
 * they were answered. The route decides which — see /api/terms-requests.
 */
const STATUS: Record<TermsChangeRequest['status'], { label: string; style: string }> = {
  pending:   { label: 'Waiting',     style: 'bg-amber-50 text-amber-700' },
  approved:  { label: 'Approved',    style: 'bg-green-50 text-green-700' },
  denied:    { label: 'Turned down', style: 'bg-red-50 text-red-700' },
  withdrawn: { label: 'Withdrawn',   style: 'bg-gray-100 text-gray-600' },
};

/** Recent enough to still be news; older decisions are on the record, not here. */
const SHOW_DECIDED_DAYS = 30;

export default function TermsRequestsSection() {
  const { formatDateTime } = useDateFormatters();
  const { refresh: refreshBadges } = useApprovals();
  const [incoming, setIncoming] = useState<TermsChangeRequest[] | null>(null);
  const [outgoing, setOutgoing] = useState<TermsChangeRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([listTermsRequests('incoming', true), listTermsRequests('outgoing', true)])
      .then(([i, o]) => { setIncoming(i); setOutgoing(o); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the terms requests'));
  }, []);
  useEffect(load, [load]);

  async function decide(r: TermsChangeRequest, action: 'approve' | 'deny' | 'withdraw') {
    setBusy(r.id);
    setError('');
    try {
      await decideTermsRequest(r.id, action, notes[r.id] ?? '');
      load();
      refreshBadges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decide the request');
    } finally {
      setBusy('');
    }
  }

  if (!incoming || !outgoing) return error ? <p className="text-sm text-red-600 mb-6">{error}</p> : null;

  const cutoff = Date.now() - SHOW_DECIDED_DAYS * 24 * 60 * 60 * 1000;
  const recent = (r: TermsChangeRequest) => r.status === 'pending' || Date.parse(r.decidedAt ?? r.requestedAt ?? '') > cutoff;
  // An approver's own requests are in incoming already; the rest see theirs.
  const approver = incoming.length > 0;
  const rows = (approver ? incoming : outgoing).filter(recent);
  if (rows.length === 0) return null;
  const waiting = rows.filter((r) => r.status === 'pending').length;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
        <FileSignature className="w-4 h-4 text-brand-600" />
        Terms and conditions changes ({waiting})
      </h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        {approver
          ? 'Changes to the terms on the client SA and the carrier Dispatch Sheet, waiting for an admin. Nothing changes until one is approved.'
          : 'Your requests to change the terms, and how they were answered.'}
      </p>

      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.id} className="py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-gray-900">{termsRequestSummary(r)}</span>
              {r.orderId && (
                <Link href={`/dashboard/orders/${r.orderId}#terms`} className="text-xs font-semibold text-brand-700 hover:underline">
                  Open the load
                </Link>
              )}
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[r.status].style}`}>
                {STATUS[r.status].label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              Asked by {r.requestedByName}{r.requestedAt ? `, ${formatDateTime(r.requestedAt)}` : ''}
              {r.decidedByName && r.status !== 'pending' ? ` · ${STATUS[r.status].label.toLowerCase()} by ${r.decidedByName}${r.decidedAt ? `, ${formatDateTime(r.decidedAt)}` : ''}` : ''}
            </p>
            {r.reason && <p className="mt-1 text-sm text-gray-700">“{r.reason}”</p>}
            {r.decisionNote && r.status !== 'pending' && <p className="mt-1 text-xs text-gray-600">Note: {r.decisionNote}</p>}

            {r.status === 'pending' && (
              <>
                {r.currentText !== undefined && r.currentText !== r.baseText && (
                  <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    The terms have changed since this was asked. Approving replaces them with the wording below as a whole.
                  </p>
                )}
                <TermsCompare now={r.currentText ?? r.baseText} proposed={r.text} />
                {approver ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Note to the person who asked (optional)"
                      maxLength={500}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <button type="button" disabled={busy === r.id} onClick={() => void decide(r, 'approve')}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                      Approve
                    </button>
                    <button type="button" disabled={busy === r.id} onClick={() => void decide(r, 'deny')}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                      Turn down
                    </button>
                  </div>
                ) : (
                  <button type="button" disabled={busy === r.id} onClick={() => void decide(r, 'withdraw')}
                    className="mt-2 text-xs font-semibold text-gray-600 underline disabled:opacity-40">
                    Withdraw
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}

/**
 * The wording now beside the wording asked for. Lines the proposal adds are
 * green and lines it drops are red — by whole line, which is how terms are
 * written (one clause to a paragraph), and enough to find what moved.
 */
function TermsCompare({ now, proposed }: { now: string; proposed: string | null }) {
  if (proposed === null) {
    return <p className="mt-2 text-xs text-gray-600">Asks for this load to go back to the general terms.</p>;
  }
  const nowLines = new Set(now.split('\n'));
  const newLines = new Set(proposed.split('\n'));
  const col = (text: string, other: Set<string>, mark: string) => (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-sans text-xs text-gray-700">
      {text.split('\n').map((line, i) => (
        <span key={i} className={line.trim() && !other.has(line) ? mark : ''}>{line}{'\n'}</span>
      ))}
    </pre>
  );
  return (
    <details className="mt-2" open>
      <summary className="cursor-pointer text-xs font-semibold text-gray-600">Compare the wording</summary>
      <div className="mt-1 grid gap-2 md:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Now</p>
          {col(now, newLines, 'bg-red-50 text-red-800')}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Proposed</p>
          {col(proposed, nowLines, 'bg-green-50 text-green-800')}
        </div>
      </div>
    </details>
  );
}
