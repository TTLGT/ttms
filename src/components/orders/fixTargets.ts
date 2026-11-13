import type { OrderSection } from './SectionEditLink';
import type { SaFixTarget } from '@/types/saRequest';

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
  pickupDate:     { kind: 'edit', section: 'route', field: 'pickupDate' },
  deliveryDate:   { kind: 'edit', section: 'route', field: 'deliveryDate' },
  commodity:      { kind: 'edit', section: 'freight', field: 'commodities' },
  weight:         { kind: 'edit', section: 'freight', field: 'commodities' },
  pieces:         { kind: 'edit', section: 'freight', field: 'commodities' },
  transportType:  { kind: 'edit', section: 'freight', field: 'transportType' },
  agreedRate:     { kind: 'edit', section: 'price', field: 'agreedRate' },
  serviceArrangers: { kind: 'edit', section: 'price', field: 'serviceCharges' },
  loading:        { kind: 'edit', section: 'dock', field: 'dockWork' },
  unloading:      { kind: 'edit', section: 'dock', field: 'dockWork' },
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

/**
 * By review check key (src/types/saRequest.ts): for a tick the file refuses,
 * and for an item the reviewer marked as wrong when sending it back — where
 * the broker goes to put it right.
 */
export const CHECK_FIX: Record<string, FixTarget> = {
  // The SA's
  client:        { kind: 'edit', section: 'general', field: 'client' },
  lane:          { kind: 'edit', section: 'route', field: 'origin' },
  freight:       { kind: 'edit', section: 'freight', field: 'commodities' },
  accessorials:  { kind: 'edit', section: 'freight', field: 'accessorials' },
  terms:         { kind: 'edit', section: 'price', field: 'clientPayment' },
  dock:          { kind: 'edit', section: 'dock', field: 'dockWork' },
  // The Dispatch Sheet's
  carrierContact:   { kind: 'carrier' },
  carrierPay:       { kind: 'edit', section: 'price', field: 'agreedRate' },
  carrierAuthority: { kind: 'carrier' },
  carrierInsurance: { kind: 'carrier' },
  carrierIdentity:  { kind: 'carrier' },
  carrierAge:       { kind: 'carrier' },
  equipment:        { kind: 'edit', section: 'freight', field: 'transportType' },
  carrierLane:      { kind: 'edit', section: 'route', field: 'origin' },
  driver:           { kind: 'carrier', editor: true },
  driverLicense:    { kind: 'carrier', editor: true },
  truckPhotos:      { kind: 'pictures' },
  carrierPayment:   { kind: 'carrier' },
};

/**
 * Where a reviewer looks to confirm a double-check item is really on the
 * order — the "See" link beside each tick. Unlike a Fix link it opens nothing
 * to edit: it scrolls the order page to the card (or the part of it) that
 * shows the answer, unfolding it first, and lights it up.
 *
 * `anchor` is an element id on the Details tab.
 */
export type SeeTarget = { tab: 'details'; anchor: string } | { tab: 'pictures' };

const see = (anchor: string): SeeTarget => ({ tab: 'details', anchor });

export const CHECK_SEE: Record<string, SeeTarget> = {
  // The SA's
  client:        see('general'),
  lane:          see('route'),
  freight:       see('freight'),
  accessorials:  see('freight-accessorials'),
  terms:         see('price-terms'),
  dock:          see('dock'),
  // The Dispatch Sheet's
  carrierContact:   see('carrier'),
  carrierPay:       see('price'),
  carrierAuthority: see('carrier'),
  carrierInsurance: see('carrier'),
  carrierIdentity:  see('carrier'),
  carrierAge:       see('carrier'),
  equipment:        see('freight'),
  carrierLane:      see('route'),
  driver:           see('carrier'),
  driverLicense:    see('carrier'),
  truckPhotos:      { tab: 'pictures' },
  carrierPayment:   see('carrier'),
};

/** Fixed targets for the "What TTMS checked" rows. */
export const FACT_FIX = {
  clientPayment: { kind: 'edit', section: 'price', field: 'clientPayment' },
  accessorials:  { kind: 'edit', section: 'freight', field: 'accessorials' },
  services:      { kind: 'edit', section: 'price', field: 'serviceCharges' },
  carrierCard:   { kind: 'carrier' },
  driver:        { kind: 'carrier', editor: true },
  pictures:      { kind: 'pictures' },
  client:        { kind: 'client' },
} satisfies Record<string, FixTarget>;

/** Where a line on the fix list (saFixList()) goes, or null for none. */
export function saFixTarget(t: SaFixTarget | null): FixTarget | null {
  if (!t) return null;
  if (t.type === 'readiness') return READINESS_FIX[t.key] ?? null;
  if (t.type === 'check') return CHECK_FIX[t.key] ?? null;
  return FACT_FIX[t.key];
}
