import type { Timestamp } from 'firebase/firestore';
import type { PartyRole } from './party';

export type AccessRequestStatus = 'pending' | 'approved' | 'denied' | 'expired';

/**
 * A request to use somebody else's client, shipper or consignee on one order.
 *
 * There are two ways to approve one, and they differ enormously.
 *
 * `once` is the original and the default: per-order and single-use. `orderId`
 * is stamped when the approval is consumed and the request moves to `expired`,
 * so the audit trail stays one-to-one with the orders it authorized. Using the
 * same party on a second order means asking again.
 *
 * `ownership` hands the record over instead — the requester is added to the
 * party's owners, which carries every order that party is the *client* on, now
 * and in future. It is not a bigger version of the same thing; it is a
 * permanent transfer, so only admins and dispatchers may grant it, matching who
 * may reassign a record anywhere else, and it writes an ownerEvents entry like
 * any other ownership change.
 */
export interface AccessRequest {
  id: string;
  partyId: string;
  /**
   * Snapshot so the inbox reads correctly even if the party is renamed.
   *
   * **Deliberately empty when `via` is 'phone'.** A requester can read their
   * own requests, so storing the name here would hand back the one thing the
   * phone lookup withholds — see the note on `via` below. The owner's inbox
   * fills it in on read instead, which it may because the owner can see the
   * record.
   */
  partyName: string;
  /** The number that was searched, for a request the requester raised by phone. */
  partyPhone?: string;
  role: PartyRole;

  requestedByUid: string;
  requestedByName: string;
  requestedByEmail: string;
  /** Why the requester needs it — shown to the owner in the inbox. */
  reason: string;

  /**
   * How the request was raised: `name` from the order form, `link` from a party
   * page a colleague sent, `phone` from the number lookup. Requests written
   * before this field existed carry neither and are read as `name`, which is
   * what they all were.
   *
   * `phone` is the one that changes what may be stored. A broker who searched a
   * number was never told whose record it is — that is the whole point, so a
   * number cannot be used to fish for a colleague's clients and go after them.
   * The request therefore carries no `partyName`, and nothing that renders a
   * requester's own row may reveal one.
   */
  via?: 'name' | 'link' | 'phone';

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

  /**
   * What approving it granted. Absent on requests decided before the choice
   * existed, and read as `once` — which is what all of them were.
   *
   * An `ownership` approval is never consumed: the requester owns the record
   * outright, so there is no single use to spend. It stays `approved`.
   */
  grantKind?: 'once' | 'ownership';

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
