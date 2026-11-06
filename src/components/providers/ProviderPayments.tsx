'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FileText, Paperclip, Plus, Receipt } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/accessControl';
import DateField from '@/components/DateField';
import MoneyInput from '@/components/MoneyInput';
import { Bi } from '@/components/spanish/Es';
import { SectionHeading } from '@/components/orders/OrderSection';
import { useDateFormatters } from '@/lib/useDateFormatters';
import { addPaymentReceipts, listProviderPayments, recordProviderPayment, voidProviderPayment } from '@/lib/providers';
import {
  MAX_RECEIPTS_PER_PAYMENT, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, PROVIDER_SERVICE_LABEL,
  type Provider, type ProviderPayment,
} from '@/types/provider';

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Today in the office's calendar (UTC−6, no daylight saving), as `YYYY-MM-DD`. */
function officeToday(): string {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Every payment TTL has made to one provider, with its receipts, and the
 * form to record another. See src/types/provider.ts for who may do what: the
 * server is the gate; this only hides what would be refused.
 */
export default function ProviderPayments({ provider, onTotals }: {
  provider: Provider;
  /** Told after a change, so the page's totals can be re-read. */
  onTotals?: () => void;
}) {
  const { profile } = useAuth();
  const { formatCalendarDate, formatDateTime } = useDateFormatters();
  const mayVoid = can(profile, 'orders.payments');
  const [payments, setPayments] = useState<ProviderPayment[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(officeToday());
  const [method, setMethod] = useState<string>('comchek');
  const [reference, setReference] = useState('');
  const [service, setService] = useState<string>(provider.services[0] ?? '');
  const [orderNumber, setOrderNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const addFor = useRef<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setPayments(await listProviderPayments(provider.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the payments');
    }
  }, [provider.id]);

  useEffect(() => { void load(); }, [load]);

  async function record() {
    setBusy(true);
    setError('');
    try {
      await recordProviderPayment(provider.id, { amount, paidOn, method, reference, service, orderNumber, notes, receipts: files });
      setOpen(false);
      setAmount(''); setReference(''); setOrderNumber(''); setNotes(''); setFiles([]);
      await load();
      onTotals?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the payment');
    } finally {
      setBusy(false);
    }
  }

  async function addReceipts(list: FileList | null) {
    const paymentId = addFor.current;
    if (!paymentId || !list?.length) return;
    setBusy(true);
    setError('');
    try {
      await addPaymentReceipts(provider.id, paymentId, [...list]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the receipt');
    } finally {
      setBusy(false);
      if (addInput.current) addInput.current.value = '';
    }
  }

  async function voidOne(p: ProviderPayment) {
    const reason = window.prompt(`Void the payment of ${usd(p.amount)} on ${p.paidOn}? Say why — it stays on the record, struck through.`);
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await voidProviderPayment(provider.id, p.id, reason);
      await load();
      onTotals?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not void the payment');
    } finally {
      setBusy(false);
    }
  }

  const live = (payments ?? []).filter((p) => !p.voidedAt);
  const total = live.reduce((n, p) => n + p.amount, 0);

  return (
    <section id="payments" className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 scroll-mt-4">
      <SectionHeading icon={Receipt} tone="emerald" title="Payments and receipts"
        sub={<Bi>Every payment we make to this provider, with its receipt. Name the load when it was for one, and it shows on the load&apos;s history too.</Bi>}
        action={!open ? (
          <button type="button" onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700">
            <Plus className="w-3.5 h-3.5" aria-hidden /> <span data-es>Record a payment</span>
          </button>
        ) : undefined} />

      {open && (
        <div className="rounded-lg border border-gray-200 p-4 mb-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label data-es className={LABEL}>Amount paid</label>
              <MoneyInput value={amount} onChange={setAmount} className={INPUT} placeholder="$" aria-label="Amount paid" />
            </div>
            <div>
              <label data-es className={LABEL}>Paid on</label>
              <DateField value={paidOn} onChange={setPaidOn} className={INPUT} ariaLabel="Paid on" />
            </div>
            <div>
              <label data-es className={LABEL}>How</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT} aria-label="How">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
              </select>
            </div>
            <div>
              <label data-es className={LABEL}>Check or transaction number</label>
              <input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label data-es className={LABEL}>Service</label>
              <select value={service} onChange={(e) => setService(e.target.value)} className={INPUT} aria-label="Service">
                <option value="">—</option>
                {provider.services.map((s) => <option key={s} value={s}>{PROVIDER_SERVICE_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label data-es className={LABEL}>Load number</label>
              <input value={orderNumber} maxLength={40} onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Optional" className={INPUT} />
            </div>
          </div>
          <div>
            <label data-es className={LABEL}>Notes</label>
            <input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label data-es className={LABEL}>Receipts</label>
            <input type="file" multiple accept={ACCEPT}
              onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, MAX_RECEIPTS_PER_PAYMENT))}
              className="block text-sm text-gray-600" />
            <p className="text-xs text-gray-500 mt-1"><Bi>A photo or a PDF. Photos are shrunk before they are sent.</Bi></p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={record} data-es
              className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save payment'}
            </button>
            <button type="button" onClick={() => setOpen(false)} data-es
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 mb-4">{error}</div>}

      <input ref={addInput} type="file" multiple accept={ACCEPT} className="hidden"
        onChange={(e) => void addReceipts(e.target.files)} />

      {payments === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-gray-400"><Bi>No payments recorded yet.</Bi></p>
      ) : (
        <>
          <p className="text-sm text-gray-700 mb-3">
            <span className="font-semibold">{usd(total)}</span> <span data-es>paid in</span> {live.length}{' '}
            {live.length === 1 ? 'payment' : 'payments'}
          </p>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {payments.map((p) => (
              <li key={p.id} className={`px-4 py-3 text-sm ${p.voidedAt ? 'bg-gray-50' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className={`min-w-0 ${p.voidedAt ? 'line-through text-gray-400' : ''}`}>
                    <p className="font-semibold text-gray-900">
                      {usd(p.amount)} <span className="font-normal text-gray-600">· {formatCalendarDate(p.paidOn)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                      {p.reference ? ` #${p.reference}` : ''}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {p.service ? `${PROVIDER_SERVICE_LABEL[p.service]} · ` : ''}
                      {p.orderNumber && (p.orderId
                        ? <Link href={`/dashboard/orders/${p.orderId}`} className="text-brand-700 hover:underline">Load {p.orderNumber}</Link>
                        : <>Load {p.orderNumber}</>)}
                      {p.orderNumber ? ' · ' : ''}Recorded by {p.recordedByName}
                    </p>
                    {p.notes && <p className="text-xs text-gray-600 mt-1">{p.notes}</p>}
                  </div>
                  {!p.voidedAt && (
                    <div className="flex items-center gap-3 shrink-0">
                      {p.receipts.length < MAX_RECEIPTS_PER_PAYMENT && (
                        <button type="button" disabled={busy}
                          onClick={() => { addFor.current = p.id; addInput.current?.click(); }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                          <Paperclip className="w-3.5 h-3.5" aria-hidden /> <span data-es>Add receipt</span>
                        </button>
                      )}
                      {mayVoid && (
                        <button type="button" disabled={busy} onClick={() => voidOne(p)} data-es
                          className="text-xs font-medium text-gray-500 hover:text-red-600">
                          Void
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {p.receipts.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {p.receipts.map((r) => (
                      <a key={r.id} href={r.url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-gray-200 text-xs text-gray-700 hover:bg-gray-50">
                        <FileText className="w-3.5 h-3.5 text-gray-400" aria-hidden /> {r.name}
                      </a>
                    ))}
                  </div>
                )}
                {p.voidedAt != null && (
                  <p className="text-xs text-red-600 mt-1">
                    Voided by {p.voidedByName} on {formatDateTime(p.voidedAt as never)}: {p.voidReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
