import type { Timestamp } from 'firebase/firestore';
import type { Address } from './order';

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

export interface Contact {
  name: string;
  email: string;
  phone: string;
  role: string;
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
  email: string;
  address: Address;
  /** Roles this party has been used in on at least one order. */
  roles: PartyRole[];
  /** Prefilled onto new orders when this party is picked as the shipper. */
  defaultOrigin: Address | null;
  /** Prefilled onto new orders when this party is picked as the consignee. */
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
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
