import type { Timestamp } from 'firebase/firestore';
import type { OrderPartyApproval } from './accessRequest';

export type OrderStatus =
  | 'quote'
  | 'booked'
  | 'carrier_assigned'
  | 'carrier_signed'
  | 'shipper_signed'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Order {
  id: string;
  batsId: string | null;
  orderNumber: string;
  /** Contracting/paying party — signs the transport agreement. */
  clientId: string;
  clientName: string;
  /** Origin party / pickup location — signs the BOL with the driver. */
  shipperId: string;
  shipperName: string;
  /** Destination party / delivery location — receives the load. */
  consigneeId: string;
  consigneeName: string;
  parentOrderId: string | null;
  status: OrderStatus;
  commodity: string;
  vehicles: string;
  pieces: number;
  weight: number;
  transportType: string;
  origin: Address;
  destination: Address;
  pickupDate: Timestamp | null;
  deliveryDate: Timestamp | null;
  dispatchedAt: Timestamp | null;
  pickedUpAt: Timestamp | null;
  carrierId: string | null;
  carrierName: string;
  driverName: string;
  driverPhone: string;
  driverLicenseStoragePath: string | null;
  bolStoragePath: string | null;
  invoiceStoragePath: string | null;
  podStoragePath: string | null;
  agreedRate: number;
  brokerFee: number;
  carrierPay: number;
  assignedTo: string;
  sourceName: string;
  notes: string;
  deliveredAt: Timestamp | null;
  carrierSignedAt: Timestamp | null;
  carrierSignerName: string | null;
  carrierSignerIp: string | null;
  shipperSignedAt: Timestamp | null;
  shipperSignerName: string | null;
  shipperSignerIp: string | null;
  /**
   * Proof of authorization when this order uses a party the creator does not
   * own. Written server-side only — see /api/orders/[orderId]/party-approvals.
   */
  partyApprovals: OrderPartyApproval[];
  clientSignedAt: Timestamp | null;
  clientSignerName: string | null;
  clientSignerIp: string | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  quote:            'Quote',
  booked:           'Booked',
  carrier_assigned: 'Carrier Assigned',
  carrier_signed:   'Carrier Signed',
  shipper_signed:   'Shipper Signed',
  in_transit:       'In Transit',
  delivered:        'Delivered',
  completed:        'Completed',
  cancelled:        'Cancelled',
};

/**
 * How far along the lifecycle each status sits. Used to reconcile an imported
 * BATS status against the one the TMS already holds: the further-along of the
 * two wins, so a refresh can advance an order but never drag it backwards.
 *
 * `cancelled` is deliberately absent — it is a terminal side-exit, not a rung
 * on the ladder, and is handled separately.
 */
export const STATUS_RANK: Record<Exclude<OrderStatus, 'cancelled'>, number> = {
  quote:            0,
  booked:           1,
  carrier_assigned: 2,
  carrier_signed:   3,
  shipper_signed:   4,
  in_transit:       5,
  delivered:        6,
  completed:        7,
};

export const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  quote:            'booked',
  booked:           'carrier_assigned',
  carrier_assigned: 'carrier_signed',
  carrier_signed:   'shipper_signed',
  shipper_signed:   'in_transit',
  in_transit:       'delivered',
  delivered:        'completed',
};
