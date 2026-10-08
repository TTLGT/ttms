import { STATUS_LABEL, type OrderStatus } from './order';
import { toDate, type DateLike } from '@/lib/dateFormat';

/**
 * The change history of an order, a party (client, shipper, consignee) or a
 * carrier: who changed what, from what, to what, and when.
 *
 * Kept as a subcollection — `orders/{id}/changes`, `parties/{id}/changes`,
 * `carriers/{id}/changes` — for the same two reasons `ownerEvents` is: an
 * array on the record would be rewritable by anyone who can save the record,
 * and a load worked for months would grow its own document without bound.
 * A subcollection also outlives its parent. Firestore does not cascade a
 * delete, so a record removed with the Admin SDK leaves its history behind,
 * which is what an audit trail is for.
 *
 * Written only by the server, in the same batch or transaction as the change
 * it describes. That is the whole guarantee: the browser no longer writes
 * orders, parties or carriers at all (see firestore.rules), so there is no
 * save that can land without its entry, and no entry a user can fake.
 *
 * Ownership changes are not repeated here. They already have their own trail
 * in `ownerEvents`, and the history route merges the two into one timeline.
 */

export const CHANGES_SUBCOLLECTION = 'changes';

export type ChangeRecordKind = 'order' | 'party' | 'carrier';

/**
 * `created` opens a record's history; `updated` is a save of its fields;
 * `event` is something that happened to it that is better said in words —
 * a BOL generated, an agreement emailed, a signature, an owner added.
 */
export type ChangeAction = 'created' | 'updated' | 'event';

/**
 * Who made the change.
 *
 *  - `app`    a signed-in staff member, named by their uid.
 *  - `signer` somebody outside the company on a public e-sign link. There is
 *             no uid; the name is the one they typed, and the email is the
 *             address the link was sent to.
 */
export type ChangeVia = 'app' | 'signer';

export interface FieldChange {
  field: string;
  /** The stored value before and after. Timestamps stay Timestamps. */
  from: unknown;
  to: unknown;
}

export interface ChangeEntry {
  id: string;
  action: ChangeAction;
  /** A plain sentence for an `event` or `created`; '' for a plain field save. */
  summary: string;
  fields: FieldChange[];
  /** '' for an outside signer. */
  actorUid: string;
  actorName: string;
  actorEmail: string;
  via: ChangeVia;
  /** Over the API a Timestamp arrives as `{_seconds}`; read it through toDate(). */
  at: DateLike;
}

/**
 * Fields never recorded.
 *
 * Every one of them is either bookkeeping or worked out from other fields
 * that are recorded — a history line saying "search terms changed" beside
 * every rename would bury the rename. `clientOwner*` is a copy of the
 * client's owners, whose changes are in the client's own history.
 */
export const UNRECORDED_FIELDS: ReadonlySet<string> = new Set([
  'id', 'createdAt', 'updatedAt',
  'searchTerms', 'nameKey', 'phoneKeys',
  'clientOwnerUids', 'clientOwnerGroupIds',
  'coverThumbUrl', 'photoCount',
  // When the mileage was worked out moves with the mileage, which is recorded.
  'laneMilesAt',
  // The ids beside a name: the name is what changed as far as a reader is
  // concerned, and it is saved in the same patch every time the id is.
  'clientId', 'shipperId', 'consigneeId', 'carrierId', 'driverId',
  // Worked out from the extra stops, which are recorded.
  'stopPartyIds',
]);

/** What each field is called on screen, where the field name is not already plain. */
const LABELS: Record<string, string> = {
  // Orders
  orderNumber: 'Order number',
  previousOrderNumber: 'Previous order number',
  batsId: 'BATS id',
  clientName: 'Client',
  shipperName: 'Shipper',
  consigneeName: 'Consignee',
  carrierName: 'Carrier',
  parentOrderId: 'Parent order',
  commodities: 'Freight items',
  commodityValue: 'Freight value',
  clientPayment: 'Client payment terms',
  carrierPayment: 'Carrier payment terms',
  brokerFeeTerms: 'Broker fee terms',
  complexTerms: 'Complex terms',
  origin: 'Pickup address',
  destination: 'Delivery address',
  extraPickups: 'Extra pickups',
  extraDeliveries: 'Extra deliveries',
  routeMapUrl: 'Route map link',
  laneMiles: 'Lane miles',
  laneMilesSource: 'Mileage method',
  firstAvailablePickup: 'First available pickup',
  pickupDateEnd: 'Pickup date (last day)',
  deliveryDateEnd: 'Delivery date (last day)',
  driverPhoneRegion: 'Driver phone country',
  driverLicenseStoragePath: "Driver's licence",
  bolStoragePath: 'BOL',
  invoiceStoragePath: 'Invoice',
  podStoragePath: 'Proof of delivery',
  coverPhotoId: 'Profile picture',
  agreedRate: 'Agreed rate',
  brokerFee: 'Broker fee',
  carrierPay: 'Carrier pay',
  partyApprovals: 'Party approvals',
  carrierSignedAt: 'Carrier signed',
  carrierSignerName: 'Carrier signer',
  carrierSignerIp: 'Carrier signer IP',
  shipperSignedAt: 'Client signed',
  shipperSignerName: 'Client signer',
  shipperSignerIp: 'Client signer IP',
  signatureWaivedAt: 'Signature waived',
  signatureWaivedByName: 'Waived by',
  signatureWaivedByUid: 'Waived by (account)',
  signatureWaivedReason: 'Reason for waiving',
  signatureWaived: 'Dispatched without signature',
  // Parties
  companyName: 'Company name',
  contactName: 'Contact name',
  phoneRegion: 'Phone country',
  phone2: 'Second phone',
  phone2Region: 'Second phone country',
  email2: 'Second email',
  defaultOrigin: 'Default pickup',
  defaultDest: 'Default delivery',
  sourceId: 'Lead source',
  sourceName: 'Lead source (BATS)',
  // Carriers
  dot: 'DOT number',
  mc: 'MC number',
  contactTitle: 'Contact title',
  dispatcherPhone: 'Dispatcher phone',
  dispatcherPhoneRegion: 'Dispatcher phone country',
  dispatcherEmail: 'Dispatcher email',
  billingContact: 'Billing contact',
  billingPhone: 'Billing phone',
  billingPhoneRegion: 'Billing phone country',
  billingEmail: 'Billing email',
  insuranceExpiration: 'Insurance expires',
  insuranceProvider: 'Insurance provider',
  insurancePolicyNumber: 'Insurance policy number',
  insuranceStoragePath: 'Certificate of insurance',
  insuranceCoverage: 'Liability coverage',
  insuranceCargoCoverage: 'Cargo coverage',
  isActive: 'Active',
  fmcsa: 'FMCSA check',
};

/** "pickupDate" → "Pickup date", for any field without a label above. */
export function changeFieldLabel(field: string): string {
  if (LABELS[field]) return LABELS[field];
  const words = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MONEY_FIELDS = new Set([
  'agreedRate', 'brokerFee', 'carrierPay', 'commodityValue',
  'insuranceCoverage', 'insuranceCargoCoverage',
]);

/**
 * Fields whose value means nothing to a reader — a storage path, a photo id,
 * a lead-source document id. Shown as whether there is one, not what it is.
 */
const OPAQUE_FIELDS = new Set([
  'driverLicenseStoragePath', 'bolStoragePath', 'invoiceStoragePath',
  'podStoragePath', 'insuranceStoragePath', 'coverPhotoId', 'sourceId',
  'parentOrderId', 'signatureWaivedByUid', 'partyApprovals', 'fmcsa',
]);

/** An order's extra pickups and deliveries — see OrderStop in src/types/order.ts. */
const STOP_FIELDS = new Set(['extraPickups', 'extraDeliveries']);

const DATE_FIELDS = new Set([
  'firstAvailablePickup', 'pickupDate', 'deliveryDate', 'pickupDateEnd',
  'deliveryDateEnd', 'dispatchedAt', 'pickedUpAt', 'deliveredAt',
  'insuranceExpiration', 'carrierSignedAt', 'shipperSignedAt', 'signatureWaivedAt',
]);

export function isBlankValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && !isTimestampLike(v)) {
    return Object.values(v as Record<string, unknown>).every(isBlankValue);
  }
  return false;
}

function isTimestampLike(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.toMillis === 'function'
    || typeof o._seconds === 'number'
    || (typeof o.seconds === 'number' && typeof o.nanoseconds === 'number');
}

const MAX_SHOWN = 240;

/**
 * One side of a change, as words.
 *
 * `formatDate` is passed in rather than imported so the company's date
 * format setting applies — see useDateFormatters().
 */
export function describeChangeValue(
  field: string,
  value: unknown,
  formatDate: (v: DateLike) => string,
): string {
  if (OPAQUE_FIELDS.has(field)) return isBlankValue(value) ? 'none' : 'set';
  if (isBlankValue(value)) return 'blank';

  if (field === 'status' && typeof value === 'string') {
    return STATUS_LABEL[value as OrderStatus] ?? value;
  }
  if (STOP_FIELDS.has(field) && Array.isArray(value)) {
    // A stop is a party, an address and a date. Flattened like any other map
    // it would print the party's document id and a raw timestamp.
    return clip(value.map((s) => {
      const stop = (s ?? {}) as { partyName?: string; address?: unknown; date?: DateLike };
      const when = toDate(stop.date ?? null) ? formatDate(stop.date as DateLike) : '';
      return [stop.partyName, flatten(stop.address ?? ''), when].filter(Boolean).join(', ');
    }).join('; '));
  }
  if (MONEY_FIELDS.has(field) && typeof value === 'number') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
  if (DATE_FIELDS.has(field) || isTimestampLike(value)) {
    return toDate(value as DateLike) ? formatDate(value as DateLike) : String(value);
  }
  return clip(flatten(value));
}

function flatten(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((v) => !isBlankValue(v)).map(flatten).join('; ');
  if (value && typeof value === 'object') {
    // An address, a set of payment terms, one freight item: the values that
    // are filled in, in the order they are stored. Readable enough to see what
    // moved, without a renderer per shape.
    return Object.values(value as Record<string, unknown>)
      .filter((v) => !isBlankValue(v))
      .map(flatten)
      .join(', ');
  }
  return String(value);
}

function clip(text: string): string {
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN - 1)}…` : text;
}

/** When an entry happened, as epoch milliseconds, for sorting. */
export function changeEntryMillis(entry: { at: DateLike }): number {
  return toDate(entry.at)?.getTime() ?? 0;
}
