import { PHONE_COUNTRY_CODE, phoneRegionOf } from '@/lib/phone';
import type { PhoneRegion } from '@/lib/phone';
import { formatLongDateRange } from '@/lib/dateFormat';
import type { Party } from '@/types/party';
import type { Carrier } from '@/types/carrier';

/**
 * Sending a signing link by text message, from the broker's own phone apps.
 *
 * TTMS does not send texts itself. A texting service (Twilio and the like)
 * would need US carrier registration (A2P 10DLC) before a single message got
 * through, and the office already texts clients from RingCentral and WhatsApp.
 * So this only writes the message and opens the app with it filled in; the
 * broker presses Send. Nothing is recorded, because TTMS cannot know whether
 * they did.
 *
 * It is no weaker than the email: the signing page still asks for an email or
 * phone we hold before it shows anything (src/lib/signAccess.ts), and the
 * signature still records the device and address it came from.
 */

/** A number we hold for the signer, to offer in the "send to" list. */
export type TextTarget = {
  /** Shown in the picker — "Main phone", "Dispatcher", "Ana (contact)". */
  label: string;
  phone: string;
  region: PhoneRegion;
};

function push(into: TextTarget[], label: string, phone: unknown, region: unknown) {
  if (typeof phone !== 'string' || phone.replace(/\D/g, '').length < 7) return;
  const r = phoneRegionOf(region);
  const key = internationalDigits(phone, r);
  if (into.some((t) => internationalDigits(t.phone, t.region) === key)) return;
  into.push({ label, phone: phone.trim(), region: r });
}

/**
 * The client's numbers, in the order a broker would try them. These are the
 * same numbers onFileFor() in signAccess.ts accepts at the door, so a number
 * picked from this list is also one that opens the link.
 */
export function partyTextTargets(p: Party | undefined | null): TextTarget[] {
  const out: TextTarget[] = [];
  if (!p) return out;
  push(out, 'Main phone', p.phone, p.phoneRegion);
  push(out, 'Second phone', p.phone2, p.phone2Region);
  // A contact has no country beside its number; signAccess reads that as US too.
  for (const c of p.contacts ?? []) {
    push(out, c.name ? `${c.name} (contact)` : 'Contact', c.phone, undefined);
  }
  return out;
}

/** The carrier's numbers — dispatch first, since that is who books loads. */
export function carrierTextTargets(c: Carrier | undefined | null): TextTarget[] {
  const out: TextTarget[] = [];
  if (!c) return out;
  push(out, 'Dispatcher', c.dispatcherPhone, c.dispatcherPhoneRegion);
  push(out, 'Main phone', c.phone, c.phoneRegion);
  push(out, 'Billing', c.billingPhone, c.billingPhoneRegion);
  return out;
}

/**
 * Country code and number as bare digits — `14699354100`. The same prefix test
 * as telHref() in phone.ts, which says why it is safe in both directions.
 */
export function internationalDigits(phone: string, region: PhoneRegion): string {
  const digits = phone.replace(/\D/g, '');
  const code = PHONE_COUNTRY_CODE[region];
  return digits.startsWith(code) ? digits : code + digits;
}

/**
 * The message. Plain, short, and it says what the page will ask for, because
 * a client who meets an unexpected "enter your email or phone" box assumes it
 * is a scam and stops there.
 *
 * `fromFile` is true when the number came off the record: then we can say
 * "this phone number" works, since it is one the door accepts. A number typed
 * in by hand may not be on file, so that message stays general rather than
 * promising something the page will refuse.
 *
 * The date is spelled out, like everything that leaves the company — a
 * slashed date is two different days depending on the reader.
 */
export function signTextMessage(opts: {
  party: 'client' | 'carrier';
  orderNumber?: string;
  url: string;
  expiresAt?: string | null;
  fromFile: boolean;
}): string {
  const load = opts.orderNumber ? ` for load #${opts.orderNumber}` : '';
  const doc = opts.party === 'carrier' ? 'the rate confirmation (Dispatch Sheet)' : 'the load confirmation';
  const until = opts.expiresAt ? formatLongDateRange(opts.expiresAt, opts.expiresAt, '') : '';
  const door = opts.fromFile
    ? 'When it opens, type this phone number (or your email) to see the document.'
    : 'When it opens, type the email or phone number we have on file for you to see the document.';
  return [
    `Hello, this is Total Transport Logistics. Please review and sign ${doc}${load}:`,
    opts.url,
    door + (until ? ` The link works until ${until}.` : ''),
    'Questions? Just reply to this message.',
  ].join('\n\n');
}

/**
 * Opens whichever app the computer uses for texts — RingCentral, when it is
 * set as the default for text messages, or Phone Link. `?body=` is the form
 * current iPhone, Android and Windows handlers all read.
 */
export function smsHref(phone: string, region: PhoneRegion, body: string): string {
  return `sms:+${internationalDigits(phone, region)}?body=${encodeURIComponent(body)}`;
}

/** WhatsApp's own click-to-chat link; it opens WhatsApp Desktop when installed, WhatsApp Web otherwise. */
export function whatsappHref(phone: string, region: PhoneRegion, body: string): string {
  return `https://wa.me/${internationalDigits(phone, region)}?text=${encodeURIComponent(body)}`;
}
