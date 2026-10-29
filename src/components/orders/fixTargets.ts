import type { OrderSection } from './SectionEditLink';

/**
 * Where a reviewer goes to fill in something the SA or Dispatch Sheet review
 * says is missing — so a red line is a link, not a hunt round the order.
 *
 * Only the target is decided here. The order page carries it out, because
 * three of the four kinds are things only that page can do: open its Carrier
 * editor, switch to its Pictures tab, scroll to one of its cards.
 *
 * `field` is the `?field=` the edit screen reads: it scrolls to the element
 * with id `field-{field}` and lights it up. Add an id there before naming a
 * new one here, or the link lands on the section and stops.
 */
export type FixTarget =
  | { kind: 'edit'; section: OrderSection; field: string }
  /** The Carrier card on the order. `editor` opens its form, where the driver is typed. */
  | { kind: 'carrier'; editor?: boolean }
  | { kind: 'pictures' }
  /** The Client Confirmation card on the order, where the client's signature is shown. */
  | { kind: 'clientConfirmation' }
  /** The client's own record — its email is not on the order. */
  | { kind: 'client' };

/** By `ReadinessItem.key` (src/types/orderReadiness.ts). A key not listed gets no link. */
export const READINESS_FIX: Record<string, FixTarget> = {
  client:         { kind: 'edit', section: 'general', field: 'client' },
  clientEmail:    { kind: 'client' },
  pickupPlace:    { kind: 'edit', section: 'route', field: 'origin' },
  deliveryPlace:  { kind: 'edit', section: 'route', field: 'destination' },
  pickupDate:     { kind: 'edit', section: 'general', field: 'pickupDate' },
  deliveryDate:   { kind: 'edit', section: 'general', field: 'deliveryDate' },
  commodity:      { kind: 'edit', section: 'freight', field: 'commodities' },
  weight:         { kind: 'edit', section: 'freight', field: 'commodities' },
  pieces:         { kind: 'edit', section: 'freight', field: 'commodities' },
  transportType:  { kind: 'edit', section: 'freight', field: 'transportType' },
  agreedRate:     { kind: 'edit', section: 'price', field: 'agreedRate' },
  shipper:        { kind: 'edit', section: 'route', field: 'shipper' },
  pickupStreet:   { kind: 'edit', section: 'route', field: 'origin' },
  consignee:      { kind: 'edit', section: 'route', field: 'consignee' },
  deliveryStreet: { kind: 'edit', section: 'route', field: 'destination' },
  carrier:        { kind: 'carrier', editor: true },
  // MC and DOT are typed on the Carrier card itself (CarrierCompliance).
  carrierNumbers: { kind: 'carrier' },
  driverName:     { kind: 'carrier', editor: true },
  driverPhone:    { kind: 'carrier', editor: true },
};

/** By review check key (src/types/saRequest.ts), for a tick the file refuses. */
export const CHECK_FIX: Record<string, FixTarget> = {
  driverLicense: { kind: 'carrier', editor: true },
  truckPhotos:   { kind: 'pictures' },
};

/** Fixed targets for the "What TTMS checked" rows. */
export const FACT_FIX = {
  clientPayment: { kind: 'edit', section: 'price', field: 'clientPayment' },
  accessorials:  { kind: 'edit', section: 'freight', field: 'accessorials' },
  carrierCard:   { kind: 'carrier' },
  driver:        { kind: 'carrier', editor: true },
  pictures:      { kind: 'pictures' },
  client:        { kind: 'client' },
} satisfies Record<string, FixTarget>;
