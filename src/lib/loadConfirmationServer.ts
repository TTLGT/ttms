import { createHash } from 'crypto';
import { formatLongDateRange } from '@/lib/dateFormat';
import {
  dimensionsSummary, formatDimensions, itemWeightLb, orderCommodityItems, orderDeliveries, orderPickups, stopPlaces,
  type Order, type OrderStop,
} from '@/types/order';
import {
  clientPaymentDetails,
  type ConfirmationFreight, type ConfirmationPayment, type ConfirmationStop,
} from '@/types/loadConfirmation';

/**
 * What the client agrees to when they sign the load confirmation, worked out
 * from the order — the one definition, used for three things:
 *
 * - the snapshot copied onto the signing link when it is sent;
 * - the fingerprint that tells a resend of the same agreement (same link,
 *   emailed again) from a changed one (held, reviewed, then revised);
 * - the "what changed" line dispatch is shown when an edit puts a link on hold.
 *
 * Anything printed on the signing page belongs here, and anything here is on
 * the signing page: a field the client cannot see must not hold their link for
 * review, and a field they can see must not change behind a signed agreement
 * without anyone noticing. Terms are deliberately not part of it — they are
 * the company's, not the order's, and a link keeps the terms it went out with
 * (see src/types/agreementTerms.ts).
 */

type AnyOrder = Partial<Order> & Record<string, unknown>;

/**
 * The parts of an agreement, each fingerprinted on its own so a change can be
 * named. `client` is special: a link belongs to the client it was sent to, so
 * a change of client is never a revision of that link — see clientAgreements.
 */
export type AgreementSection = 'client' | 'rate' | 'stops' | 'freight' | 'payment' | 'notes';

export const AGREEMENT_SECTION_LABEL: Record<AgreementSection, string> = {
  client:  'client',
  rate:    'rate',
  stops:   'pickup and delivery',
  freight: 'freight',
  payment: 'payment terms',
  notes:   'notes',
};

const SECTIONS: AgreementSection[] = ['client', 'rate', 'stops', 'freight', 'payment', 'notes'];

export function confirmationStops(order: AnyOrder): ConfirmationStop[] {
  // Every stop written out in full — the facility, the street and the window —
  // because "Dallas, TX" is a lane, not somewhere a truck can be sent, and the
  // client is confirming where their freight is collected and dropped.
  const one = (kind: ConfirmationStop['kind']) => (st: OrderStop): ConfirmationStop => ({
    kind,
    name:   st.partyName || '',
    street: st.address?.street || '',
    place:  [[st.address?.city, st.address?.state].filter(Boolean).join(', '), st.address?.zip].filter(Boolean).join(' '),
    dates:  formatLongDateRange(st.date, st.dateEnd, ''),
  });
  return [
    ...orderPickups(order).map(one('pickup')),
    ...orderDeliveries(order).map(one('delivery')),
  ].filter((st) => st.name || st.street || st.place);
}

/** The freight table, as the quote PDF and the signing page print it. */
export function confirmationFreight(order: AnyOrder): ConfirmationFreight[] {
  return orderCommodityItems(order).map((it) => ({
    description: it.description,
    quantity: it.quantity ? String(it.quantity) : '',
    dimensions: formatDimensions(it),
    weight: itemWeightLb(it) ? `${Math.round(itemWeightLb(it)).toLocaleString('en-US')} lbs` : '',
  }));
}

export interface ConfirmationContent {
  clientId: string;
  agreedRate: number;
  stops: ConfirmationStop[];
  freight: ConfirmationFreight[];
  equipment: string;
  commodity: string;
  weight: number;
  pieces: number;
  dimensions: string;
  payment: ConfirmationPayment;
  notes: string;
}

export function confirmationContent(order: AnyOrder): ConfirmationContent {
  return {
    clientId:   String(order.clientId ?? ''),
    agreedRate: Number(order.agreedRate) || 0,
    stops:      confirmationStops(order),
    freight:    confirmationFreight(order),
    equipment:  String(order.transportType ?? ''),
    commodity:  String(order.commodity ?? ''),
    weight:     Number(order.weight) || 0,
    pieces:     Number(order.pieces) || 0,
    dimensions: dimensionsSummary(orderCommodityItems(order)),
    payment:    clientPaymentDetails(order),
    notes:      String(order.notes ?? '').trim(),
  };
}

const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

/**
 * One fingerprint per section. Built from fixed-order objects, so the same
 * content always gives the same string; a date is compared as the words the
 * client reads ("March 4, 2026"), so a time-of-day wobble in a stored
 * timestamp is not a change and a moved day is.
 */
export function sectionHashes(c: ConfirmationContent): Record<AgreementSection, string> {
  return {
    client:  sha(c.clientId),
    rate:    sha(c.agreedRate),
    stops:   sha(c.stops),
    freight: sha([c.freight, c.equipment, c.commodity, c.weight, c.pieces, c.dimensions]),
    payment: sha(c.payment),
    notes:   sha(c.notes),
  };
}

export function contentHash(sections: Record<AgreementSection, string>): string {
  return sha(SECTIONS.map((s) => sections[s]));
}

/** The sections that differ, by label — "rate, pickup and delivery". */
export function changedSections(
  before: Partial<Record<AgreementSection, string>> | null | undefined,
  after: Record<AgreementSection, string>,
): AgreementSection[] {
  return SECTIONS.filter((s) => (before?.[s] ?? '') !== after[s]);
}

export function sectionList(sections: AgreementSection[]): string {
  return sections.map((s) => AGREEMENT_SECTION_LABEL[s]).join(', ');
}

/**
 * The fields the signing page reads, as written onto the link. Includes the
 * older one-line fields (`originStr`, `pickupDate`…) that the summary and the
 * email still use.
 */
export function tokenSnapshotFields(order: AnyOrder, c: ConfirmationContent): Record<string, unknown> {
  return {
    commodity:       c.commodity,
    weight:          c.weight,
    pieces:          c.pieces,
    dimensions:      c.dimensions,
    originStr:       stopPlaces(orderPickups(order)) || '—',
    destinationStr:  stopPlaces(orderDeliveries(order)) || '—',
    pickupDate:      order.pickupDate      || null,
    deliveryDate:    order.deliveryDate    || null,
    pickupDateEnd:   order.pickupDateEnd   || null,
    deliveryDateEnd: order.deliveryDateEnd || null,
    agreedRate:      c.agreedRate,
    carrierName:     order.carrierName     || '',
    notes:           c.notes,
    stops:           c.stops,
    freight:         c.freight,
    equipment:       c.equipment,
    payment:         c.payment,
  };
}
