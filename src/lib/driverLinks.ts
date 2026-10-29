'use client';

import { auth } from './firebase';
import type { DriverLinkInfo } from '@/types/driverLink';
import type { PaymentMarkKey } from '@/types/orderPayment';
import type { OrderStatus } from '@/types/order';

/**
 * The order screen's side of the driver link and of payments. Both are
 * server-kept on the order; see src/lib/driverLinksServer.ts and
 * src/lib/orderPaymentsServer.ts.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function getDriverLink(orderId: string): Promise<{ link: DriverLinkInfo | null; cannotMake: string }> {
  const res = await fetch(`/api/orders/${orderId}/driver-link`, { headers: await authHeaders() });
  return unwrap(res);
}

/** A new link, switching the old one off — or with `email`, emails the live one (making it if needed). */
export async function sendDriverLink(orderId: string, opts: { create?: boolean; email?: string }): Promise<DriverLinkInfo> {
  const res = await fetch(`/api/orders/${orderId}/driver-link`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(opts.email ? { action: 'email', email: opts.email } : { action: opts.create ? 'create' : 'ensure' }),
  });
  return (await unwrap<{ link: DriverLinkInfo }>(res)).link;
}

export async function revokeDriverLink(orderId: string): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/driver-link`, { method: 'DELETE', headers: await authHeaders() });
  await unwrap(res);
}

export async function recordPayment(
  orderId: string,
  mark: PaymentMarkKey,
  fileIds: string[],
  note: string,
): Promise<{ status: OrderStatus }> {
  const res = await fetch(`/api/orders/${orderId}/payments`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ mark, fileIds, note }),
  });
  return unwrap(res);
}

export async function undoPayment(orderId: string, mark: PaymentMarkKey): Promise<{ status: OrderStatus }> {
  const res = await fetch(`/api/orders/${orderId}/payments?mark=${mark}`, { method: 'DELETE', headers: await authHeaders() });
  return unwrap(res);
}
