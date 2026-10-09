'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, Mail, Send, ShieldCheck, Undo2, X,
} from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { fetchOrderReadiness } from '@/lib/orderPaperwork';
import {
  getSaRequest, markSaDone, requestSa, returnSaRequest, sendShipperAgreement, tickSaCheck, type SaReview,
} from '@/lib/saRequests';
import { trackActivity } from '@/lib/attendance';
import { usd } from '@/types/paymentMethod';
import { readinessOf, type ReadinessItem } from '@/types/orderReadiness';
import {
  SA_REVIEW_CHECKS, SA_STATUS_LABEL, outstandingChecks, type SaRequest,
} from '@/types/saRequest';
import { ReadinessLine } from './OrderReadinessCard';

/**
 * "Request SA" — the step after a quote is accepted.
 *
 * Replaces the button that used to read "→ Booked". The order still moves to
 * `booked`, but what the broker is doing is asking dispatch to check the load
 * and send the client the Shipper Agreement, so that is what it says. See
 * src/types/saRequest.ts.
 */
export function RequestSaButton({ orderId, onRequested }: { orderId: string; onRequested: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ReadinessItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setItems(null);
    fetchOrderReadiness(orderId).then(setItems).catch(() => setItems([]));
  }, [open, orderId]);

  const sa = items ? readinessOf(items, 'sa') : null;

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await requestSa(orderId, note);
      setOpen(false);
      setNote('');
      onRequested();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        title="The client accepted the quote: ask dispatch to check the load and send the Shipper Agreement"
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition">
        <Send className="w-4 h-4" /> Request SA
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl space-y-4 max-h-full overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Request the Shipper Agreement</h2>
                <p className="text-xs text-gray-500 mt-1">
                  For when the client has accepted the quote. Admin and dispatch are told in this load&apos;s discussion,
                  check the order and the carrier, and email the client the agreement to sign. The order moves to Booked.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!sa ? (
              <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking the order…</p>
            ) : sa.missing.length > 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-800 mb-1.5">The agreement cannot go out without:</p>
                <ul className="space-y-1">{sa.missing.map((i) => <ReadinessLine key={i.key} item={i} />)}</ul>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="w-4 h-4" /> Everything the Shipper Agreement prints is filled in.
              </p>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note for dispatch (optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000}
                placeholder="Anything they should know — the client wants it signed today, a second contact to copy…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={() => void submit()} disabled={busy || !sa || sa.missing.length > 0}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Sending…' : 'Request SA'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Where the request stands, on the order — and, for admin and dispatch, the
 * whole review: the facts TTMS can check, the items only a person can, the
 * send, and "mark done".
 *
 * Two reviewers may have it open at once. Each tick is saved as it is made
 * and names who made it, so the second person sees what the first already
 * did; the panel reloads after every action rather than trusting its own copy.
 */
export function SaRequestPanel({ orderId, refreshKey, onStatusChange }: {
  orderId: string;
  refreshKey?: unknown;
  /** The order's status moved because of something done here. */
  onStatusChange: (status: 'quote' | 'booked') => void;
}) {
  const { formatDateTime, formatDate } = useDateFormatters();
  const [data, setData] = useState<{ request: SaRequest | null; isReviewer: boolean; review: SaReview } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');

  function load() {
    getSaRequest(orderId).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the request'));
  }
  useEffect(load, [orderId, refreshKey]);

  if (!data?.request) return error ? <p className="text-xs text-red-600 mb-4">{error}</p> : null;
  const { request: r, isReviewer, review } = data;
  const hasCarrier = Boolean(review.carrier);
  const left = outstandingChecks(r.checks, hasCarrier);
  const working = isReviewer && (r.status === 'open' || r.status === 'sent');

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
      load();
    } finally {
      setBusy('');
    }
  }

  const tone = r.status === 'done' ? 'border-green-200' : r.status === 'returned' ? 'border-amber-200' : 'border-brand-200';

  return (
    <section className={`bg-white rounded-xl border-2 ${tone} p-5 mb-6 space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-600" /> Shipper Agreement request
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Asked by {r.requestedByName} · {formatDateTime(new Date(r.requestedAt))}
          </p>
          {r.note && <p className="text-sm text-gray-800 mt-1.5 whitespace-pre-wrap">&ldquo;{r.note}&rdquo;</p>}
        </div>
        <StatusPill request={r} />
      </div>

      {/* Outcome lines everybody sees */}
      {r.sentAt && (
        <p className="flex items-center gap-1.5 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <Mail className="w-3.5 h-3.5" /> SA emailed to <strong>{r.sentTo}</strong> by {r.sentByName} · {formatDateTime(new Date(r.sentAt))}
        </p>
      )}
      {r.status === 'done' && r.doneAt && (
        <p className="flex items-center gap-1.5 text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5" /> Approved and marked done by <strong>{r.doneByName}</strong> · {formatDateTime(new Date(r.doneAt))}
        </p>
      )}
      {r.status === 'returned' && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="font-semibold">Sent back by {r.returnedByName}{r.returnedAt ? ` · ${formatDateTime(new Date(r.returnedAt))}` : ''}</p>
          {r.returnReason && <p className="mt-0.5">{r.returnReason}</p>}
          <p className="mt-1 text-amber-800">Fix it, then use Request SA again.</p>
        </div>
      )}
      {!isReviewer && r.status === 'open' && (
        <p className="flex items-center gap-1.5 text-xs text-gray-600"><Clock className="w-3.5 h-3.5" />Waiting for admin or dispatch to review and send it.</p>
      )}

      {working && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Facts TTMS can check */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">What TTMS checked</p>
            <Facts review={review} formatDate={formatDate} />
            <div>
              <p className="text-[11px] font-semibold text-gray-600 mb-1">Shipper Agreement fields</p>
              <ul className="space-y-1">{readinessOf(review.readiness, 'sa').items.map((i) => <ReadinessLine key={i.key} item={i} />)}</ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-600 mb-1">BOL fields (can follow later)</p>
              <ul className="space-y-1">{readinessOf(review.readiness, 'bol').items.map((i) => <ReadinessLine key={i.key} item={i} />)}</ul>
            </div>
          </div>

          {/* What a person confirms */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
              Your double check <span className="font-normal text-gray-500 normal-case">— {SA_REVIEW_CHECKS.filter((c) => hasCarrier || !c.carrier).length - left.length} of {SA_REVIEW_CHECKS.filter((c) => hasCarrier || !c.carrier).length}</span>
            </p>
            <ul className="space-y-2">
              {SA_REVIEW_CHECKS.map((c) => {
                const mark = r.checks[c.key];
                const na = c.carrier && !hasCarrier;
                return (
                  <li key={c.key} className={na ? 'opacity-50' : ''}>
                    <label className={`flex items-start gap-2 text-xs ${na ? '' : 'cursor-pointer'}`}>
                      <input type="checkbox" className="mt-0.5 accent-brand-600" checked={Boolean(mark)}
                        disabled={na || busy !== ''}
                        onChange={(e) => void run(`check-${c.key}`, () => tickSaCheck(orderId, c.key, e.target.checked))} />
                      <span>
                        <span className="text-gray-900 font-medium">{c.label}</span>
                        <span className="block text-[11px] text-gray-500">
                          {na ? 'No carrier on the load yet — not needed to send the SA.' : c.detail}
                        </span>
                        {mark && <span className="block text-[11px] text-green-700">✓ {mark.byName} · {formatDateTime(new Date(mark.at))}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex flex-wrap gap-2 pt-1">
              {r.status === 'open' && (
                <button type="button" disabled={busy !== '' || left.length > 0 || !review.sendTo}
                  title={left.length ? 'Finish the double check first' : !review.sendTo ? 'The client has no email address' : ''}
                  onClick={() => void run('send', async () => {
                    if (!confirm(`Email the Shipper Agreement to ${review.sendTo?.email}?`)) return;
                    await sendShipperAgreement(orderId);
                    trackActivity('agreementsSent');
                  })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                  {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send SA{review.sendTo ? ` to ${review.sendTo.email}` : ''}
                </button>
              )}
              {r.status === 'sent' && (
                <button type="button" disabled={busy !== '' || left.length > 0}
                  onClick={() => void run('done', () => markSaDone(orderId))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                  {busy === 'done' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Mark done
                </button>
              )}
              {r.status === 'open' && !returning && (
                <button type="button" onClick={() => setReturning(true)} disabled={busy !== ''}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Undo2 className="w-4 h-4" /> Send back
                </button>
              )}
            </div>
            {left.length > 0 && r.status === 'open' && (
              <p className="text-[11px] text-gray-500">Sending unlocks when every applicable item is ticked.</p>
            )}

            {returning && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <label className="block text-xs font-medium text-amber-900">What does the broker need to fix?</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <div className="flex gap-2">
                  <button type="button" disabled={!reason.trim() || busy !== ''}
                    onClick={() => void run('return', async () => {
                      await returnSaRequest(orderId, reason.trim());
                      setReturning(false);
                      setReason('');
                      onStatusChange('quote');
                    })}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                    Send back to broker
                  </button>
                  <button type="button" onClick={() => setReturning(false)} className="text-xs text-gray-600 hover:text-gray-900">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StatusPill({ request }: { request: SaRequest }) {
  const cls = {
    open: 'bg-brand-50 text-brand-700 border-brand-200',
    sent: 'bg-blue-50 text-blue-700 border-blue-200',
    done: 'bg-green-50 text-green-700 border-green-200',
    returned: 'bg-amber-50 text-amber-800 border-amber-200',
  }[request.status];
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{SA_STATUS_LABEL[request.status]}</span>;
}

function Facts({ review, formatDate }: { review: SaReview; formatDate: (v: Date) => string }) {
  const c = review.carrier;
  const margin = review.agreedRate > 0 ? (review.brokerFee / review.agreedRate) * 100 : null;
  const insuranceOk = c?.insuranceExpiration
    ? c.insuranceExpiration >= (review.pickupDate ?? Date.now())
    : null;
  const fmcsaStale = c?.fmcsaCheckedAt ? Date.now() - c.fmcsaCheckedAt > 24 * 60 * 60 * 1000 : true;
  const bad = c?.fmcsaConcerns?.filter((x) => x.level === 'bad') ?? [];
  const warn = c?.fmcsaConcerns?.filter((x) => x.level === 'warn') ?? [];
  const phoneDiffers = c && c.fmcsaPhone && c.phone
    && c.fmcsaPhone.replace(/\D/g, '').slice(-10) !== c.phone.replace(/\D/g, '').slice(-10);

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex justify-between gap-3 text-xs"><span className="text-gray-500">{label}</span><span className="text-right text-gray-900">{children}</span></div>
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5">
      <Row label="SA goes to">{review.sendTo ? `${review.sendTo.name ? `${review.sendTo.name} · ` : ''}${review.sendTo.email}` : <span className="text-red-600">No email on the client</span>}</Row>
      <Row label="Agreed rate">{usd(review.agreedRate)}</Row>
      <Row label="Carrier pay / our fee">{usd(review.carrierPay)} / {usd(review.brokerFee)}{margin !== null && ` (${margin.toFixed(1)}%)`}</Row>
      <Row label="Client payment terms">{review.hasClientPayment ? 'Set' : <span className="text-amber-700">Not set</span>}</Row>
      {!c ? (
        <Row label="Carrier">Not assigned yet</Row>
      ) : (
        <>
          <Row label="Carrier">{c.name} · DOT {c.dot || '—'} · MC {c.mc || '—'}</Row>
          <Row label="Insurance certificate">
            {c.insuranceOnFile ? 'On file' : <span className="text-red-600">Not on file</span>}
            {c.insuranceExpiration && <span className={insuranceOk ? '' : 'text-red-600'}> · expires {formatDate(new Date(c.insuranceExpiration))}{insuranceOk === false && ' — before pickup'}</span>}
          </Row>
          <Row label="FMCSA check">
            {c.fmcsaCheckedAt ? formatDate(new Date(c.fmcsaCheckedAt)) : 'Never run'}
            {fmcsaStale && <span className="text-amber-700"> — run it again</span>}
          </Row>
          {phoneDiffers && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              The carrier&apos;s phone ({c.phone}) is not the one FMCSA lists ({c.fmcsaPhone}). Call FMCSA&apos;s number.
            </p>
          )}
          {[...bad, ...warn].map((x, i) => (
            <p key={i} className={`flex items-start gap-1.5 text-[11px] ${x.level === 'bad' ? 'text-red-700' : 'text-amber-800'}`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{x.text}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
