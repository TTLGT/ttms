'use client';

import { BadgeCheck } from 'lucide-react';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { SIGNATURE_METHOD_LABEL, time12, type SignatureRecord } from '@/types/signatureRecord';

/**
 * A signature recorded from a verified signed copy, as the load shows it.
 * See src/types/signatureRecord.ts.
 *
 * Says in its heading that it was recorded from a copy — never "signed
 * electronically", which is what TTMS's own link records — and says in its
 * footer who read it in and who checked it. The signing time is shown in the
 * zone the document printed, because that is what the paper says and the
 * thing a reader will compare it with.
 */
export default function SignatureRecordCard({ record, party }: { record: SignatureRecord; party: 'client' | 'carrier' }) {
  const { formatCalendarDate, formatDateTime } = useDateFormatters();
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-green-700">
        <BadgeCheck className="h-4 w-4" />
        {party === 'carrier' ? 'Carrier' : 'Client'} signature recorded from a signed copy
      </p>
      <p className="mt-1.5 text-base font-semibold text-gray-900">
        {record.signerName}
        {record.signerTitle && <span className="ml-1.5 text-sm font-normal text-gray-500">{record.signerTitle}</span>}
      </p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs text-gray-600">
        <dt className="text-gray-400">Signed</dt>
        <dd>{formatCalendarDate(record.date)} · {time12(record.time)} {record.zone}</dd>
        {record.signerIp && (<><dt className="text-gray-400">From IP</dt><dd className="font-mono">{record.signerIp}</dd></>)}
        <dt className="text-gray-400">How</dt>
        <dd>{SIGNATURE_METHOD_LABEL[record.method]}</dd>
        {record.reference && (<><dt className="text-gray-400">Reference</dt><dd className="truncate font-mono" title={record.reference}>{record.reference}</dd></>)}
      </dl>
      <p className="mt-2 border-t border-green-200 pt-2 text-[11px] text-gray-500">
        {record.source === 'pdf' ? 'Read from the PDF by TTMS' : record.source === 'pdf_edited' ? 'Read from the PDF, corrected' : 'Typed'} by {record.enteredByName}
        {' · '}verified by <strong className="text-gray-700">{record.approvedByName}</strong> · {formatDateTime(new Date(record.approvedAt))}
      </p>
    </div>
  );
}
