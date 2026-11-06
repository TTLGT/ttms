'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CircleDollarSign, Paperclip } from 'lucide-react';
import { SectionHeading } from './OrderSection';
import { Bi } from '@/components/spanish/Es';
import { listOrderFiles, uploadOrderFile } from '@/lib/orderFiles';
import { recordPayment, undoPayment } from '@/lib/driverLinks';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { useAuth } from '@/context/AuthContext';
import {
  isCodLoad,
  paymentMarkLabel,
  paymentsMissing,
  proofRequired,
  requiredMarks,
  type PaymentMarkKey,
} from '@/types/orderPayment';
import type { PaymentMark } from '@/types/orderPayment';
import type { Order, OrderStatus } from '@/types/order';
import type { OrderFile } from '@/types/orderFile';

/**
 * Whether the money on the load has moved, and the thing Completed waits on.
 * See src/types/orderPayment.ts.
 *
 * Everybody who can open the load sees it; only `orders.payments` records or
 * undoes a payment. A mark the driver made from their link shows as theirs,
 * with the proof they sent.
 */
export default function PaymentsCard({ orderId, order, onChanged }: {
  orderId: string;
  order: Order;
  onChanged: (status: OrderStatus) => void;
}) {
  const { user, can } = useAuth();
  const { formatDateTime } = useDateFormatters();
  const mayRecord = can('orders.payments');
  const cod = isCodLoad(order);
  const marks = order.paymentMarks ?? {};
  const keys = requiredMarks(cod);
  const missing = paymentsMissing(order);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [open, setOpen] = useState<PaymentMarkKey | null>(null);
  const [error, setError] = useState('');
  // Which payment is showing its "are you sure?" box. One at a time.
  const [confirming, setConfirming] = useState<PaymentMarkKey | null>(null);
  const [undoing, setUndoing] = useState(false);

  const proofIds = Object.values(marks).flatMap((m) => m?.fileIds ?? []).join(',');
  useEffect(() => {
    if (!proofIds) return;
    let cancelled = false;
    listOrderFiles(orderId).then((f) => { if (!cancelled) setFiles(f); }).catch(() => {});
    return () => { cancelled = true; };
  }, [orderId, proofIds]);

  async function undo(key: PaymentMarkKey) {
    setError('');
    setUndoing(true);
    try {
      const { status } = await undoPayment(orderId, key);
      setConfirming(null);
      onChanged(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div id="payments" className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 scroll-mt-4">
      <SectionHeading icon={CircleDollarSign} tone="emerald" title="Payments"
        action={cod ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">COD</span> : undefined} />
      <p className="-mt-2 mb-4 text-xs text-gray-500">
        {cod
          ? 'COD load: the client pays the driver at delivery, and the carrier then pays us our share. '
          : 'The client pays us and we pay the driver. '}
        {missing.length
          ? 'The load moves to Completed by itself once both are recorded.'
          : order.status === 'completed' ? 'Both recorded; the load is Completed.' : 'Both recorded.'}
      </p>

      <ul className="space-y-3">
        {keys.map((key) => {
          const mark = marks[key];
          const proofs = (mark?.fileIds ?? []).map((id) => files.find((f) => f.id === id)).filter(Boolean) as OrderFile[];
          return (
            <li key={key} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{paymentMarkLabel(key, cod)}</p>
                {mark ? (
                  <span data-es className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Recorded</span>
                ) : (
                  <span data-es className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Not yet</span>
                )}
              </div>
              {mark && (
                <p className="mt-1 text-xs text-gray-500">
                  {mark.via === 'driver' ? `${mark.byName} (driver, from the driver link)` : mark.byName}, {formatDateTime(new Date(mark.at))}
                  {mark.note && <> — {mark.note}</>}
                </p>
              )}
              {proofs.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {proofs.map((f) => (
                    <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                      <Paperclip className="h-3 w-3" /> {f.name}
                    </a>
                  ))}
                </div>
              )}
              {mayRecord && (
                <div className="mt-2">
                  {mark && confirming === key ? (
                    <UndoConfirm label={paymentMarkLabel(key, cod)} mark={mark}
                      byMe={!!user && mark.via === 'staff' && mark.byUid === user.uid}
                      completed={order.status === 'completed'} busy={undoing}
                      onCancel={() => setConfirming(null)}
                      onConfirm={() => void undo(key)} />
                  ) : mark ? (
                    <button data-es type="button" onClick={() => { setError(''); setConfirming(key); }}
                      className="text-xs text-red-600 hover:underline">Undo</button>
                  ) : open === key ? (
                    <RecordForm orderId={orderId} markKey={key} proofNeeded={proofRequired(key, 'staff')}
                      onCancel={() => setOpen(null)}
                      onDone={(status) => { setOpen(null); onChanged(status); }} />
                  ) : (
                    <button type="button" onClick={() => setOpen(key)}
                      className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      Record
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * The "are you sure?" for taking a payment back. It used to be the browser's
 * own confirm(), which people click through without reading, and which said
 * nothing about what would follow. This one says the two things that matter:
 * whose record is being taken back (a driver's, or a colleague's), and that a
 * Completed load drops back to Delivered — every required payment is needed
 * for Completed, so undoing any one of them always does that
 * (`settlementStatus()` in src/lib/orderPaymentsServer.ts).
 */
function UndoConfirm({ label, mark, byMe, completed, busy, onCancel, onConfirm }: {
  label: string;
  mark: PaymentMark;
  byMe: boolean;
  completed: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="alertdialog" aria-label={`Undo ${label}`}
      className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span><Bi vars={{ label }}>{'Undo "{label}"?'}</Bi></span>
      </p>
      <ul className="list-disc space-y-1 pl-5 text-xs text-gray-700">
        {mark.via === 'driver' ? (
          <li><Bi vars={{ name: mark.byName }}>{'{name} recorded this from the driver link. Undoing it removes their record of being paid.'}</Bi></li>
        ) : !byMe ? (
          <li><Bi vars={{ name: mark.byName }}>{'{name} recorded this payment, not you.'}</Bi></li>
        ) : null}
        {completed && (
          <li className="font-medium text-gray-900">
            <Bi>The load moves from Completed back to Delivered, and stays there until this payment is recorded again.</Bi>
          </li>
        )}
        <li><Bi>Any proof attached stays on the load, and the change log keeps a record of the undo.</Bi></li>
      </ul>
      <div className="flex gap-2 pt-1">
        <button data-es type="button" onClick={onConfirm} disabled={busy}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? 'Undoing…' : 'Yes, undo it'}
        </button>
        <button data-es type="button" onClick={onCancel} disabled={busy}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
          Keep it
        </button>
      </div>
    </div>
  );
}

function RecordForm({ orderId, markKey, proofNeeded, onCancel, onDone }: {
  orderId: string;
  markKey: PaymentMarkKey;
  proofNeeded: boolean;
  onCancel: () => void;
  onDone: (status: OrderStatus) => void;
}) {
  const [picked, setPicked] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function save() {
    if (proofNeeded && !picked.length) {
      setError('Attach proof of the payment first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // Filed as ordinary files of the load first, so the proof is on the
      // Documents tab whatever happens to the mark afterwards.
      const ids: string[] = [];
      for (const f of picked) ids.push((await uploadOrderFile(orderId, f, { kind: 'payment_proof', note: note.trim() })).id);
      const { status } = await recordPayment(orderId, markKey, ids, note);
      onDone(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-gray-50 p-3">
      <input ref={input} type="file" multiple accept="image/*,application/pdf" className="hidden"
        onChange={(e) => { setPicked(Array.from(e.target.files ?? []).slice(0, 5)); e.target.value = ''; }} />
      <button type="button" onClick={() => input.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
        <Paperclip className="h-3.5 w-3.5" />
        {picked.length ? picked.map((f) => f.name).join(', ') : proofNeeded ? 'Attach proof (required)' : 'Attach proof (optional)'}
      </button>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
        placeholder="Note — reference number, method, amount"
        className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} disabled={busy}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button data-es type="button" onClick={onCancel} disabled={busy}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
