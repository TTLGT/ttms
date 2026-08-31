/**
 * The four files an order can carry, and who may fetch each one.
 *
 * Storage rules cannot read Firestore — see the note at the top of
 * storage.rules — so they cannot ask whether the person fetching a file owns
 * the order it belongs to. Ownership can only be enforced by keeping the
 * client SDK out of the bucket and serving these through
 * `/api/orders/{id}/document`, which checks with the Admin SDK and hands back
 * a short-lived signed URL. This file is the shared vocabulary for that route
 * and the screens that call it.
 */

import type { Order, OwnerContact } from './order';

export const ORDER_DOCUMENT_KINDS = ['bol', 'invoice', 'pod', 'license'] as const;
export type OrderDocumentKind = (typeof ORDER_DOCUMENT_KINDS)[number];

/** The field on the order holding each kind's path in the bucket. */
export const DOCUMENT_PATH_FIELD: Record<OrderDocumentKind, keyof Pick<
  Order,
  'bolStoragePath' | 'invoiceStoragePath' | 'podStoragePath' | 'driverLicenseStoragePath'
>> = {
  bol:     'bolStoragePath',
  invoice: 'invoiceStoragePath',
  pod:     'podStoragePath',
  license: 'driverLicenseStoragePath',
};

/** What the download button says, so every screen says the same thing. */
export const DOCUMENT_LABEL: Record<OrderDocumentKind, string> = {
  bol:     'Bill of Lading',
  invoice: 'Invoice',
  pod:     'Proof of Delivery',
  license: 'Driver License',
};

export function isOrderDocumentKind(value: unknown): value is OrderDocumentKind {
  return typeof value === 'string'
    && (ORDER_DOCUMENT_KINDS as readonly string[]).includes(value);
}

/**
 * Whether fetching this kind requires being able to see the order.
 *
 * The BOL, the invoice and the POD are the commercial record of a load — they
 * carry the rate, the client and the margin — so they are held to exactly the
 * same boundary as the order itself: its owners, its client's owners, and
 * admin, dispatch and finance. See canSeeOrder() in src/lib/accessControl.ts.
 *
 * A driver's licence is deliberately not. It is checked at pickup, at
 * delivery, by whoever is covering the phones at 2am, and by the person
 * chasing a detention claim a week later — none of whom is necessarily on the
 * load. Every one of them is on the allowlist, which is the boundary that
 * applies here. Narrowing it would mean a broker's day off stops a truck.
 */
export function needsOrderAccess(kind: OrderDocumentKind): boolean {
  return kind !== 'license';
}

/**
 * One row of the Documents screen's driver-licence list.
 *
 * Two shapes in one, and the pair is exclusive: a reader who can see the load
 * gets `shipperName` and no `owner`, and a reader who cannot gets `owner` and
 * no `shipperName`. Modelling it this way rather than sending both and hiding
 * one in the UI is the whole point — a field that never reaches the browser
 * cannot be read out of the network tab.
 */
export interface LicenseDocumentRow {
  orderId: string;
  orderNumber: string;
  altNumber: string | null;
  /** null when this load is not visible to the reader. */
  shipperName: string | null;
  /** Present only when `shipperName` is withheld. */
  owner: OwnerContact | null;
}
