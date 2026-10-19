/**
 * A change order: a broker's edit to a load whose agreement has already gone
 * out, waiting for admin or dispatch to apply it.
 *
 * ## Why edits stop being saves
 *
 * Once the client's SA or the carrier's Dispatch Sheet has been sent, a change
 * to anything printed on it is a change to a deal somebody outside the company
 * is holding. TTMS already holds the link and reopens the review when such a
 * change is saved (clientAgreements.ts, carrierAgreements.ts). A change order
 * puts a person in front of that: the broker says what changed and why, and
 * the people who will resend the paperwork decide whether it happens at all.
 *
 * Who must ask: anybody without `orders.applyChanges` (admin and dispatch have
 * it). Edits that touch nothing printed on a sent agreement — a lane distance,
 * the internal notes, the BOL card — save as they always did.
 *
 * ## Shape
 *
 * One document per load, `changeOrders/{orderId}`: the current one. Submitting
 * again after a decision overwrites it, the same arrangement as `saRequests`;
 * the history of earlier ones is on the order's change log, which every
 * submission and decision writes to. The id being the order's is what makes
 * "one waiting change order per load" free.
 *
 * Closed to the client SDK; read and written through /api/orders/{id}/change-order
 * and /api/change-orders.
 */

export type ChangeOrderStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/** Which sent agreement the change reaches. */
export type ChangeOrderAffects = 'client' | 'carrier';

export interface ChangeOrderField {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ChangeOrder {
  orderId: string;
  orderNumber: string;
  clientName: string;
  status: ChangeOrderStatus;
  reason: string;
  affects: ChangeOrderAffects[];
  /** What the broker's save would change, old value → new, as the change log shows it. */
  changes: ChangeOrderField[];
  requestedByUid: string;
  requestedByName: string;
  requestedAt: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string;
  /** Set on a pending one when the load has changed since, so approving would be refused. */
  stale?: boolean;
}

export const MAX_CHANGE_ORDER_REASON = 1000;

const AFFECTS_LABEL: Record<ChangeOrderAffects, string> = {
  client:  'the client’s SA',
  carrier: 'the carrier’s Dispatch Sheet',
};

/** "the client’s SA and the carrier’s Dispatch Sheet" */
export function affectsLabel(affects: readonly ChangeOrderAffects[]): string {
  return affects.map((a) => AFFECTS_LABEL[a]).join(' and ') || 'a sent agreement';
}

export const CHANGE_ORDER_STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  pending:   'Waiting',
  approved:  'Approved',
  rejected:  'Turned down',
  withdrawn: 'Withdrawn',
};
