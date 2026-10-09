'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, HelpCircle, Loader2, XCircle } from 'lucide-react';
import { downloadQuotePdf, fetchOrderReadiness } from '@/lib/orderPaperwork';
import {
  READINESS_DOC_LABEL,
  readinessOf,
  type ReadinessDoc,
  type ReadinessItem,
} from '@/types/orderReadiness';

/**
 * What a quote still needs before its paperwork can go out, beside the button
 * that turns it into a quote PDF for the client.
 *
 * Shown while the order is a quote or waiting on its SA. Two columns because
 * they are two different deadlines: the Shipper Agreement is what has to be
 * right before dispatch can send it, and the BOL can wait for the carrier.
 *
 * `refreshKey` is anything that changes when the order does, so the list does
 * not go on claiming a field is missing after somebody has filled it.
 */
export default function OrderReadinessCard({ orderId, orderNumber, showQuotePdf, refreshKey }: {
  orderId: string;
  orderNumber: string;
  showQuotePdf: boolean;
  refreshKey?: unknown;
}) {
  const [items, setItems] = useState<ReadinessItem[] | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchOrderReadiness(orderId)
      .then((i) => { setItems(i); setError(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not check the order'));
  }, [orderId, refreshKey]);

  async function download() {
    setDownloading(true);
    try {
      await downloadQuotePdf(orderId, `Quote ${orderNumber}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the quote');
    } finally {
      setDownloading(false);
    }
  }

  const sa = items ? readinessOf(items, 'sa') : null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Paperwork checklist</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {sa?.complete
              ? 'Everything the Shipper Agreement needs is filled in.'
              : 'What is still needed before the Shipper Agreement and the BOL can be completed.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/orders/${orderId}/edit`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Fill in
          </Link>
          {showQuotePdf && (
            <button type="button" onClick={() => void download()} disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Quote PDF
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {!items && !error && <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking…</p>}

      {items && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(['sa', 'bol'] as ReadinessDoc[]).map((doc) => <Column key={doc} doc={doc} items={items} />)}
        </div>
      )}
    </section>
  );
}

function Column({ doc, items }: { doc: ReadinessDoc; items: ReadinessItem[] }) {
  const r = readinessOf(items, doc);
  const done = r.items.filter((i) => i.ok === true).length;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs font-semibold text-gray-800">{READINESS_DOC_LABEL[doc]}</p>
        <p className={`text-[11px] font-medium ${r.complete ? 'text-green-700' : 'text-gray-500'}`}>
          {done} of {r.items.length}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 mb-2">
        <div className={`h-1.5 rounded-full ${r.complete ? 'bg-green-500' : 'bg-brand-500'}`}
          style={{ width: `${(done / Math.max(1, r.items.length)) * 100}%` }} />
      </div>
      <ul className="space-y-1">
        {r.items.map((i) => <ReadinessLine key={i.key} item={i} />)}
      </ul>
    </div>
  );
}

export function ReadinessLine({ item }: { item: ReadinessItem }) {
  return (
    <li className="flex items-start gap-1.5 text-xs">
      {item.ok === true && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px text-green-600" />}
      {item.ok === false && <XCircle className="w-3.5 h-3.5 shrink-0 mt-px text-red-500" />}
      {item.ok === null && <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-px text-amber-500" />}
      <span className={item.ok === true ? 'text-gray-600' : 'text-gray-900'}>
        {item.label}
        {item.ok === null && <span className="text-amber-700"> — check</span>}
        {item.ok === false && item.hint && <span className="block text-[11px] text-gray-500">{item.hint}</span>}
      </span>
    </li>
  );
}

/** A tickable line, for the review list dispatch works through. */
export function TickLine({ label, detail, checked, onChange, disabled }: {
  label: string; detail?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <li>
      <label className={`flex items-start gap-2 text-xs ${disabled ? 'opacity-70' : 'cursor-pointer'}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 accent-brand-600" />
        <span>
          <span className={checked ? 'text-gray-600' : 'text-gray-900'}>{label}</span>
          {detail && <span className="block text-[11px] text-gray-500">{detail}</span>}
        </span>
      </label>
    </li>
  );
}
