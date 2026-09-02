import { adminDb, AdminAuthError, requireCompanyUser } from './firebase-admin';
import {
  canOpenParty,
  canSeeEveryParty,
  canSeeParty,
  viewAllPartyRoles,
  viewablePartyRoles,
  type PartyRoleName,
  type RoleFlags,
} from './accessControl';
import { inChunks } from './teamScope';
import type { OwnerFilter } from './ownerFilter';

export interface Caller {
  uid: string;
  email: string | undefined;
  profile: RoleFlags;
  displayName: string;
}

/**
 * Resolves the caller and their role flags in one place. Every party route goes
 * through this so visibility is decided server-side; the browser never receives
 * records it is not entitled to and so cannot leak them.
 */
export async function requireCaller(req: Request): Promise<Caller> {
  const { uid, email } = await requireCompanyUser(req);
  const snap = await adminDb.collection('users').doc(uid).get();
  const data = snap.data() ?? {};
  return {
    uid,
    email,
    profile: {
      isAdmin:        data.isAdmin === true,
      isDispatcher:   data.isDispatcher === true,
      isFinance:      data.isFinance === true,
      isHr:           data.isHr === true,
      isSalesManager: data.isSalesManager === true,
      isIntern:       data.isIntern === true,
      // The effective list, and the thing every `can()` below actually reads.
      // Left undefined rather than defaulted to [] when the profile predates
      // permissions: an empty array would read as "allowed to do nothing",
      // where undefined tells `can()` to derive the list from the role flags
      // and hand this person exactly the access they had yesterday.
      permissions:   Array.isArray(data.permissions) ? data.permissions as string[] : undefined,
      groupIds:      (data.groupIds ?? []) as string[],
      managedUids:   (data.managedUids ?? []) as string[],
      managedEmails: (data.managedEmails ?? []) as string[],
    },
    displayName: data.displayName || email || 'Unknown user',
  };
}

/** The client-safe shape of a party the caller is entitled to see in full. */
export interface VisibleParty {
  id: string;
  companyName: string;
  contactName: string;
  nameKey: string;
  phone: string;
  email: string;
  address: unknown;
  roles: string[];
  defaultOrigin: unknown;
  defaultDest: unknown;
  assignedToUids: string[];
  assignedToName: string;
  assignedToGroupIds: string[];
  assignedToEmails: string[];
  sourceId: string | null;
  sourceName: string;
  notes: string;
}

export function toVisibleParty(id: string, d: FirebaseFirestore.DocumentData): VisibleParty {
  return {
    id,
    companyName:    d.companyName    ?? '',
    contactName:    d.contactName    ?? '',
    nameKey:        d.nameKey        ?? '',
    phone:          d.phone          ?? '',
    email:          d.email          ?? '',
    address:        d.address        ?? null,
    roles:          d.roles          ?? [],
    defaultOrigin:  d.defaultOrigin  ?? null,
    defaultDest:    d.defaultDest    ?? null,
    assignedToUids:     d.assignedToUids     ?? [],
    assignedToName:     d.assignedToName     ?? '',
    assignedToGroupIds: d.assignedToGroupIds ?? [],
    assignedToEmails:   d.assignedToEmails   ?? [],
    sourceId:           d.sourceId           ?? null,
    sourceName:         d.sourceName         ?? '',
    notes:              d.notes              ?? '',
  };
}

export interface PartyQuery {
  /** Page size. Omitted returns every visible party. */
  limit?: number;
  /** The nameKey of the last party on the previous page. */
  cursor?: string | null;
  /** 'client', 'shipper' or 'consignee'. */
  role?: string;
  /** Name prefix, matched against nameKey. */
  search?: string;
  /**
   * Only the records one colleague owns — what the Clients list shows when it
   * is opened from somebody's book of business.
   *
   * Resolved from an email by the route rather than accepted as a uid; see
   * lib/ownerFilter.ts. Like the order-side twin it only narrows what this
   * caller could already see, so it needs no permission of its own — a party's
   * owners are on its own page.
   */
  owner?: OwnerFilter | null;
}

export interface PartyPage {
  parties: VisibleParty[];
  cursor: string | null;
}

/**
 * A page of the parties the caller may see, by name.
 *
 * Paged for the same reason orders and carriers are: the party migration took
 * this collection from one record to seven thousand, and the Clients screen was
 * reading all of them — about 3.7 MB and six and a half seconds — to show a
 * screenful.
 *
 * The two visibility paths split the way they do everywhere else. A privileged
 * caller gets a real cursor query over the collection. Everyone else gets the
 * union of what they own, what their groups own, what nobody owns and what they
 * have been granted, which cannot be cursored without an index per branch — so
 * that path reads its union once and pages it in memory, as it always has.
 *
 * Ordered by `nameKey` rather than the display name: it is the normalized form
 * the collection is already indexed on, and sorting by it puts "acme" next to
 * "ACME Corp." instead of in a different part of the alphabet.
 */
export async function listVisiblePartiesPage(
  caller: Caller,
  query: PartyQuery = {},
): Promise<PartyPage> {
  const col = adminDb.collection('parties');

  // Nothing at all for somebody who may not open this kind of record. Applied
  // here as well as in canSeeParty because the union below is built from
  // queries rather than filtered through that test — an intern would otherwise
  // be handed every unowned party in the company.
  if (!canOpenParty(caller.profile, query.role ? [query.role] : undefined)) {
    return { parties: [], cursor: null };
  }

  // Asked for one colleague's records. Taken before the wholesale branch on
  // purpose: two `array-contains` filters cannot share a query, so an owner and
  // a role cannot both be pushed down — and starting from the owner is the one
  // that narrows, where starting from the role is seven thousand documents.
  if (query.owner) {
    return pagePartiesInMemory(await partiesOwnedBy(caller, query.owner), query);
  }

  /*
    Two ways to get the cheap path: seeing every party there is, or seeing
    every party of the one kind this screen is asking for. The second is what
    makes a "sees every client but not every shipper" permission usable — the
    Clients screen names its role, so the query can be the same collection scan
    a dispatcher gets, narrowed to clients.

    Anything else falls through to the ownership union below, which is where a
    wholesale kind is folded in a query at a time.
  */
  const seesAll = viewAllPartyRoles(caller.profile);
  const wholesale = canSeeEveryParty(caller.profile)
    || (!!query.role && seesAll.includes(query.role as PartyRoleName));

  if (wholesale) {
    let q: FirebaseFirestore.Query = col;
    if (query.role) q = q.where('roles', 'array-contains', query.role);

    const term = (query.search ?? '').trim().toLowerCase();
    if (term) {
      // U+F8FF sorts above any character that appears in a name, so the pair bounds every
      // key starting with what was typed. Prefix only — Firestore has no
      // substring index; see the carriers list for the same trade.
      q = q.where('nameKey', '>=', term).where('nameKey', '<', term + '\uf8ff');
    }

    q = q.orderBy('nameKey');
    if (query.cursor) q = q.startAfter(query.cursor);
    if (query.limit)  q = q.limit(query.limit + 1);

    const snap = await q.get();
    const docs = query.limit ? snap.docs.slice(0, query.limit) : snap.docs;
    return {
      parties: docs.map((d) => toVisibleParty(d.id, d.data())),
      cursor: query.limit && snap.docs.length > query.limit
        ? (docs[docs.length - 1].data().nameKey ?? null)
        : null,
    };
  }

  return pagePartiesInMemory(await listVisibleParties(caller, query.role), query);
}

/**
 * The tail both in-memory paths share: apply the role and the name prefix, find
 * the cursor's place, cut a page.
 *
 * Expects `all` already ordered by nameKey, which both callers are — the cursor
 * is a name rather than a position, so a set that re-sorted between pages would
 * silently skip records.
 */
function pagePartiesInMemory(all: VisibleParty[], query: PartyQuery): PartyPage {
  const term = (query.search ?? '').trim().toLowerCase();
  const matching = all.filter((p) => {
    if (query.role && !(p.roles ?? []).includes(query.role)) return false;
    if (term && !(p.nameKey ?? '').startsWith(term)) return false;
    return true;
  });

  const start = query.cursor
    ? matching.findIndex((p) => p.nameKey === query.cursor) + 1
    : 0;
  const rows = matching.slice(start);
  if (!query.limit || rows.length <= query.limit) return { parties: rows, cursor: null };

  const page = rows.slice(0, query.limit);
  return { parties: page, cursor: page[page.length - 1].nameKey ?? null };
}

/**
 * The parties one colleague owns, as this caller is entitled to see them.
 *
 * Ownership by name only — `assignedToUids` and the address they are held under
 * until first sign-in. A work group's records are deliberately not counted as
 * any one member's: the group exists precisely so a book can belong to several
 * people, and crediting it to each of them in turn would make "Maria's clients"
 * mean something different from what the phrase says.
 *
 * `assignedToName`, the raw BATS rep name, is also left out. It grants nothing
 * and resolves to nobody, so a record still carrying only that is unclaimed
 * rather than somebody's.
 */
async function partiesOwnedBy(
  caller: Caller,
  owner: OwnerFilter,
): Promise<VisibleParty[]> {
  const col = adminDb.collection('parties');

  const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [
    col.where('assignedToEmails', 'array-contains', owner.email).get(),
  ];
  if (owner.uid) {
    queries.push(col.where('assignedToUids', 'array-contains', owner.uid).get());
  }

  const [snaps, lent] = await Promise.all([
    Promise.all(queries),
    // A record lent by a live approval would otherwise disappear from a
    // filtered list while sitting in the unfiltered one, which reads as the
    // filter having lost it rather than as the grant not applying.
    approvedPartyIds(caller.uid),
  ]);

  const lentIds = new Set(lent);
  const byId = new Map<string, VisibleParty>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const data = d.data();
      // The ordinary per-record test, not an assumption about who is asking.
      // For the readers who reach this screen it removes nothing; it is here so
      // that stays true when somebody is given one more permission.
      if (!canSeeParty(data, caller.uid, caller.profile) && !lentIds.has(d.id)) continue;
      if (!canOpenParty(caller.profile, data.roles)) continue;
      byId.set(d.id, toVisibleParty(d.id, data));
    }
  }

  return [...byId.values()].sort((a, b) => a.nameKey.localeCompare(b.nameKey));
}

/**
 * How many visible parties hold a role, without fetching them.
 *
 * `owner` narrows it to one colleague's records, so the total in the heading
 * agrees with the list under it when the screen was opened from somebody's
 * book of business.
 */
export async function countVisibleParties(
  caller: Caller,
  role?: string,
  owner?: OwnerFilter | null,
): Promise<number> {
  if (!canOpenParty(caller.profile, role ? [role] : undefined)) return 0;

  if (owner) {
    const owned = await partiesOwnedBy(caller, owner);
    return role ? owned.filter((p) => (p.roles ?? []).includes(role)).length : owned.length;
  }

  const seesAll = viewAllPartyRoles(caller.profile);
  if (canSeeEveryParty(caller.profile)
    || (role && seesAll.includes(role as PartyRoleName))) {
    const col = adminDb.collection('parties');
    const q = role ? col.where('roles', 'array-contains', role) : col;
    return (await q.count().get()).data().count;
  }
  const all = await listVisibleParties(caller, role);
  return role ? all.filter((p) => (p.roles ?? []).includes(role)).length : all.length;
}

/**
 * Every party the caller may see. Privileged roles get the collection; everyone
 * else gets the union of what they own and what nobody owns. The two targeted
 * queries avoid streaming thousands of documents only to discard most of them.
 *
 * On the current collection the privileged path is seven thousand documents and
 * several seconds — use `listVisiblePartiesPage` for anything that shows a list.
 */
export async function listVisibleParties(
  caller: Caller,
  /**
   * The kind of party the caller is asking about, when they are asking about
   * one.
   *
   * Only used to keep the wholesale queries below honest. Somebody who sees
   * every client but not every shipper, looking at the Shippers screen, must
   * not have the entire client list read and thrown away to answer it — on
   * this collection that is seven thousand documents for nothing.
   */
  role?: string,
): Promise<VisibleParty[]> {
  const col = adminDb.collection('parties');

  const viewable = viewablePartyRoles(caller.profile);
  if (viewable.length === 0) return [];

  if (canSeeEveryParty(caller.profile)) {
    const snap = await col.orderBy('nameKey').get();
    return snap.docs.map((d) => toVisibleParty(d.id, d.data()));
  }

  const groupIds = caller.profile.groupIds ?? [];
  const managed  = caller.profile.managedUids ?? [];
  const managedEmails = caller.profile.managedEmails ?? [];

  const [mine, unowned, viaGroup, granted, viaTeam, byKind] = await Promise.all([
    col.where('assignedToUids', 'array-contains', caller.uid).get(),
    // Every ownership field has to be empty for a party to count as unowned.
    // assignedToEmails joined this list when ownership-by-email was added: a
    // party held for someone who has not signed in yet is owned, and matching
    // it here would have published it to the whole company.
    col.where('assignedToUids', '==', [])
       .where('assignedToGroupIds', '==', [])
       .where('assignedToEmails', '==', [])
       .where('assignedToName', '==', '')
       .get(),
    // `array-contains-any` caps at 30 values, which is far more work groups
    // than one person would ever belong to.
    groupIds.length
      ? col.where('assignedToGroupIds', 'array-contains-any', groupIds.slice(0, 30)).get()
      : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }),
    approvedPartyIds(caller.uid),
    /*
      A Sales Manager's team. Two queries rather than one because a member who
      has never signed in is held by email — see managedEmails — and dropping
      that half would hide exactly the records a manager is most likely to be
      setting up for a new hire.
    */
    Promise.all([
      ...inChunks(managed).map((batch) =>
        col.where('assignedToUids', 'array-contains-any', batch).get()),
      ...inChunks(managedEmails).map((batch) =>
        col.where('assignedToEmails', 'array-contains-any', batch).get()),
    ]),
    /*
      Kinds this caller sees wholesale but could not be served by the cheap
      path above, because the screen did not name a role. One query per kind;
      usually none, because a caller with all three took the branch above and a
      caller with a role filter took the other one.
    */
    Promise.all(
      viewAllPartyRoles(caller.profile)
        // Narrowed to what was asked for. With no role named — the analytics
        // rollup, the resolver — every wholesale kind is fetched, which is
        // correct and is why those callers are the ones that page nothing.
        .filter((kind) => !role || kind === role)
        .map((kind) => col.where('roles', 'array-contains', kind).get()),
    ),
  ]);

  const byId = new Map<string, VisibleParty>();
  for (const d of [
    ...mine.docs, ...unowned.docs, ...viaGroup.docs,
    ...viaTeam.flatMap((snap) => snap.docs),
    ...byKind.flatMap((snap) => snap.docs),
  ]) {
    byId.set(d.id, toVisibleParty(d.id, d.data()));
  }

  // A live approval lends visibility until it is spent on an order.
  const extra = granted.filter((id) => !byId.has(id));
  if (extra.length) {
    const docs = await adminDb.getAll(...extra.map((id) => col.doc(id)));
    for (const d of docs) if (d.exists) byId.set(d.id, toVisibleParty(d.id, d.data()!));
  }

  return [...byId.values()]
    // A caller who may open only some kinds gets only those. The queries above
    // ask about ownership, which knows nothing about what kind of record it is
    // attached to, so the narrowing happens here.
    .filter((p) => canOpenParty(caller.profile, p.roles))
    .sort((a, b) => a.nameKey.localeCompare(b.nameKey));
}

/**
 * Party ids this user has an approved, not-yet-spent request for.
 *
 * Ownership grants are deliberately excluded. Such a request stays 'approved'
 * for good — there is no single use to spend — so counting it here would mean
 * an admin who later removed the person from the record had not actually taken
 * anything away: the stale approval would keep lending what the removal was
 * meant to end. Their access comes from being an owner, and it has to end when
 * that does.
 */
export async function approvedPartyIds(uid: string): Promise<string[]> {
  const snap = await adminDb
    .collection('partyAccessRequests')
    .where('requestedByUid', '==', uid)
    .where('status', '==', 'approved')
    .get();
  return snap.docs
    .filter((d) => d.data().grantKind !== 'ownership')
    .map((d) => d.data().partyId as string)
    .filter(Boolean);
}

/**
 * Resolves the approval that entitles `uid` to use `partyId`, if any.
 *
 * Ownership grants are excluded here too, and for the matching reason: they are
 * not a single-use token and must not be spendable as one. While the grant
 * holds, the caller owns the record and needs no approval at all; once it has
 * been taken away, this must not hand them one last order on the strength of a
 * permission that was withdrawn.
 */
export async function findApproval(uid: string, partyId: string) {
  const snap = await adminDb
    .collection('partyAccessRequests')
    .where('requestedByUid', '==', uid)
    .where('partyId', '==', partyId)
    .where('status', '==', 'approved')
    .get();
  return snap.docs.find((d) => d.data().grantKind !== 'ownership') ?? null;
}

/**
 * The three answers a party id can produce, kept apart.
 *
 * `getVisibleParty` collapses "gone" and "not yours" into a thrown error, which
 * is right for a route that only ever serves the record. A page reached by a
 * link a colleague pasted needs to tell the two apart: "this client was
 * deleted" and "this is Maria's client, ask her" send the reader somewhere
 * completely different, and rendering "not found" for both sent them nowhere.
 */
export type PartyAccess =
  | { status: 'ok'; party: VisibleParty }
  | { status: 'missing' }
  | { status: 'denied'; ownerName: string };

export async function readParty(caller: Caller, partyId: string): Promise<PartyAccess> {
  const snap = await adminDb.collection('parties').doc(partyId).get();
  if (!snap.exists) return { status: 'missing' };

  const data = snap.data()!;
  if (canSeeParty(data, caller.uid, caller.profile)) {
    return { status: 'ok', party: toVisibleParty(snap.id, data) };
  }
  // An approved request stands in for ownership until it is consumed.
  if (await findApproval(caller.uid, partyId)) {
    return { status: 'ok', party: toVisibleParty(snap.id, data) };
  }

  return {
    status:    'denied',
    ownerName: await ownerLabel(
      data.assignedToUids ?? [],
      data.assignedToName ?? '',
      data.assignedToGroupIds ?? [],
      data.assignedToEmails ?? [],
    ),
  };
}

/**
 * Loads a party only if the caller is entitled to it; 403s rather than 404s.
 * The throwing face of `readParty`, for routes that only ever serve the record.
 */
export async function getVisibleParty(caller: Caller, partyId: string): Promise<VisibleParty> {
  const access = await readParty(caller, partyId);
  if (access.status === 'missing') throw new AdminAuthError('Party not found', 404);
  if (access.status === 'denied') {
    throw new AdminAuthError('You do not have access to this record', 403);
  }
  return access.party;
}

/** Display name for an owner uid, for the collision warning and the inbox. */
export async function ownerLabel(
  assignedToUids: string[],
  assignedToName: string,
  assignedToGroupIds: string[] = [],
  assignedToEmails: string[] = [],
): Promise<string> {
  const uid = assignedToUids?.[0];
  if (uid) {
    const snap = await adminDb.collection('users').doc(uid).get();
    const d = snap.data();
    if (d) return d.displayName || d.email || 'another user';
  }
  // A group-owned record names the group — "talk to Gabe's Team" is more
  // actionable than naming one arbitrary member.
  const groupId = assignedToGroupIds?.[0];
  if (groupId) {
    const snap = await adminDb.collection('workGroups').doc(groupId).get();
    const d = snap.data();
    if (d?.name) return d.name;
  }
  // Held for somebody invited who has never signed in: there is no profile to
  // name, and the whole point of the label is telling the reader who to go ask,
  // so the address they were invited at beats "another user".
  const email = assignedToEmails?.[0];
  if (email) return email;

  return assignedToName.trim() || 'another user';
}

/** Everyone who may decide a request for a party, expanding groups to members. */
export async function ownersFor(party: FirebaseFirestore.DocumentData): Promise<string[]> {
  const direct = (party.assignedToUids ?? []) as string[];
  const groups = (party.assignedToGroupIds ?? []) as string[];
  if (groups.length === 0) return direct;

  const docs = await adminDb.getAll(
    ...groups.map((g) => adminDb.collection('workGroups').doc(g)),
  );
  const fromGroups = docs.flatMap((d) => (d.exists ? (d.data()!.memberUids ?? []) : []));
  return [...new Set([...direct, ...fromGroups])] as string[];
}
