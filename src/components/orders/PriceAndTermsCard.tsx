import Link from 'next/link';
import {
  COMPLEX_LEGS,
  FEE_PAYER_LABEL,
  PAYMENT_SIDE_LABEL,
  feeBase,
  paymentFee,
  perMile,
  remainingBrokerFee,
  remainingCarrierPay,
  usd,
} from '@/types/paymentMethod';
import type { ComplexLeg, OrderPaymentTerms, PaymentSide } from '@/types/paymentMethod';
import { SERVICE_ARRANGER_LABEL, arrangerNote, notOurCharge, serviceChargeLines, serviceChargesTotal } from '@/types/order';
import type { Order } from '@/types/order';
import { Bi } from '@/components/spanish/Es';
import { ArrowRight, Banknote, CircleCheck, DollarSign, FileText, Route, TriangleAlert, Wrench } from 'lucide-react';
import { SectionHeading } from './OrderSection';
import { Hint, PartHeading } from './DetailBits';

type Props = Pick<Order, 'agreedRate' | 'brokerFee' | 'carrierPay' | 'laneMiles'
  | 'clientPayment' | 'carrierPayment' | 'brokerFeeTerms' | 'specialTerms' | 'complexTerms'
  | 'accessorials' | 'serviceCharges'>;

/** Zero reads as "not set" here, as it always has on this card. */
function money(n: number | null | undefined): string {
  return n ? usd(n) : '—';
}

/*
 * The complex legs drawn as who pays whom. The labels in COMPLEX_LEG_LABEL
 * ("Customer Pays Broker") are BATS's and stay as the form's wording; here
 * the same leg is split into its two ends so the eye can follow the money
 * without reading a sentence per row.
 */
const LEG_ENDS: Record<ComplexLeg, { from: string; to: string; note?: string }> = {
  customerPaysBroker:  { from: 'Customer', to: 'Broker' },
  customerPaysBroker2: { from: 'Customer', to: 'Broker', note: '2nd payment' },
  customerPaysCarrier: { from: 'Customer', to: 'Carrier' },
  carrierPaysBroker:   { from: 'Carrier',  to: 'Broker' },
  brokerPaysCarrier:   { from: 'Broker',   to: 'Carrier' },
};

const PARTY_CHIP: Record<string, string> = {
  Customer: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Broker:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  Carrier:  'bg-violet-50 text-violet-700 border-violet-200',
};

function PartyChip({ who }: { who: string }) {
  return (
    <span data-es className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${PARTY_CHIP[who]}`}>{who}</span>
  );
}

/*
 * One of the three headline numbers, as a box in the money's flow: client →
 * TTL → carrier. Class strings written out in full so Tailwind finds them.
 */
const NODE = {
  indigo:  { box: 'border-indigo-200 bg-indigo-50',   ink: 'text-indigo-700' },
  emerald: { box: 'border-emerald-200 bg-emerald-50', ink: 'text-emerald-700' },
  violet:  { box: 'border-violet-200 bg-violet-50',   ink: 'text-violet-700' },
};

function FlowNode({ label, sub, value, extra, tone }: {
  label: string; sub: string; value: string; extra?: string | null; tone: keyof typeof NODE;
}) {
  return (
    <div className={`min-w-0 rounded-xl border px-4 py-3 text-center ${NODE[tone].box}`}>
      <p data-es className={`text-[11px] font-semibold uppercase tracking-wide ${NODE[tone].ink}`}>{label}</p>
      <p data-es className="text-xs text-gray-500">{sub}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-gray-900">{value}</p>
      {extra && <p className="text-xs tabular-nums text-gray-500">{extra}</p>}
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center text-gray-400" aria-hidden>
      <ArrowRight className="h-5 w-5 rotate-90 sm:rotate-0" />
    </div>
  );
}

/** "TTL", "the carrier" — who arranged a service, as it reads inside a sentence. */
function arrangerInSentence(label: string): string {
  return label === 'TTL' ? 'TTL' : `the ${label.toLowerCase()}`;
}

/**
 * The load's Price and Terms on the order page — BATS's block, read back.
 * Every terms line is the order's own copy of the option (see
 * OrderPaymentTerms), so it shows what the load was booked with even after
 * the option changes in Settings.
 *
 * Laid out (2026-11-11, chosen by the office from a set of drafts) as the
 * money's path first — what the client pays, what TTL keeps, what the
 * carrier gets — with a bar showing how the rate splits and the mileage under
 * it, each service said as a sentence, then how each side is paid. The
 * wording that explains how services print is folded behind a Hint.
 */
export default function PriceAndTermsCard({ order, action }: {
  order: Props;
  /** Drawn at the right of the heading — the order page's per-section Edit. */
  action?: React.ReactNode;
}) {
  const bases = { agreedRate: order.agreedRate, carrierPay: order.carrierPay, brokerFee: order.brokerFee };
  const complex = order.complexTerms?.enabled ? order.complexTerms : null;
  const ppm = perMile(order.agreedRate, order.laneMiles);
  const payPpm = perMile(order.carrierPay, order.laneMiles);
  const services = serviceChargeLines(order);
  const servicesTotal = serviceChargesTotal(services);

  const rate = order.agreedRate || 0;
  const pay = order.carrierPay || 0;
  const fee = order.brokerFee || 0;
  const margin = rate > 0 && fee > 0 ? Math.round((fee / rate) * 1000) / 10 : null;
  // The bar shows the parts against each other, so it is drawn only when
  // there are at least two of them to compare.
  const parts = [
    { key: 'carrier', label: 'Carrier pay', amount: pay, cls: 'bg-violet-500' },
    { key: 'fee', label: 'Broker fee', amount: fee, cls: 'bg-emerald-500' },
    { key: 'services', label: 'Services', amount: servicesTotal, cls: 'bg-amber-400' },
  ].filter((p) => p.amount > 0);
  const partsTotal = parts.reduce((s, p) => s + p.amount, 0);

  function terms(side: PaymentSide, t: OrderPaymentTerms | null | undefined) {
    return (
      <div className="rounded-xl border border-gray-200 px-4 py-3">
        <p data-es className="text-xs text-gray-500">{PAYMENT_SIDE_LABEL[side]}</p>
        <p className="mt-0.5 text-sm font-semibold text-gray-900">{t ? t.methodName : '—'}</p>
        {t && t.feeType !== 'none' && (
          <p className="mt-1 text-xs text-gray-500">
            Fee <span className="font-medium text-gray-700">{usd(paymentFee(t, feeBase(side, bases)))}</span>
            {t.feeType === 'percent' && ` (${t.feeAmount}%)`}
            {' · paid by '}{FEE_PAYER_LABEL[t.feePayer]}
          </p>
        )}
      </div>
    );
  }

  const usedLegs = complex ? COMPLEX_LEGS.filter((leg) => complex[leg]) : [];

  return (
    <div id="price" className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 scroll-mt-4">
      <SectionHeading icon={DollarSign} tone="emerald" title="Price and Terms" action={action}
        summary={[
          `Rate ${money(order.agreedRate)}${ppm !== null ? ` (${usd(ppm)}/mi)` : ''}`,
          `Fee ${money(order.brokerFee)}${margin !== null ? ` (${margin}%)` : ''}`,
          `Carrier ${money(order.carrierPay)}`,
          servicesTotal > 0 ? `Services ${usd(servicesTotal)}` : '',
          order.clientPayment ? `Client pays by ${order.clientPayment.methodName}` : '',
        ].filter(Boolean).join(' | ')} />

      {/* The money's path, left to right: what the client pays, what TTL
          keeps, what the carrier gets. Stacked top to bottom on a phone. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        <FlowNode tone="indigo" label="Agreed Rate" sub="What the client pays" value={money(order.agreedRate)}
          extra={ppm !== null ? `${usd(ppm)} / mi` : null} />
        <FlowArrow />
        <FlowNode tone="emerald" label="Broker Fee" sub="What TTL keeps" value={money(order.brokerFee)}
          extra={margin !== null ? `${margin}% of the rate` : null} />
        <FlowArrow />
        <FlowNode tone="violet" label="Carrier Pay" sub="What the carrier gets" value={money(order.carrierPay)}
          extra={payPpm !== null ? `${usd(payPpm)} / mi` : null} />
      </div>

      {parts.length > 1 && (
        <div className="mt-4">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100" role="img"
            aria-label={parts.map((p) => `${p.label} ${usd(p.amount)}`).join(', ')}>
            {parts.map((p) => (
              <span key={p.key} className={`${p.cls} h-full`} style={{ width: `${(p.amount / partsTotal) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {parts.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${p.cls}`} />
                <span data-es>{p.label}</span>
                <span className="font-medium tabular-nums text-gray-700">{Math.round((p.amount / partsTotal) * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500">
        <Route className="h-3.5 w-3.5" />
        {order.laneMiles
          ? <>Total mileage <span className="font-medium tabular-nums text-gray-700">{Math.round(order.laneMiles).toLocaleString()} mi</span></>
          : <span data-es>No distance yet, so no per-mile figures</span>}
      </p>

      {/* Each service said as one sentence. Yellow while something is
          missing — nobody chosen to arrange it, or TTL's cost not entered —
          so the gap reads as a gap. */}
      {services.length > 0 && (
        <div className="mt-4 space-y-2">
          {services.map((s, i) => {
            const ours = !notOurCharge(s.arrangedBy);
            const missing = !s.arrangedBy || (ours && s.amount == null);
            const provider = s.providerId ? (
              <Link href={`/dashboard/providers/${s.providerId}`} className="font-medium text-brand-600 hover:underline">
                {s.providerName || 'the provider'}
              </Link>
            ) : null;
            return (
              <div key={`${s.service}-${i}`}
                className={`flex gap-2 rounded-xl border px-3 py-2.5 text-sm ${missing ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-200 bg-gray-50 text-gray-800'}`}>
                <Wrench className={`mt-0.5 h-4 w-4 shrink-0 ${missing ? 'text-amber-600' : 'text-gray-400'}`} />
                <p className="min-w-0">
                  <strong className="font-semibold">{s.label}</strong>
                  {!s.arrangedBy ? (
                    <>. Nobody is chosen to arrange it yet.</>
                  ) : !ours ? (
                    <>: {arrangerNote(s.arrangedBy)}{provider && <>, with {provider}</>}.</>
                  ) : (
                    <>
                      , arranged by {arrangerInSentence(SERVICE_ARRANGER_LABEL[s.arrangedBy])}
                      {provider && <> with {provider}</>}.{' '}
                      {s.amount == null
                        ? <>No cost entered yet, so it adds {usd(0)} to the rate.</>
                        : <>Adds <span className="font-semibold tabular-nums">{usd(s.amount)}</span> to the rate.</>}
                    </>
                  )}
                </p>
              </div>
            );
          })}
          {services.length > 1 && (
            <p className="text-xs text-gray-500">
              Additional services: <span className="font-semibold tabular-nums text-gray-900">{usd(servicesTotal)}</span>
            </p>
          )}
          <Hint label="How services show to the client">
            <Bi>Included in the Agreed Rate, and listed one by one on the client&apos;s SA and invoice. Carrier pay and the
            broker fee are shown to the client together, as Freight Transportation.</Bi>
          </Hint>
        </div>
      )}

      <div className="mt-6 border-t border-gray-100 pt-5">
        <PartHeading icon={Banknote} title="How it is paid" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {terms('client', order.clientPayment)}
          {!complex && terms('carrier', order.carrierPayment)}
          {!complex && terms('brokerFee', order.brokerFeeTerms)}
        </div>

        {order.specialTerms && (
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p data-es className="flex items-center gap-1.5 text-xs text-gray-500"><FileText className="h-3.5 w-3.5" />Special Terms</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{order.specialTerms}</p>
          </div>
        )}
      </div>

      {complex && (
        <div className="mt-6 border-t border-gray-100 pt-5">
          <PartHeading title="Complex Payment Terms" />
          {usedLegs.length ? (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {usedLegs.map((leg) => (
                <li key={leg} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <PartyChip who={LEG_ENDS[leg].from} />
                  <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                  <PartyChip who={LEG_ENDS[leg].to} />
                  {LEG_ENDS[leg].note && <span data-es className="text-xs text-gray-500">{LEG_ENDS[leg].note}</span>}
                  <span className="ml-auto text-sm font-semibold tabular-nums text-gray-900">{money(complex[leg])}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p data-es className="text-sm text-gray-400">No payments entered.</p>
          )}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([
              ['Remaining Carrier Pay', remainingCarrierPay(complex, order.carrierPay)],
              ['Remaining Broker Fee', remainingBrokerFee(complex, order.brokerFee)],
            ] as const).map(([label, amount]) => (
              <div key={label}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 ${amount === 0 ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                  {amount === 0 ? <CircleCheck className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
                  <span data-es>{label}</span>
                </span>
                <span className="font-semibold tabular-nums">{usd(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
