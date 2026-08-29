import type { Timestamp } from 'firebase/firestore';
import type { PartyRole } from './party';

export type AccessRequestStatus = 'pending' | 'approved' | 'denied' | 'expired';

/**
 * A request to use somebody else's client, shipper or consignee on one order.
 *
 * Approval is deliberately per-order and single-use: `orderId` is stamped when
 * the approved request is consumed, and the request moves to `expired`. Using
 * the same party on a second order means asking again, which keeps the audit
 * trail one-to-one with the orders it authorized.
 */
export interface AccessRequest {
  id: string;
  partyId: string;
  /** Snapshot so the inbox reads correctly even if the party is renamed. */
  partyName: string;
  role: PartyRole;

  requestedByUid: string;
  requestedByName: string;
  requestedByEmail: string;
  /** Why the requester needs it — shown to the owner in the inbox. */
  reason: string;

  /**
   * How the request was raised: `name` from the order form, `link` from a party
   * page a colleague sent. Requests written before this field existed carry
   * neither and are read as `name`, which is what they all were.
   */
  via?: 'name' | 'link';

  /** Owners at the time of the request; any one of them may approve. */
  ownerUids: string[];
  /** Owner as BATS recorded it, when no TMS account exists yet. */
  ownerName: string;

  status: AccessRequestStatus;

  decidedByUid: string | null;
  decidedByName: string | null;
  decidedByIp: string | null;
  decidedAt: Timestamp | null;
  /** True when an admin decided on the owner's behalf. */
  decidedByAdmin: boolean;
  denyReason: string | null;

  /** Set when the approval is spent on an order. */
  consumedByOrderId: string | null;
  consumedAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * The approval record copied onto an order, so the order itself carries proof
 * of who authorized the use of a party that was not the creator's.
 */
export interface OrderPartyApproval {
  partyId: string;
  partyName: string;
  role: PartyRole;
  requestId: string;
  approvedByUid: string;
  approvedByName: string;
  approvedByIp: string;
  approvedAt: Timestamp;
  approvedByAdmin: boolean;
}
