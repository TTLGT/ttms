import type { DocumentData } from 'firebase-admin/firestore';
import { adminDb, AdminAuthError } from './firebase-admin';
import { can } from './accessControl';
import type { Caller } from './partyAccess';
import { effectivePermissions } from '@/types/permission';
import { affectsLabel, type ChangeOrder, type ChangeOrderAffects } from '@/types/changeOrder';

/**
 * The server half of change orders — see src/types/changeOrder.ts for the
 * arrangement. This file holds what updateOrderAsCaller() needs (the gate);
 * deciding one lives in changeOrderDecisions.ts, which calls back into
 * orderWrites and so cannot be imported by it.
 */

export const CHANGE_ORDERS_COLLECTION = 'changeOrders';

export function changeOrderRef(orderId: string) {
  return adminDb.collection(CHANGE_ORDERS_COLLECTION).doc(orderId);
}

/** May save a change to a sent agreement directly, and decide other people's change orders. */
export function canApplyOrderChanges(caller: Pick<Caller, 'profile'>): boolean {
  /*
   * The role's own bundle as well as the mirrored list. The permission was
   * added to dispatch on 2026-10-19, and a dispatcher's mirrored list only
   * gains it at their next sign-in (or /api/admin/users/sync). Without this,
   * every dispatcher still signed in would have been told to file a change
   * order for their own edits — and could not have approved one. Role flags
   * only, never wider: the result is exactly what the mirror will hold.
   */
  return can(caller.profile, 'orders.applyChanges')
    || (caller.profile ? effectivePermissions(caller.profile, []).includes('orders.applyChanges') : false);
}

/**
 * Thrown by updateOrderAsCaller() when the caller must ask instead. The PATCH
 * route turns it into `{ needsChangeOrder: true, affects }`, which is what the
 * browser listens for to offer the change-order box.
 */
export class ChangeOrderNeeded extends AdminAuthError {
  affects: ChangeOrderAffects[];
  constructor(affects: ChangeOrderAffects[]) {
    super(CHANGE_ORDER_NEEDED(affects), 409);
    this.affects = affects;
  }
}

export const CHANGE_ORDER_NEEDED = (affects: ChangeOrderAffects[]) =>
  `This changes ${affectsLabel(affects)}, which has already been sent. Submit it as a change order for dispatch to approve.`;

/** The one-line summary written on the change log and in the room. */
export function changeOrderSummary(byName: string, reason: string, affects: ChangeOrderAffects[]): string {
  return `${byName} submitted a change order touching ${affectsLabel(affects)}${reason ? `: ${reason}` : ''}`;
}

/** A change order as the screens read it. Timestamps as ISO strings. */
export function serializeChangeOrder(d: DocumentData): ChangeOrder {
  const iso = (v: unknown) => (v as { toDate?: () => Date } | null)?.toDate?.()?.toISOString?.() ?? null;
  // Values in `changes` are passed through as stored: a Timestamp goes out
  // as { _seconds, _nanoseconds }, which describeChangeValue() reads as a
  // date — the same path the Change log takes.
  const statuses = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
  return {
    orderId: String(d.orderId ?? ''),
    orderNumber: String(d.orderNumber ?? ''),
    clientName: String(d.clientName ?? ''),
    status: statuses.includes(d.status) ? d.status : 'pending',
    reason: String(d.reason ?? ''),
    affects: (Array.isArray(d.affects) ? d.affects : []).filter((a: unknown) => a === 'client' || a === 'carrier'),
    changes: (Array.isArray(d.changes) ? d.changes : []).map((c: DocumentData) => ({
      field: String(c.field ?? ''), from: c.from ?? null, to: c.to ?? null,
    })),
    requestedByUid: String(d.requestedByUid ?? ''),
    requestedByName: String(d.requestedByName ?? ''),
    requestedAt: iso(d.requestedAt),
    decidedByName: typeof d.decidedByName === 'string' ? d.decidedByName : null,
    decidedAt: iso(d.decidedAt),
    decisionNote: String(d.decisionNote ?? ''),
  };
}
