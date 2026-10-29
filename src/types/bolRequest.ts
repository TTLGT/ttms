/**
 * A BOL waiting for admin or dispatch to send it out.
 *
 * ## Why TTMS opens it, and why a person sends it
 *
 * Once both sides of a load have signed — the client (or a waiver is on
 * file) and the carrier — the paperwork is settled and the BOL is the next
 * thing everybody needs. TTMS generates it there and then and opens one of
 * these. It does not email it by itself: who gets a BOL differs by load (the
 * shipper's dock wants it, a consignee may not, a client sometimes asks for
 * it), so admin and dispatch choose the recipients and press send.
 *
 * ## Shape
 *
 * One document per order, `bolRequests/{orderId}`. The id being the order's
 * makes "one open request per load" free, and is what stops a signature
 * landing twice from opening two. A new carrier signing later opens a fresh
 * round over the old one (the BOL names the carrier, so the one already sent
 * is wrong); every send stays on the order's change log either way.
 *
 * Who works it: anybody holding `orders.sendAgreement` — admin and dispatch
 * by default, the same people who send the agreements.
 *
 * Closed to the client SDK; read and written through /api/bol-requests and
 * /api/orders/{id}/bol-request. See src/lib/bolRequests.ts.
 */

import { accessorialLabels, orderCommodityItems, orderDisplayNumber, type Order } from './order';

export const BOL_REQUESTS_COLLECTION = 'bolRequests';

/**
 * What the BOL prints, reduced to a short string — stored on the order as
 * `bolFingerprint` each time it is generated, and compared with the order as
 * it stands to say "this BOL is out of date".
 *
 * Why a fingerprint and not a redraw on every save: a redraw quietly changed
 * a document that may already be with a dock or a driver, and made a new
 * version on every keystroke-level save. Now a person regenerates on purpose.
 *
 * Runs in the browser and on the server over the same order, so every value
 * goes in as plain JSON: timestamps as whole seconds (the browser receives
 * them serialized), keys sorted, absent read as null. The carrier's DOT and
 * MC come off the carrier record and are not in it — a different carrier is
 * (`carrierId`), a corrected number on the same one is not.
 *
 * Keep in step with `bolBuffer()` in src/lib/bolRequests.ts: a field the BOL
 * starts printing belongs here too, or changing it will not raise the banner.
 */
export function bolFingerprint(order: Record<string, unknown>): string {
  const o = order as Partial<Order> & Record<string, unknown>;
  // Whole seconds: the browser gets `{ _seconds, _nanoseconds }` and the
  // server a Timestamp, and seconds are what both can agree on exactly.
  const secs = (v: unknown): number | null => {
    if (!v || typeof v !== 'object') return null;
    const t = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof t.toMillis === 'function') return Math.floor(t.toMillis() / 1000);
    const s = t.seconds ?? t._seconds;
    return typeof s === 'number' ? s : null;
  };
  const pick = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
  const printed = {
    number: orderDisplayNumber(o),
    ...pick(
      'clientName', 'shipperName', 'consigneeName', 'carrierId', 'carrierName', 'driverName',
      'transportType', 'truckNumber', 'trailerNumber', 'commodity', 'pieces', 'weight',
      'origin', 'destination', 'pickupDate', 'pickupDateEnd', 'deliveryDate', 'deliveryDateEnd',
      'extraPickups', 'extraDeliveries', 'carrierInstructions',
      'freightChargeTerms', 'thirdPartyBillTo', 'trailerLoadedBy', 'freightCountedBy',
      'trailerUnloadedBy', 'deliveryCountedBy', 'bolShowDockBoxes', 'carrierSignerName', 'carrierSignerIp',
    ),
    items:        orderCommodityItems(o),
    accessorials: accessorialLabels(o),
    carrierSignedAt: secs(o.carrierSignedAt),
  };
  const stable = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    return JSON.stringify(v ?? null);
  };
  // FNV-1a: short to store, and a collision only costs a missing banner.
  let h = 0x811c9dc5;
  for (const ch of stable(printed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * True when the BOL on file no longer matches the order. False for a BOL
 * generated before fingerprints were stored: nothing to compare, and a banner
 * on every older load would be noise rather than news.
 */
export function bolOutdated(order: Record<string, unknown>): boolean {
  const stored = order.bolFingerprint;
  return Boolean(order.bolStoragePath) && typeof stored === 'string' && stored !== bolFingerprint(order);
}

/**
 * - `open` — the BOL is generated; nobody has sent it yet.
 * - `sent` — emailed at least once; waiting to be marked done (more can be sent).
 * - `done` — closed by somebody, who is named.
 */
export type BolRequestStatus = 'open' | 'sent' | 'done';

export const BOL_STATUS_LABEL: Record<BolRequestStatus, string> = {
  open: 'Waiting to be sent',
  sent: 'Sent — mark done',
  done: 'Done',
};

/** Who a BOL can go to. The role on this load, never an address from the browser. */
export type BolRecipientRole = 'carrier' | 'client' | 'shipper' | 'consignee';

export const BOL_ROLE_LABEL: Record<BolRecipientRole, string> = {
  carrier:   'Carrier',
  client:    'Client',
  shipper:   'Shipper',
  consignee: 'Consignee',
};

/**
 * One address a BOL could go to on this load, as the server worked it out.
 *
 * `key` is what the browser sends back to choose it: `carrier`, `client`,
 * `shipper:0`, `consignee:1`… — a stop's position, so a load with two pickups
 * offers both. The server resolves the key to an address again on send and
 * never accepts an address, so a BOL can only reach somebody on the load.
 */
export interface BolRecipient {
  key: string;
  role: BolRecipientRole;
  /** "Shipper", or "Pickup 2" on a multi-stop load. */
  label: string;
  name: string;
  /** '' when nothing is on file — drawn, but cannot be ticked. */
  email: string;
}

export const MAX_BOL_RECIPIENTS = 10;

export function isBolRecipientKey(value: unknown): value is string {
  return typeof value === 'string' && /^(carrier|client|(shipper|consignee):\d{1,2})$/.test(value);
}

/** One email of the BOL. */
export interface BolSend {
  at: number;
  byName: string;
  /** "Shipper · dock@acme.com", as it was at the time. */
  to: { label: string; email: string }[];
}

export interface BolRequest {
  orderId: string;
  orderNumber: string;
  clientName: string;
  carrierName: string;
  /** The carrier the BOL was generated for. A different one signing opens a new round. */
  carrierId: string;
  status: BolRequestStatus;
  /** Epoch ms. */
  openedAt: number;
  /** What made TTMS open it, in words — "The carrier signed the Dispatch Sheet". */
  openedBecause: string;
  sends: BolSend[];
  doneAt: number | null;
  doneByName: string | null;
}

/**
 * A BOL that was on file until somebody generated it again — kept, not
 * overwritten, because it may already have gone to a dock or a driver and
 * "what did the carrier actually receive?" has to stay answerable.
 * `orders/{orderId}/bolVersions/{id}`; the PDF is `bol-versions/{orderId}/{id}.pdf`.
 */
export interface BolVersion {
  id: string;
  /** Epoch ms the PDF was drawn; null only if Storage did not say. */
  generatedAt: number | null;
  /** Null for a BOL drawn before versions were kept, which recorded nobody. */
  generatedByName: string | null;
  replacedAt: number;
  replacedByName: string;
  /** The emails that went out while this was the BOL on file. */
  sends: BolSend[];
}
