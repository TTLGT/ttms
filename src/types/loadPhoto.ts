/**
 * Pictures of a load — the freight on the dock, strapped on the deck, at the
 * consignee's door, and whatever got damaged in between.
 *
 * They are held to exactly the same boundary as the BOL and the POD: a photo
 * of a load says whose freight it is, where it went and, often, what the
 * paperwork on the pallet reads. So the bucket prefix is closed to the client
 * SDK outright (storage.rules has no `load-photos/` match at all), the records
 * in `loadPhotos` are closed to it too, and everything is read and written
 * through `/api/orders/{id}/photos` and `/api/documents/photos`, which apply
 * canSeeOrder() with the Admin SDK and hand back signed URLs.
 *
 * Unlike the four documents in orderDocument.ts, an order has any number of
 * these, so they are their own collection rather than a path on the order.
 * Top-level rather than a subcollection of `orders`: the Documents screen lists
 * them across every load, and a collection-group query over a subcollection
 * would need an index scope this project's service account cannot create.
 */

import {
  itemStop, orderCommodityItems, orderDeliveries, orderPickups, stopLabel,
  type CommodityItem, type Order, type StopKind,
} from './order';

export const LOAD_PHOTOS_COLLECTION = 'loadPhotos';

/**
 * What the picture is of — shown as "Type". Stored as `stage`, its name from
 * when it said where in the trip the picture was taken; *where* is now the
 * separate `location` tag.
 */
export const PHOTO_STAGES = ['commodity', 'truck', 'location', 'proof', 'other'] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number];

export const PHOTO_STAGE_LABEL: Record<PhotoStage, string> = {
  /** The freight itself — on the dock, on the deck, at the door. */
  commodity: 'Commodity',
  /**
   * The driver's truck and trailer, before the load is tendered — not the
   * freight. The SA review asks for at least one (see src/types/saRequest.ts):
   * a truck that turns up looking nothing like its pictures is how a
   * double-brokered load shows itself at the dock.
   */
  truck:     'Truck',
  /** The place — a facility, a dock door, a gate, a yard. */
  location:  'Location',
  /**
   * Evidence: damage, a broken seal, a shortage. Never shown to the client
   * (see clientPhotoId()), because a document asking somebody to sign is the
   * wrong place to lead with it.
   */
  proof:     'Proof',
  other:     'Other',
};

export function isPhotoStage(value: unknown): value is PhotoStage {
  return typeof value === 'string' && (PHOTO_STAGES as readonly string[]).includes(value);
}

/**
 * A stored value as one of today's types. Pictures saved before 2026-10-21
 * carry the old list: pickup, in transit and delivery were all pictures of the
 * freight, and damage is what Proof is for.
 *
 * `signed_sa` reads as Other. A signed SA belongs on the Documents tab now,
 * but an old picture of one still counts as proof in signedSaProof(), which
 * reads the stored value — so the viewer only sends a type when somebody
 * changes it, and opening one to fix its caption does not quietly undo that.
 */
export function normalizeStage(value: unknown): PhotoStage {
  if (isPhotoStage(value)) return value;
  if (value === 'pickup' || value === 'in_transit' || value === 'delivery') return 'commodity';
  if (value === 'damage') return 'proof';
  return 'other';
}

/*
  Size limits. The browser shrinks every picture before sending it (see
  prepareLoadPhoto in src/lib/loadPhotos.ts), because the upload goes through a
  Vercel function and Vercel refuses a request body over 4.5 MB — a straight
  phone photo is often bigger than that on its own.

  2560 px on the long edge still reads a pallet label or a seal number, which
  is the detail a claim turns on. The thumbnail is what the reel, the grid and
  the orders list draw, so it is small enough that a screen of them is cheap.
*/
export const PHOTO_MAX_EDGE       = 2560;
export const PHOTO_THUMB_EDGE     = 480;
export const MAX_PHOTO_BYTES      = 3_500_000;
export const MAX_THUMB_BYTES      = 300_000;
/** Most one order can carry. A guard against a runaway upload, not a quota. */
export const MAX_PHOTOS_PER_ORDER = 200;
/** Longest caption, in characters. */
export const MAX_CAPTION          = 300;
/** Longest commodity label, in characters. */
export const MAX_PHOTO_COMMODITY  = 120;
/** Longest location label, in characters. */
export const MAX_PHOTO_LOCATION   = 160;

/**
 * Whether a picture of this type says where the freight is picked up *and*
 * where it is delivered (2026-11-10). Only the commodity: freight travels
 * from one stop to another, so a single Stop made a broker choose between
 * the two.
 *
 * No other type is asked for a stop at all any more (the office's call,
 * 2026-11-10). `location` is still kept and shown on pictures that have one —
 * the driver's link files its Picked up / Delivered proof at that stop, and
 * older pictures were tagged by hand — but nobody is asked to fill it in.
 */
export function hasRoute(stage: PhotoStage | ''): boolean {
  return stage === 'commodity';
}

/**
 * A commodity picture's two stops, with an old single `location` folded into
 * whichever one it names. Pictures saved before 2026-11-10 carried one label,
 * and every label photoLocationChoices() made starts "Pickup" or "Delivery";
 * a hand-typed one that starts with neither stays in `location`.
 */
export function routeOf(d: { stage?: unknown; location?: unknown; pickupAt?: unknown; deliverTo?: unknown }):
  { location: string; pickupAt: string; deliverTo: string } {
  const location  = String(d.location ?? '');
  let   pickupAt  = String(d.pickupAt ?? '');
  let   deliverTo = String(d.deliverTo ?? '');
  if (normalizeStage(d.stage) !== 'commodity') return { location, pickupAt: '', deliverTo: '' };
  if (location && /^pickup\b/i.test(location) && !pickupAt)    return { location: '', pickupAt: location, deliverTo };
  if (location && /^delivery\b/i.test(location) && !deliverTo) return { location: '', pickupAt, deliverTo: location };
  return { location, pickupAt, deliverTo };
}

/** Where a picture belongs, as one line for a caption, a tooltip or a search. */
export function photoWhere(p: Pick<LoadPhoto, 'stage' | 'location' | 'pickupAt' | 'deliverTo'>): string {
  return [
    p.location,
    p.pickupAt  ? `Picked up at ${p.pickupAt}` : '',
    p.deliverTo ? `Delivered to ${p.deliverTo}` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * The stops of a load as picture locations: "Pickup 2 — Acme Steel, Dallas, TX".
 * Numbered only when the load has more than one of that kind, which is the
 * case the tag exists for.
 */
export function photoLocationChoices(order: Order, kinds: StopKind[]): string[] {
  const out: string[] = [];
  for (const kind of kinds) {
    const stops = kind === 'pickup' ? orderPickups(order) : orderDeliveries(order);
    stops.forEach((s, i) => {
      const name  = kind === 'pickup' ? 'Pickup' : 'Delivery';
      const head  = stops.length > 1 ? stopLabel(kind, i) : name;
      const place = [s.address?.city, s.address?.state].filter(Boolean).join(', ');
      const where = [s.partyName.trim(), place].filter(Boolean).join(', ');
      out.push((where ? `${head} — ${where}` : head).slice(0, MAX_PHOTO_LOCATION));
    });
  }
  return out;
}

/**
 * A freight line's stops as picture tags — the same labels the Picked up at /
 * Delivered to boxes offer, so a picture added from the line reads exactly as
 * one tagged by hand. '' for a side the line has not been given yet.
 */
export function itemPhotoRoute(order: Order, item: CommodityItem): { pickupAt: string; deliverTo: string } {
  const side = (kind: StopKind) => {
    const choices = photoLocationChoices(order, [kind]);
    const i = itemStop(item, kind, choices.length);
    return i == null ? '' : choices[i] ?? '';
  };
  return { pickupAt: side('pickup'), deliverTo: side('delivery') };
}

/** One freight line as something a commodity picture can be linked to. */
export interface CommodityLineChoice {
  id: string;
  label: string;
  pickupAt: string;
  deliverTo: string;
}

/**
 * The load's freight lines a picture can be linked to — only when there is
 * more than one, since with one there is nothing to tell apart and the
 * picture is simply the load's commodity.
 */
export function commodityLineChoices(order: Order): CommodityLineChoice[] {
  const items = orderCommodityItems(order);
  if (items.length < 2) return [];
  return items.map((it, i) => ({
    id: it.id,
    label: `${i + 1}. ${it.description.trim() || 'Unnamed commodity'}`,
    ...itemPhotoRoute(order, it),
  }));
}

/**
 * The commodity pictures of one freight line: those linked to it
 * (`commodityItemId`), plus — for pictures from before the link existed —
 * unlinked ones whose commodity label is the line's description.
 */
export function photosForItem<T extends LoadPhoto>(photos: T[], item: CommodityItem): T[] {
  const key = commodityKey(item.description);
  return photos.filter((p) => p.stage === 'commodity' && (
    p.commodityItemId ? p.commodityItemId === item.id : key !== '' && commodityKey(p.commodity) === key
  ));
}

/**
 * Where a picture lives in the bucket.
 *
 * Worked out from the two ids, never stored and never taken from a request.
 * That is what lets an order carry a `coverPhotoId` the browser can write (the
 * order rules allow any field an owner edits) without it becoming a way to name
 * somebody else's file: whatever id is written there, the path it produces is
 * inside this order's own folder, which the reader can already see.
 */
export function loadPhotoPath(orderId: string, photoId: string, size: 'full' | 'thumb'): string {
  return `load-photos/${orderId}/${photoId}${size === 'thumb' ? '_thumb' : ''}.jpg`;
}

/**
 * Commodity labels grouped case- and spacing-insensitively, so "Steel coils"
 * and "steel  COILS" land under one filter entry on the Documents screen.
 */
export function commodityKey(label: string | null | undefined): string {
  return (label ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** One picture, as the browser receives it. Times are epoch milliseconds. */
export interface LoadPhoto {
  id: string;
  orderId: string;
  caption: string;
  stage: PhotoStage;
  /**
   * What the picture shows — one of the order's commodity lines, or the load's
   * summary when it shows the whole thing. Copied at upload rather than linked,
   * because commodity lines have no stable id worth pointing at and a picture
   * of the coils stays a picture of the coils if the line is later reworded.
   */
  commodity: string;
  /**
   * Commodity pictures only: the freight line (`CommodityItem.id`) the
   * picture shows, or '' (2026-11-10). Set when it is added from that line in
   * the Freight section, or picked in "Which commodity?". Line ids are stable
   * across edits, so unlike a stop this can be a link; a line later deleted
   * simply leaves the picture unlinked, still labelled by `commodity`.
   */
  commodityItemId: string;
  /**
   * Which stop the picture was taken at — one of photoLocationChoices(), or ''
   * when it is not tied to one. Copied as text for the same reason as
   * `commodity`: stops are positions, and removing one shifts the rest, so an
   * index would quietly move a picture to a different company's dock.
   */
  location: string;
  /**
   * Commodity pictures only (hasRoute()): the pickup the freight leaves from
   * and the delivery it goes to, each one of photoLocationChoices() for that
   * kind, or ''. Text for `location`'s reason. Always '' on any other type —
   * the server clears them when the type changes.
   */
  pickupAt: string;
  deliverTo: string;
  width: number;
  height: number;
  uploadedByUid: string;
  uploadedByName: string;
  createdAt: number;
  /** Signed, short-lived. */
  url: string;
  thumbUrl: string;
}

/**
 * One row of the Documents screen's picture browser: a picture plus enough of
 * its load to search and group by. Only loads the reader can see appear at all,
 * so unlike a licence row nothing here needs redacting.
 */
export interface LoadPhotoRow extends LoadPhoto {
  orderNumber: string;
  altNumber: string | null;
  clientName: string;
  shipperName: string;
  consigneeName: string;
  /** The load's own one-line commodity, which the picture's label may narrow. */
  orderCommodity: string;
  /** The truck or trailer the load moved on (`Order.transportType`); '' when unset. */
  transportType: string;
  /** "Laredo, TX" — for the table and the search box. */
  originLabel: string;
  destinationLabel: string;
  /** Whether this is the load's profile picture. */
  isCover: boolean;
  /**
   * Year, make, model, colour, type and VIN of the vehicle(s) in the picture,
   * for the search box only: the linked freight line's, or every line on the
   * load when the picture is not linked to one. '' when nothing is a vehicle.
   */
  vehicles: string;
}
