import type { Timestamp } from 'firebase/firestore';

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
  shipperId: string;
  shipperName: string;
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

export const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  quote:            'booked',
  booked:           'carrier_assigned',
  carrier_assigned: 'carrier_signed',
  carrier_signed:   'shipper_signed',
  shipper_signed:   'in_transit',
  in_transit:       'delivered',
  delivered:        'completed',
};
