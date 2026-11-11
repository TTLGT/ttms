'use client';

import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Pill } from '@/components/orders/DetailBits';
import { Bi } from '@/components/spanish/Es';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { getClientSnapshot } from '@/lib/parties';
import { CLIENT_TYPE_LABEL, CLIENT_TYPE_MEANING, CLIENT_TYPE_TONE } from '@/types/clientSnapshot';
import type { ClientSnapshot } from '@/types/clientSnapshot';

/**
 * A client's type and history, read from /api/parties/{id}/snapshot — see
 * src/types/clientSnapshot.ts for what each type means. Draws nothing for a
 * client this person may not open, or while it loads.
 *
 * `compact` is the order page's version: the badges and four numbers, no bars.
 */

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/** Loads the snapshot once per client id. */
export function useClientSnapshot(clientId: string | null | undefined): ClientSnapshot | null {
  const [snap, setSnap] = useState<ClientSnapshot | null>(null);
  useEffect(() => {
    setSnap(null);
    if (!clientId) return;
    let live = true;
    getClientSnapshot(clientId).then((s) => { if (live) setSnap(s); }).catch(() => {});
    return () => { live = false; };
  }, [clientId]);
  return snap;
}

/** The type badge (and the credit badge beside it). */
export function ClientTypeBadges({ snap }: { snap: ClientSnapshot }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span title={CLIENT_TYPE_MEANING[snap.type]}>
        <Pill tone={CLIENT_TYPE_TONE[snap.type]}>{CLIENT_TYPE_LABEL[snap.type]}</Pill>
      </span>
      {snap.creditClient && <Pill tone="emerald" icon={CreditCard}>Credit client</Pill>}
    </span>
  );
}

export default function ClientSnapshotView({ snap, compact = false }: { snap: ClientSnapshot; compact?: boolean }) {
  const { formatDate } = useDateFormatters();
  const day = (d: string | null) => (d ? formatDate(new Date(`${d}T12:00:00`)) : '—');
  const max = Math.max(1, ...snap.months.map((m) => m.loads));

  const stats = [
    { label: 'Loads booked', value: snap.bookedLoads.toLocaleString() + (snap.truncated ? '+' : '') },
    { label: 'Last 3 months', value: snap.loadsLast3Months.toLocaleString() },
    { label: 'Average rate', value: snap.averageRate != null ? money(snap.averageRate) : '—' },
    { label: 'Last load', value: day(snap.lastLoadDay) },
    ...(compact ? [] : [
      { label: 'This month', value: snap.loadsThisMonth.toLocaleString() },
      { label: 'Total billed', value: snap.totalBilled ? money(snap.totalBilled) : '—' },
      { label: 'First load', value: day(snap.firstLoadDay) },
      { label: 'Open quotes · cancelled', value: `${snap.quotes} · ${snap.cancelled}` },
    ]),
  ];

  return (
    <div className="space-y-3">
      <div>
        {/* The order page already shows the badges beside the client's name. */}
        {!compact && <ClientTypeBadges snap={snap} />}
        <p className={`${compact ? '' : 'mt-1 '}text-xs text-gray-500`}><Bi>{CLIENT_TYPE_MEANING[snap.type]}</Bi></p>
      </div>
      <dl className={`grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-gray-50 px-3 py-2">
            <dt data-es className="text-[11px] font-medium text-gray-500">{s.label}</dt>
            <dd className="text-sm font-semibold text-gray-900 tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {!compact && (
        <div>
          <p data-es className="text-[11px] font-medium text-gray-500 mb-1">Loads per month</p>
          <div className="flex items-end gap-2 h-16">
            {snap.months.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1" title={`${m.month}: ${m.loads}`}>
                <span className="text-[10px] tabular-nums text-gray-500">{m.loads || ''}</span>
                <div className="w-full rounded-t bg-brand-500" style={{ height: `${Math.max(2, (m.loads / max) * 40)}px`, opacity: m.loads ? 1 : 0.15 }} />
                <span className="text-[10px] text-gray-400">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        <Bi>Counts every load of this client, including ones you cannot open. Dated by pickup.</Bi>
      </p>
    </div>
  );
}
