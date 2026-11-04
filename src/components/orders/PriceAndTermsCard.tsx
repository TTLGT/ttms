import {
  COMPLEX_LEGS,
  COMPLEX_LEG_LABEL,
  FEE_PAYER_LABEL,
  PAYMENT_SIDE_LABEL,
  feeBase,
  paymentFee,
  perMile,
  remainingBrokerFee,
  remainingCarrierPay,
  usd,
} from '@/types/paymentMethod';
import type { OrderPaymentTerms, PaymentSide } from '@/types/paymentMethod';
import { serviceChargeLines, serviceChargesTotal } from '@/types/order';
import type { Order } from '@/types/order';

type Props = Pick<Order, 'agreedRate' | 'brokerFee' | 'carrierPay' | 'laneMiles'
  | 'clientPayment' | 'carrierPayment' | 'brokerFeeTerms' | 'specialTerms' | 'complexTerms'
  | 'accessorials' | 'serviceCharges'>;

/** Zero reads as "not set" here, as it always has on this card. */
function money(n: number | null | undefined): string {
  return n ? usd(n) : '—';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm text-gray-900">{children}</div>
    </div>
  );
}

/**
 * The load's Price and Terms on the order page — BATS's block, read back.
 * Every terms line is the order's own copy of the option (see
 * OrderPaymentTerms), so it shows what the load was booked with even after
 * the option changes in Settings.
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
  const linehaul = Math.round(((order.agreedRate || 0) - servicesTotal) * 100) / 100;

  function terms(side: PaymentSide, t: OrderPaymentTerms | null | undefined) {
    return (
      <Row label={PAYMENT_SIDE_LABEL[side]}>
        {!t ? '—' : (
          <>
            {t.methodName}
            {t.feeType !== 'none' && (
              <span className="block text-xs text-gray-500 mt-0.5">
                Fee {usd(paymentFee(t, feeBase(side, bases)))}
                {t.feeType === 'percent' && ` (${t.feeAmount}%)`}
                {' · paid by '}{FEE_PAYER_LABEL[t.feePayer]}
              </span>
            )}
          </>
        )}
      </Row>
    );
  }

  return (
    <div id="price" className="bg-white rounded-xl border border-gray-200 p-6 scroll-mt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Price and Terms</h3>
        {action}
      </div>
      <p className="text-xs text-gray-500 mt-1 mb-4">
        Total mileage: {order.laneMiles ? Math.round(order.laneMiles).toLocaleString() : '—'}
        {' · '}Total PPM: {ppm !== null ? usd(ppm) : '—'}
        {' · '}Carrier pay PPM: {payPpm !== null ? usd(payPpm) : '—'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Row label="Agreed Rate">{money(order.agreedRate)}</Row>
        <Row label="Broker Fee">{money(order.brokerFee)}</Row>
        <Row label="Carrier Pay">{money(order.carrierPay)}</Row>
      </div>

      {services.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Services in the Agreed Rate</p>
          <p className="text-xs text-gray-500 mb-3">Part of the rate, not added to it. Not printed on any document.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {services.map((s, i) => (
              <div key={`${s.service}-${i}`} className="flex justify-between gap-4 border-b border-gray-100 py-1">
                <span className="text-gray-600">{s.label}</span>
                <span className={s.amount == null ? 'text-gray-400' : 'text-gray-900'}>
                  {s.amount == null ? 'No cost entered' : usd(s.amount)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Services: <span className="font-semibold text-gray-900">{usd(servicesTotal)}</span>
            {order.agreedRate > 0 && (
              <>{' · '}Linehaul (the rest of the rate): <span className="font-semibold text-gray-900">{usd(Math.max(0, linehaul))}</span></>
            )}
          </p>
          {order.agreedRate > 0 && linehaul < 0 && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The services add up to more than the Agreed Rate.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-100">
        {terms('client', order.clientPayment)}
        {!complex && terms('carrier', order.carrierPayment)}
        {!complex && terms('brokerFee', order.brokerFeeTerms)}
      </div>

      {order.specialTerms && (
        <div className="mt-6">
          <Row label="Special Terms">
            <p className="whitespace-pre-wrap">{order.specialTerms}</p>
          </Row>
        </div>
      )}

      {complex && (
        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Complex Payment Terms</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {COMPLEX_LEGS.map((leg) => (
              <div key={leg} className="flex justify-between gap-4 border-b border-gray-100 py-1">
                <span className="text-gray-600">{COMPLEX_LEG_LABEL[leg]}</span>
                <span className="text-gray-900">{money(complex[leg])}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
            {([
              ['Remaining Carrier Pay', remainingCarrierPay(complex, order.carrierPay)],
              ['Remaining Broker Fee', remainingBrokerFee(complex, order.brokerFee)],
            ] as const).map(([label, amount]) => (
              <div key={label}
                className={`rounded-lg border px-3 py-2 ${amount === 0 ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <span className="text-xs font-medium">{label}: </span>
                <span className="font-semibold">{usd(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
