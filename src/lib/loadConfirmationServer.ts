import { createHash } from 'crypto';
import { formatLongDateRange } from '@/lib/dateFormat';
import {
  accessorialLabels, dimensionsSummary, formatDimensions, orderAccessorials, hasVehicleDetails, itemWeightLb, vehicleSummary, orderCommodityItems, orderDeliveries, orderPickups, stopPlaces,
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
 *
 * `notes` is the client's special instructions (`clientInstructions`). The key
 * keeps its old name because it is stored in `sectionHashes` on every live
 * link: a new key would read as changed on every one of them and hold them
 * all for review on their next save. Under the old name only a link whose
 * order had internal notes reads as changed, once — which is true, since the
 * client is no longer shown them.
 */
export type AgreementSection = 'client' | 'rate' | 'stops' | 'freight' | 'payment' | 'notes';

export const AGREEMENT_SECTION_LABEL: Record<AgreementSection, string> = {
  client:  'client',
  rate:    'rate',
  stops:   'pickup and delivery',
  freight: 'freight',
  payment: 'payment terms',
  notes:   'special instructions',
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

/**
 * The freight table, as the quote PDF and the signing page print it.
 *
 * A vehicle line carries its year, make, model and VIN as well — BATS printed
 * them on the Shipper Agreement, and a client signing for a car is confirming
 * which car. The keys are added only to a line that has them: this feeds the
 * `freight` fingerprint, and a '' on every ordinary line would make every live
 * link read as changed on its next save. A vehicle load sent before this
 * existed will read as a freight change once, which is true — the client was
 * never shown the VIN.
 */
export function confirmationFreight(order: AnyOrder): ConfirmationFreight[] {
  return orderCommodityItems(order).map((it) => {
    const line: ConfirmationFreight = {
      description: it.description,
      quantity: it.quantity ? String(it.quantity) : '',
      dimensions: formatDimensions(it),
      weight: itemWeightLb(it) ? `${Math.round(itemWeightLb(it)).toLocaleString('en-US')} lbs` : '',
    };
    if (hasVehicleDetails(it)) {
      const vehicle = vehicleSummary(it);
      if (vehicle) line.vehicle = vehicle;
      if (it.vin?.trim()) line.vin = it.vin.trim().toUpperCase();
    }
    return line;
  });
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
  /** Accessorial keys, in catalog order — keys rather than labels, so rewording a label holds no link. */
  accessorials: string[];
  /** The client's special instructions, as staff wrote them. Not what the client adds when signing — that is theirs, not a term we offer. */
  instructions: string;
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
    accessorials: orderAccessorials(order),
    instructions: String(order.clientInstructions ?? '').trim(),
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
    // Accessorials are what the truck must bring, so they are part of the
    // freight. Appended only when there are any: every link sent before they
    // existed fingerprints exactly as it did, and is not held on its next save.
    freight: sha([c.freight, c.equipment, c.commodity, c.weight, c.pieces, c.dimensions,
      ...(c.accessorials.length ? [c.accessorials] : [])]),
    payment: sha(c.payment),
    notes:   sha(c.instructions),
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
    // Under its own key: links sent before 2026-10-14 carry `notes`, which
    // was the order's notes as the client was shown them, and still show it.
    specialInstructions: c.instructions,
    stops:           c.stops,
    freight:         c.freight,
    equipment:       c.equipment,
    // As the client reads them. Absent on links sent before 2026-10-15.
    accessorials:    accessorialLabels(c),
    payment:         c.payment,
    /*
     * Printed on the PDF's header, as BATS printed them, and deliberately not
     * part of the fingerprint: neither is a term the client agrees to, so
     * neither should hold a link for review. They are the order's as of the
     * send, like everything else on the link.
     */
    orderCreatedAt:       order.createdAt || null,
    firstAvailablePickup: order.firstAvailablePickup || null,
  };
}
