import { orderCommodityItems, type Address, type Order } from './order';

/**
 * What an order still needs before its paperwork can go out: the Shipper
 * Agreement (the client's load confirmation, see send-shipper-agreement) and
 * the Bill of Lading.
 *
 * One definition, read by three things that must agree about it — the
 * checklist on the order while it is a quote, the quote PDF's footnote, and
 * the review dispatch does before sending the SA. Pure: anything that needs a
 * second document (whether the client has an email address, the carrier's
 * DOT) is passed in as a fact, and `null` means "not known here", which is
 * shown as a thing to check rather than as a failure.
 *
 * The two lists are what the two documents actually print. Adding a line to
 * either PDF without adding it here means the checklist says "ready" for a
 * document that comes out with a blank in it.
 */

export type ReadinessDoc = 'sa' | 'bol';

export const READINESS_DOC_LABEL: Record<ReadinessDoc, string> = {
  sa:  'Shipper Agreement',
  bol: 'Bill of Lading',
};

export interface ReadinessItem {
  key: string;
  doc: ReadinessDoc;
  label: string;
  /** true = filled, false = missing, null = cannot tell from here. */
  ok: boolean | null;
  /** Said under a missing item: what to do about it. */
  hint?: string;
}

/** Facts from other records. Leave one out and its line says "check". */
export interface ReadinessFacts {
  clientHasEmail?: boolean | null;
  carrierHasDotOrMc?: boolean | null;
}

const filled = (v: unknown) => typeof v === 'string' ? v.trim() !== '' : v != null && v !== false;
const place = (a: Address | null | undefined) => Boolean(a?.city?.trim() && a?.state?.trim() && a?.zip?.trim());
const street = (a: Address | null | undefined) => Boolean(a?.street?.trim());

export function orderReadiness(order: Partial<Order>, facts: ReadinessFacts = {}): ReadinessItem[] {
  const items = orderCommodityItems(order);
  const described = Boolean(order.commodity?.trim()) || items.some((i) => i.description?.trim());
  const weighed = (Number(order.weight) || 0) > 0;

  const sa: Omit<ReadinessItem, 'doc'>[] = [
    { key: 'client', label: 'Client', ok: filled(order.clientId), hint: 'Pick the client on the order.' },
    { key: 'clientEmail', label: 'Client email to send the SA to', ok: facts.clientHasEmail ?? null,
      hint: 'Add an email to the client record or one of its contacts.' },
    { key: 'pickupPlace', label: 'Pickup city, state and ZIP', ok: place(order.origin) },
    { key: 'deliveryPlace', label: 'Delivery city, state and ZIP', ok: place(order.destination) },
    { key: 'pickupDate', label: 'Pickup date', ok: filled(order.pickupDate) },
    { key: 'deliveryDate', label: 'Delivery date', ok: filled(order.deliveryDate) },
    { key: 'commodity', label: 'What the freight is', ok: described },
    { key: 'weight', label: 'Weight', ok: weighed },
    { key: 'agreedRate', label: 'Agreed rate', ok: (Number(order.agreedRate) || 0) > 0,
      hint: 'The quote calculator can work this out.' },
  ];

  const bol: Omit<ReadinessItem, 'doc'>[] = [
    { key: 'shipper', label: 'Shipper', ok: filled(order.shipperId) || filled(order.shipperName) },
    { key: 'pickupStreet', label: 'Pickup street address', ok: street(order.origin) },
    { key: 'consignee', label: 'Consignee', ok: filled(order.consigneeId) || filled(order.consigneeName) },
    { key: 'deliveryStreet', label: 'Delivery street address', ok: street(order.destination) },
    { key: 'pieces', label: 'Number of pieces', ok: (Number(order.pieces) || 0) > 0 },
    { key: 'carrier', label: 'Carrier', ok: filled(order.carrierId) || filled(order.carrierName),
      hint: 'Usually assigned once the SA is out.' },
    { key: 'carrierNumbers', label: 'Carrier DOT or MC', ok: order.carrierId ? (facts.carrierHasDotOrMc ?? null) : false },
    { key: 'driverName', label: 'Driver name', ok: filled(order.driverName) },
    { key: 'driverPhone', label: 'Driver phone', ok: filled(order.driverPhone) },
  ];

  return [
    ...sa.map((i) => ({ ...i, doc: 'sa' as const })),
    ...bol.map((i) => ({ ...i, doc: 'bol' as const })),
  ];
}

/** Everything one document needs, and whether any of it is missing. */
export function readinessOf(items: ReadinessItem[], doc: ReadinessDoc) {
  const mine = items.filter((i) => i.doc === doc);
  return {
    items: mine,
    missing: mine.filter((i) => i.ok === false),
    unknown: mine.filter((i) => i.ok === null),
    complete: mine.every((i) => i.ok === true),
  };
}
