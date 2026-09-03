import {
  collection,
  doc,
  addDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { toNameKey, partyDisplayName, partyPhoneKeys, toPhoneKey, BLANK_ADDRESS } from '@/types/party';
import type { Party, PartyRole } from '@/types/party';
import type { OwnerEvent } from '@/types/ownerEvent';
import type { AccessRequest } from '@/types/accessRequest';

const COL = 'parties';

/**
 * Extra owners to put on a record at the moment it is created.
 *
 * Not part of Party itself because ownership never travels with an ordinary
 * field patch — see OWNERSHIP_FIELDS below. Creation is the one point where a
 * broker may name owners directly, because the record is theirs and seconds
 * old; the route checks what they are allowed to name.
 */
export interface NewPartyOwners {
  uids?: string[];
  groupIds?: string[];
}

/**
 * Creates a party through the API so the name collision is checked against
 * records the browser cannot see. Throws `PartyOwnedError` when the name
 * belongs to somebody else.
 */
export async function createParty(
  data: Partial<Omit<Party, 'id' | 'createdAt' | 'updatedAt'>>
    & { companyName: string; owners?: NewPartyOwners },
): Promise<string> {
  const res = await fetch('/api/parties', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 409 && body.error === 'owned') {
    throw new PartyOwnedError(body.ownerName ?? 'another user');
  }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return (body.party as Party).id;
}

/** Raised when a name is already held by a party the caller cannot see. */
export class PartyOwnedError extends Error {
  ownerName: string;
  constructor(ownerName: string) {
    super(`That name belongs to a record owned by ${ownerName}.`);
    this.name = 'PartyOwnedError';
    this.ownerName = ownerName;
  }
}

/**
 * What a party id meant for this user. See `PartyAccess` in partyAccess.ts for
 * why "gone" and "not yours" are kept apart rather than both reading as null.
 */
export type PartyAccess =
  | { status: 'ok'; party: Party }
  | { status: 'missing' }
  | { status: 'denied'; ownerName: string };

/**
 * Reads through the API rather than the client SDK, for the same reason
 * listParties does: ownership is a security boundary, and it is decided
 * server-side. A denied read used to surface as a bare permission error the
 * page turned into "Party not found" — untrue, and it named nobody to go ask.
 */
export async function getParty(partyId: string): Promise<PartyAccess> {
  const res = await fetch(`/api/parties/${partyId}`, { headers: await authHeaders() });

  if (res.status === 404) return { status: 'missing' };
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    return { status: 'denied', ownerName: String(body.ownerName ?? '') };
  }

  const { party } = await unwrap<{ party: Party }>(res);
  return { status: 'ok', party };
}

/**
 * Every party the signed-in user is entitled to see.
 *
 * This goes through the API rather than reading Firestore directly: ownership
 * is a security boundary now, and the browser must never receive records it is
 * not entitled to. `role` narrows the result to parties used in that role.
 */
export async function listParties(opts: { role?: PartyRole } = {}): Promise<Party[]> {
  const qs = opts.role ? `?role=${encodeURIComponent(opts.role)}` : '';
  const { parties } = await apiGet<{ parties: Party[] }>(`/api/parties${qs}`);
  return parties;
}

export interface PartyQuery {
  limit?: number;
  cursor?: string | null;
  role?: PartyRole;
  /** Name prefix. Matched by the server, not in the browser. */
  search?: string;
  /**
   * One colleague's records, named by their email — the identifier the
   * directory links on. Resolved to a uid server-side; see lib/ownerFilter.ts.
   */
  owner?: string;
}

export interface PartyPage {
  parties: Party[];
  cursor: string | null;
}

/**
 * One page of parties, by name.
 *
 * What a list screen should use. `listParties` above returns every visible
 * party, which since the migration is about seven thousand records.
 */
export async function listPartiesPage(q: PartyQuery = {}): Promise<PartyPage> {
  const p = new URLSearchParams();
  if (q.limit)  p.set('limit', String(q.limit));
  if (q.cursor) p.set('cursor', q.cursor);
  if (q.role)   p.set('role', q.role);
  if (q.search) p.set('search', q.search);
  if (q.owner)  p.set('owner', q.owner);
  const page = await apiGet<{ parties: Party[]; cursor: string | null }>(`/api/parties?${p}`);
  return { parties: page.parties ?? [], cursor: page.cursor ?? null };
}

/**
 * How many parties hold a role, without fetching them.
 *
 * `owner` narrows it to one colleague's, so the heading agrees with the list
 * when the screen was opened from somebody's book of business.
 */
export async function countParties(role?: PartyRole, owner?: string): Promise<number> {
  const p = new URLSearchParams({ count: '1' });
  if (role)  p.set('role', role);
  if (owner) p.set('owner', owner);
  const { count } = await apiGet<{ count: number }>(`/api/parties?${p}`);
  return count;
}

export type ResolveVerdict =
  | { verdict: 'available' }
  | { verdict: 'visible'; party: Party }
  | {
      verdict: 'owned';
      ownerName: string;
      existingRequest: { id: string; status: string } | null;
    };

/**
 * Asks the server what a typed name means for this user: free to create, theirs
 * to use, or someone else's. Exact-name only — see the route for why.
 */
export async function resolvePartyName(name: string): Promise<ResolveVerdict> {
  return apiPost<ResolveVerdict>('/api/parties/resolve', { name });
}

/**
 * What a phone number is already on file as.
 *
 * `matches` are records this user may use straight away. `owned` says how many
 * belong to somebody else and names who to ask — the number is on file even
 * when the caller cannot see whose it is, and treating that as "not found"
 * would create the duplicate. `searched` is false when the number was too
 * short to look up at all, which is a different thing from finding nothing.
 */
export interface PhoneLookup {
  matches: Party[];
  owned: { ownerName: string }[];
  searched: boolean;
}

export async function lookupPartiesByPhone(phone: string): Promise<PhoneLookup> {
  if (!toPhoneKey(phone)) return { matches: [], owned: [], searched: false };
  const result = await apiPost<PhoneLookup>('/api/parties/by-phone', { phone });
  return {
    matches:  result.matches ?? [],
    owned:    result.owned ?? [],
    searched: result.searched ?? false,
  };
}

export async function requestPartyAccess(
  name: string,
  role: PartyRole,
  reason: string,
): Promise<{ id: string; status: string }> {
  return apiPost('/api/parties/access-requests', { name, role, reason });
}

/**
 * Asks for access to whoever is on a phone number.
 *
 * The caller has no id and no name — the lookup gives neither for a record
 * they cannot see — so the server resolves the number again. What comes back
 * never names the record, and the stored request does not either.
 */
export async function requestPartyAccessByPhone(
  phone: string,
  role: PartyRole,
  reason: string,
): Promise<{ id: string; status: string }> {
  return apiPost('/api/parties/access-requests', { phone, role, reason });
}

/**
 * Asks for access to a party the caller reached by link, where there is an id
 * but no order and so no role to fill. The server derives the role from the
 * record; see the route for why that is only ever an audit-trail detail.
 */
export async function requestPartyAccessById(
  partyId: string,
  reason: string,
): Promise<{ id: string; status: string }> {
  return apiPost('/api/parties/access-requests', { partyId, reason });
}

export async function listAccessRequests(box: 'incoming' | 'outgoing') {
  const { requests } = await apiGet<{ requests: AccessRequest[] }>(
    `/api/parties/access-requests?box=${box}`,
  );
  return requests;
}

/**
 * Approve or deny one party request.
 *
 * `grant` applies to an approval only. `once` lends the record for a single
 * order — the default, and what this has always done. `ownership` hands it
 * over: the requester joins its owners and gets every order it is the client
 * on. Only admins and dispatchers may send the second, and the server enforces
 * that rather than trusting the screen to hide the option.
 */
export async function decideAccessRequest(
  requestId: string,
  action: 'approve' | 'deny',
  options: { reason?: string; grant?: 'once' | 'ownership' } = {},
) {
  return apiPost(`/api/parties/access-requests/${requestId}`, {
    action,
    reason: options.reason,
    grant:  options.grant ?? 'once',
  });
}

/** Spends an approval on a freshly created order; a no-op when none is needed. */
export async function recordPartyApproval(orderId: string, partyId: string, role: PartyRole) {
  return apiPost(`/api/orders/${orderId}/party-approvals`, { partyId, role });
}

// ── Ownership ────────────────────────────────────────────────────────────────

/**
 * Owners to add or remove. All three lists are optional; `emails` names people
 * who exist on the allowlist but have never signed in.
 */
export interface OwnerChange {
  uids?: string[];
  groupIds?: string[];
  emails?: string[];
}

/**
 * Ownership moves only through this route, and only for admins and
 * dispatchers. Reassigning a client also refreshes every one of its orders,
 * which is why the response reports how many were touched — a client with a
 * long history can be a large write.
 */
export async function addPartyOwners(partyId: string, owners: OwnerChange) {
  return apiPost<{ ordersTouched: number }>(`/api/parties/${partyId}/owners`, owners);
}

export async function removePartyOwners(partyId: string, owners: OwnerChange) {
  return apiSend<{ ordersTouched: number }>('DELETE', `/api/parties/${partyId}/owners`, owners);
}

export async function listPartyOwnerEvents(partyId: string): Promise<OwnerEvent[]> {
  const { events } = await apiGet<{ events: OwnerEvent[] }>(`/api/parties/${partyId}/owners`);
  return events ?? [];
}

// ── API plumbing ─────────────────────────────────────────────────────────────

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${await user.getIdToken()}`,
  };
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: await authHeaders() });
  return unwrap<T>(res);
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiSend<T>('POST', url, body);
}

async function apiSend<T>(method: string, url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: await authHeaders(),
    body:    JSON.stringify(body),
  });
  return unwrap<T>(res);
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/**
 * Fields no client write may touch. Ownership decides who can see a record, so
 * letting the browser set it meant any user who could see a party could take
 * it — and because an unowned party is visible to everyone, that was every
 * unclaimed client in the system, with nothing recording who did it.
 *
 * Ownership now moves only through /api/parties/{id}/owners, which is limited
 * to admins and dispatchers and writes the history entry in the same batch.
 * The rules enforce this too; stripping the fields here keeps an honest caller
 * from writing a patch the rules would simply reject.
 */
const OWNERSHIP_FIELDS = ['assignedToUids', 'assignedToGroupIds', 'assignedToEmails', 'assignedToName'] as const;

export async function updateParty(
  partyId: string,
  data: Partial<Omit<Party, 'id' | 'createdAt'>>,
): Promise<void> {
  const patch: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
  for (const field of OWNERSHIP_FIELDS) delete patch[field];

  const touchesPhone = data.phone !== undefined || data.phone2 !== undefined;
  const touchesName  = data.companyName !== undefined || data.contactName !== undefined;

  // Both derived keys are built from a pair of fields and a patch may carry
  // only one half of either, so the saved record supplies the rest. Read once
  // even when a single edit changes a name and a phone together. An unreadable
  // record means the update is about to be rejected anyway; falling back to the
  // empty string keeps that as the rules' decision rather than throwing here.
  let saved: Party | null = null;
  if (touchesPhone || touchesName) {
    const access = await getParty(partyId);
    saved = access.status === 'ok' ? access.party : null;
  }

  if (touchesPhone) {
    // Same contract as nameKey: a phone changed without its key rewritten
    // leaves the party findable only under the number it used to have.
    patch.phoneKeys = partyPhoneKeys({
      phone:  data.phone  ?? saved?.phone  ?? '',
      phone2: data.phone2 ?? saved?.phone2 ?? '',
    });
  }

  if (touchesName) {
    const companyName = (data.companyName ?? saved?.companyName ?? '').trim();
    const contactName = (data.contactName ?? saved?.contactName ?? '').trim();
    patch.nameKey = toNameKey(companyName || contactName);
  }

  await updateDoc(doc(db, COL, partyId), patch);
}

/** Records that a party has now been used in `role`, without clobbering others. */
export async function tagPartyRole(partyId: string, role: PartyRole): Promise<void> {
  await updateDoc(doc(db, COL, partyId), {
    roles:     arrayUnion(role),
    updatedAt: serverTimestamp(),
  });
}

/**
 * What a typed-in name means for this user, without creating anything.
 *
 * This used to create the party itself when the name was free, from that one
 * box and nothing else. It no longer does: a client minted from a name alone
 * has no phone, no email and no address, and the gap only shows up later, when
 * somebody needs to send it an agreement. The picker opens the full form on
 * `free` instead — see PartyQuickCreate.
 *
 * The role is still tagged onto an existing record here, because using a party
 * in a new role is not the same as inventing one.
 */
export async function findParty(
  name: string,
  role: PartyRole,
): Promise<{ party: Party } | { ownedBy: string } | { free: true }> {
  const trimmed = name.trim();
  const verdict = await resolvePartyName(trimmed);

  if (verdict.verdict === 'owned') return { ownedBy: verdict.ownerName };

  if (verdict.verdict === 'visible') {
    const party = verdict.party;
    if (!(party.roles ?? []).includes(role)) {
      // Best effort: a party reached under an approval is not writable by the
      // requester, and failing to tag a role must not block picking it.
      await tagPartyRole(party.id, role).catch(() => {});
      party.roles = [...(party.roles ?? []), role];
    }
    return { party };
  }

  return { free: true };
}

// ── Search ranking ───────────────────────────────────────────────────────────

/**
 * Scores a party against a query. Higher is better, 0 means no match. Ranked so
 * that what the user most likely meant floats to the top: a name starting with
 * the query beats a word inside it, which beats initials, which beats a loose
 * subsequence ("acm crp" still finds "Acme Corporation").
 */
export function scoreParty(party: Party, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 1;

  const display  = partyDisplayName(party).toLowerCase();
  const haystack = [display, party.contactName, party.email, party.phone, party.address?.city]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (display === q)                 return 1000;
  if (display.startsWith(q))         return 900 - display.length;

  const words = display.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 800 - display.length;

  const initials = words.map((w) => w[0]).join('');
  if (initials.startsWith(q))        return 700 - display.length;

  if (display.includes(q))           return 600 - display.length;
  if (haystack.includes(q))          return 500 - display.length;

  return isSubsequence(q, display) ? 400 - display.length : 0;
}

/** True when every character of `needle` appears in order within `haystack`. */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return i === needle.length;
}

export function searchParties(parties: Party[], query: string): Party[] {
  return parties
    .map((p) => ({ p, score: scoreParty(p, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || partyDisplayName(a.p).localeCompare(partyDisplayName(b.p)))
    .map((x) => x.p);
}
