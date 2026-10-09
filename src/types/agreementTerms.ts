/**
 * The terms and conditions printed on the client's load confirmation (the
 * "SA") and accepted on the public signing page.
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
 * back to `DEFAULT_CLIENT_TERMS`, which is the text those links were sent
 * under.
 */

export interface AgreementTerms {
  /** The client load confirmation's terms, as plain text. Line breaks are kept. */
  client: string;
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

export const DEFAULT_AGREEMENT_TERMS: AgreementTerms = { client: DEFAULT_CLIENT_TERMS };

/**
 * Checks the terms as saved. Returns the cleaned text, or the sentence to show.
 * Run in the panel before saving and again in `PUT /api/agreement-terms`,
 * which is where it counts.
 *
 * Empty is refused rather than read as "use the default": a client asked to
 * accept terms and shown none has agreed to nothing, and an admin clearing the
 * box by accident should be told rather than silently given the old wording.
 */
export function validateClientTerms(raw: unknown): { text: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'The terms are missing.' };
  // Trailing spaces and Windows line endings are noise; the line breaks
  // themselves are the layout of the document and are kept.
  const text = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
  if (!text) return { error: 'The terms cannot be empty. Clients are asked to accept them before they sign.' };
  if (text.length > MAX_TERMS_LENGTH) {
    return { error: `The terms are too long — ${MAX_TERMS_LENGTH.toLocaleString('en-US')} characters at most.` };
  }
  return { text };
}

/** The stored terms, with the default for anything unusable — read side. */
export function readClientTerms(raw: unknown): string {
  const checked = validateClientTerms(raw);
  return 'text' in checked ? checked.text : DEFAULT_CLIENT_TERMS;
}
