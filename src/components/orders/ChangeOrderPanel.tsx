'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FilePen } from 'lucide-react';
import { CHANGE_ORDER_EVENT, decideChangeOrder, getChangeOrder } from '@/lib/changeOrdersClient';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { useApprovals } from '@/context/ApprovalsContext';
import { changeFieldLabel, describeChangeValue } from '@/types/recordHistory';
import { affectsLabel, CHANGE_ORDER_STATUS_LABEL, type ChangeOrder } from '@/types/changeOrder';

/**
 * A change order, as a row: what it changes, from what to what, why, and —
 * for admin and dispatch while it waits — Approve and Turn down. Used on the
 * load (ChangeOrderPanel, below) and on the Approvals screen.
 */

const STATUS_STYLE: Record<ChangeOrder['status'], string> = {
  pending:   'bg-amber-50 text-amber-700',
  approved:  'bg-green-50 text-green-700',
  rejected:  'bg-red-50 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-600',
};

export function ChangeOrderRow({
  co, canDecide, uid, showLoad = false, onDecided,
}: {
  co: ChangeOrder;
  canDecide: boolean;
  uid: string;
  showLoad?: boolean;
  onDecided: () => void;
}) {
  const { formatDate, formatDateTime } = useDateFormatters();
  const { refresh: refreshBadges } = useApprovals();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function decide(action: 'approve' | 'reject' | 'withdraw') {
    const ask = action === 'approve'
      ? `Apply this change to load ${co.orderNumber}? ${affectsLabel(co.affects)} goes on hold until you send the update.`
      : action === 'withdraw' ? 'Withdraw your change order? Nothing on the load changes.' : '';
    if (ask && !window.confirm(ask)) return;
    setBusy(true);
    setError('');
    try {
      await decideChangeOrder(co.orderId, action, note);
      setNote('');
      onDecided();
      refreshBadges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decide the change order');
    } finally {
      setBusy(false);
    }
  }

  const pending = co.status === 'pending';
  const fmt = (field: string, v: unknown) => describeChangeValue(field, v, (d) => formatDate(d));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-gray-900">
          {showLoad ? `Load ${co.orderNumber}${co.clientName ? ` · ${co.clientName}` : ''}` : `Change order from ${co.requestedByName}`}
        </span>
        {showLoad && (
          <Link href={`/dashboard/orders/${co.orderId}#change-order`} className="text-xs font-semibold text-brand-700 hover:underline">
            Open the load
          </Link>
        )}
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[co.status]}`}>
          {CHANGE_ORDER_STATUS_LABEL[co.status]}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        {showLoad ? `Asked by ${co.requestedByName}` : 'Asked'}{co.requestedAt ? `, ${formatDateTime(co.requestedAt)}` : ''}
        {' · changes '}{affectsLabel(co.affects)}
        {co.decidedByName && !pending ? ` · ${CHANGE_ORDER_STATUS_LABEL[co.status].toLowerCase()} by ${co.decidedByName}${co.decidedAt ? `, ${formatDateTime(co.decidedAt)}` : ''}` : ''}
      </p>
      {co.reason && <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">“{co.reason}”</p>}
      {co.decisionNote && !pending && <p className="mt-1 text-xs text-gray-600">Note: {co.decisionNote}</p>}

      {co.changes.length > 0 && (
        <table className="mt-2 w-full text-xs">
          <tbody>
            {co.changes.map((c) => (
              <tr key={c.field} className="border-t border-gray-100 align-top">
                <td className="py-1 pr-3 font-medium text-gray-700 whitespace-nowrap">{changeFieldLabel(c.field)}</td>
                <td className="py-1 pr-3 text-gray-500 line-through decoration-gray-300">{fmt(c.field, c.from)}</td>
                <td className="py-1 text-gray-900">{fmt(c.field, c.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pending && co.stale && (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          The load has changed in the same fields since this was asked, so it cannot be approved as it stands.
          Turn it down and ask for it again from the load as it is now.
        </p>
      )}

      {pending && canDecide && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to the broker (needed to turn it down)"
            maxLength={1000}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button type="button" disabled={busy || co.stale} onClick={() => void decide('approve')}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            Approve and apply
          </button>
          <button type="button" disabled={busy || !note.trim()} onClick={() => void decide('reject')}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            Turn down
          </button>
        </div>
      )}
      {pending && !canDecide && co.requestedByUid === uid && (
        <button type="button" disabled={busy} onClick={() => void decide('withdraw')}
          className="mt-2 text-xs font-semibold text-gray-600 underline disabled:opacity-40">
          Withdraw
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** How long a decided change order stays on the load before it is only on the Change log. */
const SHOW_DECIDED_DAYS = 14;

/**
 * The load's change order, on its page. Nothing at all when there is none, or
 * the last one was decided long enough ago to be history. `refreshKey` moves
 * when the page saves something, since a save may have just filed one.
 */
export default function ChangeOrderPanel({
  orderId, refreshKey = 0, onDecided,
}: {
  orderId: string;
  refreshKey?: number;
  /** An approval changed the load; the page re-reads it. */
  onDecided?: () => void;
}) {
  const [state, setState] = useState<{ co: ChangeOrder | null; canDecide: boolean; uid: string } | null>(null);

  const load = useCallback(() => {
    getChangeOrder(orderId)
      .then((r) => setState({ co: r.changeOrder, canDecide: r.canDecide, uid: r.uid }))
      .catch(() => setState(null));
  }, [orderId]);
  useEffect(load, [load, refreshKey]);
  useEffect(() => {
    const onFiled = (e: Event) => { if ((e as CustomEvent).detail?.orderId === orderId) load(); };
    window.addEventListener(CHANGE_ORDER_EVENT, onFiled);
    return () => window.removeEventListener(CHANGE_ORDER_EVENT, onFiled);
  }, [load, orderId]);

  const co = state?.co;
  if (!state || !co) return null;
  const recent = co.status === 'pending'
    || Date.parse(co.decidedAt ?? co.requestedAt ?? '') > Date.now() - SHOW_DECIDED_DAYS * 24 * 60 * 60 * 1000;
  if (!recent) return null;

  return (
    <section id="change-order" className={`rounded-xl border p-5 mb-6 bg-white ${co.status === 'pending' ? 'border-amber-300' : 'border-gray-200'}`}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-900">
        <FilePen className="h-4 w-4 text-brand-600" /> Change order
      </h2>
      <ChangeOrderRow co={co} canDecide={state.canDecide} uid={state.uid}
        onDecided={() => { load(); onDecided?.(); }} />
    </section>
  );
}
