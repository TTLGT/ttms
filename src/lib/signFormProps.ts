import { formatLongDateRange } from '@/lib/dateFormat';
import { DEFAULT_CLIENT_TERMS } from '@/types/agreementTerms';
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
  notes: string;
  terms?: string;
  stops?: ConfirmationStop[];
  freight?: ConfirmationFreight[];
  equipment?: string;
  payment?: ConfirmationPayment | null;
  validUntil?: string;
  sentByName?: string;
  sentByEmail?: string;
  version?: number;
  revisedNote?: string;
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
    // A client link sent before the terms were a setting has no copy of
    // them, and was sent under the standard wording — which is what it shows.
    terms: isClient ? (typeof data.termsText === 'string' && data.termsText ? data.termsText : DEFAULT_CLIENT_TERMS) : undefined,
    stops: isClient && Array.isArray(data.stops) ? data.stops : undefined,
    freight: isClient && Array.isArray(data.freight) ? data.freight : undefined,
    equipment: isClient ? data.equipment || '' : undefined,
    payment: isClient ? data.payment ?? null : undefined,
    validUntil: longDate(data.expiresAt),
    sentByName: isClient ? data.sentByName || '' : undefined,
    sentByEmail: isClient ? data.sentByEmail || '' : undefined,
    version: typeof data.version === 'number' ? data.version : undefined,
    revisedNote: typeof data.version === 'number' && data.version > 1
      ? `This is an updated agreement${data.changedSections ? ` (changed: ${data.changedSections})` : ''}. It replaces the version we sent you${data.previousSentAt ? ` on ${longDate(data.previousSentAt)}` : ' before'}. Please review it again before signing.`
      : undefined,
  };
}
