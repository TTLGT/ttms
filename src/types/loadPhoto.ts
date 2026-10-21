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

import { orderDeliveries, orderPickups, stopLabel, type Order, type StopKind } from './order';

export const LOAD_PHOTOS_COLLECTION = 'loadPhotos';

/**
 * Where in the load's life the picture was taken.
 *
 * Its own field rather than something inferred from the upload time, because
 * the answer that matters in a claim — "was it already broken at pickup?" — is
 * one the uploader knows and a clock does not: pickup photos are routinely
 * sent in hours after the truck has left.
 */
export const PHOTO_STAGES = ['pickup', 'in_transit', 'delivery', 'damage', 'truck', 'signed_sa', 'other'] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number];

export const PHOTO_STAGE_LABEL: Record<PhotoStage, string> = {
  pickup:     'Pickup',
  in_transit: 'In transit',
  delivery:   'Delivery',
  damage:     'Damage',
  /**
   * The driver's truck and trailer, before the load is tendered — not the
   * freight. The SA review asks for at least one (see src/types/saRequest.ts):
   * a truck that turns up looking nothing like its pictures is how a
   * double-brokered load shows itself at the dock.
   */
  truck:      'Truck',
  /**
   * A photo of the client's Shipper Agreement signed on paper. Like a
   * `signed_sa` file, it is what lets staff move the load to Client Signed by
   * hand — see src/lib/signedSaProof.ts.
   */
  signed_sa:  'Signed Shipper Agreement (SA)',
  other:      'Other',
};

export function isPhotoStage(value: unknown): value is PhotoStage {
  return typeof value === 'string' && (PHOTO_STAGES as readonly string[]).includes(value);
}

/**
 * The stage a new picture most likely belongs to, from where the load is.
 * Only a starting point for the picker — the uploader can always change it.
 */
export function defaultStageFor(status: string): PhotoStage {
  if (status === 'in_transit') return 'in_transit';
  if (status === 'delivered' || status === 'completed') return 'delivery';
  return 'pickup';
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
 * Which stops a picture of this type can be tagged with. A pickup picture is
 * at a pickup and a delivery one at a delivery; damage and "other" can be
 * anywhere on the trip; in transit is on the road, and a truck or a signed SA
 * is not about a stop at all.
 */
export function locationKindsFor(stage: PhotoStage | ''): StopKind[] {
  if (stage === 'pickup')   return ['pickup'];
  if (stage === 'delivery') return ['delivery'];
  if (stage === 'damage' || stage === 'other') return ['pickup', 'delivery'];
  return [];
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
   * Which stop the picture was taken at — one of photoLocationChoices(), or ''
   * when it is not tied to one. Copied as text for the same reason as
   * `commodity`: stops are positions, and removing one shifts the rest, so an
   * index would quietly move a picture to a different company's dock.
   */
  location: string;
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
}
