import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from './firebase-admin';
import { writeChange, type ChangeActor } from './recordHistory';
import { postOrderAlert, statusAlert } from './chatAlerts';
import { ORDER_FILES_COLLECTION } from '@/types/orderFile';
import {
  MAX_PAYMENT_NOTE,
  MAX_PROOF_FILES,
  isCodLoad,
  paymentMarkLabel,
  paymentsMissing,
  proofRequired,
  type PaymentMark,
  type PaymentMarkKey,
  type PaymentMarks,
} from '@/types/orderPayment';
import type { OrderStatus } from '@/types/order';

/**
 * Recording payments on a load, server-side — see src/types/orderPayment.ts.
 * The driver's own marks are written by src/lib/driverLinksServer.ts; both
 * ask settlementStatus() what the status becomes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;

/**
 * The status a load moves to once its marks are `marks`, or null for no move.
 *
 * - Delivered with nothing missing → Completed, by itself: the last payment
 *   landing is the event Completed is waiting for, and a button nobody
 *   remembers to press would leave paid loads looking open.
 * - Completed with something missing again (a mark taken back) → Delivered,
 *   since Completed would no longer be true.
 */
export function settlementStatus(order: Data, marks: PaymentMarks): OrderStatus | null {
  const missing = paymentsMissing({ ...order, paymentMarks: marks });
  if (order.status === 'delivered' && missing.length === 0) return 'completed';
  if (order.status === 'completed' && missing.length > 0) return 'delivered';
  return null;
}

/**
 * Records one payment, by a staff member with `orders.payments`. Proof is
 * named by `orderFiles` id — uploaded first through the ordinary files route
 * as kind `payment_proof` — and every id is checked to be exactly that, on
 * this load.
 */
export async function markPayment(
  orderId: string,
  order: Data,
  key: PaymentMarkKey,
  fileIds: string[],
  note: string,
  actor: ChangeActor,
): Promise<{ status: OrderStatus }> {
  const cod = isCodLoad(order);
  // Broker Paid is the carrier handing back our share, which only happens
  // when the client paid the carrier. Driver Paid is allowed on COD too: a
  // load whose COD fell short and that we topped up is still that.
  if (key === 'brokerPaid' && !cod) {
    throw new AdminAuthError('Broker Paid is only for COD loads, where the client pays the driver.', 400);
  }
  if (order.paymentMarks?.[key]) {
    throw new AdminAuthError('That payment is already recorded. Undo it first to record it again.', 409);
  }
  const ids = [...new Set(fileIds)].slice(0, MAX_PROOF_FILES);
  if (proofRequired(key, 'staff') && !ids.length) {
    throw new AdminAuthError('Attach proof of the payment first — a transfer screenshot, a cheque, a receipt.', 400);
  }
  const files = await Promise.all(ids.map((id) => adminDb.collection(ORDER_FILES_COLLECTION).doc(id).get()));
  if (files.some((f) => !f.exists || f.data()?.orderId !== orderId || f.data()?.kind !== 'payment_proof')) {
    throw new AdminAuthError('A proof file is missing or belongs to another load. Upload it again.', 400);
  }

  const now = Timestamp.now();
  const mark: PaymentMark = {
    at: now.toMillis(), byUid: actor.uid, byName: actor.name, via: 'staff',
    fileIds: ids, note: note.trim().slice(0, MAX_PAYMENT_NOTE),
  };
  const marks = { ...(order.paymentMarks ?? {}), [key]: mark };
  const next = settlementStatus(order, marks);

  const ref = adminDb.collection('orders').doc(orderId);
  const batch = adminDb.batch();
  batch.update(ref, {
    [`paymentMarks.${key}`]: mark,
    updatedAt: now,
    ...(next ? { status: next } : {}),
  });
  writeChange(batch, ref, {
    action:  'event',
    summary: `Recorded: ${paymentMarkLabel(key, cod)}${ids.length ? `, with ${ids.length} proof file${ids.length === 1 ? '' : 's'}` : ''}${mark.note ? ` — ${mark.note}` : ''}`,
    fields:  next ? [{ field: 'status', from: order.status, to: next }] : [],
  }, actor, now);
  await batch.commit();
  await postOrderAlert(orderId, `${paymentMarkLabel(key, cod)}: recorded.`).catch(() => {});
  if (next) await postOrderAlert(orderId, statusAlert(next)).catch(() => {});
  return { status: next ?? order.status };
}

/**
 * Takes a payment back. The proof files stay on the load — a payment
 * recorded and then undone is something somebody will ask about.
 */
export async function clearPayment(
  orderId: string,
  order: Data,
  key: PaymentMarkKey,
  actor: ChangeActor,
): Promise<{ status: OrderStatus }> {
  if (!order.paymentMarks?.[key]) return { status: order.status };
  const cod = isCodLoad(order);
  const marks: PaymentMarks = { ...(order.paymentMarks ?? {}) };
  delete marks[key];
  const next = settlementStatus(order, marks);
  const now = Timestamp.now();
  const ref = adminDb.collection('orders').doc(orderId);
  const batch = adminDb.batch();
  batch.update(ref, {
    [`paymentMarks.${key}`]: FieldValue.delete(),
    updatedAt: now,
    ...(next ? { status: next } : {}),
  });
  writeChange(batch, ref, {
    action:  'event',
    summary: `Undid: ${paymentMarkLabel(key, cod)}`,
    fields:  next ? [{ field: 'status', from: order.status, to: next }] : [],
  }, actor, now);
  await batch.commit();
  if (next) await postOrderAlert(orderId, statusAlert(next)).catch(() => {});
  return { status: next ?? order.status };
}
