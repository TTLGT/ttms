'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileSignature, ScanText, ShieldCheck } from 'lucide-react';
import { listSignedDocuments } from '@/lib/orderPaperwork';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { useApprovals } from '@/context/ApprovalsContext';
import { detectedAnything, time12 } from '@/types/signatureRecord';
import type { SignedDocumentRow } from '@/types/signedDocument';
import SignedCopyReview, { ReviewPill } from './SignedCopyReview';
import RecordImportBadge from './RecordImportBadge';

/**
 * Signed copies uploaded to loads, waiting for admin or dispatch to verify
 * them — the Approvals screen's block for them. See src/types/signatureRecord.ts.
 *
 * Verifiers see every copy waiting (oldest first) and the ones decided in
 * the last fortnight, each with who decided it — the same arrangement as the
 * agreement requests above it, so one dispatcher can see another already did
 * it. Each row opens the review window right here, document and all; the load
 * is a link away for anything else. Anybody else sees the copies they
 * uploaded and where each stands.
 */
export default function SignedDocumentsSection() {
  const { formatDateTime, formatCalendarDate } = useDateFormatters();
  const { refresh: refreshBadges } = useApprovals();
  const [data, setData] = useState<{ rows: SignedDocumentRow[]; isVerifier: boolean } | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<SignedDocumentRow | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    listSignedDocuments().then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the signed copies'));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-red-600 mb-6">{error}</p>;
  if (!data || (!data.isVerifier && data.rows.length === 0)) return null;

  const waiting = data.rows.filter((r) => r.file.review === 'pending');

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
        <FileSignature className="w-4 h-4 text-brand-600" />
        {data.isVerifier ? `Signed copies to verify (${waiting.length})` : 'Signed copies you uploaded'}
      </h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        {data.isVerifier
          ? 'Signed SAs and Dispatch Sheets uploaded to loads — BATS imports, scans, emailed copies. Open one, check the document against the details read from it, and approve it to record the signature on the load.'
          : 'Where each signed copy you uploaded stands. It counts on the load once admin or dispatch has verified it.'}
      </p>
      {notice && <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>}

      {data.rows.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing waiting.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.rows.map((r) => {
            const s = r.file.signature;
            return (
              <li key={r.file.id}>
                <button type="button" onClick={() => setOpen(r)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded py-2.5 -mx-2 px-2 text-left hover:bg-gray-50">
                  <span className="font-mono text-sm font-semibold text-gray-900">{r.orderNumber}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.party === 'carrier' ? 'bg-orange-50 text-orange-700' : 'bg-purple-50 text-purple-700'}`}>
                    {r.party === 'carrier' ? 'Signed Dispatch Sheet' : 'Signed SA'}
                  </span>
                  {r.recordImport && <RecordImportBadge />}
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                    {s
                      ? <>Signed by <strong>{s.signerName}</strong> · {formatCalendarDate(s.date)} {time12(s.time)} {s.zone}</>
                      : r.partyName || r.file.name}
                    {!s && detectedAnything(r.file.detected) && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-emerald-700"><ScanText className="h-3 w-3" /> details read from the PDF</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    {r.file.review === 'pending'
                      ? `Uploaded by ${r.file.uploadedByName} · ${formatDateTime(new Date(r.file.createdAt))}`
                      : `${r.file.review === 'approved' ? 'Verified' : 'Refused'} by ${r.file.reviewedByName} · ${formatDateTime(new Date(r.file.reviewedAt))}`}
                  </span>
                  {r.file.review === 'pending' && data.isVerifier ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
                      <ShieldCheck className="h-3.5 w-3.5" /> Verify
                    </span>
                  ) : <ReviewPill file={r.file} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <SignedCopyReview
          file={open.file}
          ctx={{
            orderId: open.orderId, orderNumber: open.orderNumber, batsId: open.batsId, party: open.party,
            partyName: open.partyName, orderStatus: open.orderStatus, recordImport: open.recordImport,
            hasRecord: open.hasRecord, eSigned: open.eSigned,
            carrierId: open.carrierId, carrierName: open.carrierName, driverName: open.driverName,
          }}
          loadLink
          onClose={() => setOpen(null)}
          onSaved={(_file, note) => {
            setNotice(note ?? '');
            load();
            refreshBadges();
          }}
        />
      )}
    </section>
  );
}
