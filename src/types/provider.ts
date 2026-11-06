import type { Address } from './order';
import type { Accessorial, DockHelpService } from './order';
import { phoneRegionOf, type PhoneRegion } from '@/lib/phone';
import { addressLine, cleanAddress } from './partyAddress';

/**
 * 3rd-party providers (2026-11-06): the lumpers, forklift and crane outfits,
 * rigging crews, pilot cars and the rest that a load hires at a dock or on
 * the road. A company-wide directory — **everybody on the allowlist can see
 * and search every one**, because unlike a client nobody owns a lumper crew
 * and the whole point is that the next broker at that dock can find the
 * number. So there is no ownership here and none of the party machinery.
 *
 * What is recorded:
 *
 *  - the provider: services, where they work, contact details, their prices;
 *  - every payment TTL makes them, with its receipts (`providers/{id}/payments`).
 *
 * Closed to the browser: no Firestore rule matches `providers`, so every read
 * and write is through `/api/providers`, and receipts sit under
 * `provider-receipts/` with no storage rule at all, served only as signed
 * links. Edits write the record's change log (`changes`), like a carrier's.
 *
 * Who does what:
 *  - read the directory: anybody signed in, interns included;
 *  - add or edit a provider, record a payment, add a receipt: `orders.view`
 *    (everybody but interns — the people who book them);
 *  - see payments: `orders.view` as well;
 *  - void a payment: `orders.payments` (admin, finance). A payment is never
 *    deleted; a void keeps it, struck through, with who and why.
 */

export const PROVIDERS_COLLECTION = 'providers';
export const PROVIDER_PAYMENTS_SUBCOLLECTION = 'payments';

export type ProviderService =
  | 'lumper' | 'forklift' | 'crane' | 'rigging' | 'pilot_car' | 'permits'
  | 'storage' | 'towing' | 'repair' | 'tarping' | 'other';

export const PROVIDER_SERVICES: ProviderService[] = [
  'lumper', 'forklift', 'crane', 'rigging', 'pilot_car', 'permits', 'storage', 'towing', 'repair', 'tarping', 'other',
];

export const PROVIDER_SERVICE_LABEL: Record<ProviderService, string> = {
  lumper:    'Lumper',
  forklift:  'Forklift',
  crane:     'Crane',
  rigging:   'Rigging crew',
  pilot_car: 'Pilot car / escort',
  permits:   'Permits',
  storage:   'Storage / warehouse',
  towing:    'Towing',
  repair:    'Truck repair',
  tarping:   'Tarping',
  other:     'Other',
};

/** Which providers the order form offers for a kind of dock help. */
export function providerServiceFor(help: DockHelpService | null | undefined): ProviderService | null {
  return help && help !== 'other' ? help : null;
}

/**
 * Which providers to offer first for an additional service in Price and
 * Terms (2026-11-06). Null where the directory has no matching service —
 * the picker then lists everybody by name. Only a ranking, never a filter:
 * a towing outfit that also sends a mechanic must still be pickable.
 */
const SERVICE_FOR_ACCESSORIAL: Partial<Record<Accessorial, ProviderService>> = {
  pilot_car: 'pilot_car', oversize_permit: 'permits', towing: 'towing', mechanic: 'repair',
  forklift: 'forklift', crane: 'crane', rigging: 'rigging', storage: 'storage', lumper: 'lumper',
};
export function providerServiceForAccessorial(a: Accessorial | 'other'): ProviderService | null {
  return a === 'other' ? null : SERVICE_FOR_ACCESSORIAL[a] ?? null;
}

export type RateUnit = 'flat' | 'hour' | 'pallet' | 'piece' | 'mile' | 'day' | 'load';
export const RATE_UNITS: RateUnit[] = ['flat', 'hour', 'pallet', 'piece', 'mile', 'day', 'load'];
export const RATE_UNIT_LABEL: Record<RateUnit, string> = {
  flat: 'flat', hour: 'per hour', pallet: 'per pallet', piece: 'per piece', mile: 'per mile', day: 'per day', load: 'per load',
};

/** One price a provider quoted us. A note, not a contract: what they said last. */
export interface ProviderRate {
  id: string;
  service: ProviderService;
  /** "Floor load, 53' trailer", "Minimum 4 hours". */
  description: string;
  amount: number | null;
  unit: RateUnit;
}

export interface Provider {
  id: string;
  companyName: string;
  /** Lower-cased name, for sorting and the duplicate check. */
  nameKey: string;
  services: ProviderService[];
  /** What `other` is, or anything the service list does not say. */
  serviceNote: string;
  contactName: string;
  phone: string;
  phoneRegion?: PhoneRegion;
  phone2: string;
  phone2Region?: PhoneRegion;
  email: string;
  website: string;
  address: Address;
  /** Where else they work: "DFW and 100 miles around", "All of Georgia". */
  serviceArea: string;
  rates: ProviderRate[];
  notes: string;
  /** Kept by the payment routes, for the directory list. */
  paymentCount: number;
  totalPaid: number;
  lastPaidOn: string | null;
  createdByUid: string;
  createdByName: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type PaymentMethod = 'cash' | 'check' | 'card' | 'ach' | 'zelle' | 'comchek' | 'efs' | 'wire' | 'other';
export const PAYMENT_METHODS: PaymentMethod[] = ['comchek', 'efs', 'card', 'ach', 'zelle', 'check', 'cash', 'wire', 'other'];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash', check: 'Check', card: 'Card', ach: 'ACH', zelle: 'Zelle',
  comchek: 'Comchek', efs: 'EFS check', wire: 'Wire', other: 'Other',
};

export interface ProviderReceipt {
  id: string;
  name: string;
  contentType: string;
  size: number;
  uploadedByUid: string;
  uploadedByName: string;
  uploadedAt: unknown;
  /** Signed, two-to-three hours, added when read. Never stored. */
  url?: string;
}

export interface ProviderPayment {
  id: string;
  amount: number;
  /** `YYYY-MM-DD`, the day it was paid — office time, typed by a person. */
  paidOn: string;
  method: PaymentMethod;
  /** Check, Comchek or transaction number. */
  reference: string;
  service: ProviderService | null;
  /** The load it was for, when there was one. */
  orderId: string | null;
  orderNumber: string;
  notes: string;
  receipts: ProviderReceipt[];
  recordedByUid: string;
  recordedByName: string;
  createdAt: unknown;
  voidedAt: unknown | null;
  voidedByUid: string | null;
  voidedByName: string | null;
  voidReason: string | null;
}

export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const MAX_RECEIPTS_PER_PAYMENT = 10;
/** What a receipt may be: a picture of it or the PDF. */
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

/** Where a receipt sits in the bucket. Built, never stored or taken from a request. */
export function providerReceiptPath(providerId: string, paymentId: string, receiptId: string): string {
  return `provider-receipts/${providerId}/${paymentId}/${receiptId}`;
}

// ─── Cleaning what a form sends ─────────────────────────────────────────────

const LIMITS = {
  companyName: 120, serviceNote: 200, contactName: 120, phone: 40, email: 160, website: 200,
  serviceArea: 200, notes: 4000, rateDescription: 160,
} as const;

function str(v: unknown, max: number): string {
  return (typeof v === 'string' ? v.trim() : '').slice(0, max);
}

export function isProviderService(v: unknown): v is ProviderService {
  return typeof v === 'string' && (PROVIDER_SERVICES as string[]).includes(v);
}

export function providerNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The editable fields of a provider, checked, from whatever JSON came in. */
export function cleanProviderFields(raw: unknown, newId: () => string): Omit<Provider,
  'id' | 'nameKey' | 'paymentCount' | 'totalPaid' | 'lastPaidOn' | 'createdByUid' | 'createdByName' | 'createdAt' | 'updatedAt'> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const services = Array.isArray(r.services) ? [...new Set(r.services.filter(isProviderService))] : [];
  const rates: ProviderRate[] = (Array.isArray(r.rates) ? r.rates : []).slice(0, 40).flatMap((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const amount = typeof o.amount === 'number' && Number.isFinite(o.amount) && o.amount >= 0
      ? Math.round(o.amount * 100) / 100
      : typeof o.amount === 'string' && o.amount.trim() && Number.isFinite(Number(o.amount.replace(/[$,]/g, '')))
        ? Math.round(Number(o.amount.replace(/[$,]/g, '')) * 100) / 100
        : null;
    const description = str(o.description, LIMITS.rateDescription);
    if (amount == null && !description) return [];
    return [{
      id:      typeof o.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(o.id) ? o.id : newId(),
      service: isProviderService(o.service) ? o.service : (services[0] ?? 'other'),
      description,
      amount,
      unit:    (RATE_UNITS as string[]).includes(String(o.unit)) ? o.unit as RateUnit : 'flat',
    }];
  });
  return {
    companyName:  str(r.companyName, LIMITS.companyName),
    services,
    serviceNote:  str(r.serviceNote, LIMITS.serviceNote),
    contactName:  str(r.contactName, LIMITS.contactName),
    phone:        str(r.phone, LIMITS.phone),
    phoneRegion:  phoneRegionOf(r.phoneRegion),
    phone2:       str(r.phone2, LIMITS.phone),
    phone2Region: phoneRegionOf(r.phone2Region),
    email:        str(r.email, LIMITS.email).toLowerCase(),
    website:      str(r.website, LIMITS.website),
    address:      cleanAddress(r.address),
    serviceArea:  str(r.serviceArea, LIMITS.serviceArea),
    rates,
    notes:        str(r.notes, LIMITS.notes),
  };
}

/** Why a provider cannot be saved, or ''. A name and a way to reach them. */
export function providerProblem(p: Pick<Provider, 'companyName' | 'phone' | 'email' | 'services'>): string {
  if (!p.companyName) return 'Give the provider a name.';
  if (!p.services.length) return 'Tick at least one service they provide.';
  if (!p.phone && !p.email) return 'Add a phone number or an email, so the next person can reach them.';
  return '';
}

// ─── Searching the directory ────────────────────────────────────────────────

function digits(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '');
}

/**
 * Whether a provider matches what was typed in the directory's search box.
 * Every word must be found somewhere — the name, a service, the contact,
 * the city, state, ZIP or street, the service area, the email, the notes,
 * a rate's description — and a run of digits also matches inside either
 * phone number, so "214 555" finds (214) 555-0199.
 */
export function providerMatches(p: Provider, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    p.companyName, p.contactName, p.email, p.website, p.serviceArea, p.serviceNote, p.notes,
    addressLine(p.address), p.address?.state, p.address?.city,
    ...p.services.map((s) => PROVIDER_SERVICE_LABEL[s]),
    ...p.rates.map((r) => r.description),
    p.phone, p.phone2,
  ].join(' ').toLowerCase();
  const phones = `${digits(p.phone)} ${digits(p.phone2)}`;
  return words.every((w) => hay.includes(w) || (/^\d{3,}$/.test(digits(w)) && phones.includes(digits(w))));
}

/** "$45.00 per hour". */
export function rateText(r: Pick<ProviderRate, 'amount' | 'unit'>): string {
  if (r.amount == null) return 'Ask';
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(r.amount);
  return r.unit === 'flat' ? usd : `${usd} ${RATE_UNIT_LABEL[r.unit]}`;
}
