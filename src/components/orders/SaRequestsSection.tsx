'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { listSaRequests } from '@/lib/saRequests';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { SA_STATUS_LABEL, type SaRequest } from '@/types/saRequest';

/**
 * The SA requests block on the Approvals screen.
 *
 * Admin and dispatch see every request still to do and the ones closed in the
 * last two weeks, each with who closed it — that is how one of them knows the
 * other already handled a load. Anybody else sees the requests they made.
 * The work itself happens on the order, so every row opens it.
 */
export default function SaRequestsSection() {
  const { formatDateTime } = useDateFormatters();
  const [data, setData] = useState<{ requests: SaRequest[]; isReviewer: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listSaRequests().then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load SA requests'));
  }, []);

  if (error) return <p className="text-sm text-red-600 mb-6">{error}</p>;
  if (!data || (!data.isReviewer && data.requests.length === 0)) return null;

  const todo = data.requests.filter((r) => r.status === 'open' || r.status === 'sent');
  const rest = data.requests.filter((r) => r.status !== 'open' && r.status !== 'sent');

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-brand-600" />
        {data.isReviewer ? `Shipper Agreements to send (${todo.length})` : 'Your Shipper Agreement requests'}
      </h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        {data.isReviewer
          ? 'Quotes the client accepted. Open one to review the order and the carrier, send the SA, and mark it done.'
          : 'Where each request you made stands.'}
      </p>

      {data.requests.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing waiting.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {[...todo, ...rest].map((r) => (
            <li key={r.orderId}>
              <Link href={`/dashboard/orders/${r.orderId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded">
                <span className="font-mono text-sm font-semibold text-gray-900">{r.orderNumber}</span>
                <span className="text-sm text-gray-700 min-w-0 flex-1 truncate">{r.clientName}</span>
                <span className="text-xs text-gray-500">
                  {r.status === 'done' && r.doneAt
                    ? `Done by ${r.doneByName} · ${formatDateTime(new Date(r.doneAt))}`
                    : r.status === 'returned'
                      ? `Sent back by ${r.returnedByName}`
                      : r.status === 'sent' && r.sentAt
                        ? `Sent by ${r.sentByName} · ${formatDateTime(new Date(r.sentAt))}`
                        : `Asked by ${r.requestedByName} · ${formatDateTime(new Date(r.requestedAt))}`}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  r.status === 'done' ? 'bg-green-50 text-green-700 border-green-200'
                  : r.status === 'returned' ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : r.status === 'sent' ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-brand-50 text-brand-700 border-brand-200'
                }`}>{SA_STATUS_LABEL[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
