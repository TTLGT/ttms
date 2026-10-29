'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleDollarSign, Paperclip } from 'lucide-react';
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
  const { can } = useAuth();
  const { formatDateTime } = useDateFormatters();
  const mayRecord = can('orders.payments');
  const cod = isCodLoad(order);
  const marks = order.paymentMarks ?? {};
  const keys = requiredMarks(cod);
  const missing = paymentsMissing(order);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [open, setOpen] = useState<PaymentMarkKey | null>(null);
  const [error, setError] = useState('');

  const proofIds = Object.values(marks).flatMap((m) => m?.fileIds ?? []).join(',');
  useEffect(() => {
    if (!proofIds) return;
    let cancelled = false;
    listOrderFiles(orderId).then((f) => { if (!cancelled) setFiles(f); }).catch(() => {});
    return () => { cancelled = true; };
  }, [orderId, proofIds]);

  async function undo(key: PaymentMarkKey) {
    if (!confirm(`Undo "${paymentMarkLabel(key, cod)}"? The proof stays on the load.`)) return;
    setError('');
    try {
      const { status } = await undoPayment(orderId, key);
      onChanged(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-1 flex items-center gap-2">
        <CircleDollarSign className="h-4 w-4 text-gray-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payments</h3>
        {cod && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">COD</span>}
      </div>
      <p className="mb-4 text-xs text-gray-500">
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
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Recorded</span>
                ) : (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Not yet</span>
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
                  {mark ? (
                    <button type="button" onClick={() => void undo(key)} className="text-xs text-red-600 hover:underline">Undo</button>
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
        <button type="button" onClick={onCancel} disabled={busy}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
