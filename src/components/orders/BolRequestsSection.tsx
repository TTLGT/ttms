'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { listBolRequests } from '@/lib/bolRequestsClient';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { BOL_STATUS_LABEL, type BolRequest } from '@/types/bolRequest';

/**
 * BOLs to send, on the Approvals screen — admin and dispatch only. The route
 * answers everybody else with an empty list, and the block then draws
 * nothing. Like the agreement requests above it, the work happens on the
 * order, so every row opens it.
 */
export default function BolRequestsSection() {
  const { formatDateTime } = useDateFormatters();
  const [rows, setRows] = useState<BolRequest[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listBolRequests().then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the BOLs to send'));
  }, []);

  if (error) return <p className="text-sm text-red-600 mb-6">{error}</p>;
  if (!rows || rows.length === 0) return null;
  const todo = rows.filter((r) => r.status !== 'done').length;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
        <FileText className="w-4 h-4 text-brand-600" />
        BOLs to send ({todo})
      </h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        Loads where the client and the carrier have both signed. TTMS made the BOL; open the load to choose who gets it, send it, and mark it done.
      </p>
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => {
          const last = r.sends[r.sends.length - 1];
          return (
            <li key={r.orderId}>
              <Link href={`/dashboard/orders/${r.orderId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded">
                <span className="font-mono text-sm font-semibold text-gray-900">{r.orderNumber}</span>
                <span className="text-sm text-gray-700 min-w-0 flex-1 truncate">
                  {[r.clientName, r.carrierName].filter(Boolean).join(' · ')}
                </span>
                <span className="text-xs text-gray-500">
                  {r.status === 'done' && r.doneAt
                    ? `Done by ${r.doneByName} · ${formatDateTime(new Date(r.doneAt))}`
                    : last
                      ? `Sent by ${last.byName} · ${formatDateTime(new Date(last.at))}`
                      : `Ready · ${formatDateTime(new Date(r.openedAt))}`}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  r.status === 'done' ? 'bg-green-50 text-green-700 border-green-200'
                  : r.status === 'sent' ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-brand-50 text-brand-700 border-brand-200'
                }`}>{BOL_STATUS_LABEL[r.status]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
