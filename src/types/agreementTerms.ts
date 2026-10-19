/**
 * The terms and conditions printed on the client's load confirmation (the
 * "SA") and on the carrier's Dispatch Sheet (the "CA"), and accepted on the
 * public signing page.
 *
 * Kept by admin and dispatch in Settings → Operations → Agreement Terms, under
 * `agreementTerms.manage`. Stored as `appSettings/agreementTerms` rather than
 * a key on `appSettings/general`: that document is read on nearly every page,
 * and several kilobytes of legal text would ride along on every one of those
 * reads for the sake of one panel and one public page.
 *
 * **What the settings hold is what the next agreement is sent with, never what
 * an earlier one says.** The send route copies the text onto the signing token
 * (`termsText`), and the signing page shows the copy. A link already in a
 * client's inbox keeps the terms it was sent with even if dispatch rewrites
 * them an hour later — otherwise a client could sign wording that did not
 * exist when they were asked to, and the token would no longer record what was
 * agreed. A token from before this existed has no copy, and the page falls
 * back to `DEFAULT_CLIENT_TERMS` / `DEFAULT_CARRIER_TERMS`, which are the
 * texts those links were sent under. Carrier links began carrying their copy
 * on 2026-10-19, when the carrier's terms became a setting too.
 */

/** Whose document a set of terms is printed on. Same words as `AgreementParty`. */
export type TermsParty = 'client' | 'carrier';

export interface AgreementTerms {
  /** The client load confirmation's terms, as plain text. Line breaks are kept. */
  client: string;
  /** The carrier Dispatch Sheet's terms, as plain text. */
  carrier: string;
}

/** A stop on a runaway document, and far more than any real set of terms. */
export const MAX_TERMS_LENGTH = 20_000;

/**
 * The wording every client agreement was sent under before the terms became a
 * setting — moved here verbatim from the signing form. Changing it changes
 * what the unconfigured company sends, and what old links fall back to; edit
 * the setting instead.
 */
export const DEFAULT_CLIENT_TERMS = `SHIPPER LOAD CONFIRMATION

This Load Confirmation ("Agreement") is entered into between Total Transport Logistics ("Broker") and the client identified above ("Client").

1. LOAD ACCEPTANCE. By signing below, Client confirms the freight details described in this confirmation and authorizes Total Transport Logistics to arrange transportation of the described shipment.

2. RATE. Client agrees to pay the Agreed Rate stated above for transportation services. Payment terms are net 30 days from invoice date.

3. FREIGHT DESCRIPTION. Client warrants that the commodity description, weight, and piece count are accurate. Any discrepancies may result in additional charges.

4. PICKUP & DELIVERY. Client is responsible for having freight ready at the origin location on the specified pickup date. Delivery estimates are not guaranteed unless stated as guaranteed service.

5. CLAIMS. Any freight claims must be submitted in writing within 9 months of delivery. Client must retain all supporting documentation including bills of lading and delivery receipts.

6. INDEMNIFICATION. Client shall indemnify and hold harmless Total Transport Logistics from any claims arising from Client's failure to properly prepare, describe, or label the freight.

7. DIGITAL SIGNATURE. The parties agree that an electronic signature is legally binding to the same extent as a wet ink signature pursuant to the Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state law. Client's name, IP address, date, and time are recorded upon submission.

8. GOVERNING LAW. This Agreement is governed by the laws of the United States and the state of Texas.`;

/**
 * The wording every carrier agreement was sent under before the terms became
 * a setting. Carrier links sent before 2026-10-19 carry no copy of their
 * terms and are shown and printed with this, so **changing it changes what
 * those Dispatch Sheets say, signed ones included.** Edit the setting instead.
 */
export const DEFAULT_CARRIER_TERMS = `DISPATCH SHEET

This Dispatch Sheet ("Agreement") is entered into between Total Transport Logistics ("Broker") and the carrier identified above ("Carrier").

1. LOAD ACCEPTANCE. By signing below, Carrier accepts the load described in this Dispatch Sheet and agrees to transport the shipment in accordance with all terms herein.

2. RATE. Carrier agrees to accept the Carrier Pay stated above as full and complete compensation for services rendered. Payment will be made within 30 days of receipt of a signed Proof of Delivery (POD) and invoice.

3. CARRIER OBLIGATIONS. Carrier shall: (a) pick up and deliver the shipment on the dates specified; (b) ensure the driver is properly licensed and the vehicle is in safe, roadworthy condition; (c) comply with all federal, state, and local regulations including FMCSA requirements; (d) not broker, re-broker, or assign this load to any third party without prior written consent from Broker.

4. INSURANCE. Carrier represents and warrants that it maintains continuous cargo insurance of at least $100,000 and liability insurance of at least $1,000,000. Carrier must provide certificate of insurance upon request.

5. LOSS & DAMAGE. Carrier is liable for cargo loss or damage under the Carmack Amendment (49 U.S.C. § 14706). Carrier shall not limit its liability below the full actual value of the shipment.

6. DOUBLE BROKERING. Any attempt to re-broker this shipment without authorization is grounds for immediate termination of this agreement and Carrier shall forfeit all compensation.

7. DIGITAL SIGNATURE. The parties agree that an electronic signature is legally binding to the same extent as a wet ink signature pursuant to the Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state law. Carrier's name, IP address, date, and time are recorded upon submission.

8. GOVERNING LAW. This Agreement is governed by the laws of the United States and the state of Texas.`;

export const DEFAULT_TERMS: Record<TermsParty, string> = {
  client: DEFAULT_CLIENT_TERMS,
  carrier: DEFAULT_CARRIER_TERMS,
};

/** Who is asked to accept them, for the one sentence that names them. */
const SIGNERS: Record<TermsParty, string> = { client: 'Clients', carrier: 'Carriers' };

/**
 * Checks the terms as saved. Returns the cleaned text, or the sentence to show.
 * Run in the panel before saving and again in `PUT /api/agreement-terms`,
 * which is where it counts.
 *
 * Empty is refused rather than read as "use the default": a signer asked to
 * accept terms and shown none has agreed to nothing, and an admin clearing the
 * box by accident should be told rather than silently given the old wording.
 */
export function validateTerms(raw: unknown, party: TermsParty): { text: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'The terms are missing.' };
  // Trailing spaces and Windows line endings are noise; the line breaks
  // themselves are the layout of the document and are kept.
  const text = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
  if (!text) return { error: `The terms cannot be empty. ${SIGNERS[party]} are asked to accept them before they sign.` };
  if (text.length > MAX_TERMS_LENGTH) {
    return { error: `The terms are too long — ${MAX_TERMS_LENGTH.toLocaleString('en-US')} characters at most.` };
  }
  return { text };
}

/** The stored terms, with the default for anything unusable — read side. */
export function readTerms(raw: unknown, party: TermsParty): string {
  const checked = validateTerms(raw, party);
  return 'text' in checked ? checked.text : DEFAULT_TERMS[party];
}

/** What each document is called on screen, for headings and change-log lines. */
export const TERMS_DOC_LABEL: Record<TermsParty, string> = {
  client: 'client SA',
  carrier: 'carrier Dispatch Sheet',
};

/**
 * Where an order keeps terms of its own — one load's replacement for the
 * general wording, set from the order. Absent or null means the load follows
 * the general terms. Kept by `/api/orders/{id}/terms` only; a SERVER_KEPT
 * field in orderWrites.ts, so an ordinary order edit cannot set it and skip
 * the approval below.
 */
export const ORDER_TERMS_FIELD = { client: 'clientTerms', carrier: 'carrierTerms' } as const satisfies Record<TermsParty, string>;

/** The order's own terms for `party`, or null when it follows the general ones. */
export function orderTermsOf(order: Record<string, unknown> | null | undefined, party: TermsParty): string | null {
  const raw = order?.[ORDER_TERMS_FIELD[party]];
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

/**
 * A change to the terms waiting on an admin — `termsChangeRequests/{id}`.
 *
 * Changing the terms is a change to a contract, so somebody who can edit them
 * but not approve them (dispatch, by default) proposes; somebody holding
 * `agreementTerms.approve` (admin) decides. An approver's own edit applies at
 * once — they would only be approving themselves.
 *
 * **Where it was made is what it changes**, and the approver cannot widen it:
 * a request from Settings is for the general terms; a request from an order is
 * for that order alone. An approver who likes an order's wording enough to use
 * it everywhere pastes it into Settings, as a separate decision.
 *
 * `text` null on an order request means "go back to the general terms".
 * `baseText` is what the proposer was looking at, so the approver can see
 * whether the terms moved underneath the request before deciding.
 */
export type TermsScope = 'general' | 'order';
export type TermsRequestStatus = 'pending' | 'approved' | 'denied' | 'withdrawn';

export interface TermsChangeRequest {
  id: string;
  scope: TermsScope;
  party: TermsParty;
  orderId: string | null;
  orderNumber: string | null;
  text: string | null;
  baseText: string;
  /** Optional, from the proposer: why. */
  reason: string;
  status: TermsRequestStatus;
  requestedByUid: string;
  requestedByName: string;
  requestedByEmail: string;
  requestedAt: string | null;
  decidedByUid: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string;
  /**
   * Filled in on the way out, never stored: the terms as they stand now, so
   * the approver compares against today's wording rather than `baseText`.
   */
  currentText?: string;
}

export const MAX_TERMS_REASON = 500;

/** What a request asks for, in one line. */
export function termsRequestSummary(r: Pick<TermsChangeRequest, 'scope' | 'party' | 'orderNumber' | 'text'>): string {
  const doc = TERMS_DOC_LABEL[r.party];
  if (r.scope === 'general') return `Change the general terms on every ${doc}`;
  const load = r.orderNumber ? `load ${r.orderNumber}` : 'one load';
  return r.text === null
    ? `Put ${load} back on the general ${doc} terms`
    : `Give ${load} its own ${doc} terms`;
}
