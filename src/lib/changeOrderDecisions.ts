import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from './firebase-admin';
import { canSeeOrder } from './accessControl';
import { postOrderAlert } from './chatAlerts';
import { actorOf, sameValue, writeChange } from './recordHistory';
import type { Caller } from './partyAccess';
import { updateOrderAsCaller } from './orderWrites';
import { canApplyOrderChanges, changeOrderRef, serializeChangeOrder } from './changeOrders';
import { affectsLabel, MAX_CHANGE_ORDER_REASON, type ChangeOrder } from '@/types/changeOrder';

/**
 * Deciding a change order — see src/types/changeOrder.ts. Kept apart from
 * changeOrders.ts because approving goes through updateOrderAsCaller(), which
 * imports that file for its gate.
 */

export function cleanNote(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_CHANGE_ORDER_REASON) : '';
}

/** Fields whose value on the load is no longer what the change order was asked against. */
function movedFields(order: Record<string, unknown>, base: Record<string, unknown>): string[] {
  return Object.keys(base).filter((f) => !sameValue(order[f] ?? null, base[f] ?? null));
}

/** The load's current change order, for its page. Null when there has never been one. */
export async function changeOrderForOrder(orderId: string, order: Record<string, unknown>): Promise<ChangeOrder | null> {
  const snap = await changeOrderRef(orderId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const co = serializeChangeOrder(d);
  if (co.status === 'pending') co.stale = movedFields(order, (d.base ?? {}) as Record<string, unknown>).length > 0;
  return co;
}

/**
 * - `approve` — saves the broker's patch as the approver, through the same
 *   updateOrderAsCaller() every edit uses, so the holds, the reopened reviews
 *   and the change log all happen exactly as if dispatch had typed it. The
 *   change order is marked approved in that same batch, conditioned on the
 *   document not having moved since it was read: two approvers pressing at
 *   once apply it once.
 * - `reject` — with a note for the broker. Nothing on the load moves.
 * - `withdraw` — the broker's own, while it is still waiting.
 */
export async function decideChangeOrder(
  caller: Caller,
  orderId: string,
  action: 'approve' | 'reject' | 'withdraw',
  note: string,
): Promise<ChangeOrder> {
  const coRef = changeOrderRef(orderId);
  const orderRef = adminDb.collection('orders').doc(orderId);
  const [coSnap, orderSnap] = await Promise.all([coRef.get(), orderRef.get()]);
  if (!coSnap.exists || !orderSnap.exists) throw new AdminAuthError('Change order not found', 404);
  const d = coSnap.data()!;
  const order = orderSnap.data()!;
  if (d.status !== 'pending') {
    throw new AdminAuthError(`This change order was already ${d.status === 'rejected' ? 'turned down' : d.status}.`, 409);
  }
  if (!canSeeOrder(order, caller.uid, caller.profile)) {
    throw new AdminAuthError('You do not have access to this order', 403);
  }
  const requester = String(d.requestedByName ?? 'the broker');
  const affects = affectsLabel(Array.isArray(d.affects) ? d.affects : []);
  const now = Timestamp.now();

  if (action === 'withdraw') {
    if (d.requestedByUid !== caller.uid) throw new AdminAuthError('Only the person who asked can withdraw a change order.', 403);
    const batch = adminDb.batch();
    batch.update(coRef, { status: 'withdrawn', decidedByUid: caller.uid, decidedByName: caller.displayName, decidedAt: now }, { lastUpdateTime: coSnap.updateTime });
    writeChange(batch, orderRef, { action: 'event', summary: 'Withdrew the change order' }, actorOf(caller), now);
    await batch.commit();
    await postOrderAlert(orderId, `${caller.displayName} withdrew their change order.`).catch(() => {});
  } else {
    if (!canApplyOrderChanges(caller)) {
      throw new AdminAuthError('Only admin and dispatch decide change orders.', 403);
    }
    const decided = { decidedByUid: caller.uid, decidedByName: caller.displayName, decidedAt: now, decisionNote: note };

    if (action === 'reject') {
      if (!note) throw new AdminAuthError('Say why, so the broker knows what to do instead.', 400);
      const batch = adminDb.batch();
      batch.update(coRef, { status: 'rejected', ...decided }, { lastUpdateTime: coSnap.updateTime });
      writeChange(batch, orderRef, { action: 'event', summary: `Turned down ${requester}’s change order: ${note}` }, actorOf(caller), now);
      await batch.commit();
      await postOrderAlert(orderId, `${caller.displayName} turned down ${requester}’s change order: ${note}`).catch(() => {});
    } else {
      // Somebody saved over the same fields since: approving would quietly
      // undo their change. Refused, so the broker asks again from the load as it is.
      const moved = movedFields(order, (d.base ?? {}) as Record<string, unknown>);
      if (moved.length) {
        throw new AdminAuthError('The load has changed since this was asked, in the same fields. Turn it down and ask the broker to submit it again from the load as it is now.', 409);
      }
      const reason = String(d.reason ?? '');
      await updateOrderAsCaller(caller, orderId, (d.patch ?? {}) as Record<string, unknown>, {
        summary: `Approved ${requester}’s change order${reason ? ` (“${reason}”)` : ''}${note ? `. Note: ${note}` : ''}.`,
        inBatch: (batch) => batch.update(coRef, { status: 'approved', ...decided }, { lastUpdateTime: coSnap.updateTime }),
      });
      await postOrderAlert(orderId,
        `${caller.displayName} approved ${requester}’s change order. The load is updated, and ${affects} needs sending again.${note ? ` Note: ${note}` : ''}`,
      ).catch(() => {});
    }
  }

  return serializeChangeOrder((await coRef.get()).data()!);
}

/**
 * The Approvals list. `incoming` is every waiting change order for somebody who can
 * decide them — limited to loads they can see, because a change order shows
 * the load's rates — and nothing for anybody else, so the nav badge costs a
 * broker no more than a query. `outgoing` is the caller's own.
 */
export async function listChangeOrders(caller: Caller, box: 'incoming' | 'outgoing'): Promise<ChangeOrder[]> {
  const col = adminDb.collection('changeOrders');
  if (box === 'outgoing') {
    // Single-field queries only, indexed automatically.
    const snap = await col.where('requestedByUid', '==', caller.uid).get();
    return snap.docs.map((s) => serializeChangeOrder(s.data()))
      .sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''));
  }
  if (!canApplyOrderChanges(caller)) return [];
  // Waiting ones only: the nav badge runs this on every page load, so it
  // reads what is waiting and the loads they are on, and nothing decided —
  // those stay on the load itself and its Change log.
  const snap = await col.where('status', '==', 'pending').limit(100).get();
  if (snap.empty) return [];
  const orders = await adminDb.getAll(...snap.docs.map((s) => adminDb.collection('orders').doc(s.id)));
  const byId = new Map(orders.map((o) => [o.id, o.data()]));
  return snap.docs.flatMap((s) => {
    const order = byId.get(s.id);
    if (!order || !canSeeOrder(order, caller.uid, caller.profile)) return [];
    const co = serializeChangeOrder(s.data());
    if (co.status === 'pending') co.stale = movedFields(order, (s.data().base ?? {}) as Record<string, unknown>).length > 0;
    return [co];
  }).sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''));
}
