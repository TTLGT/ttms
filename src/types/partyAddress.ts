import type { Address } from './order';
import type { Party, PartyRole } from './party';
import { countryCode, countryOf, regionIsCode, withCountry } from './addressCountry';

/**
 * The places a shipper or consignee ships from or receives at (2026-11-06).
 *
 * A pickup or delivery address is never a free-standing string on an order:
 * it is one of the addresses of the shipper or consignee at that stop. A party
 * carries its own `address` (the main one, edited with the rest of its
 * details) plus any number of `addresses` — a second warehouse, a yard, a
 * plant across town — each with a label somebody can recognise it by.
 *
 * Before this a party held one `defaultOrigin` and one `defaultDest`. Those
 * are read as saved addresses here (`savedLocations()`), and the first save
 * of the list through `/api/parties/{id}/addresses` folds them in and clears
 * the old fields, so nothing typed into them is lost and nothing is shown
 * twice.
 *
 * The order still keeps its own copy of the address it used, for the reason
 * an order keeps its own driver phone: an SA or a BOL is what was true on the
 * day, and correcting a party's address must not rewrite paperwork that has
 * already gone out. The link is that the copy must be one of the party's
 * addresses when the order is saved — a new one typed on the order is added
 * to the party in the same save (see linkStopAddresses() in
 * src/components/orders/StopPartyFields.tsx).
 */
export interface PartyLocation extends Address {
  /** Stable, so an edit or a removal names the right one. */
  id: string;
  /** "Plant 2", "Back gate". Optional; '' reads as "Address 2" and so on. */
  label: string;
}

/** One address as a picker offers it. */
export interface LocationChoice {
  id: string;
  label: string;
  address: Address;
  /** `main` is the party's own address, edited with its details. */
  source: 'main' | 'saved';
}

/** More than this on one record is a list nobody can pick from. */
export const MAX_PARTY_ADDRESSES = 40;
export const MAX_LOCATION_LABEL = 60;

/** Id of the party's own address in a list of choices. Never stored. */
export const MAIN_LOCATION_ID = 'main';

const FIELD_MAX = { street: 160, city: 80, state: 40, zip: 20, country: 4 } as const;

/** A fresh id for a saved address. Short: it is only unique within one party. */
export function newLocationId(): string {
  return `loc_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export function blankAddress(): Address {
  return { street: '', city: '', state: '', zip: '', country: 'US' };
}

export function addressIsBlank(a: Partial<Address> | null | undefined): boolean {
  return !a || ![a.street, a.city, a.state, a.zip].some((v) => String(v ?? '').trim());
}

/**
 * The parts of an address still empty, in the words the form uses — [] when
 * it is complete. A blank address answers every part; callers that treat
 * "nothing typed" differently check addressIsBlank() first.
 */
export function missingAddressParts(a: Partial<Address> | null | undefined): string[] {
  // Named the way that country's form names them, and the postal code only
  // where an address is written with one — see postalRequired.
  const country = countryOf(a);
  const parts: [keyof Address, string][] = [
    ['street', 'street'], ['city', 'city'], ['state', country.regionWord.toLowerCase()],
    ...(country.postalRequired ? [['zip', country.postalWord === 'ZIP' ? 'ZIP' : 'postal code'] as [keyof Address, string]] : []),
  ];
  return parts.filter(([k]) => !String(a?.[k] ?? '').trim()).map(([, word]) => word);
}

/**
 * An Address from whatever JSON came in, every field a trimmed string.
 * KEEP IN SYNC with cleanAddress() in scripts/import-bats.js.
 */
export function cleanAddress(raw: unknown): Address {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s = (k: keyof typeof FIELD_MAX) =>
    (typeof r[k] === 'string' ? (r[k] as string).trim() : '').slice(0, FIELD_MAX[k]);
  const country = countryCode(s('country'));
  // A US state or Canadian province is a code; anywhere else it is a name,
  // kept as typed — see regionIsCode().
  const state = regionIsCode(country) ? s('state').toUpperCase() : s('state');
  return { street: s('street'), city: s('city'), state, zip: s('zip'), country };
}

/**
 * "123 Main St, Dallas, TX 75201" — and "6a Avenida 5-55, Antigua Guatemala,
 * Sacatepéquez, Guatemala" for a stop abroad: the country is written only
 * when it is not the US, so a US address reads as it always has.
 */
export function addressLine(a: Partial<Address> | null | undefined): string {
  if (!a) return '';
  const cityState = [a.city, a.state].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
  const line = [String(a.street ?? '').trim(), [cityState, String(a.zip ?? '').trim()].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  return withCountry(line, a);
}

// ─── Matching ───────────────────────────────────────────────────────────────

/**
 * The words a street is typed with in more than one way, reduced to one.
 * "123 North Main Street" and "123 N Main St." are the same dock.
 */
const STREET_WORDS: Record<string, string> = {
  street: 'st', avenue: 'ave', av: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd',
  highway: 'hwy', lane: 'ln', court: 'ct', place: 'pl', parkway: 'pkwy', circle: 'cir',
  suite: 'ste', building: 'bldg', north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw', freeway: 'fwy',
  expressway: 'expy', terrace: 'ter', trail: 'trl', way: 'way', square: 'sq', route: 'rte',
};

export function streetKey(street: string | null | undefined): string {
  return String(street ?? '')
    .toLowerCase()
    .replace(/[#.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_WORDS[w] ?? w)
    .join(' ');
}

function zip5(zip: string | null | undefined): string {
  return String(zip ?? '').replace(/\D/g, '').slice(0, 5);
}

function cityKey(a: Partial<Address>): string {
  return `${String(a.city ?? '').trim().toLowerCase()}|${String(a.state ?? '').trim().toLowerCase()}`;
}

/**
 * Whether two addresses are the same place: the same street once spelled
 * the same way, and the same ZIP — or, where either has no ZIP, the same city
 * and state. Deliberately strict: two docks on one street are two addresses.
 */
export function sameAddress(a: Partial<Address> | null | undefined, b: Partial<Address> | null | undefined): boolean {
  if (addressIsBlank(a) || addressIsBlank(b)) return false;
  // Two countries are two places, whatever the street is called: both have a
  // San José, and a ZIP compared by its digits can coincide across a border.
  if (countryCode(a!.country) !== countryCode(b!.country)) return false;
  if (streetKey(a!.street) !== streetKey(b!.street)) return false;
  const za = zip5(a!.zip), zb = zip5(b!.zip);
  if (za && zb) return za === zb;
  return cityKey(a!) === cityKey(b!);
}

/**
 * How closely a typed address matches a saved one, 0 for not at all. Used to
 * suggest which shipper or consignee an address belongs to while it is still
 * being typed, so a partial address still finds its record:
 *
 *  - the same ZIP, or the same city and state, is the floor of a match;
 *  - a street that starts the same way (the house number and more) lifts it.
 *
 * A typed street that disagrees on its house number is no match at all, even
 * in the same ZIP — that is a neighbour, not this facility.
 */
export function addressMatchScore(typed: Partial<Address>, saved: Partial<Address>): number {
  if (addressIsBlank(typed) || addressIsBlank(saved)) return 0;
  if (countryCode(typed.country) !== countryCode(saved.country)) return 0;
  const zt = zip5(typed.zip), zs = zip5(saved.zip);
  const sameZip  = zt.length === 5 && zt === zs;
  const sameCity = !!String(typed.city ?? '').trim() && cityKey(typed) === cityKey(saved);
  if (!sameZip && !sameCity) return 0;

  const st = streetKey(typed.street), ss = streetKey(saved.street);
  if (!st) return sameZip ? 1 : 0.5;
  const numT = st.split(' ')[0], numS = ss.split(' ')[0];
  if (/^\d/.test(numT) && /^\d/.test(numS) && numT !== numS) return 0;
  if (ss === st) return 4;
  if (ss.startsWith(st) || st.startsWith(ss)) return 3;
  return /^\d/.test(numT) && numT === numS ? 2 : 0;
}

// ─── A party's addresses ────────────────────────────────────────────────────

type PartyAddressFields = Partial<Pick<Party, 'address' | 'addresses' | 'defaultOrigin' | 'defaultDest'>>;

/** A stored list from whatever JSON came in: shapes checked, blanks and repeats dropped, ids kept or made. */
export function cleanPartyLocations(raw: unknown, newId: () => string): PartyLocation[] {
  if (!Array.isArray(raw)) return [];
  const out: PartyLocation[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const address = cleanAddress(r);
    if (addressIsBlank(address)) continue;
    if (out.some((x) => sameAddress(x, address))) continue;
    let id = typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) && r.id !== MAIN_LOCATION_ID ? r.id : '';
    if (!id || ids.has(id)) id = newId();
    ids.add(id);
    const label = (typeof r.label === 'string' ? r.label.trim() : '').slice(0, MAX_LOCATION_LABEL);
    out.push({ id, label, ...address });
    if (out.length >= MAX_PARTY_ADDRESSES) break;
  }
  return out;
}

/**
 * The saved addresses — everything but the main one — with the two
 * single-address fields this list replaced read in as the first two, unless
 * the list already holds them or they are the main address.
 */
export function savedLocations(p: PartyAddressFields | null | undefined): PartyLocation[] {
  if (!p) return [];
  const list: PartyLocation[] = Array.isArray(p.addresses) ? p.addresses.filter((a) => !addressIsBlank(a)) : [];
  const legacy: [Address | null | undefined, string, string][] = [
    [p.defaultOrigin, 'legacy-origin', 'Pickup'],
    [p.defaultDest,   'legacy-dest',   'Delivery'],
  ];
  const out = [...list];
  for (const [a, id, label] of legacy) {
    if (!a || addressIsBlank(a)) continue;
    if (sameAddress(a, p.address) || out.some((x) => sameAddress(x, a))) continue;
    out.push({ id, label, ...cleanAddress(a) });
  }
  return out;
}

// ─── Addresses an import found ──────────────────────────────────────────────
// KEEP IN SYNC with importedLocationId() / mergeImportedLocations() in
// scripts/import-bats.js, which cannot import TypeScript. Used by both BATS
// importers (src/lib/batsImport.ts and that script).

/** FNV-1a, 32-bit, as 8 hex digits. Not crypto: this file reaches the browser. */
function fnv1a(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * A stable id for an address an import found, worked out from the address
 * itself so every run names the same place the same way. That is what lets a
 * re-import recognise an address it already offered (see below), and keeps
 * the record identical from run to run so an unchanged party is skipped.
 */
export function importedLocationId(a: Partial<Address>): string {
  const text = `${streetKey(a.street)}|${zip5(a.zip) || cityKey(a)}`;
  return `imp_${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x9747b28c)}`;
}

type ImportPrior = PartyAddressFields & { importedAddressIds?: string[] | null };

/**
 * A party's addresses after an import, from what it already had and every
 * address the import saw it at, in the order seen (2026-11-12).
 *
 * BATS does not tell a client from a shipper, so one company turns up at many
 * addresses across many loads. Every one of them is added to its list, once.
 *
 *  - **The main address is TTMS's once it has one.** The first address seen
 *    fills it only while it is blank, so a re-import never undoes a
 *    correction made in the app.
 *  - **An address is offered once, ever.** `importedAddressIds` remembers
 *    every address an import has put forward for this party, so one somebody
 *    has since removed in the app is not brought back by the next run.
 *  - The two legacy single-address fields are folded into the list by
 *    `savedLocations()`, so the caller writes them back as null — the same
 *    as the app's own first save of the list.
 */
export function mergeImportedLocations(
  prior: ImportPrior | null | undefined,
  found: readonly (Partial<Address> | null | undefined)[],
): { address: Address | null; addresses: PartyLocation[]; importedAddressIds: string[] } {
  const offered  = new Set(prior?.importedAddressIds ?? []);
  const incoming = found.filter((a) => !addressIsBlank(a)).map((a) => cleanAddress(a));

  let main: Address | null = prior && !addressIsBlank(prior.address) ? (prior.address as Address) : null;
  if (!main) {
    const first = incoming.find((a) => !offered.has(importedLocationId(a)));
    if (first) {
      main = first;
      offered.add(importedLocationId(first));
    }
  }

  const list = savedLocations(prior);
  for (const a of incoming) {
    const id = importedLocationId(a);
    if (offered.has(id)) continue;
    // Already there, as the main address or a saved one: nothing to add, but
    // it counts as offered, so removing it later sticks.
    if (sameAddress(a, main) || list.some((x) => sameAddress(x, a) || x.id === id)) {
      offered.add(id);
      continue;
    }
    // Full: left un-offered, so a later run can add it once there is room.
    if (list.length >= MAX_PARTY_ADDRESSES) continue;
    offered.add(id);
    list.push({ id, label: '', ...a });
  }

  return {
    address: main ?? (prior?.address as Address | undefined) ?? null,
    addresses: list,
    importedAddressIds: [...offered].sort(),
  };
}

/**
 * Every address a stop can use for this party: the main one first, then the
 * saved ones. For a shipper the old default pickup comes before the rest, and
 * for a consignee the old default delivery, so the address the order form
 * used to fill in is still the one it fills in.
 */
export function partyLocations(p: PartyAddressFields | null | undefined, role?: PartyRole): LocationChoice[] {
  if (!p) return [];
  const out: LocationChoice[] = [];
  if (!addressIsBlank(p.address)) {
    out.push({ id: MAIN_LOCATION_ID, label: 'Main address', address: cleanAddress(p.address), source: 'main' });
  }
  const saved = savedLocations(p).map((l, i): LocationChoice => ({
    id: l.id,
    label: l.label || `Address ${i + 2}`,
    address: { street: l.street, city: l.city, state: l.state, zip: l.zip, country: countryCode(l.country) },
    source: 'saved',
  }));
  const preferred = role === 'shipper' ? p.defaultOrigin : role === 'consignee' ? p.defaultDest : null;
  if (preferred && !addressIsBlank(preferred)) {
    const i = saved.findIndex((l) => sameAddress(l.address, preferred));
    if (i > 0) saved.unshift(...saved.splice(i, 1));
    // The old default for this role goes ahead of the main address too.
    if (i >= 0) return [...saved.slice(0, 1), ...out, ...saved.slice(1)];
  }
  return [...out, ...saved];
}

/** The location of this party at an address, or null when the party is not there. */
export function locationAt(p: PartyAddressFields | null | undefined, a: Partial<Address> | null | undefined): LocationChoice | null {
  return partyLocations(p).find((l) => sameAddress(l.address, a)) ?? null;
}

export interface AddressSuggestion {
  party: Party;
  location: LocationChoice;
  score: number;
}

/**
 * The records an address being typed belongs to, best first: what lets
 * somebody who knows where they are going find who is there. A party already
 * used in this role ranks ahead of one that is not, at the same score.
 */
export function suggestPartiesForAddress(
  parties: readonly Party[],
  typed: Partial<Address>,
  role: PartyRole,
  limit = 4,
): AddressSuggestion[] {
  if (addressIsBlank(typed)) return [];
  const found: AddressSuggestion[] = [];
  for (const party of parties) {
    let best: AddressSuggestion | null = null;
    for (const location of partyLocations(party, role)) {
      const score = addressMatchScore(typed, location.address);
      if (score > (best?.score ?? 0)) best = { party, location, score };
    }
    if (best) found.push(best);
  }
  const inRole = (p: Party) => ((p.roles ?? []).includes(role) ? 1 : 0);
  return found
    .filter((s) => s.score >= (String(typed.street ?? '').trim() ? 2 : 1))
    .sort((a, b) => b.score - a.score || inRole(b.party) - inRole(a.party))
    .slice(0, limit);
}
