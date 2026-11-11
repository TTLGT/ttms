import type { Timestamp } from 'firebase/firestore';
import type { Address } from './order';
import type { PartyLocation } from './partyAddress';
import { PHONE_COUNTRY_CODE, PHONE_NATIONAL_LENGTH, RECORD_PHONE_REGIONS, phoneRegionOf } from '@/lib/phone';
import type { PhoneRegion } from '@/lib/phone';

/**
 * A party is any company or individual we do business with. The same party may
 * act as the client on one order, the shipper on another, and the consignee on
 * a third — the role lives on the order, not on the party. `roles` records the
 * roles a party has actually been used in, so role-filtered lists stay honest.
 */
export type PartyRole = 'client' | 'shipper' | 'consignee';

export const PARTY_ROLES: PartyRole[] = ['client', 'shipper', 'consignee'];

export const ROLE_LABEL: Record<PartyRole, string> = {
  client:    'Client',
  shipper:   'Shipper',
  consignee: 'Consignee',
};

/**
 * One more person at a client, shipper or consignee, beside the record's own
 * main contact (`contactName` / `email` / `phone`).
 *
 * Grown on 2026-11-11 from the four strings BATS imported into a card people
 * edit on the party page (PartyContactsCard). Every new key is optional, so a
 * BATS contact reads exactly as it did. The list is cleaned on the server by
 * cleanContacts() below before it is stored.
 */
export interface Contact {
  /**
   * Set on every contact added from the card. Absent on BATS imports, and that
   * absence is meaningful — see saContactIndex(): an imported contact keeps
   * the SA it has always received, a new one never takes it by accident.
   */
  id?: string;
  name: string;
  email: string;
  phone: string;
  /** Which country `phone` is in — the same contract as Party.phoneRegion. */
  phoneRegion?: PhoneRegion;
  /** Title or position: "Finance", "Warehouse manager". Free text with suggestions. */
  role: string;
  /**
   * Which of the party's addresses this person is at — location ids from
   * partyLocations() (MAIN_LOCATION_ID for the main one). Empty means all of
   * them, or not said.
   */
  addressIds?: string[];
  /** Can say yes to a rate or a new lane. A label for the broker; it grants nothing. */
  decisionMaker?: boolean;
  /**
   * The SA goes to this person instead of the main contact. At most one per
   * party — cleanContacts() keeps the first.
   */
  saSigner?: boolean;
  /** Invoices and payment questions go to this person. Any number may be ticked. */
  billing?: boolean;
  /** Wants the load updates — see UpdatePrefs. */
  updates?: boolean;
}

/** Positions offered as suggestions in the contact card. Free text is still allowed. */
export const CONTACT_POSITIONS = [
  'Owner', 'CEO', 'President', 'General manager', 'Operations manager', 'Logistics manager',
  'Logistics coordinator', 'Traffic manager', 'Shipping clerk', 'Receiving clerk',
  'Warehouse manager', 'Dock supervisor', 'Supervisor', 'Plant manager', 'Purchasing / buyer',
  'Procurement manager', 'Sales representative', 'Customer service', 'Finance', 'Billing',
  'Accounts payable', 'Controller', 'Office manager', 'Dispatcher', 'Security / gate', 'IT',
] as const;

export const MAX_CONTACTS = 25;

/**
 * Who on a party receives its SA (and its BOL copy): the index into
 * `contacts`, or -1 for the record's own main email.
 *
 * 1. A contact ticked "Signs the SA", with an email.
 * 2. Otherwise the first *imported* contact (no `id`) with an email — the
 *    rule clientContactOf() always used, kept so no live client's SA changes
 *    recipient because this card shipped.
 * 3. Otherwise -1, the main contact.
 *
 * A contact added from the card is never picked by rule 2. Before, the first
 * contact with an email took the SA, so adding a Finance person to a client
 * would have quietly sent the next SA to Finance.
 *
 * The one definition — clientContactOf(), the review's "update the client"
 * path and the BOL's party address all read it.
 */
export function saContactIndex(contacts: readonly Partial<Contact>[] | null | undefined): number {
  const list = Array.isArray(contacts) ? contacts : [];
  const hasEmail = (c: Partial<Contact>) => typeof c?.email === 'string' && !!c.email.trim();
  const ticked = list.findIndex((c) => c?.saSigner === true && hasEmail(c));
  if (ticked >= 0) return ticked;
  return list.findIndex((c) => !c?.id && hasEmail(c));
}

/**
 * A contact list as it arrived in a save, made safe to store: at most
 * MAX_CONTACTS, every field its expected type, blank rows dropped, one SA
 * signer at most. A row added from the card arrives with `isNew` and gets an
 * id from `newId`; imported rows keep having none — see Contact.id.
 */
export function cleanContacts(value: unknown, newId: () => string): Contact[] {
  if (!Array.isArray(value)) return [];
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  let signer = false;
  const out: Contact[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const row: Contact = {
      name:  text(c.name, 120),
      email: text(c.email, 200),
      phone: text(c.phone, 40),
      role:  text(c.role, 80),
    };
    if (!row.name && !row.email && !row.phone) continue;
    const id = text(c.id, 40) || (c.isNew === true ? newId() : '');
    if (id) row.id = id;
    if (c.phoneRegion) row.phoneRegion = phoneRegionOf(c.phoneRegion);
    const ids = Array.isArray(c.addressIds) ? c.addressIds.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
    if (ids.length) row.addressIds = ids;
    if (c.decisionMaker === true) row.decisionMaker = true;
    if (c.billing === true) row.billing = true;
    if (c.updates === true) row.updates = true;
    if (c.saSigner === true && !signer && row.email) { row.saSigner = true; signer = true; }
    out.push(row);
    if (out.length >= MAX_CONTACTS) break;
  }
  return out;
}

/**
 * How the client pays us (2026-11-11). Set on the client record and shown on
 * every load of theirs; the order does not copy it, because terms are agreed
 * with the client, not per load.
 */
export const PAYMENT_TERMS = ['prepaid', 'cod', 'quick_pay', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60'] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];
export const PAYMENT_TERMS_LABEL: Record<PaymentTerms, string> = {
  prepaid:   'Prepaid — pays before pickup',
  cod:       'COD — pays on delivery',
  quick_pay: 'Quick pay — within 2 days of delivery',
  net_7:     'Net 7',
  net_15:    'Net 15',
  net_30:    'Net 30',
  net_45:    'Net 45',
  net_60:    'Net 60',
};
export function isPaymentTerms(v: unknown): v is PaymentTerms {
  return (PAYMENT_TERMS as readonly unknown[]).includes(v);
}

/** How and how often a client wants to hear about their loads. */
export const UPDATE_CHANNELS = ['email', 'text', 'call', 'whatsapp', 'portal'] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];
export const UPDATE_CHANNEL_LABEL: Record<UpdateChannel, string> = {
  email: 'Email', text: 'Text message', call: 'Phone call', whatsapp: 'WhatsApp', portal: 'Their own portal',
};
export const UPDATE_FREQUENCIES = ['every_step', 'pickup_delivery', 'daily', 'delays_only', 'on_request'] as const;
export type UpdateFrequency = (typeof UPDATE_FREQUENCIES)[number];
export const UPDATE_FREQUENCY_LABEL: Record<UpdateFrequency, string> = {
  every_step:      'At every step',
  pickup_delivery: 'At pickup and delivery',
  daily:           'Once a day while moving',
  delays_only:     'Only when something goes wrong',
  on_request:      'Only when they ask',
};
export interface UpdatePrefs {
  channels: UpdateChannel[];
  frequency: UpdateFrequency | null;
  /** Anything else: "call before 10am Central", "cc their customer". */
  note: string;
}

/** Stored shape, whatever arrived. */
export function cleanUpdatePrefs(value: unknown): UpdatePrefs {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const asked = Array.isArray(v.channels) ? (v.channels as unknown[]) : [];
  const channels = UPDATE_CHANNELS.filter((c) => asked.includes(c));
  const frequency = (UPDATE_FREQUENCIES as readonly unknown[]).includes(v.frequency) ? v.frequency as UpdateFrequency : null;
  return { channels, frequency, note: typeof v.note === 'string' ? v.note.trim().slice(0, 500) : '' };
}

export interface Party {
  id: string;
  batsId: string | null;
  /** Blank for individuals who trade under their own name. */
  companyName: string;
  /** Doubles as the display name when there is no company name. */
  contactName: string;
  /** Normalized `toNameKey(displayName)`, stored so upserts can query on it. */
  nameKey: string;
  contacts: Contact[];
  phone: string;
  /**
   * Which country `phone` is in. Absent on every party written before the
   * picker existed — read it through `phoneRegionOf()`, which answers US for
   * those, rather than reading the field directly.
   */
  phoneRegion?: PhoneRegion;
  email: string;
  /** A second number for the same contact — a mobile beside a switchboard. */
  phone2: string;
  /** Which country `phone2` is in. Same contract as `phoneRegion`. */
  phone2Region?: PhoneRegion;
  /** A second address for the same contact — an AP inbox beside a personal one. */
  email2: string;
  /**
   * Both phone numbers reduced to digits, so a party can be found by dialling
   * code. Stored as an array because Firestore can only match a whole field
   * value, and because one number now contributes more than one key — see
   * phoneKeysFor(). Kept in step by everything that writes a phone.
   */
  phoneKeys: string[];
  address: Address;
  /** Roles this party has been used in on at least one order. */
  roles: PartyRole[];
  /**
   * Every other place this party ships from or receives at, beside the main
   * `address` (2026-11-06). Absent on records written before it; read through
   * `partyLocations()` / `savedLocations()` in src/types/partyAddress.ts,
   * which also read the two single-address fields below into the list.
   */
  addresses?: PartyLocation[];
  /**
   * The one default pickup a party had before `addresses`. Still read — see
   * savedLocations() — and cleared once the list is first saved.
   */
  defaultOrigin: Address | null;
  /** The one default delivery, before `addresses`. Same contract as `defaultOrigin`. */
  defaultDest: Address | null;
  /**
   * Owners, as user accounts. A party with owners is visible only to them and
   * to admin/finance/dispatch; everyone else must request approval to use it.
   */
  assignedToUids: string[];
  /**
   * The owner as BATS recorded it, kept because most reps do not have TMS
   * accounts yet. While this is set and `assignedToUids` is empty the party is
   * owned-but-unclaimed: regular users still get the collision warning naming
   * this person, and an admin approves on their behalf. Resolving the name to a
   * real account moves it into `assignedToUids`.
   */
  assignedToName: string;
  /**
   * Owning work groups. Every member of a listed group can see and use this
   * party, which is how team-owned records work without naming each person.
   */
  assignedToGroupIds: string[];
  /**
   * Owners who exist on the allowlist but have never signed in, held by email
   * because `users/{uid}` — and therefore a uid to point at — only comes into
   * being at first sign-in. This is a real, final assignment, not a pending
   * one: /api/auth/session converts the entry to `assignedToUids` the first
   * time the person authenticates.
   *
   * Ownership by email grants nothing until then, which is harmless — the
   * person cannot sign in to look at anything either. What it must NOT do is
   * make the record read as unowned, hence its place in isUnowned() below.
   */
  assignedToEmails: string[];
  /**
   * How this client came to us — a `leadSources` document id, or null.
   *
   * Only meaningful on a client; a shipper or consignee is a facility, not a
   * lead. Stored as an id with the label resolved from the list at render
   * time, for the same reason as on the order — see src/types/order.ts.
   */
  sourceId: string | null;
  /**
   * The lead source exactly as BATS wrote it (its `LeadSourceName` column).
   * A fallback label for imported clients whose text matched nothing on the
   * managed list. Not written by the app.
   */
  sourceName: string;
  notes: string;
  /** How the client pays us. Absent = not said. See PAYMENT_TERMS. */
  paymentTerms?: PaymentTerms | null;
  /**
   * Approved for our Credit services with our factoring company — a credit
   * client. Set only by `orders.payments` (admin, finance): it is a finance
   * decision, enforced in updatePartyAsCaller().
   */
  creditClient?: boolean;
  /** Invoice instructions: a portal to upload to, a PO that must be quoted. */
  billingNotes?: string;
  /** How and how often they want load updates. Absent = not said. */
  updatePrefs?: UpdatePrefs | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * The digits of a phone number, last ten kept.
 *
 * Ten because that is a US number without its country code: a broker who types
 * `469-576-9974` must find the record saved as `+1 (469) 576-9974`, and both
 * reduce to `4695769974`. Anything shorter than seven digits is not a number
 * anybody could dial and returns empty, which is what stops a half-typed
 * search from matching every extension in the database.
 *
 * **This is the US/Canada/Mexico shape, and it is wrong for Guatemala** — an
 * 8-digit number carrying its country code is eleven digits, so the last ten
 * start inside the `502`. It survives as the length test the forms and the
 * combobox use ("is this long enough to be a number at all") and as one of the
 * keys stored, so nothing that was findable before this file learned about
 * countries became unfindable. What actually matches is phoneKeysFor() and
 * phoneSearchKeys() below.
 */
export function toPhoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
}

/** Just the digits, with nothing thrown away. */
function digitsOf(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '');
}

/**
 * Every key one number should be stored under.
 *
 * A number is filed twice — as the national number and as the international
 * one — because those are the two ways it gets typed into a search box, and
 * which one somebody reaches for depends on where they are standing. A
 * Guatemalan client is `4874-0227` to the person who rings it every week and
 * `+502 4874 0227` to whoever copied it off an email.
 *
 * The legacy last-ten key goes in as well. For a US number it is already the
 * national form, so this changes nothing for the records that existed before
 * countries did; for the others it costs one array entry and guarantees that
 * re-keying can only add matches, never remove one.
 */
export function phoneKeysFor(
  raw: string | null | undefined,
  region: PhoneRegion | undefined,
): string[] {
  const digits = digitsOf(raw);
  if (digits.length < 7) return [];

  const r        = phoneRegionOf(region);
  const code     = PHONE_COUNTRY_CODE[r];
  const national = PHONE_NATIONAL_LENGTH[r];

  // Strip the country code only when what is left is exactly a national
  // number, the same rule normalizePhone() uses — so a ten-digit US number
  // that happens to start with 1 is not shortened into nonsense.
  const bare = digits.length === code.length + national && digits.startsWith(code)
    ? digits.slice(code.length)
    : digits;

  return [...new Set([bare, code + bare, toPhoneKey(raw)].filter(Boolean))];
}

/**
 * The keys a typed search should be matched against.
 *
 * The search box has no country beside it and never will — somebody reading a
 * number off a rate confirmation does not know or care which of our records it
 * is filed under. So instead of deciding, this offers every reading of what
 * was typed and lets `array-contains-any` find whichever one a record holds:
 * the digits as given, the last ten, each country code stripped off the front,
 * and each country code added to it.
 *
 * The list is short by construction — a set of at most a handful after
 * deduplication, because a reading only appears when the digit count fits it —
 * but it is capped anyway: Firestore rejects an `array-contains-any` of more
 * than ten values, and a query that throws is worse than one that looks under
 * nine of ten stones.
 */
export function phoneSearchKeys(typed: string | null | undefined): string[] {
  const digits = digitsOf(typed);
  if (digits.length < 7) return [];

  const keys = new Set<string>([digits, toPhoneKey(typed)]);
  for (const region of RECORD_PHONE_REGIONS) {
    const code     = PHONE_COUNTRY_CODE[region];
    const national = PHONE_NATIONAL_LENGTH[region];
    if (digits.length === code.length + national && digits.startsWith(code)) {
      keys.add(digits.slice(code.length));
    }
    if (digits.length === national) keys.add(code + digits);
  }
  return [...keys].filter(Boolean).slice(0, 10);
}

/**
 * The keys a party should be findable by. Both numbers, deduplicated, blanks
 * dropped.
 *
 * ⚠️ Anything that writes a party's phone must write this alongside it —
 * `createParty` (via /api/parties), `updateParty` and the BATS importers all
 * do. A party saved without it exists but cannot be found by phone, and
 * nothing fails loudly. Same contract as `nameKey`, for the same reason.
 *
 * ⚠️ It must be given the regions too. Passing the numbers alone files a
 * Guatemalan number as though it were American, which is findable only by
 * somebody who types it the one way it happens to have been stored.
 */
export function partyPhoneKeys(
  p: Pick<Party, 'phone' | 'phone2'> & {
    phoneRegion?: PhoneRegion;
    phone2Region?: PhoneRegion;
  } | {
    phone?: string;
    phone2?: string;
    phoneRegion?: PhoneRegion;
    phone2Region?: PhoneRegion;
  },
): string[] {
  return [...new Set([
    ...phoneKeysFor(p.phone,  p.phoneRegion),
    ...phoneKeysFor(p.phone2, p.phone2Region),
  ])];
}

/**
 * True when what somebody typed into a name box is really a phone number.
 *
 * Seven digits and almost nothing else: a company name can contain a digit
 * ("3M", "A1 Freight") but not seven of them, so this never hijacks a name
 * search. Letters disqualify it outright.
 */
export function looksLikePhone(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /[a-z]/i.test(trimmed)) return false;
  return trimmed.replace(/\D/g, '').length >= 7;
}

export const BLANK_CONTACT: Contact = { name: '', email: '', phone: '', role: '' };

export const BLANK_ADDRESS: Address = { street: '', city: '', state: '', zip: '', country: 'US' };

/**
 * True when nobody owns this party, so anyone may use and claim it.
 *
 * Every ownership field has to be checked, not just the uid list: a party owned
 * by an invited-but-never-signed-in rep carries only `assignedToEmails`, and
 * omitting it here would publish that person's book of business to everyone
 * until they first logged in.
 */
export function isUnowned(
  p: Pick<Party, 'assignedToUids' | 'assignedToName' | 'assignedToGroupIds' | 'assignedToEmails'>,
): boolean {
  return (p.assignedToUids ?? []).length === 0
    && (p.assignedToGroupIds ?? []).length === 0
    && (p.assignedToEmails ?? []).length === 0
    && !(p.assignedToName ?? '').trim();
}

/** What to show in lists and on documents: company name, or the person's name. */
export function partyDisplayName(p: Pick<Party, 'companyName' | 'contactName'>): string {
  return p.companyName.trim() || p.contactName.trim();
}

/**
 * Spelling variants of the same legal suffix. These are canonicalized rather
 * than removed: dropping them entirely would merge "Acme Corp" with "Acme Inc",
 * which are different companies, and a wrong merge is much harder to undo than
 * a duplicate is to clean up.
 */
const SUFFIX_CANON: [RegExp, string][] = [
  [/\b(incorporated|inc)\b/g, 'inc'],
  [/\b(corporation|corp)\b/g, 'corp'],
  [/\b(llc|l l c)\b/g,        'llc'],
  [/\b(limited|ltd)\b/g,      'ltd'],
  [/\b(company|co)\b/g,       'co'],
  [/\b(llp|l l p)\b/g,        'llp'],
];

/**
 * Collapses a name to a comparison key so "Acme Corp.", "ACME Corporation" and
 * "acme  corp" all upsert onto one party instead of three, while "Acme Inc"
 * stays separate.
 */
export function toNameKey(raw: string): string {
  let out = raw
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  for (const [re, canon] of SUFFIX_CANON) out = out.replace(re, canon);
  return out.trim().replace(/\s+/g, ' ');
}
