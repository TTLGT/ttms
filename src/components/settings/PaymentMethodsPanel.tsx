'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import MoneyInput from '@/components/MoneyInput';
import { getAppSettings, savePaymentMethods } from '@/lib/appSettings';
import {
  FEE_PAYERS,
  FEE_PAYER_LABEL,
  FEE_TYPES,
  FEE_TYPE_LABEL,
  blankPaymentMethod,
  feeBase,
  feeRateLabel,
  paymentFee,
  usd,
  validatePaymentMethods,
} from '@/types/paymentMethod';
import type { FeePayer, FeeType, PaymentMethod, PaymentSide } from '@/types/paymentMethod';
import { Bi } from '@/components/spanish/Es';
import { useSaveBarEntry } from './kit/SaveBar';
import { EmptyState, Loading, Notice, PreviewBox, SettingsCard } from './kit/ui';

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-50 disabled:text-gray-400';

/** What each list is for, and what a percentage fee on it is taken of. */
const LISTS: { side: PaymentSide; title: string; blurb: string; percentOf: string; placeholder: string }[] = [
  { side: 'client',    title: 'Client payment method', blurb: 'How the client pays us.', percentOf: 'the agreed rate', placeholder: 'e.g. ACH, Credit card, Check' },
  { side: 'carrier',   title: 'Carrier pay terms', blurb: 'How and when the carrier is paid.', percentOf: 'the carrier pay', placeholder: 'e.g. COD - Cash, Quick pay, Net 30' },
  { side: 'brokerFee', title: 'Broker fee terms', blurb: 'When our fee is collected.', percentOf: 'the broker fee', placeholder: 'e.g. Charge on Dispatch, Charge on Delivery' },
];

/**
 * The example load every preview prices: what the client pays, what the
 * carrier gets, and the difference that is ours. Round numbers on purpose —
 * a 3% fee on $2,000 is a figure anybody can check in their head.
 */
const SAMPLE = { agreedRate: 2000, carrierPay: 1700, brokerFee: 300 };

/**
 * Admin-kept dropdowns for an order's Price and Terms. See
 * src/types/paymentMethod.ts.
 *
 * Removing an option here is safe for loads that already use it — each order
 * keeps its own copy of the option it was given — so there is no retire step
 * the way Lead Sources has one.
 *
 * Each of the three lists registers with the Save bar on its own, so editing
 * two of them and pressing Save once saves both.
 */
export default function PaymentMethodsPanel() {
  const [lists, setLists] = useState<Record<PaymentSide, PaymentMethod[]> | null>(null);
  const [drafts, setDrafts] = useState<Record<PaymentSide, PaymentMethod[]> | null>(null);
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

  useEffect(() => { if (lists && !drafts) setDrafts(lists); }, [lists, drafts]);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!lists || !drafts) return <SettingsCard><Loading /></SettingsCard>;

  return (
    <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {LISTS.map((l) => (
          <MethodList
            key={l.side}
            {...l}
            initial={lists[l.side]}
            onDraft={(methods) => setDrafts((d) => (d ? { ...d, [l.side]: methods } : d))}
          />
        ))}
        <p className="text-xs leading-relaxed text-gray-500">
          <Bi>Changing or removing an option does not touch loads that already use it. Each order keeps
          the option — name, fee and who pays — as it was when it was picked, so the paperwork for a
          load booked at 3% still says 3% after the fee goes up.</Bi>
        </p>
      </div>

      <div className="2xl:sticky 2xl:top-0">
        <PreviewBox title="On a $2,000 load" note="An example load: the client pays $2,000, the carrier gets $1,700 and our fee is $300. Uses what is typed, saved or not.">
          <SampleLoad drafts={drafts} />
        </PreviewBox>
      </div>
    </div>
  );
}

function SampleLoad({ drafts }: { drafts: Record<PaymentSide, PaymentMethod[]> }) {
  return (
    <div className="space-y-4">
      {LISTS.map((l) => (
        <div key={l.side}>
          <p data-es className="text-xs font-semibold text-gray-700">{l.title}</p>
          {drafts[l.side].length === 0 ? (
            <p data-es className="mt-1 text-xs text-gray-400">No options yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {drafts[l.side].map((m) => {
                const amount = Number.isFinite(m.feeAmount) ? m.feeAmount : 0;
                const fee = paymentFee({ feeType: m.feeType, feeAmount: amount }, feeBase(l.side, SAMPLE));
                return (
                  <li key={m.id} className="flex items-baseline justify-between gap-2 px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 truncate text-gray-800">{m.name || 'Unnamed option'}</span>
                    <span className="flex-shrink-0 text-right tabular-nums">
                      {m.feeType === 'none' ? (
                        <span data-es className="text-gray-400">No fee</span>
                      ) : (
                        <>
                          <span className="font-semibold text-gray-900">{usd(fee)}</span>
                          <span className="text-gray-400"> · {feeRateLabel({ feeType: m.feeType, feeAmount: amount })} · </span>
                          <span className="text-gray-600">{FEE_PAYER_LABEL[m.feePayer]} pays</span>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function MethodList({ side, title, blurb, percentOf, placeholder, initial, onDraft }: {
  side: PaymentSide;
  title: string;
  blurb: string;
  percentOf: string;
  placeholder: string;
  initial: PaymentMethod[];
  onDraft: (methods: PaymentMethod[]) => void;
}) {
  const [saved, setSaved]     = useState<PaymentMethod[]>(initial);
  const [draft, setDraft]     = useState<PaymentMethod[]>(initial);
  // Amounts are typed as strings so "2." survives under the cursor; the
  // number is worked out on save.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => amountStrings(initial));

  const current = draft.map((m) => ({ ...m, feeAmount: m.feeType === 'none' ? 0 : parseFloat(amounts[m.id] ?? '') }));
  const dirty = JSON.stringify(current) !== JSON.stringify(saved);
  const checked = validatePaymentMethods(current);
  const problem = dirty && 'error' in checked ? `${title}: ${checked.error}` : undefined;

  // The preview prices what is typed, so it has to hear about every keystroke.
  const currentKey = JSON.stringify(current);
  useEffect(() => { onDraft(current); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentKey]);

  function reset(to: PaymentMethod[]) {
    setDraft(to);
    setAmounts(amountStrings(to));
  }

  const { active } = useSaveBarEntry({
    dirty,
    problem,
    save: async () => {
      if ('error' in checked) throw new Error(checked.error);
      const previous = saved;
      await savePaymentMethods(side, checked.methods);
      setSaved(checked.methods);
      reset(checked.methods);
      return async () => { await savePaymentMethods(side, previous); setSaved(previous); reset(previous); };
    },
    discard: () => reset(saved),
  });

  function patch(id: string, changes: Partial<PaymentMethod>) {
    setDraft((d) => d.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }

  function add() {
    // A carrier's options are paid to the carrier, so a fee on one most often
    // comes out of the carrier's pay; a client's or our fee's, out of the
    // client's pocket.
    const m: PaymentMethod = { ...blankPaymentMethod(), feePayer: side === 'carrier' ? 'carrier' : 'client' };
    setDraft((d) => [...d, m]);
    setAmounts((a) => ({ ...a, [m.id]: '' }));
  }

  return (
    <SettingsCard
      title={title}
      description={blurb}
      aside={<span className="text-xs tabular-nums text-gray-400">{draft.length}</span>}
    >
      {draft.length === 0 ? (
        <EmptyState art="list" title="No options yet" body="Until one is added, the order form has nothing to offer here." />
      ) : (
        <div className="space-y-3">
          {draft.map((m) => (
            <div key={m.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label data-es className="mb-1 block text-xs font-medium text-gray-600">Name</label>
                  <input value={m.name} onChange={(e) => patch(m.id, { name: e.target.value })}
                    placeholder={placeholder} maxLength={60} className={INPUT} />
                </div>
                <button type="button" onClick={() => setDraft((d) => d.filter((x) => x.id !== m.id))}
                  className="mb-2 text-gray-400 transition hover:text-red-600"
                  aria-label={`Remove ${m.name || 'this payment method'}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label data-es className="mb-1 block text-xs font-medium text-gray-600">Fee</label>
                  <select value={m.feeType} onChange={(e) => patch(m.id, { feeType: e.target.value as FeeType })} className={INPUT}>
                    {FEE_TYPES.map((t) => <option key={t} value={t}>{FEE_TYPE_LABEL[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {m.feeType === 'percent' ? 'Percent' : 'Amount (USD)'}
                  </label>
                  {m.feeType === 'percent' ? (
                    <input type="number" min="0" max={100} step="0.01" value={amounts[m.id] ?? ''}
                      onChange={(e) => setAmounts((a) => ({ ...a, [m.id]: e.target.value }))}
                      placeholder="3" className={INPUT} />
                  ) : (
                    <MoneyInput disabled={m.feeType === 'none'} value={m.feeType === 'none' ? '' : (amounts[m.id] ?? '')}
                      onChange={(v) => setAmounts((a) => ({ ...a, [m.id]: v }))} placeholder="0.00" className={INPUT} />
                  )}
                </div>
                <div>
                  <label data-es className="mb-1 block text-xs font-medium text-gray-600">Paid by (default)</label>
                  <select value={m.feePayer} disabled={m.feeType === 'none'}
                    onChange={(e) => patch(m.id, { feePayer: e.target.value as FeePayer })} className={INPUT}>
                    {FEE_PAYERS.map((p) => <option key={p} value={p}>{FEE_PAYER_LABEL[p]}</option>)}
                  </select>
                </div>
              </div>
              {m.feeType === 'percent' && (
                <p className="mt-2 text-xs text-gray-500">A percentage of {percentOf} on each load.</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={draft.length >= 50}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
          <Plus className="h-4 w-4" /> <span data-es>Add an option</span>
        </button>
        {!active && dirty && (
          <button type="button" disabled={Boolean(problem)}
            onClick={() => { if ('methods' in checked) void savePaymentMethods(side, checked.methods).then(() => setSaved(checked.methods)); }}
            className="ml-auto rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save</button>
        )}
      </div>
    </SettingsCard>
  );
}

function amountStrings(methods: PaymentMethod[]): Record<string, string> {
  return Object.fromEntries(methods.map((m) => [m.id, m.feeType === 'none' ? '' : String(m.feeAmount)]));
}
