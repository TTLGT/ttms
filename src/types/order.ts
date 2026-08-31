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

export type DimensionUnit = 'in' | 'ft' | 'cm' | 'm';
export type WeightUnit = 'lb' | 'kg';

/**
 * One line of freight on an order. A load is rarely a single uniform object —
 * a broker may move a tractor, its detached bucket and a crate of parts on the
 * same order, each with its own size and weight — so dimensions live per item
 * rather than on the order.
 *
 * Units are stored alongside the numbers instead of being normalised on save:
 * a carrier quoted "8 ft wide" wants to read back "8 ft", not "96 in", and an
 * over-dimension permit is written in the units the broker was quoted in.
 * Conversion happens at the point of calculation — see `toInches`/`toPounds`.
 */
export interface CommodityItem {
  /** Client-generated and stable across edits. Only used as a React key. */
  id: string;
  description: string;
  /** How many identical pieces this line covers. */
  quantity: number;
  length: number;
  width: number;
  height: number;
  dimensionUnit: DimensionUnit;
  /** Weight of ONE piece — the line total is `quantity * weight`. */
  weight: number;
  weightUnit: WeightUnit;
}

const INCHES_PER: Record<DimensionUnit, number> = { in: 1, ft: 12, cm: 1 / 2.54, m: 100 / 2.54 };
const POUNDS_PER: Record<WeightUnit, number> = { lb: 1, kg: 2.20462262185 };

export const DIMENSION_UNITS: DimensionUnit[] = ['in', 'ft', 'cm', 'm'];
export const WEIGHT_UNITS: WeightUnit[] = ['lb', 'kg'];

export const DIMENSION_UNIT_LABEL: Record<DimensionUnit, string> = {
  in: 'in', ft: 'ft', cm: 'cm', m: 'm',
};
export const WEIGHT_UNIT_LABEL: Record<WeightUnit, string> = { lb: 'lbs', kg: 'kg' };

export function toInches(value: number, unit: DimensionUnit): number {
  return (value || 0) * INCHES_PER[unit];
}

export function toPounds(value: number, unit: WeightUnit): number {
  return (value || 0) * POUNDS_PER[unit];
}

export function convertLength(value: number, from: DimensionUnit, to: DimensionUnit): number {
  return toInches(value, from) / INCHES_PER[to];
}

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  return toPounds(value, from) / POUNDS_PER[to];
}

/** A fresh blank line for the itemised commodity editor. */
export function blankCommodityItem(): CommodityItem {
  return {
    // crypto.randomUUID is unavailable on http:// origins other than localhost,
    // and this id never leaves the browser, so a cheap random suffix is enough.
    id: `ci_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    quantity: 1,
    length: 0,
    width: 0,
    height: 0,
    dimensionUnit: 'in',
    weight: 0,
    weightUnit: 'lb',
  };
}

/** Total weight of one commodity line, in pounds. */
export function itemWeightLb(item: CommodityItem): number {
  return toPounds(item.weight, item.weightUnit) * (item.quantity || 0);
}

/** Cubic feet occupied by one commodity line. */
export function itemVolumeFt3(item: CommodityItem): number {
  const cubicInches =
    toInches(item.length, item.dimensionUnit) *
    toInches(item.width, item.dimensionUnit) *
    toInches(item.height, item.dimensionUnit);
  return (cubicInches / 1728) * (item.quantity || 0);
}

export function totalPieces(items: CommodityItem[]): number {
  return items.reduce((sum, i) => sum + (i.quantity || 0), 0);
}

export function totalWeightLb(items: CommodityItem[]): number {
  return items.reduce((sum, i) => sum + itemWeightLb(i), 0);
}

/** "48 x 40 x 60 in", or '' when the line carries no dimensions. */
export function formatDimensions(item: CommodityItem): string {
  const { length, width, height } = item;
  if (!length && !width && !height) return '';
  const n = (v: number) => (Number.isInteger(v) ? String(v) : String(Number((v || 0).toFixed(2))));
  return `${n(length)} × ${n(width)} × ${n(height)} ${DIMENSION_UNIT_LABEL[item.dimensionUnit]}`;
}

/**
 * The one-line description written back to the legacy `commodity` field. Order
 * lists, invoices and agreement emails were built against that single string
 * and still read it, so it is kept in sync rather than dropped.
 */
export function commoditySummary(items: CommodityItem[]): string {
  const named = items.map((i) => i.description.trim()).filter(Boolean);
  if (!named.length) return '';
  if (named.length === 1) return named[0];
  return `${named[0]} + ${named.length - 1} more`;
}

/**
 * Itemised freight for an order, including orders written before the
 * `commodities` array existed and BATS imports, which carry only a
 * description. Those collapse to a single dimensionless line so every reader —
 * detail page, BOL, invoice — can assume an array.
 */
export function orderCommodityItems(
  order: Partial<Pick<Order, 'commodities' | 'commodity' | 'pieces' | 'weight'>>,
): CommodityItem[] {
  if (order.commodities?.length) return order.commodities;
  const quantity = order.pieces || 0;
  return [{
    ...blankCommodityItem(),
    // Fixed rather than random: this runs on every render of a legacy order,
    // and a key that changed each time would remount the row.
    id: 'legacy',
    description: order.commodity ?? '',
    quantity: quantity || 1,
    // The legacy field held the whole load's weight; dividing it back out
    // keeps the line total identical to what the order has always shown.
    weight: quantity > 1 ? (order.weight ?? 0) / quantity : (order.weight ?? 0),
  }];
}

/**
 * Every item's dimensions on one line, for places that have room for a string
 * but not a table — the agreement emails and the public signing page.
 */
export function dimensionsSummary(items: CommodityItem[]): string {
  const parts = items
    .map((i) => {
      const dims = formatDimensions(i);
      if (!dims) return '';
      const name = i.description.trim();
      return name ? `${name}: ${dims}` : dims;
    })
    .filter(Boolean);
  return parts.join('; ');
}

/** An address flattened into something Google Maps can geocode. */
/**
 * The number a load is known by — on its header, in every list, and on the
 * BOL, invoice and rate confirmation that go out under it.
 *
 * A load that came from BATS keeps leading with its BATS id. The company
 * worked those loads under that number for years: it is what a carrier has in
 * their file, what a client puts on a remittance, and what a broker types into
 * a search. Handing an eight-year-old load a brand-new number would be
 * technically tidier and practically worse.
 *
 * Loads booked in TTMS lead with their sequence number. So the two
 * conventions run side by side and the split is permanent — but it is a split
 * along a line that already exists, between the old system and this one, and
 * it settles itself as BATS-era loads close out.
 *
 * Every screen and document goes through this function rather than reading
 * `orderNumber` directly, so that rule lives in one place.
 */
export function orderDisplayNumber(
  // Loose rather than Pick<Order, …> because the document routes work from a
  // raw Firestore snapshot, and a helper every outbound BOL and invoice goes
  // through should not need a cast at each call site.
  order: { orderNumber?: string | null; batsId?: string | null },
): string {
  return order.batsId || order.orderNumber || '';
}

/**
 * The load's other number, shown under the display number — never instead of
 * it. Null when the order only ever had one.
 *
 * For a BATS load that is the TTMS sequence number; for a TTMS load that has
 * one, the pre-sequence number it used to carry.
 */
export function orderAltNumber(
  order: { orderNumber?: string | null; batsId?: string | null; previousOrderNumber?: string | null },
): string | null {
  if (order.batsId) return order.orderNumber || null;
  const prev = order.previousOrderNumber;
  return prev && prev !== order.orderNumber ? prev : null;
}

export function addressToQuery(a: Address | null | undefined): string {
  if (!a) return '';
  return [a.street, a.city, a.state, a.zip].map((v) => (v ?? '').trim()).filter(Boolean).join(', ');
}

/**
 * `estimate` — free, offline, from ZIP centroids (`src/lib/routeDistance.ts`).
 * `routes`   — exact road miles from the Google Routes API, billed per lookup.
 */
export type LaneMilesSource = 'estimate' | 'routes';

/**
 * How a lane distance is phrased everywhere it is shown, hedged according to
 * how it was obtained. Two ZIPs in the same town share a centroid and estimate
 * to zero, which is not a useful thing to print, so anything very short is
 * reported as a floor instead.
 */
export function formatLaneMiles(
  miles: number | null | undefined,
  source: LaneMilesSource | null | undefined,
): string {
  if (miles === null || miles === undefined) return '';
  if (source === 'routes') return `${Math.round(miles).toLocaleString()} mi`;
  if (miles < 10) return 'under 10 mi';
  return `about ${Math.round(miles).toLocaleString()} mi`;
}

/** The caveat that has to travel with the number, or '' when there is none. */
export function laneMilesCaption(source: LaneMilesSource | null | undefined): string {
  if (source === 'routes') return 'driving distance via Google Routes';
  if (source === 'estimate') return 'straight-line estimate, not exact road miles';
  return '';
}

/** The label the number sits under. */
export function laneMilesLabel(source: LaneMilesSource | null | undefined): string {
  return source === 'routes' ? 'Driving distance' : 'Estimated distance';
}

/**
 * Whether an address can be placed on the map at all. The distance estimate
 * works off ZIP centroids, so a ZIP is the one part it cannot do without.
 */
export function isRoutableAddress(a: Address | null | undefined): boolean {
  return Boolean((a?.zip ?? '').trim());
}

/**
 * A Google Maps directions link for the load. Built with the documented Maps
 * URLs API rather than a scraped /maps/dir/ path, so it needs no API key and
 * survives Maps UI changes — it simply opens Maps with the route filled in.
 * Returns '' unless both ends are known, so a half-built link is never saved.
 */
export function buildRouteMapUrl(
  origin: Address | null | undefined,
  destination: Address | null | undefined,
): string {
  const from = addressToQuery(origin);
  const to = addressToQuery(destination);
  if (!from || !to) return '';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`;
}

export interface Order {
  id: string;
  batsId: string | null;
  orderNumber: string;
  /**
   * What this order was called before it was given a sequence number, on the
   * records that predate one — a BATS id, or one of the old random
   * `TTL-2026-4821` numbers.
   *
   * Kept because the previous number is on paperwork already in the world, and
   * because staff spent years looking loads up by it. Optional: an order
   * created after the sequence went in has never had another number.
   */
  previousOrderNumber?: string | null;
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
  /**
   * One-line freight description. Derived from `commodities` on save — see
   * `commoditySummary` — and kept because order lists, PDFs and the agreement
   * emails read it directly.
   */
  commodity: string;
  /** Itemised freight. The source of truth for pieces, weight and dimensions. */
  commodities: CommodityItem[];
  vehicles: string;
  /** Sum of `commodities[].quantity`. Derived — see `totalPieces`. */
  pieces: number;
  /** Total load weight in pounds. Derived — see `totalWeightLb`. */
  weight: number;
  transportType: string;
  origin: Address;
  destination: Address;
  /**
   * Google Maps directions link for the route. Auto-built from the two
   * addresses but editable — a broker often needs to pin the exact gate or
   * yard that geocoding a street address does not find.
   */
  routeMapUrl: string;
  /**
   * Distance between the two addresses, in miles. null = not worked out (no
   * ZIP, or lane distances are switched off).
   *
   * Stored rather than recomputed on read, so the figure a broker quoted
   * against does not move under them.
   */
  laneMiles: number | null;
  /**
   * How `laneMiles` was arrived at. Matters because the two methods are not
   * interchangeable — an estimate is roughly ±5% and must never be billed
   * against, while a routed figure is exact. Every surface that shows the
   * number reads this to know what to call it.
   */
  laneMilesSource: LaneMilesSource | null;
  /**
   * Earliest date the freight can be collected, as the client stated it.
   *
   * Deliberately separate from `pickupDate`: this is a constraint the client
   * gives us and it does not move, while `pickupDate` is the date dispatch
   * actually scheduled and is rewritten as the load is worked. Imported from
   * the BATS `FirstAvailablePickup` column, which is why the two must not be
   * collapsed into one field.
   */
  firstAvailablePickup: Timestamp | null;
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
  /**
   * The owning rep as BATS recorded it. Kept as free text for reference and
   * for the ownership timeline; it grants nothing on its own. A name the
   * import could not match to anyone stays here until an admin or dispatcher
   * assigns a real owner.
   */
  assignedTo: string;
  /**
   * Owners of this order. Unlike a party, an order with no owner at all is
   * NOT shared reference data — it is visible only to admin, dispatch and
   * finance. Orders are the commercial record of who is working a load, so the
   * safe default is closed rather than open. See canSeeOrder().
   */
  assignedToUids: string[];
  /** Owning work groups; every member sees the order. */
  assignedToGroupIds: string[];
  /**
   * Owners who exist on the allowlist but have never signed in — see the same
   * field on Party for why ownership has to be held by email until a uid
   * exists to convert it to.
   */
  assignedToEmails: string[];
  /**
   * Owners of this order's client, mirrored from the party.
   *
   * Owning a client grants access to all of its orders, and security rules
   * cannot express that: rules cannot run a query, and a get() on the client
   * party for every order would blow Firestore's 20-document-access limit on
   * any list. So the client's owners are denormalized here and kept in step by
   * syncClientOwners() whenever the party's ownership changes. Do not read
   * these as the order's own owners — they are a cache of someone else's.
   */
  clientOwnerUids: string[];
  clientOwnerGroupIds: string[];
  /**
   * The managed lead source this load is attributed to — a `leadSources`
   * document id, or null when nobody has set one.
   *
   * Only the id is stored. The name is resolved from the list at render time
   * so an admin renaming a source updates every order at once; mirroring the
   * label here would mean rewriting thousands of documents on a rename.
   *
   * Who may change it is narrower than who may edit the order — see
   * canEditSource() in src/lib/accessControl.ts.
   */
  sourceId: string | null;
  /**
   * The source exactly as BATS wrote it. Kept as a fallback label for imported
   * orders whose text matched nothing on the managed list, so the order still
   * shows where it came from. Not written by the app — new orders set
   * `sourceId` instead.
   */
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
  /**
   * Fragments this order can be found by — see orderSearchTerms. Derived on
   * save from the number, the party names, the lane and the commodity; never
   * edited by hand and never shown.
   */
  searchTerms?: string[];
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
 * Every status there is, derived from the labels rather than written out again
 * so the two cannot drift. The order-count endpoint asks for one aggregation
 * per entry, so adding a status here costs a query, not a list to remember.
 */
export const ORDER_STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[];

// ── Search ───────────────────────────────────────────────────────────────────

/** Shortest fragment worth storing. One letter would match most of the book. */
const MIN_TERM = 2;
/**
 * Longest fragment stored. Somebody who has typed twelve characters has already
 * narrowed it to a handful; the rest of the word adds entries and finds nothing
 * new, because the query matches a *stored fragment* exactly.
 */
const MAX_TERM = 12;
/** A guard against one absurd commodity description bloating a document. */
const MAX_TERMS = 400;

/**
 * The fields a person searches an order by.
 *
 * `shipperName` carries the customer on every imported order — BATS put the
 * CustomerName there — which is why it matters more than `clientName`, a field
 * that is empty on all but one order until the party migration runs.
 */
function searchableValues(order: Record<string, unknown>): string[] {
  const address = (a: unknown) => {
    const v = a as { city?: string; state?: string } | null | undefined;
    return [v?.city ?? '', v?.state ?? ''];
  };
  return [
    String(order.orderNumber ?? ''),
    String(order.batsId ?? ''),
    String(order.previousOrderNumber ?? ''),
    String(order.shipperName ?? ''),
    String(order.clientName ?? ''),
    String(order.consigneeName ?? ''),
    String(order.carrierName ?? ''),
    String(order.commodity ?? ''),
    ...address(order.origin),
    ...address(order.destination),
  ];
}

/** Lowercased words, punctuation dropped. "Palm Beach, FL" → ["palm","beach","fl"]. */
export function searchWords(text: string): string[] {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Every fragment an order should be findable by.
 *
 * Firestore cannot search for text inside a field — there is no equivalent of
 * `LIKE '%morris%'`, and the only reason the carriers list could once do it was
 * that it had already downloaded all eleven thousand of them. So the fragments
 * are worked out on save and stored, and the query becomes `array-contains`,
 * which is a single indexed lookup however large the collection grows.
 *
 * Every prefix of every word is stored, so typing "morr" finds "Morris" — which
 * is what a search box is expected to do. Prefixes only: "orris" will not find
 * it. Storing every *substring* would square the size of this array for a case
 * nobody actually types.
 *
 * A word is indexed under its own prefixes, so multi-word values are found by
 * any of their words: "Palm Beach" answers to "palm" and to "beach".
 */
export function orderSearchTerms(order: Record<string, unknown>): string[] {
  const terms = new Set<string>();

  for (const value of searchableValues(order)) {
    for (const word of searchWords(value)) {
      const limit = Math.min(word.length, MAX_TERM);
      // A word shorter than MIN_TERM is still worth storing whole — a two-letter
      // state code is exactly what somebody types to find a lane.
      for (let n = Math.min(MIN_TERM, word.length); n <= limit; n++) {
        terms.add(word.slice(0, n));
      }
      if (terms.size > MAX_TERMS) break;
    }
  }

  return [...terms].slice(0, MAX_TERMS);
}

/**
 * What to look up for a typed query.
 *
 * Only the first word is matched. `array-contains-any` would let several words
 * be tried at once but treats them as OR, so "palm beach" would return every
 * load touching either — wider than what was typed, not narrower. The remaining
 * words are filtered from the returned page instead; see the orders list.
 */
export function orderSearchTerm(query: string): string {
  const word = searchWords(query)[0] ?? '';
  return word.slice(0, MAX_TERM);
}

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
