import { feeRateLabel, paymentFee, usd } from './paymentMethod';
import type { ComplexTerms, OrderPaymentTerms } from './paymentMethod';

/**
 * What the client's load confirmation shows beyond the one-line lane: every
 * stop with its address, the freight line by line, and how the client pays.
 *
 * Copied onto the signing token when the agreement is sent, pre-formatted, and
 * never read back from the order — the same reason the rest of the token is a
 * snapshot: what the client signed must not shift if the order is edited
 * afterwards. Every field is optional on the page, because tokens sent before
 * these existed have none of them.
 */

export interface ConfirmationStop {
  kind: 'pickup' | 'delivery';
  /** The facility. Empty for a stop typed in with no party. */
  name: string;
  street: string;
  /** "Dallas, TX 75201". */
  place: string;
  /** "March 4 – 6, 2026", or '' when no date was given. */
  dates: string;
}

export interface ConfirmationFreight {
  description: string;
  quantity: string;
  dimensions: string;
  weight: string;
}

export interface ConfirmationPayment {
  /** How the client pays us — the order's chosen option. Null when none was chosen. */
  method: string | null;
  /** The fee the client pays for that option, written out. Null when there is none for them. */
  fee: string | null;
  /** For a load paid in more than one part: the client's parts only. */
  parts: { label: string; amount: string }[];
}

/**
 * The client's side of the money, and only that.
 *
 * The order's payment block mixes both sides — carrier pay terms, broker fee
 * terms, "carrier pays broker" — and none of that is the client's business;
 * carrier pay in particular is our margin. So this is a list of what to
 * include, not of what to leave out: a new field on the order stays off the
 * client's page until somebody decides it belongs there.
 *
 * `specialTerms` is deliberately absent. It is free text shared between both
 * sides of the load and is regularly about the carrier ("quick pay 2%"), so
 * nothing guarantees it is fit for the client to read.
 *
 * A fee the carrier or TTL absorbs is not shown: it changes nothing the client
 * pays.
 */
export function clientPaymentDetails(order: {
  agreedRate?: number;
  clientPayment?: OrderPaymentTerms | null;
  complexTerms?: ComplexTerms | null;
}): ConfirmationPayment {
  const t = order.clientPayment ?? null;
  let fee: string | null = null;
  if (t && t.feeType !== 'none' && t.feePayer === 'client') {
    const amount = paymentFee(t, order.agreedRate ?? 0);
    fee = t.feeType === 'percent'
      ? `${feeRateLabel(t)} ${t.methodName} fee (${usd(amount)}), paid by you`
      : `${t.methodName} fee of ${usd(amount)}, paid by you`;
  }

  const complex = order.complexTerms?.enabled ? order.complexTerms : null;
  const parts: ConfirmationPayment['parts'] = [];
  if (complex) {
    const legs: [keyof ComplexTerms, string][] = [
      ['customerPaysBroker', 'Payment to Total Transport Logistics'],
      ['customerPaysBroker2', 'Second payment to Total Transport Logistics'],
      ['customerPaysCarrier', 'Paid by you directly to the carrier'],
    ];
    for (const [key, label] of legs) {
      const amount = complex[key];
      if (typeof amount === 'number' && amount > 0) parts.push({ label, amount: usd(amount) });
    }
  }

  return { method: t?.methodName || null, fee, parts };
}
