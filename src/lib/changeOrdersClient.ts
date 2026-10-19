import { auth } from './firebase';
import { encodeRecordPatch } from './recordWire';
import type { ChangeOrder, ChangeOrderAffects } from '@/types/changeOrder';

/**
 * The browser half of change orders — see src/types/changeOrder.ts.
 *
 * Every order edit goes through saveOrderPatch() in src/lib/orders.ts. When
 * the server answers that the edit needs a change order, that function asks
 * here for a reason — through whichever <ChangeOrderPrompt> the dashboard
 * layout mounted — and, given one, submits the same patch as a change order.
 * Doing it at that one choke point is what lets every edit screen get the
 * box without each of them learning about change orders.
 */

/** Fired on window when a change order is filed, with `{ orderId }`. */
export const CHANGE_ORDER_EVENT = 'ttms:change-order';

/** Thrown by an order save that became a change order rather than a save. */
export class ChangeOrderSubmitted extends Error {
  constructor() {
    super('Sent to dispatch as a change order. The load changes once it is approved.');
    this.name = 'ChangeOrderSubmitted';
  }
}

type Asker = (affects: ChangeOrderAffects[], message: string) => Promise<string | null>;
let asker: Asker | null = null;

/** The prompt registers itself while mounted. */
export function registerChangeOrderPrompt(fn: Asker | null) {
  asker = fn;
}

/** A reason, or null when the person cancelled (or nothing is mounted to ask). */
export function askForChangeOrderReason(affects: ChangeOrderAffects[], message: string): Promise<string | null> {
  return asker ? asker(affects, message) : Promise.resolve(null);
}

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function submitChangeOrder(orderId: string, patch: Record<string, unknown>, reason: string): Promise<boolean> {
  const r = await call<{ changeOrder: boolean }>(`/api/orders/${orderId}/change-order`, {
    method: 'POST',
    body: JSON.stringify({ patch: encodeRecordPatch(patch), reason }),
  });
  // The load's page shows the change order it just gained without each edit
  // screen having to tell it — see ChangeOrderPanel.
  if (r.changeOrder && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_ORDER_EVENT, { detail: { orderId } }));
  }
  return r.changeOrder;
}

export async function getChangeOrder(orderId: string): Promise<{ changeOrder: ChangeOrder | null; canDecide: boolean; uid: string }> {
  return call(`/api/orders/${orderId}/change-order`);
}

export async function decideChangeOrder(
  orderId: string,
  action: 'approve' | 'reject' | 'withdraw',
  note = '',
): Promise<ChangeOrder> {
  return (await call<{ changeOrder: ChangeOrder }>(`/api/orders/${orderId}/change-order`, {
    method: 'PATCH',
    body: JSON.stringify({ action, note }),
  })).changeOrder;
}

export async function listChangeOrders(box: 'incoming' | 'outgoing'): Promise<ChangeOrder[]> {
  return (await call<{ changeOrders: ChangeOrder[] }>(`/api/change-orders?box=${box}`)).changeOrders;
}
