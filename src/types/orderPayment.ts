/**
 * Whether the money on a load has moved — and therefore whether it can be
 * Completed.
 *
 * Completed means the load is finished for everybody: the client has paid and
 * the driver has been paid. Before 2026-10-29 it was a button anybody pressed
 * after Delivered; now the button waits for `paymentsMissing()` to be empty,
 * and the load moves to Completed by itself the moment the last payment is
 * recorded on a delivered load.
 *
 * Three marks, kept on the order as `paymentMarks` (server-kept — see
 * SERVER_KEPT_FIELDS in src/lib/orderWrites.ts):
 *
 * - `clientPaid` — the client paid. On an ordinary load that is us, recorded
 *   by staff with `orders.payments`. On a **COD** load the client pays the
 *   driver everything at the door, so the driver records it from their link.
 * - `driverPaid` — the driver (the carrier) has been paid. Recorded by the
 *   driver from their link or by staff, and **always with proof attached**:
 *   a screenshot of the transfer, a photo of the cheque, a PDF. On a COD load
 *   the driver was paid by the client, so the COD mark stands in for this one.
 * - `brokerPaid` — COD only: the carrier has handed us our share. Staff only;
 *   a driver saying "I paid the broker" is not us having been paid.
 *
 * Proof is an `orderFiles` record of kind `payment_proof`, named by id. A
 * mark's proof is never deleted with the mark: a payment taken back is
 * itself something the change log should be able to show the evidence for.
 */

import type { ComplexTerms, OrderPaymentTerms } from './paymentMethod';

export const PAYMENT_MARKS = ['clientPaid', 'driverPaid', 'brokerPaid'] as const;
export type PaymentMarkKey = (typeof PAYMENT_MARKS)[number];

export function isPaymentMarkKey(value: unknown): value is PaymentMarkKey {
  return typeof value === 'string' && (PAYMENT_MARKS as readonly string[]).includes(value);
}

export interface PaymentMark {
  /** Epoch milliseconds, like the driver's steps — the order travels as JSON. */
  at: number;
  /** Empty for the driver, who has no account. */
  byUid: string;
  byName: string;
  via: 'staff' | 'driver';
  /** `orderFiles` ids of kind `payment_proof`. */
  fileIds: string[];
  note: string;
}

export type PaymentMarks = Partial<Record<PaymentMarkKey, PaymentMark>>;

export const MAX_PAYMENT_NOTE = 300;
/** Proofs on one mark. A guard, not a quota. */
export const MAX_PROOF_FILES = 5;

/**
 * True when the client pays the carrier at delivery — the driver collects.
 *
 * Read from what the order already says rather than a new switch: BATS's
 * complex terms with money on the Customer Pays Carrier leg, or Carrier Pay
 * Terms whose name says COD ("COD - Cash", "COD Check"), which is how the
 * office has always written it. The name test is a word match, so
 * "Cash on delivery" spelled out does not count; name the option with COD.
 */
export function isCodLoad(order: {
  complexTerms?: ComplexTerms | null;
  carrierPayment?: OrderPaymentTerms | null;
}): boolean {
  const t = order.complexTerms;
  if (t?.enabled && (t.customerPaysCarrier ?? 0) > 0) return true;
  return /\bCOD\b/i.test(order.carrierPayment?.methodName ?? '');
}

/**
 * What the driver collects at the door on a COD load, when the order says —
 * the Customer Pays Carrier leg. Null when it is not written down; the driver
 * page then says only that it is COD.
 */
export function codAmount(order: { complexTerms?: ComplexTerms | null }): number | null {
  const t = order.complexTerms;
  return t?.enabled && (t.customerPaysCarrier ?? 0) > 0 ? t.customerPaysCarrier : null;
}

/** Which marks a load needs before it is Completed, in the order they happen. */
export function requiredMarks(cod: boolean): PaymentMarkKey[] {
  return cod ? ['clientPaid', 'brokerPaid'] : ['clientPaid', 'driverPaid'];
}

/**
 * The marks still missing. Empty means the money is settled and the load may
 * be Completed. The single definition — the order-write guard, the auto-move
 * and the button all ask this.
 */
export function paymentsMissing(order: {
  complexTerms?: ComplexTerms | null;
  carrierPayment?: OrderPaymentTerms | null;
  paymentMarks?: PaymentMarks | null;
}): PaymentMarkKey[] {
  const marks = order.paymentMarks ?? {};
  return requiredMarks(isCodLoad(order)).filter((k) => !marks[k]);
}

/** Who may record a mark. The driver's link offers only what is theirs to say. */
export function driverMayRecord(key: PaymentMarkKey, cod: boolean): boolean {
  if (key === 'brokerPaid') return false;
  // An ordinary client pays us, which a driver cannot see.
  if (key === 'clientPaid') return cod;
  // On COD the client's payment at the door *is* the driver's pay, so the
  // driver records that one, and a second "I got paid" would say it twice.
  return !cod;
}

/** Whether a mark must carry a proof file. Paying a driver always does. */
export function proofRequired(key: PaymentMarkKey, via: 'staff' | 'driver'): boolean {
  return key === 'driverPaid' || via === 'driver';
}

export function paymentMarkLabel(key: PaymentMarkKey, cod: boolean): string {
  if (key === 'clientPaid') return cod ? 'Client paid the driver (COD)' : 'Client paid us';
  if (key === 'driverPaid') return 'Driver paid';
  return 'Broker paid (carrier paid our share)';
}

/** "Waiting on: client paid us, driver paid" — for a disabled Completed button. */
export function missingSentence(missing: PaymentMarkKey[], cod: boolean): string {
  if (!missing.length) return '';
  return `Completed waits on payment: ${missing.map((k) => paymentMarkLabel(k, cod).toLowerCase()).join(', ')}. Record it in the Payments card.`;
}
