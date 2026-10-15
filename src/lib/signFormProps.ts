import { formatLongDateRange } from '@/lib/dateFormat';
import { phoneRegionOf, PHONE_COUNTRY_CODE } from '@/lib/phone';
import { CARRIER_TERMS, DEFAULT_CLIENT_TERMS } from '@/types/agreementTerms';
import type { ConfirmationFreight, ConfirmationPayment, ConfirmationStop } from '@/types/loadConfirmation';

/**
 * What the signing page shows, worked out from a signing link's stored data.
 * One mapping for the public page (`/sign/[token]`) and the staff preview on
 * the order (`/dashboard/orders/{id}/agreement`), so the preview cannot drift
 * from what the client actually sees.
 *
 * Plain values only — it crosses from the server into a client component, and
 * Firestore timestamps do not.
 */

export interface SignFormData {
  type: 'carrier_agreement' | 'shipper_agreement';
  orderNumber: string;
  partyName: string;
  driverName: string;
  commodity: string;
  weight: string;
  pieces: string;
  dimensions: string;
  originStr: string;
  destinationStr: string;
  pickupDate: string;
  deliveryDate: string;
  rate: string;
  /**
   * The order's notes as a link sent before 2026-10-14 was shown them, when
   * the one Notes box went on everything. '' on every link since: notes are
   * internal now, and what the signer sees is `instructions`.
   */
  notes: string;
  /** Our special instructions for whoever signs — the client's or the carrier's. */
  instructions: string;
  /**
   * What the client typed into "Special instructions" when they signed this
   * link. '' until signed, and on carrier links. Theirs, kept beside ours.
   */
  signerInstructions: string;
  /**
   * Who loads, unloads and counts — carrier links only, and only the
   * questions answered on the order when it was sent (dockWorkLines()).
   * Absent on links sent before 2026-10-15.
   */
  dockWork?: { label: string; value: string }[];
  terms?: string;
  stops?: ConfirmationStop[];
  freight?: ConfirmationFreight[];
  equipment?: string;
  payment?: ConfirmationPayment | null;
  validUntil?: string;
  sentByName?: string;
  sentByEmail?: string;
  /**
   * The load's broker — who the signer should call. '' on links sent before
   * brokers were named, which show the sender instead. See paperworkBroker().
   */
  brokerName?: string;
  brokerEmail?: string;
  /** Work number with its extension, ready to print. */
  brokerPhone?: string;
  version?: number;
  revisedNote?: string;
  /*
   * The client's own details and two dates, for the PDF's header — what BATS
   * printed there. Client copies only, and '' on links sent before they were
   * copied onto the link: the PDF leaves out what it does not have rather
   * than reading today's order.
   */
  clientContactName?: string;
  /** Street, then "City, ST ZIP". */
  clientAddressLines?: string[];
  clientPhone?: string;
  orderDate?: string;
  firstAvailablePickup?: string;
}

/** A stored phone as it prints on paper: the country code in front of anything not American. */
function paperPhone(raw: unknown, region: unknown): string {
  const phone = typeof raw === 'string' ? raw.trim() : '';
  if (!phone) return '';
  const r = phoneRegionOf(region);
  return r === 'US' ? phone : `+${PHONE_COUNTRY_CODE[r]} ${phone}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addressLines(a: any): string[] {
  if (!a || typeof a !== 'object') return [];
  const place = [[a.city, a.state].filter(Boolean).join(', '), a.zip].filter(Boolean).join(' ');
  return [String(a.street ?? '').trim(), place.trim()].filter(Boolean);
}

export function longDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function currency(n: number): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function signFormData(data: Record<string, any>): SignFormData {
  // `shipper_agreement` is the client's load confirmation — the token type is
  // historical and names the field it writes, not who signs it.
  const isClient = data.type === 'shipper_agreement';
  return {
    type: isClient ? 'shipper_agreement' : 'carrier_agreement',
    orderNumber: String(data.orderNumber ?? ''),
    /*
     * Who the document names.
     *
     * `shipperName` is the fallback: links emailed before the load confirmation
     * was readdressed to the client stored the name under that key, and they
     * stay live for seven days. Without it, a carrier or client part-way through
     * signing would see a blank party name on a legal document.
     */
    partyName: isClient ? (data.clientName || data.shipperName || '') : (data.carrierName || ''),
    driverName: data.driverName || '',
    commodity: data.commodity || '',
    weight: data.weight ? `${Number(data.weight).toLocaleString()} lbs` : '—',
    pieces: data.pieces ? String(data.pieces) : '—',
    dimensions: data.dimensions || '',
    originStr: data.originStr || '—',
    destinationStr: data.destinationStr || '—',
    pickupDate: formatLongDateRange(data.pickupDate, data.pickupDateEnd),
    deliveryDate: formatLongDateRange(data.deliveryDate, data.deliveryDateEnd),
    rate: currency(isClient ? data.agreedRate : data.carrierPay),
    notes: data.notes || '',
    instructions: typeof data.specialInstructions === 'string' ? data.specialInstructions : '',
    signerInstructions: typeof data.signerInstructions === 'string' ? data.signerInstructions : '',
    dockWork: !isClient && Array.isArray(data.dockWork)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? data.dockWork.filter((l: any) => l && typeof l.label === 'string' && typeof l.value === 'string')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((l: any) => ({ label: l.label, value: l.value }))
      : undefined,
    // A client link sent before the terms were a setting has no copy of
    // them, and was sent under the standard wording — which is what it shows.
    terms: isClient ? (typeof data.termsText === 'string' && data.termsText ? data.termsText : DEFAULT_CLIENT_TERMS) : CARRIER_TERMS,
    stops: isClient && Array.isArray(data.stops) ? data.stops : undefined,
    freight: isClient && Array.isArray(data.freight) ? data.freight : undefined,
    equipment: isClient ? data.equipment || '' : undefined,
    payment: isClient ? data.payment ?? null : undefined,
    validUntil: longDate(data.expiresAt),
    sentByName: data.sentByName || '',
    sentByEmail: data.sentByEmail || '',
    brokerName: data.brokerName || '',
    brokerEmail: data.brokerEmail || '',
    brokerPhone: data.brokerPhone || '',
    version: typeof data.version === 'number' ? data.version : undefined,
    revisedNote: typeof data.version === 'number' && data.version > 1
      ? `This is an updated agreement${data.changedSections ? ` (changed: ${data.changedSections})` : ''}. It replaces the version we sent you${data.previousSentAt ? ` on ${longDate(data.previousSentAt)}` : ' before'}. Please review it again before signing.`
      : undefined,
    clientContactName: isClient ? String(data.clientContactName ?? '') : undefined,
    clientAddressLines: isClient ? addressLines(data.clientAddress) : undefined,
    clientPhone: isClient ? paperPhone(data.clientPhone, data.clientPhoneRegion) : undefined,
    orderDate: isClient ? formatLongDateRange(data.orderCreatedAt, null, '') : undefined,
    firstAvailablePickup: isClient ? formatLongDateRange(data.firstAvailablePickup, null, '') : undefined,
  };
}
