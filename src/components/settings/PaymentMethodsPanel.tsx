'use client';

import { useEffect, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { getAppSettings, savePaymentMethods } from '@/lib/appSettings';
import {
  FEE_PAYERS,
  FEE_PAYER_LABEL,
  FEE_TYPES,
  FEE_TYPE_LABEL,
  blankPaymentMethod,
  validatePaymentMethods,
} from '@/types/paymentMethod';
import type { FeePayer, FeeType, PaymentMethod, PaymentSide } from '@/types/paymentMethod';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-50 disabled:text-gray-400';

/** What each list is for, and what a percentage fee on it is taken of. */
const LISTS: { side: PaymentSide; title: string; percentOf: string; placeholder: string }[] = [
  { side: 'client',    title: 'Client Payment Method — how the client pays us', percentOf: 'the agreed rate', placeholder: 'e.g. ACH, Credit card, Check' },
  { side: 'carrier',   title: 'Carrier Pay Terms — how and when the carrier is paid', percentOf: 'the carrier pay', placeholder: 'e.g. COD - Cash, Quick pay, Net 30' },
  { side: 'brokerFee', title: 'Broker Fee Terms — when our fee is collected', percentOf: 'the broker fee', placeholder: 'e.g. Charge on Dispatch, Charge on Delivery' },
];

/**
 * Admin-kept dropdowns for an order's Price and Terms. See
 * src/types/paymentMethod.ts.
 *
 * Removing an option here is safe for loads that already use it — each order
 * keeps its own copy of the option it was given — so there is no retire step
 * the way Lead Sources has one.
 */
export default function PaymentMethodsPanel() {
  const [lists, setLists] = useState<Record<PaymentSide, PaymentMethod[]> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAppSettings()
      .then((res) => setLists({
        client: res.settings.clientPaymentMethods,
        carrier: res.settings.carrierPaymentMethods,
        brokerFee: res.settings.brokerFeeTermOptions,
      }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the setting'));
  }, []);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Payment Terms</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        The dropdowns in every order&apos;s Price and Terms: how the client pays us, how the
        carrier is paid, and when our fee is collected. Each option can carry a fee for using it —
        a flat amount, or a percentage of the money it moves — and says who pays that fee unless
        the broker changes it on the load.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {!lists ? (
        !error && <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-8">
          {LISTS.map((l) => (
            <MethodList key={l.side} {...l} initial={lists[l.side]} />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-gray-500 leading-relaxed">
        Changing or removing an option does not touch loads that already use it. Each order keeps
        the option — name, fee and who pays — as it was when it was picked, so the paperwork for a
        load booked at 3% still says 3% after the fee goes up.
      </p>
    </section>
  );
}

function MethodList({ side, title, percentOf, placeholder, initial }: {
  side: PaymentSide;
  title: string;
  percentOf: string;
  placeholder: string;
  initial: PaymentMethod[];
}) {
  const [saved, setSaved]     = useState<PaymentMethod[]>(initial);
  const [draft, setDraft]     = useState<PaymentMethod[]>(initial);
  // Amounts are typed as strings so "2." survives under the cursor; the
  // number is worked out on save.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => amountStrings(initial));
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  const current = draft.map((m) => ({ ...m, feeAmount: m.feeType === 'none' ? 0 : parseFloat(amounts[m.id] ?? '') }));
  const dirty = JSON.stringify(current) !== JSON.stringify(saved);

  function patch(id: string, changes: Partial<PaymentMethod>) {
    setDraft((d) => d.map((m) => (m.id === id ? { ...m, ...changes } : m)));
    setDone(false);
  }

  function add() {
    // A carrier's options are paid to the carrier, so a fee on one most often
    // comes out of the carrier's pay; a client's or our fee's, out of the
    // client's pocket.
    const m: PaymentMethod = { ...blankPaymentMethod(), feePayer: side === 'carrier' ? 'carrier' : 'client' };
    setDraft((d) => [...d, m]);
    setAmounts((a) => ({ ...a, [m.id]: '' }));
    setDone(false);
  }

  function remove(id: string) {
    setDraft((d) => d.filter((m) => m.id !== id));
    setDone(false);
  }

  async function save() {
    // Blank or half-typed amounts on a fee-carrying option would otherwise be
    // saved as NaN; the shared check turns that into a sentence.
    const checked = validatePaymentMethods(current);
    if ('error' in checked) { setError(checked.error); return; }
    setSaving(true);
    setError('');
    try {
      await savePaymentMethods(side, checked.methods);
      setSaved(checked.methods);
      setDraft(checked.methods);
      setAmounts(amountStrings(checked.methods));
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the setting');
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setDraft(saved);
    setAmounts(amountStrings(saved));
    setError('');
  }

  return (
    <div>
      <p className="text-sm font-semibold text-gray-800 mb-2">{title}</p>

      {draft.length === 0 && (
        <p className="text-sm text-gray-500 mb-3">
          None yet. Until one is added, the order form has nothing to offer here.
        </p>
      )}

      <div className="space-y-3">
        {draft.map((m) => (
          <div key={m.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  value={m.name}
                  onChange={(e) => patch(m.id, { name: e.target.value })}
                  placeholder={placeholder}
                  maxLength={60}
                  className={INPUT}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="mb-2 text-gray-400 hover:text-red-600 transition"
                aria-label={`Remove ${m.name || 'this payment method'}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fee</label>
                <select
                  value={m.feeType}
                  onChange={(e) => patch(m.id, { feeType: e.target.value as FeeType })}
                  className={INPUT}
                >
                  {FEE_TYPES.map((t) => <option key={t} value={t}>{FEE_TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {m.feeType === 'percent' ? 'Percent' : 'Amount (USD)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max={m.feeType === 'percent' ? 100 : undefined}
                  step="0.01"
                  disabled={m.feeType === 'none'}
                  value={m.feeType === 'none' ? '' : (amounts[m.id] ?? '')}
                  onChange={(e) => { setAmounts((a) => ({ ...a, [m.id]: e.target.value })); setDone(false); }}
                  placeholder={m.feeType === 'percent' ? '3' : '0.00'}
                  className={INPUT}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Paid by (default)</label>
                <select
                  value={m.feePayer}
                  disabled={m.feeType === 'none'}
                  onChange={(e) => patch(m.id, { feePayer: e.target.value as FeePayer })}
                  className={INPUT}
                >
                  {FEE_PAYERS.map((p) => <option key={p} value={p}>{FEE_PAYER_LABEL[p]}</option>)}
                </select>
              </div>
            </div>
            {m.feeType === 'percent' && (
              <p className="text-xs text-gray-500 mt-2">A percentage of {percentOf} on each load.</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={draft.length >= 50}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Add an option
        </button>
        <div className="flex-1" />
        {dirty && (
          <>
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
        {done && !dirty && (
          <span className="flex items-center gap-1.5 text-xs text-green-700">
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}

function amountStrings(methods: PaymentMethod[]): Record<string, string> {
  return Object.fromEntries(methods.map((m) => [m.id, m.feeType === 'none' ? '' : String(m.feeAmount)]));
}
