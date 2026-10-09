/**
 * A broker asking dispatch to send the Shipper Agreement (the client's load
 * confirmation — see send-shipper-agreement) for a quote the client accepted.
 *
 * ## Why it is a request and not a button
 *
 * The step after a quote used to be a button reading "→ Booked", which read
 * like it booked something and did nothing but change a word. What actually
 * happens next is that dispatch checks the order and the carrier and sends the
 * SA — so that is what the button now starts. The order still moves to the
 * stored status `booked` (renaming a stored status is a migration); what
 * changed is what pressing it means.
 *
 * ## Shape
 *
 * One document per order, `saRequests/{orderId}`: the current round. Asking
 * again after dispatch sent it back overwrites it, and the story of earlier
 * rounds is on the order's change log and in its discussion room. The id being
 * the order's is what makes "only one open request per load" free.
 *
 * Who works it: anybody holding `orders.sendAgreement` (admin and dispatch by
 * default), all of them at once — whoever gets there first. Each of them sees
 * the others' ticks and, at the end, who marked it done.
 *
 * Closed to the client SDK; read and written through /api/sa-requests and
 * /api/orders/{id}/sa-request.
 */

import { MIN_OPERATING_MONTHS, isNewCarrier, officeDay, type OperatingSince } from './fmcsa';
import { hasVehicleDetails, type CommodityItem } from './order';
import type { FmcsaConcern } from './fmcsa';
import type { ReadinessItem } from './orderReadiness';

export const SA_REQUESTS_COLLECTION = 'saRequests';

/**
 * - `open`     — waiting for dispatch to review and send.
 * - `sent`     — the SA has been emailed to the client; waiting to be marked done.
 * - `done`     — reviewed, sent, and closed by somebody, who is named.
 * - `returned` — dispatch sent it back to the broker with a reason.
 */
export type SaRequestStatus = 'open' | 'sent' | 'done' | 'returned';

export const SA_STATUS_LABEL: Record<SaRequestStatus, string> = {
  open:     'Waiting for review',
  sent:     'SA sent — mark done',
  done:     'Done',
  returned: 'Sent back to broker',
};

/** One tick on the review list: who ticked it and when (epoch ms). */
export interface SaCheckMark {
  byUid: string;
  byName: string;
  at: number;
}

export interface SaRequest {
  orderId: string;
  orderNumber: string;
  clientName: string;
  status: SaRequestStatus;
  note: string;
  requestedByUid: string;
  requestedByName: string;
  requestedAt: number;
  /** Review ticks by key. A key that is absent is unticked. */
  checks: Record<string, SaCheckMark>;
  sentAt: number | null;
  sentByName: string | null;
  sentTo: string | null;
  doneAt: number | null;
  doneByName: string | null;
  returnedAt: number | null;
  returnedByName: string | null;
  returnReason: string | null;
  /**
   * Why the round was opened. `requested` is a broker pressing Request SA;
   * `changed` is TTMS reopening it because the order changed after the SA was
   * sent, which holds the client's link until it is sent again — see
   * src/lib/clientAgreements.ts. The person named as requester is whoever
   * made the change, and the note is TTMS's own wording, not theirs.
   */
  reason: 'requested' | 'changed';
  /**
   * Extra addresses the SA email is copied to — the client's AP desk, a
   * second contact — added by dispatch on the review. Copied, never sent to
   * instead: the client contact stays the one asked to sign. Everybody on
   * this list receives the client's rate, so it is set only by a reviewer and
   * every send names who it was copied to. Carried into the next round
   * unless the client changes.
   */
  ccEmails: string[];
  /** Who the last send was copied to. */
  sentCc: string[];
}

/**
 * Stored on the request beside the fields above, so that copying the request
 * into its round (see SaRound) is a whole copy:
 *
 * - `roundId`    — the round's id. Absent on requests from before rounds were kept.
 * - `saVersion`  — the SA version this round sent.
 * - `dispatched` — the review facts at the first send.
 * - `sends`      — every email this round made.
 */
export const SA_ROUNDS_SUBCOLLECTION = 'rounds';

/** Most addresses one SA is copied to. Enough for a team; not a mailing list. */
export const MAX_SA_CC = 5;

const SA_CC_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isCcEmail(value: string): boolean {
  return value.length <= 254 && SA_CC_RE.test(value);
}

/**
 * A CC list as it may be stored: trimmed, lower-cased, valid, de-duplicated,
 * capped. Anything else in the input is dropped rather than refused, because
 * this also cleans what is read back from a document.
 */
export function cleanCcList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (e && isCcEmail(e) && !out.includes(e)) out.push(e);
  }
  return out.slice(0, MAX_SA_CC);
}

/**
 * What dispatch confirms by hand before sending. The parts a computer can
 * check — a field being filled in, a certificate's date, FMCSA's answer — are
 * shown beside these as facts; these are the parts that need a person on the
 * phone or reading a screen. Two of them are the ones a double-brokered load
 * gets past: an authority that is active and a phone number that matches
 * FMCSA's.
 *
 * `carrier` items only apply once a carrier is on the load. Before that they
 * are shown greyed out and are not required, because the SA can go out first
 * — it is the client's commitment, and the carrier's comes after it.
 *
 * Keys are stored in `checks`. Renaming one drops everybody's tick on it.
 */
export interface SaReviewCheck {
  key: string;
  label: string;
  detail: string;
  carrier?: boolean;
}

export const SA_REVIEW_CHECKS: SaReviewCheck[] = [
  { key: 'client', label: 'Client and contact are right',
    detail: 'The SA goes to the email address shown. A wrong one sends our client’s rate to a stranger.' },
  { key: 'rate', label: 'Agreed rate is what the client accepted',
    detail: 'Check it against the quote or the email where they said yes.' },
  { key: 'lane', label: 'Addresses, dates and hours confirmed',
    detail: 'Every pickup and delivery, including appointment windows and any extra stops.' },
  { key: 'freight', label: 'Freight matches the truck',
    detail: 'Description, dimensions and weight fit the equipment, and nothing needs a permit nobody has arranged.' },
  { key: 'accessorials', label: 'Accessorials arranged',
    detail: 'Ramps, a winch, a liftgate, tarps, straps or chains, a pilot car — whatever this freight needs to load and unload is on the truck and priced in.' },
  { key: 'terms', label: 'Payment terms agreed',
    detail: 'How and when the client pays is set on the order and is what they agreed to.' },
  { key: 'carrierAuthority', label: 'Carrier authority active on FMCSA', carrier: true,
    detail: 'Run the FMCSA check on the carrier if the last one is more than a day old.' },
  { key: 'carrierInsurance', label: 'Carrier insurance on file and in date', carrier: true,
    detail: 'The certificate covers the pickup date and the cargo value.' },
  { key: 'carrierIdentity', label: 'Carrier contact matches FMCSA', carrier: true,
    detail: 'Call the number FMCSA lists, not the one in the email. This is how a double broker is caught.' },
  { key: 'carrierAge', label: `Carrier operating for ${MIN_OPERATING_MONTHS} months or more`, carrier: true,
    detail: 'From the date FMCSA granted its authority, shown on the left. If TTMS has no date, look the carrier up on SAFER.' },
  { key: 'driver', label: 'Driver name and phone confirmed', carrier: true,
    detail: 'With the carrier’s dispatcher, before the driver is named on any paperwork.' },
  { key: 'driverLicense', label: 'Driver’s license on file', carrier: true,
    detail: 'A copy uploaded on this load or on the driver’s record, in date, with the same name as the driver.' },
  { key: 'truckPhotos', label: 'Pictures of the driver’s truck on file', carrier: true,
    detail: 'In Pictures on this load, as “Truck”: truck and trailer, with the plate and the DOT number on the door readable.' },
];

/**
 * What TTMS can tell about the three items a file answers — the license, the
 * truck pictures, the carrier's age — worked out on the server by
 * `saGateFactsFor()`.
 */
export interface SaGateFacts {
  licenseOnFile: boolean;
  /** Epoch ms, or null when no expiry is recorded. */
  licenseExpiration: number | null;
  truckPhotos: number;
  operatingSince: OperatingSince | null;
}

/**
 * What the freight lines say the truck will need, beside the accessorials
 * item. A prompt, never a verdict: the order has no field for accessorials,
 * so this reads only what the lines already carry — whether a line is a
 * vehicle, and whether it runs. Nothing here blocks the tick.
 */
export function accessorialHints(commodities: readonly CommodityItem[] | null | undefined): string[] {
  const lines = commodities ?? [];
  const count = (pred: (c: CommodityItem) => boolean) =>
    lines.filter(pred).reduce((n, c) => n + Math.max(1, Number(c.quantity) || 1), 0);
  const inoperable = count((c) => c.condition === 'inoperable');
  const vehicles = count((c) => hasVehicleDetails(c) && c.condition !== 'inoperable');
  const out: string[] = [];
  if (inoperable) out.push(`${inoperable} inoperable vehicle${inoperable === 1 ? '' : 's'}: the truck needs a winch, and both ends a way to load it.`);
  if (vehicles) out.push(`${vehicles} vehicle${vehicles === 1 ? '' : 's'} on board: ramps on the truck, or a dock at both ends.`);
  return out;
}

/**
 * Why a review item cannot be ticked yet, or null when it can.
 *
 * For these three a tick saying "yes" against a file that says "no" would be
 * a tick nobody can trust, so the file decides and the tick only confirms a
 * person looked. An unknown carrier age is not refused — that is for the
 * reviewer to settle on SAFER — but a known one under six months is.
 */
export function checkBlockedBy(key: string, f: SaGateFacts | null | undefined, today: string = officeDay()): string | null {
  if (!f) return null;
  if (key === 'driverLicense') {
    if (!f.licenseOnFile) return 'No driver’s license uploaded on this load or the driver’s record.';
    if (f.licenseExpiration !== null && new Date(f.licenseExpiration).toISOString().slice(0, 10) < today) {
      return 'The driver’s license on file has expired.';
    }
  }
  if (key === 'truckPhotos' && f.truckPhotos === 0) {
    return 'No pictures marked “Truck” on this load yet.';
  }
  if (key === 'carrierAge' && isNewCarrier(f.operatingSince, today)) {
    return `This carrier has been operating less than ${MIN_OPERATING_MONTHS} months.`;
  }
  return null;
}

export function isReviewCheckKey(value: unknown): value is string {
  return typeof value === 'string' && SA_REVIEW_CHECKS.some((c) => c.key === value);
}

/**
 * The items still needed, given whether a carrier is on the load yet. With
 * `facts`, an item ticked earlier whose file has since gone — a license
 * deleted, a picture removed — counts as outstanding again.
 */
export function outstandingChecks(
  checks: Record<string, unknown>,
  hasCarrier: boolean,
  facts?: SaGateFacts | null,
): SaReviewCheck[] {
  return SA_REVIEW_CHECKS.filter((c) =>
    (hasCarrier || !c.carrier) && (!checks[c.key] || checkBlockedBy(c.key, facts) !== null));
}

/** "Chrome on Windows", "Safari on iPhone" — the device line on a signature. */
export function describeDevice(userAgent: string): string {
  const ua = userAgent || '';
  if (!ua) return 'Unknown device';
  const os =
    /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /CrOS/.test(ua) ? 'Chromebook'
    : /Linux/.test(ua) ? 'Linux'
    : 'an unknown system';
  // Order matters: Edge and Opera both say "Chrome", and Chrome says "Safari".
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'a browser';
  const mobile = /Mobile|iPhone|Android/.test(ua) ? ' (mobile)' : '';
  return `${browser} on ${os}${mobile}`;
}

/**
 * Everything a reviewer checks the request against, as the review screen
 * draws it. Built by `buildSaReview()`; also frozen onto a round at the
 * moment the SA is sent, as `dispatched`, so the record shows the facts as
 * they stood then rather than as they stand when somebody looks.
 */
export interface SaReview {
  readiness: ReadinessItem[];
  sendTo: { name: string; email: string } | null;
  carrier: {
    name: string; dot: string; mc: string; phone: string; email: string;
    insuranceExpiration: number | null; insuranceOnFile: boolean;
    fmcsaCheckedAt: number | null; fmcsaPhone: string; fmcsaConcerns: FmcsaConcern[] | null;
  } | null;
  pickupDate: number | null;
  agreedRate: number;
  carrierPay: number;
  brokerFee: number;
  hasClientPayment: boolean;
  gate: SaGateFacts;
  accessorialHints: string[];
  /** The client's own addresses, for the CC picker. Empty for a non-reviewer, and never frozen. */
  clientContacts: { name: string; email: string }[];
}

/** One email of the SA: the first, a resend, or a revision. */
export interface SaSend {
  at: number;
  byName: string;
  sentTo: string;
  cc: string[];
  /** The version of the client's link that went out. */
  version: number;
  kind: 'new' | 'resend' | 'revision';
}

/**
 * One round of the review, kept for good at `saRequests/{orderId}/rounds/{id}`.
 *
 * The request document is the round in progress and is replaced whenever a
 * new one opens — a broker asking again, or an order change after the SA
 * went out. Before that happens, and at every step that matters (sent, done,
 * sent back), the whole request is copied here, ticks and all. So a load
 * keeps every review it ever had, each with who ticked what and when, beside
 * the version of the SA it sent.
 *
 * A send with no request open — an older load, or dispatch sending straight
 * from Client Confirmation — is recorded as a round too (`direct`), with no
 * ticks, so the record of what went out and what TTMS knew then is complete.
 */
export interface SaRound {
  id: string;
  kind: 'review' | 'direct';
  /** Where the round ended up. `open`/`sent` on a superseded round is where it was when replaced. */
  status: SaRequestStatus | 'direct';
  reason: 'requested' | 'changed' | null;
  note: string;
  requestedByName: string;
  requestedAt: number;
  checks: Record<string, SaCheckMark>;
  sentAt: number | null;
  sentByName: string | null;
  sentTo: string | null;
  sentCc: string[];
  /** The SA version this round sent. Null when it never sent one. */
  saVersion: number | null;
  /** The facts at the first send. Null on a round that never sent, and on rounds from before this was kept. */
  dispatched: SaReview | null;
  sends: SaSend[];
  doneAt: number | null;
  doneByName: string | null;
  returnedAt: number | null;
  returnedByName: string | null;
  returnReason: string | null;
  /** When a newer round replaced it. */
  supersededAt: number | null;
}
