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
  { key: 'terms', label: 'Payment terms agreed',
    detail: 'How and when the client pays is set on the order and is what they agreed to.' },
  { key: 'carrierAuthority', label: 'Carrier authority active on FMCSA', carrier: true,
    detail: 'Run the FMCSA check on the carrier if the last one is more than a day old.' },
  { key: 'carrierInsurance', label: 'Carrier insurance on file and in date', carrier: true,
    detail: 'The certificate covers the pickup date and the cargo value.' },
  { key: 'carrierIdentity', label: 'Carrier contact matches FMCSA', carrier: true,
    detail: 'Call the number FMCSA lists, not the one in the email. This is how a double broker is caught.' },
  { key: 'driver', label: 'Driver name and phone confirmed', carrier: true,
    detail: 'With the carrier’s dispatcher, before the driver is named on any paperwork.' },
];

export function isReviewCheckKey(value: unknown): value is string {
  return typeof value === 'string' && SA_REVIEW_CHECKS.some((c) => c.key === value);
}

/** The ticks still needed, given whether a carrier is on the load yet. */
export function outstandingChecks(checks: Record<string, unknown>, hasCarrier: boolean): SaReviewCheck[] {
  return SA_REVIEW_CHECKS.filter((c) => (hasCarrier || !c.carrier) && !checks[c.key]);
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
