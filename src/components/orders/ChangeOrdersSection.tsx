'use client';

import { useCallback, useEffect, useState } from 'react';
import { FilePen } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listChangeOrders } from '@/lib/changeOrdersClient';
import type { ChangeOrder } from '@/types/changeOrder';
import { ChangeOrderRow } from './ChangeOrderPanel';

/**
 * Change orders on the Approvals screen. Admin and dispatch see every one on
 * loads they can see and decide them here; a broker sees their own and how
 * they were answered. The route decides which — see /api/change-orders.
 */

/** Recent enough to still be news; older ones are on each load's Change log. */
const SHOW_DECIDED_DAYS = 30;

export default function ChangeOrdersSection() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<ChangeOrder[] | null>(null);
  const [outgoing, setOutgoing] = useState<ChangeOrder[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([listChangeOrders('incoming'), listChangeOrders('outgoing')])
      .then(([i, o]) => { setIncoming(i); setOutgoing(o); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the change orders'));
  }, []);
  useEffect(load, [load]);

  if (!incoming || !outgoing) return error ? <p className="text-sm text-red-600 mb-6">{error}</p> : null;

  const cutoff = Date.now() - SHOW_DECIDED_DAYS * 24 * 60 * 60 * 1000;
  const recent = (r: ChangeOrder) => r.status === 'pending' || Date.parse(r.decidedAt ?? r.requestedAt ?? '') > cutoff;
  // The incoming list is the waiting ones, and empty for anybody who cannot
  // decide them; decided ones stay on the load and its Change log.
  const decider = incoming.length > 0;
  const rows = (decider ? incoming : outgoing).filter(recent);
  if (rows.length === 0) return null;
  const waiting = rows.filter((r) => r.status === 'pending').length;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
        <FilePen className="w-4 h-4 text-brand-600" />
        Change orders ({waiting})
      </h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        {decider
          ? 'Brokers’ changes to loads whose SA or Dispatch Sheet has already gone out. Nothing changes until one is approved; approving applies it and opens the review to send the updated paperwork.'
          : 'Your change orders, and how they were answered.'}
      </p>
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.orderId} className="py-3">
            <ChangeOrderRow co={r} canDecide={decider} uid={user?.uid ?? ''} showLoad onDecided={load} />
          </li>
        ))}
      </ul>
    </section>
  );
}
