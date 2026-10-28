'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Mail, PenLine, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { deleteOrderFile, listOrderFiles, uploadOrderFile } from '@/lib/orderFiles';
import { sendSignedSaConfirmation } from '@/lib/orderPaperwork';
import { useDateFormatters } from '@/lib/useDateFormatters';
import type { DateLike } from '@/lib/dateFormat';
import { orderDisplayNumber, type Order } from '@/types/order';
import { SIGNED_AGREEMENT_KIND, SIGNED_SA_ACCEPT, formatFileSize, type OrderFile } from '@/types/orderFile';
import { RECORD_FIELD, SIGNATURE_METHOD_LABEL, asSignatureRecord, time12 } from '@/types/signatureRecord';
import SignedCopyReview, { ReviewPill, type SignedCopyContext } from './SignedCopyReview';
import SignatureRecordCard from './SignatureRecordCard';
import { AGREEMENT_BUTTON } from '@/types/saRequest';

/**
 * The Signed SA slot: the client's agreement signed some other way than the
 * e-signature link — on paper, by email, a photo of the page, or the BATS
 * e-signed PDF of a load imported from BATS — uploaded by staff. Drawn in
 * Client Confirmation and on the Documents tab, the same files in both.
 *
 * Stored as order files of kind `signed_sa` (src/types/orderFile.ts): the
 * same create-only bucket path and server registration as every other file,
 * kept out of "Other files" and shown only here.
 *
 * - **Upload** — PDFs and pictures, by anybody who can open the load, only
 *   while the client has not e-signed. Each copy arrives waiting for
 *   verification, and the review window opens straight away with whatever
 *   TTMS read off the PDF (src/types/signatureRecord.ts).
 * - **Verify** — admin and dispatch open the copy, check the details, and
 *   approve it. That records the signature on the load (the green card), and
 *   only a verified copy lets anything else happen:
 * - **Mark Client Signed** — the page's own advance, offered here because this
 *   is where the copy that allows it is.
 * - **Email the client** — that their acceptance is registered, with the
 *   verified files attached (admin and dispatch).
 *
 * `party="carrier"` is the same slot for the carrier's Dispatch Sheet
 * (`signed_ca` files), in the Carrier section and on the Documents tab, with
 * Mark Carrier Signed and the confirmation emailed to the carrier.
 */
export default function SignedSaUploads({
  order, orderId, eSigned, confirmation, canMarkSigned, onMarkSigned, onChange, onCount, onVerifiedCount, party = 'client',
}: {
  /** How many copies the slot holds, whenever that is known or changes — for a status column beside it. */
  onCount?: (count: number) => void;
  /** Of those, how many are verified — the same column says "Verified" rather than "waiting". */
  onVerifiedCount?: (count: number) => void;
  order: Order;
  orderId: string;
  party?: 'client' | 'carrier';
  /** The client signed on the link. */
  eSigned: boolean;
  confirmation: { at: DateLike; to: string; byName: string } | null;
  /** The load is waiting at Booked and could be moved to Client Signed by hand. */
  canMarkSigned: boolean;
  onMarkSigned?: () => void;
  /** Something was uploaded, removed, verified or emailed — the page refreshes what depends on it. */
  onChange?: () => void;
}) {
  const { user, can } = useAuth();
  const { formatDateTime, formatCalendarDate } = useDateFormatters();
  const [files, setFiles] = useState<OrderFile[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [sent, setSent] = useState<{ at: Date; to: string; byName: string } | null>(null);
  const [reviewing, setReviewing] = useState<OrderFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const carrier = party === 'carrier';
  const kind = SIGNED_AGREEMENT_KIND[party];
  const label = carrier ? 'Signed Dispatch Sheet' : 'Signed Shipper Agreement (SA)';
  const who = carrier ? 'carrier' : 'client';
  const verifier = can('orders.verifyRecords');
  const record = asSignatureRecord(order[RECORD_FIELD[party].record]);

  useEffect(() => {
    listOrderFiles(orderId)
      .then((all) => setFiles(all.filter((f) => f.kind === kind)))
      .catch((e) => setError(e instanceof Error ? e.message : `Could not load the ${label}`));
  }, [orderId, kind, label]);

  const ctx: SignedCopyContext = {
    orderId,
    orderNumber: orderDisplayNumber(order),
    batsId: order.batsId ?? null,
    party,
    partyName: (carrier ? order.carrierName : order.clientName) || '',
    orderStatus: order.status,
    recordImport: order.recordImport === true,
    hasRecord: Boolean(record),
    eSigned,
    carrierId: order.carrierId || null,
    carrierName: order.carrierName || '',
    driverName: order.driverName || '',
  };

  async function upload(list: FileList) {
    setError('');
    setNotice('');
    let last: OrderFile | null = null;
    for (const file of Array.from(list)) {
      if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
        setError(`${file.name} is not a PDF or a picture.`);
        continue;
      }
      try {
        setProgress(0);
        const saved = await uploadOrderFile(orderId, file, { kind, note: '' }, setProgress);
        setFiles((f) => [...(f ?? []), saved]);
        last = saved;
        onChange?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setProgress(null);
      }
    }
    // Straight into the review, with whatever was read off it: the details
    // are fresh in the uploader's mind now, and nowhere near it next week.
    if (last) setReviewing(last);
  }

  async function remove(file: OrderFile) {
    const backsRecord = record?.fileId === file.id;
    if (!confirm(backsRecord
      ? `Remove ${file.name}? The ${who} signature recorded from it is removed with it. This cannot be undone.`
      : `Remove ${file.name} from this load? It cannot be brought back.`)) return;
    setBusy(file.id);
    try {
      await deleteOrderFile(orderId, file.id);
      setFiles((f) => f?.filter((x) => x.id !== file.id) ?? f);
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove it');
    } finally {
      setBusy('');
    }
  }

  async function email() {
    if (!confirm(`Email the ${who} that we have registered their acceptance of the ${carrier ? 'rate confirmation' : 'load confirmation'}, with the verified ${label} attached?`)) return;
    setBusy('email');
    setError('');
    try {
      const r = await sendSignedSaConfirmation(orderId, party);
      setSent({ at: new Date(r.at), to: r.sentTo, byName: user?.displayName || 'you' });
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the confirmation');
    } finally {
      setBusy('');
    }
  }

  // Waiting or refused: whoever uploaded it, or somebody who sees every load
  // or verifies. Verified: only somebody who verifies (the route says so too).
  const mayRemove = (f: OrderFile) => !eSigned && (f.review === 'approved'
    ? verifier
    : f.uploadedByUid === user?.uid || can('orders.viewAll') || verifier);
  const count = files?.length;
  useEffect(() => { if (count !== undefined) onCount?.(count); }, [count, onCount]);
  const verifiedCount = files?.filter((f) => f.review === 'approved').length;
  useEffect(() => { if (verifiedCount !== undefined) onVerifiedCount?.(verifiedCount); }, [verifiedCount, onVerifiedCount]);

  const last = sent ?? confirmation;
  const hasFiles = Boolean(files && files.length > 0);
  const verified = (files ?? []).filter((f) => f.review === 'approved');
  const waiting = (files ?? []).filter((f) => f.review === 'pending');

  // E-signed with nothing uploaded: the signed PDF is offered elsewhere and
  // there is nothing for this slot to say.
  if (eSigned && !hasFiles && !record) return null;

  return (
    <div className="space-y-2">
      {record && <SignatureRecordCard record={record} party={party} />}

      {hasFiles && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {files!.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className={`h-4 w-4 shrink-0 ${f.review === 'approved' ? 'text-green-600' : f.review === 'rejected' ? 'text-red-400' : 'text-amber-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-brand-700 hover:underline">{f.name}</a>
                  <ReviewPill file={f} />
                </div>
                <p className="truncate text-[11px] text-gray-500">
                  {formatFileSize(f.size)} · uploaded by {f.uploadedByName} · {formatDateTime(new Date(f.createdAt))}
                  {f.review === 'approved' && f.reviewedByName && <> · verified by {f.reviewedByName}</>}
                </p>
                {f.review === 'rejected' && f.rejectReason && (
                  <p className="text-[11px] text-red-600">Refused by {f.reviewedByName}: {f.rejectReason}</p>
                )}
                {f.review === 'pending' && f.signature && (
                  <p className="truncate text-[11px] text-gray-600">
                    Signed by <strong>{f.signature.signerName}</strong> · {formatCalendarDate(f.signature.date)} {time12(f.signature.time)} {f.signature.zone}
                    {' · '}{SIGNATURE_METHOD_LABEL[f.signature.method]}
                  </p>
                )}
              </div>
              {f.review === 'pending' && verifier ? (
                <button type="button" onClick={() => setReviewing(f)}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verify
                </button>
              ) : (
                <button type="button" onClick={() => setReviewing(f)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  <PenLine className="h-3.5 w-3.5" /> {f.review === 'pending' && !f.signature ? 'Add details' : 'Details'}
                </button>
              )}
              {mayRemove(f) && (
                <button type="button" onClick={() => void remove(f)} disabled={busy === f.id} aria-label={`Remove ${f.name}`}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {waiting.length > 0 && !verifier && (
        <p className="text-[11px] text-amber-800">
          Admin and dispatch have been told. {waiting.length === 1 ? 'It counts' : 'They count'} on the load once one of them has checked {waiting.length === 1 ? 'it' : 'them'}.
        </p>
      )}

      {!eSigned && (
        <>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={progress !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {progress !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {progress !== null ? `Uploading… ${progress}%` : hasFiles ? 'Upload another page' : `Upload signed ${AGREEMENT_BUTTON[party]} (PDF or picture)`}
          </button>
          <input ref={inputRef} type="file" accept={SIGNED_SA_ACCEPT} multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
          {!hasFiles && files !== null && (
            <p className="text-[11px] text-gray-500">
              {order.recordImport
                ? `For a load from BATS: upload the ${who}’s signed copy from BATS. TTMS reads the signer and time off the PDF, and admin or dispatch verifies it.`
                : `For a ${who} who cannot sign on the link: upload what they signed — a scan, a PDF, or a photo of the page. Admin or dispatch verifies it.`}
            </p>
          )}
        </>
      )}

      {verified.length > 0 && !eSigned && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canMarkSigned && onMarkSigned && (
            <button type="button" onClick={onMarkSigned}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> {carrier ? 'Mark Carrier Signed' : 'Mark Client Signed'}
            </button>
          )}
          {can('orders.sendAgreement') && (
            <button type="button" onClick={() => void email()} disabled={busy !== ''}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy === 'email' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {last ? 'Email the confirmation again' : `Email the ${who} their confirmation`}
            </button>
          )}
        </div>
      )}

      {last && (
        <p className="text-xs text-blue-800">
          Acceptance confirmation emailed to <strong>{last.to}</strong> by {last.byName} · {formatDateTime(last.at)}
        </p>
      )}
      {verified.length > 0 && !eSigned && !last && !can('orders.sendAgreement') && (
        <p className="text-[11px] text-gray-500">Admin or dispatch can email the {who} a confirmation with this attached.</p>
      )}
      {notice && <p className="text-xs text-amber-700">{notice}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {reviewing && (
        <SignedCopyReview
          file={reviewing}
          ctx={ctx}
          onClose={() => setReviewing(null)}
          onSaved={(saved, note) => {
            setFiles((f) => f?.map((x) => (x.id === saved.id ? saved : x)) ?? f);
            if (note) setNotice(note);
            onChange?.();
          }}
        />
      )}
    </div>
  );
}
