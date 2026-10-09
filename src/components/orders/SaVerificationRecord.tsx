'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, ClipboardCheck, Loader2, Mail, X } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { listSaRounds } from '@/lib/saRequests';
import { readinessOf } from '@/types/orderReadiness';
import { SA_REVIEW_CHECKS, SA_STATUS_LABEL, type SaRound } from '@/types/saRequest';
import { Facts } from './SaRequestPanel';
import { ReadinessLine } from './OrderReadinessCard';

/**
 * The load's verification record, opened from Client Confirmation: every
 * review round it has had, newest first — who asked, who ticked each item and
 * when, which version of the SA went to whom, who approved it — and what TTMS
 * showed the reviewer at the moment it was sent. See SaRound in
 * src/types/saRequest.ts.
 *
 * Read only when opened. Most visits to a load never look at it.
 */
export default function SaVerificationRecord({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [rounds, setRounds] = useState<SaRound[] | null>(null);
  const [error, setError] = useState('');

  function show() {
    setOpen(true);
    setRounds(null);
    setError('');
    listSaRounds(orderId).then(setRounds).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the record'));
  }

  return (
    <>
      <button type="button" onClick={show}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition">
        <ClipboardCheck className="w-3.5 h-3.5" /> Verification record
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl space-y-4 max-h-full overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Verification record</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Every review of this load&apos;s Shipper Agreement, newest first: who checked each item and when,
                  which version was sent to whom, who approved it, and what TTMS showed when it went out.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : rounds === null ? (
              <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</p>
            ) : rounds.length === 0 ? (
              <p className="text-sm text-gray-500">No review or SA has been recorded on this load yet.</p>
            ) : (
              <ol className="space-y-4">
                {rounds.map((r, i) => <Round key={r.id} round={r} latest={i === 0} />)}
              </ol>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Round({ round: r, latest }: { round: SaRound; latest: boolean }) {
  const { formatDateTime, formatDate } = useDateFormatters();
  const [factsOpen, setFactsOpen] = useState(false);
  const at = (v: number) => formatDateTime(new Date(v));

  const title = r.kind === 'direct' ? 'Sent without a review request'
    : r.reason === 'changed' ? 'Review after an order change'
    : 'Review requested';
  const state = r.kind === 'direct' ? 'Sent'
    : r.supersededAt && (r.status === 'open' || r.status === 'sent') ? 'Replaced before it was finished'
    : SA_STATUS_LABEL[r.status as keyof typeof SA_STATUS_LABEL];
  // Whether the carrier items applied: the load had a carrier when it went
  // out, or somebody ticked one of them.
  const hadCarrier = Boolean(r.dispatched?.carrier) || SA_REVIEW_CHECKS.some((c) => c.carrier && r.checks[c.key]);

  return (
    <li className={`rounded-lg border ${latest ? 'border-brand-200' : 'border-gray-200'} p-4 space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {title}{r.saVersion ? <span className="font-normal text-gray-500"> · SA version {r.saVersion}</span> : null}
          </p>
          <p className="text-xs text-gray-500">
            {r.kind === 'direct' ? 'By' : r.reason === 'changed' ? 'Opened by TTMS after a change by' : 'Asked by'} {r.requestedByName || 'Unknown'} · {at(r.requestedAt)}
          </p>
          {r.note && <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">{r.note}</p>}
        </div>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700">{state}</span>
      </div>

      {r.sends.length > 0 ? (
        <ul className="space-y-1">
          {r.sends.map((s, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-blue-800">
              <Mail className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                {s.kind === 'revision' ? 'Updated SA' : s.kind === 'resend' ? 'SA sent again' : 'SA'} (version {s.version}) emailed
                to <strong>{s.sentTo}</strong>{s.cc.length > 0 && <> (copied to {s.cc.join(', ')})</>} by {s.byName} · {at(s.at)}
              </span>
            </li>
          ))}
        </ul>
      ) : r.sentAt ? (
        // A round from before each send was listed: the one send it recorded.
        <p className="flex items-start gap-1.5 text-xs text-blue-800">
          <Mail className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>SA emailed to <strong>{r.sentTo}</strong>{r.sentCc.length > 0 && <> (copied to {r.sentCc.join(', ')})</>} by {r.sentByName} · {at(r.sentAt)}</span>
        </p>
      ) : (
        <p className="text-xs text-gray-500">No SA was sent from this round.</p>
      )}

      {r.doneAt && (
        <p className="text-xs text-green-800">Approved and marked done by <strong>{r.doneByName}</strong> · {at(r.doneAt)}</p>
      )}
      {r.returnedAt && (
        <p className="text-xs text-amber-800">
          Sent back to the broker by <strong>{r.returnedByName}</strong> · {at(r.returnedAt)}{r.returnReason && <>: {r.returnReason}</>}
        </p>
      )}
      {r.supersededAt && (
        <p className="text-xs text-gray-500">Replaced by a newer review · {at(r.supersededAt)}</p>
      )}

      {r.kind === 'review' && (
        <div>
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Double check</p>
          <ul className="space-y-1">
            {SA_REVIEW_CHECKS.map((c) => {
              const mark = r.checks[c.key];
              const na = c.carrier && !hadCarrier;
              return (
                <li key={c.key} className={`flex flex-wrap justify-between gap-x-3 text-xs ${na ? 'opacity-50' : ''}`}>
                  <span className="text-gray-900">{mark ? '✓' : '○'} {c.label}</span>
                  <span className={mark ? 'text-green-700' : 'text-gray-500'}>
                    {mark ? `${mark.byName} · ${at(mark.at)}` : na ? 'Not needed — no carrier yet' : 'Not ticked'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {r.dispatched ? (
        <div>
          <button type="button" onClick={() => setFactsOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800">
            {factsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            What TTMS showed when it was sent
          </button>
          {factsOpen && (
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              <Facts review={r.dispatched} formatDate={formatDate} asOf={r.sentAt ?? undefined} />
              <div>
                <p className="text-[11px] font-semibold text-gray-600 mb-1">Shipper Agreement fields</p>
                <ul className="space-y-1">{readinessOf(r.dispatched.readiness, 'sa').items.map((i) => <ReadinessLine key={i.key} item={i} />)}</ul>
              </div>
            </div>
          )}
        </div>
      ) : r.sentAt ? (
        <p className="text-[11px] text-gray-400">Sent before TTMS kept a copy of the facts at the time of sending.</p>
      ) : null}
    </li>
  );
}
