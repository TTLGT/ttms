import { otherPhone, PHONE_COUNTRY_CODE, PHONE_NATIONAL_LENGTH, OTHER_PHONE_LABEL } from './phone';
import type { PhoneRegion } from './phone';
import type { AllowedUser } from '@/types/allowedUser';

/**
 * Ordering the access list in Settings → People.
 *
 * Here rather than in the page because two things now ask for the same order:
 * the Sort by dropdown above the list, and the sortable headings in the list
 * view. Two copies of "what does a blank phone number sort as" would answer it
 * differently the first time either was touched.
 *
 * The company directory has its own (lib/directorySort.ts) and they are
 * deliberately separate: that one orders a phone book everybody can open, this
 * one orders the access list and knows about fields — birthdays, the date
 * somebody was added — that only exist on this side.
 */

export type SortField =
  | 'firstName' | 'lastName' | 'email' | 'phone' | 'phoneOther' | 'extension'
  | 'startDate' | 'dateOfBirth' | 'added';
export type SortDir   = 'asc' | 'desc';

export const SORT_FIELDS: { key: SortField; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName',  label: 'Last name' },
  { key: 'email',     label: 'Email' },
  { key: 'phone',     label: 'Work phone (US)' },
  { key: 'phoneOther', label: OTHER_PHONE_LABEL },
  { key: 'extension', label: 'Extension' },
  { key: 'startDate', label: 'Start date' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'added',     label: 'Date added' },
];

/** Direction reads differently depending on what is being ordered. */
export function directionLabel(field: SortField, dir: SortDir): string {
  if (field === 'added')     return dir === 'asc' ? 'Oldest first' : 'Newest first';
  if (field === 'startDate') return dir === 'asc' ? 'Longest here first' : 'Newest hire first';
  // The earliest birthday belongs to the oldest person, which is the way round
  // anyone sorting by it is actually thinking.
  if (field === 'dateOfBirth') return dir === 'asc' ? 'Oldest first' : 'Youngest first';
  if (field === 'phone' || field === 'phoneOther' || field === 'extension') {
    return dir === 'asc' ? 'Low → High' : 'High → Low';
  }
  return dir === 'asc' ? 'A → Z' : 'Z → A';
}

const digitsOnly = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

/**
 * Compare phone numbers as digits alone.
 *
 * New and re-saved numbers are all one shape now (lib/phone.ts), but entries
 * that have not been touched since still hold whatever was typed at the time —
 * (555) 123-4567, 555.123.4567, +1 555 123 4567 — and those have to sort in
 * with the rest rather than in a block of their own. The country code is
 * dropped for the same reason: +1 on the US line, +502 or +52 on the other.
 *
 * Sorting the second column mixes countries, and that is the honest result:
 * it is one column holding one number each, so it orders by the number and
 * lets the country ride along.
 */
function phoneKey(value: string | null | undefined, region: PhoneRegion): string {
  const d = digitsOnly(value);
  const code = PHONE_COUNTRY_CODE[region];
  const national = PHONE_NATIONAL_LENGTH[region];
  return d.length === national + code.length && d.startsWith(code)
    ? d.slice(code.length)
    : d;
}

/**
 * Extensions are numbers, so they have to sort like numbers: comparing them as
 * text would put 1050 ahead of 204. Zero-padding to a fixed width gets numeric
 * order out of the same string compare everything else uses. Anything not
 * purely numeric falls back to its own text.
 */
function extensionKey(p: AllowedUser): string {
  const raw = (p.extension ?? '').trim().toLowerCase();
  const d = digitsOnly(raw);
  return d ? d.padStart(8, '0') : raw;
}

/**
 * The text a row sorts under. Empty for someone the field is blank on, which
 * the comparator treats as "unknown" and sends to the end — a block of blanks
 * at the top is just noise, and pending invites often have no details at all.
 */
export function sortText(p: AllowedUser, field: SortField): string {
  if (field === 'email')     return p.email.toLowerCase();
  if (field === 'phone')     return phoneKey(p.phone, 'US');
  if (field === 'phoneOther') {
    const { value, region } = otherPhone(p);
    return phoneKey(value, region);
  }
  if (field === 'extension') return extensionKey(p);
  // Stored as YYYY-MM-DD precisely so plain text order is date order; a blank
  // one falls through to the same "unknown, so put it last" rule as the rest.
  if (field === 'startDate')   return (p.startDate ?? '').trim();
  if (field === 'dateOfBirth') return (p.dateOfBirth ?? '').trim();
  const value = field === 'lastName' ? p.lastName : p.firstName;
  return (value ?? '').trim().toLowerCase();
}

/**
 * Firestore hands back a Timestamp, but an entry created before `invitedAt`
 * existed has none. Those sort to the end either way rather than jumping to
 * the top as epoch zero.
 */
export function millis(ts: { toDate?: () => Date } | null | undefined): number | null {
  return ts && typeof ts.toDate === 'function' ? ts.toDate().getTime() : null;
}
