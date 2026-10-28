'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  AlertTriangle, BadgeCheck, CheckCircle2, ExternalLink, FileSearch, Loader2, ScanText, ShieldAlert, X, XCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DateField from '@/components/DateField';
import { submitSignedCopy } from '@/lib/orderPaperwork';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { formatFileSize, type OrderFile } from '@/types/orderFile';
import {
  DETECTED_FORMAT_LABEL, MAX_REJECT_REASON, SIGNATURE_METHOD_LABEL, SIGNATURE_METHODS, SIGNATURE_ZONES,
  SIGNATURE_ZONE_LABEL, cleanSignatureDetails, detailsFromDetected, detectedAnything, orderNumberMatches,
  type SignatureDetails, type SignatureZone,
} from '@/types/signatureRecord';
import RecordImportBadge from './RecordImportBadge';
import SignedCopyCarrierStep from './SignedCopyCarrierStep';

/**
 * The one window a signed copy is looked at in — the document on the left,
 * its signature details on the right. See src/types/signatureRecord.ts.
 *
 * - For whoever uploaded it: check what TTMS read off the PDF (or type it from
 *   the page) and send it for verification.
 * - For admin and dispatch: the same, plus the confirmation that they opened
 *   the file and it is what it says, then Approve (which records the
 *   signature on the load) or Refuse with a reason.
 *
 * The file is shown here rather than linked, because opening it is the whole
 * of the check: an approval given without looking is the failure this exists
 * to prevent, and a link in another tab is one nobody has to click.
 *
 * Opened from the Signed SA / Signed Carrier Agreement slot on the load
 * (straight after an upload, and from each file) and from the Approvals queue.
 */

export interface SignedCopyContext {
  orderId: string;
  orderNumber: string;
  batsId: string | null;
  party: 'client' | 'carrier';
  partyName: string;
  orderStatus: string;
  recordImport: boolean;
  /** A signature is already recorded for this party — a further page needs no details. */
  hasRecord: boolean;
  eSigned: boolean;
  /** The carrier on the load — a Carrier Agreement is verified against one. */
  carrierId: string | null;
  carrierName: string;
  driverName: string;
}

const EMPTY: SignatureDetails = {
  signerName: '', signerTitle: '', date: '', time: '', zone: 'CST', signerIp: '', method: 'paper', reference: '',
};

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none';

export default function SignedCopyReview({
  file, ctx, onClose, onSaved, loadLink = false,
}: {
  file: OrderFile;
  ctx: SignedCopyContext;
  /** Offer a link to the load — when opened from somewhere other than the load. */
  loadLink?: boolean;
  onClose: () => void;
  /** The file as it now stands, after a save or a decision. */
  onSaved: (file: OrderFile, note?: string) => void;
}) {
  const { can, user } = useAuth();
  const { formatDateTime } = useDateFormatters();
  const verifier = can('orders.verifyRecords');
  const isPdf = file.contentType === 'application/pdf';
  const isImage = file.contentType.startsWith('image/');
  const who = ctx.party === 'carrier' ? 'carrier' : 'client';
  const docName = ctx.party === 'carrier' ? 'Signed Dispatch Sheet' : 'Signed SA';

  // What was read off the PDF, and the form starting from the saved details
  // if there are any, else from the reading.
  const read = useMemo(() => detailsFromDetected(file.detected), [file.detected]);
  const [form, setForm] = useState<SignatureDetails>(() => ({
    ...EMPTY,
    // A load imported from BATS was signed in BATS unless the page says otherwise.
    ...(ctx.recordImport ? { method: 'bats_esign' as const } : {}),
    ...read,
    ...(file.signature ?? {}),
  }));
  const set = <K extends keyof SignatureDetails>(k: K, v: SignatureDetails[K]) => setForm((f) => ({ ...f, [k]: v }));

  // A verifier who just uploaded the copy has it open in front of them, so
  // the "I opened this file" box starts ticked: approving their own upload is
  // one click. Anybody else's starts empty.
  const [confirmed, setConfirmed] = useState(verifier && file.review === 'pending' && file.uploadedByUid === user?.uid);
  // The load's carrier, which the carrier step can change while this is open.
  const [carrierLink, setCarrierLink] = useState({ id: ctx.carrierId, name: ctx.carrierName });
  const needsCarrier = ctx.party === 'carrier' && !carrierLink.id;
  const canAdvance = ctx.party === 'client'
    ? (ctx.orderStatus === 'booked' || ctx.orderStatus === 'carrier_assigned') && !ctx.eSigned
    : ctx.orderStatus === 'shipper_signed' && !ctx.eSigned;
  const [advance, setAdvance] = useState(true);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'approve' | 'reject'>('');
  const [error, setError] = useState('');

  const pending = file.review === 'pending';
  const decided = !pending;
  // A further page of an agreement already recorded may go through without
  // details; an empty form is then simply not sent.
  const formEmpty = !form.signerName && !form.date && !form.time;
  const detailsOptional = ctx.hasRecord && formEmpty;

  const numberCheck = orderNumberMatches(file.detected?.orderNumber ?? null, { batsId: ctx.batsId, orderNumber: ctx.orderNumber });
  const wrongParty = file.detected?.party && file.detected.party !== ctx.party;

  /** "from PDF" beside a field still holding what was read; "edited" once changed. */
  function tag(k: keyof SignatureDetails) {
    const was = read[k];
    if (!was) return null;
    return form[k] === was
      ? <span className="ml-1.5 rounded bg-emerald-50 px-1 py-px text-[10px] font-semibold text-emerald-700">from PDF</span>
      : <span className="ml-1.5 rounded bg-amber-50 px-1 py-px text-[10px] font-semibold text-amber-700">edited</span>;
  }

  async function run(action: 'save' | 'approve' | 'reject') {
    setError('');
    let details: SignatureDetails | undefined;
    if (action !== 'reject' && !(action === 'approve' && detailsOptional)) {
      const cleaned = cleanSignatureDetails(form);
      if ('error' in cleaned) { setError(cleaned.error); return; }
      details = cleaned.value;
    }
    if (action === 'reject' && !reason.trim()) { setError('Say why, so the uploader knows what to fix.'); return; }
    setBusy(action);
    try {
      const res = action === 'save'
        ? await submitSignedCopy(ctx.orderId, file.id, { action: 'save', details: details! })
        : action === 'approve'
          ? await submitSignedCopy(ctx.orderId, file.id, { action: 'approve', details, advance: canAdvance && advance })
          : await submitSignedCopy(ctx.orderId, file.id, { action: 'reject', reason: reason.trim() });
      onSaved(res.file, res.advanceError
        ? `Verified, but the load was not moved: ${res.advanceError}`
        : undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save it');
    } finally {
      setBusy('');
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`${docName} — ${ctx.orderNumber}`}
        className="flex h-full max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">
                {verifier && pending ? `Verify the ${docName.toLowerCase()}` : docName}
              </h2>
              {loadLink
                ? <Link href={`/dashboard/orders/${ctx.orderId}`} className="font-mono text-sm font-semibold text-brand-700 hover:underline">{ctx.orderNumber}</Link>
                : <span className="font-mono text-sm font-semibold text-gray-500">{ctx.orderNumber}</span>}
              {ctx.recordImport && <RecordImportBadge />}
              <ReviewPill file={file} />
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {ctx.partyName ? <>{ctx.party === 'carrier' ? 'Carrier' : 'Client'}: <strong className="text-gray-700">{ctx.partyName}</strong> · </> : null}
              {file.name} · {formatFileSize(file.size)} · uploaded by {file.uploadedByName} · {formatDateTime(new Date(file.createdAt))}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="Close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* The document */}
          <div className="flex min-h-[40vh] flex-1 flex-col border-b border-gray-200 bg-gray-100 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5"><FileSearch className="h-3.5 w-3.5" /> Check the signature block against the details on the right.</span>
              <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                Open in a new tab <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="min-h-0 flex-1 px-3 pb-3">
              {isPdf ? (
                <iframe src={`${file.url}#view=FitH`} title={file.name} className="h-full min-h-[40vh] w-full rounded-lg border border-gray-200 bg-white" />
              ) : isImage ? (
                <div className="flex h-full min-h-[40vh] items-start justify-center overflow-auto rounded-lg border border-gray-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived bucket URL; next/image would proxy it */}
                  <img src={file.url} alt={file.name} className="max-w-full" />
                </div>
              ) : (
                <p className="p-6 text-sm text-gray-500">This file cannot be shown here. Open it in a new tab.</p>
              )}
            </div>
          </div>

          {/* The details */}
          <div className="flex w-full flex-col lg:w-[400px] lg:flex-none">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {ctx.party === 'carrier' && !ctx.eSigned && (
                <SignedCopyCarrierStep orderId={ctx.orderId} file={file} carrier={carrierLink} driverName={ctx.driverName}
                  onLinked={(c) => { setCarrierLink(c); onSaved(file); }} />
              )}

              <ReadingBanner file={file} isPdf={isPdf} />

              {numberCheck === false && (
                <Warning tone="red">
                  This document is for order <strong>{file.detected?.orderNumber}</strong>, and this load is{' '}
                  <strong>{ctx.batsId || ctx.orderNumber}</strong>. Check it was uploaded to the right load.
                </Warning>
              )}
              {wrongParty && (
                <Warning tone="amber">
                  This looks like the {file.detected!.party === 'carrier' ? 'carrier’s agreement (a dispatch sheet)' : 'client’s shipper agreement'},
                  {' '}but it was uploaded as the {who}’s. Refuse it and upload it in the right slot.
                </Warning>
              )}
              {ctx.eSigned && (
                <Warning tone="blue">
                  The {who} already signed on TTMS’s link. That signature stays the one on record; this copy is filed beside it.
                </Warning>
              )}
              {file.review === 'rejected' && file.rejectReason && (
                <Warning tone="red">
                  Refused by {file.reviewedByName}: {file.rejectReason}
                </Warning>
              )}

              <fieldset disabled={file.review === 'approved' || (decided && !verifier)} className="space-y-3">
                <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Signature details{detailsOptional ? ' (optional — a signature is already recorded)' : ''}
                </legend>
                <Field label="Signed by" tag={tag('signerName')}>
                  <input value={form.signerName} onChange={(e) => set('signerName', e.target.value)}
                    placeholder="Name as it appears on the document" className={inputCls} />
                </Field>
                <Field label="Title" hint="optional">
                  <input value={form.signerTitle} onChange={(e) => set('signerTitle', e.target.value)}
                    placeholder="Owner, dispatcher…" className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Date signed" tag={tag('date')}>
                    <DateField value={form.date} onChange={(v) => set('date', v)} className={inputCls} ariaLabel="Date signed" />
                  </Field>
                  <Field label="Time" tag={tag('time')}>
                    <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <Field label="Time zone, as printed" tag={tag('zone')}>
                  <select value={form.zone} onChange={(e) => set('zone', e.target.value as SignatureZone)} className={inputCls}>
                    {(Object.keys(SIGNATURE_ZONES) as SignatureZone[]).map((z) => (
                      <option key={z} value={z}>{SIGNATURE_ZONE_LABEL[z]}</option>
                    ))}
                  </select>
                </Field>
                {file.detected?.signedAtText && (
                  <p className="-mt-1 text-[11px] text-gray-500">
                    The document says: <span className="font-mono text-gray-700">{file.detected.signedAtText}</span>
                  </p>
                )}
                <Field label="Signer's IP address" hint="if printed" tag={tag('signerIp')}>
                  <input value={form.signerIp} onChange={(e) => set('signerIp', e.target.value)}
                    placeholder="108.147.173.79" className={`${inputCls} font-mono`} />
                </Field>
                <Field label="How it was signed" tag={read.method && form.method === read.method ? tag('method') : null}>
                  <select value={form.method} onChange={(e) => set('method', e.target.value as SignatureDetails['method'])} className={inputCls}>
                    {SIGNATURE_METHODS.map((m) => <option key={m} value={m}>{SIGNATURE_METHOD_LABEL[m]}</option>)}
                  </select>
                </Field>
                <Field label="Reference" hint="checksum or envelope id, optional" tag={tag('reference')}>
                  <input value={form.reference} onChange={(e) => set('reference', e.target.value)}
                    className={`${inputCls} font-mono text-xs`} />
                </Field>
              </fieldset>

              {file.signature && (
                <p className="text-[11px] text-gray-500">
                  Details entered by {file.signature.enteredByName} · {formatDateTime(new Date(file.signature.enteredAt))}
                  {file.signature.source === 'pdf' ? ' · as read from the PDF' : file.signature.source === 'pdf_edited' ? ' · read from the PDF, then corrected' : ' · typed by hand'}
                </p>
              )}
              {file.review === 'approved' && file.reviewedByName && (
                <p className="flex items-center gap-1.5 text-xs text-green-700">
                  <BadgeCheck className="h-4 w-4" /> Verified by <strong>{file.reviewedByName}</strong> · {formatDateTime(new Date(file.reviewedAt))}
                </p>
              )}

              {verifier && file.review !== 'approved' && !refusing && (
                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <label className="flex items-start gap-2 text-sm text-gray-800">
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                    <span>I opened this file. It is the {who}’s signed agreement for this load, and the details above match it.</span>
                  </label>
                  {canAdvance && (
                    <label className="flex items-start gap-2 text-sm text-gray-800">
                      <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                      <span>Also move the load to <strong>{ctx.party === 'carrier' ? 'Carrier Signed' : 'Client Signed'}</strong></span>
                    </label>
                  )}
                </div>
              )}

              {refusing && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {file.review === 'approved' ? 'Why is the verification being taken back?' : 'Why is it being refused?'}
                  </label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, MAX_REJECT_REASON))} rows={2} autoFocus
                    placeholder="Not signed, wrong load, unreadable page…" className={inputCls} />
                </div>
              )}

              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
              {refusing ? (
                <>
                  <button type="button" onClick={() => { setRefusing(false); setReason(''); setError(''); }} disabled={Boolean(busy)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">Back</button>
                  <button type="button" onClick={() => void run('reject')} disabled={Boolean(busy)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                    {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    {file.review === 'approved' ? 'Take back verification' : 'Refuse'}
                  </button>
                </>
              ) : verifier && pending ? (
                <>
                  <button type="button" onClick={() => setRefusing(true)} disabled={Boolean(busy)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Refuse…</button>
                  <button type="button" onClick={() => void run('approve')} disabled={Boolean(busy) || !confirmed || needsCarrier}
                    title={needsCarrier ? 'Link the carrier to the load first (step 1 above)' : confirmed ? undefined : 'Tick the box once you have checked the file'}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve and record signature
                  </button>
                </>
              ) : pending ? (
                <>
                  <button type="button" onClick={onClose} disabled={Boolean(busy)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">Later</button>
                  <button type="button" onClick={() => void run('save')} disabled={Boolean(busy)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {file.signature ? 'Save details' : 'Send for verification'}
                  </button>
                </>
              ) : verifier ? (
                <>
                  {file.review === 'approved' && (
                    <button type="button" onClick={() => setRefusing(true)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Take back…</button>
                  )}
                  {file.review === 'rejected' && (
                    <button type="button" onClick={() => void run('approve')} disabled={Boolean(busy) || !confirmed || needsCarrier}
                      title={needsCarrier ? 'Link the carrier to the load first (step 1 above)' : confirmed ? undefined : 'Tick the box once you have checked the file'}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
                      {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve after all
                    </button>
                  )}
                  <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">Close</button>
                </>
              ) : (
                <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">Close</button>
              )}
            </div>
            {!verifier && pending && (
              <p className="border-t border-gray-100 bg-gray-50 px-5 pb-3 text-[11px] text-gray-500">
                Admin and dispatch have been told. It counts on the load once one of them has checked it.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, hint, tag, children }: { label: string; hint?: string; tag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center text-xs font-medium text-gray-700">
        {label}{hint && <span className="ml-1 font-normal text-gray-400">({hint})</span>}{tag}
      </span>
      {children}
    </label>
  );
}

function Warning({ tone, children }: { tone: 'red' | 'amber' | 'blue'; children: React.ReactNode }) {
  const cls = {
    red:   'border-red-200 bg-red-50 text-red-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue:  'border-blue-200 bg-blue-50 text-blue-800',
  }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`}>
      <AlertTriangle className="mt-px h-3.5 w-3.5 flex-none" />
      <p>{children}</p>
    </div>
  );
}

/** What TTMS managed to read, said before the form it filled. */
function ReadingBanner({ file, isPdf }: { file: OrderFile; isPdf: boolean }) {
  if (detectedAnything(file.detected)) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
        <ScanText className="mt-px h-4 w-4 flex-none" />
        <p>
          <strong>Read from the PDF</strong>
          {file.detected?.format ? <> — {DETECTED_FORMAT_LABEL[file.detected.format]}</> : null}.
          {' '}Check each line against the signature block on the document before saving.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
      <ShieldAlert className="mt-px h-4 w-4 flex-none text-gray-400" />
      <p>
        {isPdf
          ? 'No signature text was found on this PDF — it is probably a scan. Type the details from the page.'
          : 'This is a picture, so TTMS cannot read it. Type the details from the page.'}
      </p>
    </div>
  );
}

/** Where a signed copy stands, as one small pill. */
export function ReviewPill({ file }: { file: Pick<OrderFile, 'review'> }) {
  if (file.review === 'pending') {
    return <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Waiting for verification</span>;
  }
  if (file.review === 'rejected') {
    return <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Refused</span>;
  }
  if (file.review === 'approved') {
    return <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">Verified</span>;
  }
  return null;
}
