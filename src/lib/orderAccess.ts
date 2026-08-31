/**
 * Server-side order visibility.
 *
 * The direct sibling of partyAccess.ts, and it exists for the same reason: the
 * filtering has to happen with the Admin SDK so the browser is never sent
 * orders it is not entitled to. Firestore rules are the floor underneath this,
 * not a substitute for it.
 *
 * Orders are closed by default. Where an unowned party is shared reference
 * data, an unowned order is visible only to admin, dispatch and finance — see
 * canSeeOrder() for why the two differ.
 */

import { adminDb, AdminAuthError } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { canSeeAllParties, canSeeOrder } from './accessControl';
import { orderSearchTerm, searchWords } from '@/types/order';
import type { OwnerContact } from '@/types/order';
import { ownerLabel } from './partyAccess';
import type { Caller } from './partyAccess';

const COL = 'orders';

/**
 * The fields the list screens actually render.
 *
 * Orders average about 1.2 KB each, and the list shows nine columns of that.
 * Sending the whole document was costing roughly 12 MB on a collection of ten
 * thousand — projecting to these fields cuts the payload to a bit over a third
 * and roughly halves the time Firestore takes to serve it.
 *
 * `parentOrderId` is here despite never being displayed: the list hides
 * suborders, and a row cannot be filtered out by a field it was not sent.
 * `createdAt` likewise — it is the sort key and the paging cursor.
 */
const LIST_FIELDS = [
  'orderNumber', 'batsId', 'previousOrderNumber',
  'clientName', 'shipperName', 'origin', 'destination',
  'commodity', 'status', 'pickupDate', 'agreedRate',
  'parentOrderId', 'createdAt',
] as const;

/**
 * The fields the analytics charts read. A much narrower slice than the list —
 * that page works over years of history rather than a page of fifty, so the
 * per-order weight is what decides whether it is usable at all.
 */
const ANALYTICS_FIELDS = [
  'status', 'pickupDate', 'agreedRate', 'carrierPay',
  'clientId', 'clientName', 'transportType',
] as const;

/** What a caller may ask of the order list. */
export interface OrderQuery {
  /** Page size. Omitted means every visible order — see listVisibleOrders. */
  limit?: number;
  /** Opaque cursor from a previous page. */
  cursor?: string | null;
  status?: string;
  carrierId?: string;
  /**
   * The three party roles are separate filters, not one, because the role
   * lives on the order rather than on the party — the same company can be the
   * client on one load and the consignee on another, and a screen showing
   * "this party's orders" has to ask about each role it might have played.
   */
  clientId?: string;
  shipperId?: string;
  consigneeId?: string;
  /** '' selects top-level orders; an id selects that order's suborders. */
  parentOrderId?: string;
  /**
   * Only orders carrying this attachment. The Documents screen is a list of
   * files, and the overwhelming majority of orders have none — asking for
   * every order and discarding the ones with nothing attached meant reading
   * ten thousand documents to render a handful of rows.
   */
  hasDocument?: DocumentField;
  /**
   * What somebody typed into the search box. Matched against the fragments
   * stored on each order — see orderSearchTerms in src/types/order.ts.
   */
  search?: string;
  /**
   * Earliest pickup date to include, as epoch milliseconds. Bounds the
   * analytics history to the range actually being charted.
   */
  pickupFrom?: number;
  /** Trims each order to the fields that shape of screen actually reads. */
  fields?: 'list' | 'analytics' | 'full';
}

/** The four attachment paths an order can carry. */
export const DOCUMENT_FIELDS = [
  'bolStoragePath', 'invoiceStoragePath', 'podStoragePath', 'driverLicenseStoragePath',
] as const;
export type DocumentField = (typeof DOCUMENT_FIELDS)[number];

export interface OrderPage {
  orders: Record<string, unknown>[];
  /** Pass back as `cursor` for the next page. null means this was the last. */
  cursor: string | null;
}

/**
 * A page of the orders the caller may see, newest first.
 *
 * The two visibility paths are paged very differently, and deliberately so.
 *
 * A privileged caller sees the whole collection — ten thousand orders and
 * growing — so their page is a real Firestore cursor query that reads only the
 * rows it returns. Everyone else sees the union of four queries (assigned to
 * them, to their groups, or owned via the client on either), and a union cannot
 * be cursor-paged without an index for every branch *times* every filter. It
 * does not need to be: a broker sees the loads they are working, which is a
 * small set by construction, so that path reads its union once and pages it in
 * memory. The asymmetry is the point — it is the same reason the two paths
 * exist at all.
 */
export async function listVisibleOrdersPage(
  caller: Caller,
  query: OrderQuery = {},
): Promise<OrderPage> {
  const col = adminDb.collection(COL);
  const projection = PROJECTIONS[query.fields ?? 'full'];

  if (canSeeAllParties(caller.profile)) {
    let q: FirebaseFirestore.Query = col;
    if (query.status)               q = q.where('status', '==', query.status);
    if (query.carrierId)            q = q.where('carrierId', '==', query.carrierId);
    if (query.clientId)             q = q.where('clientId', '==', query.clientId);
    if (query.shipperId)            q = q.where('shipperId', '==', query.shipperId);
    if (query.consigneeId)          q = q.where('consigneeId', '==', query.consigneeId);
    // `!= null` rather than `> ''`: the field is written as null when there is
    // no file, and an inequality also excludes documents missing it entirely,
    // which is what "has an attachment" should mean.
    if (query.hasDocument)          q = q.where(query.hasDocument, '!=', null);
    // One term, because array-contains-any is an OR: searching "palm beach"
    // through it would return every load touching either word. The first word
    // narrows in the query and the rest are applied to the result below.
    const term = query.search ? orderSearchTerm(query.search) : '';
    if (term)                       q = q.where('searchTerms', 'array-contains', term);
    if (query.parentOrderId != null) {
      // A suborder's parent is stored as null, not an empty string, so the
      // "top level only" case has to ask for null rather than ''.
      q = q.where('parentOrderId', '==', query.parentOrderId || null);
    }

    /*
      Firestore insists that the field carrying an inequality is the first one
      sorted on, which rules out the createdAt cursor used everywhere else. Both
      inequality filters therefore return their result whole rather than paging
      it, and both are bounded by their nature rather than by a page size: an
      attachment is the exception among orders, and a pickup-date floor is
      already the range the caller chose to look at.

      Capped regardless, so neither can become an unbounded read — a company-wide
      document drive, or an "all time" range some years from now.
    */
    if (query.hasDocument || query.pickupFrom) {
      const sortField = query.hasDocument ?? 'pickupDate';
      if (query.pickupFrom) {
        q = q.where('pickupDate', '>=', Timestamp.fromMillis(query.pickupFrom));
      }
      if (projection) q = q.select(...projection);
      const snap = await q.orderBy(sortField, 'desc').limit(query.limit ?? 20000).get();
      return { orders: snap.docs.map((d) => ({ id: d.id, ...d.data() })), cursor: null };
    }

    // __name__ is ordered explicitly so the cursor is total: two orders sharing
    // a createdAt (a BATS import gave a whole day the same timestamp) would
    // otherwise page inconsistently, dropping or repeating rows at the seam.
    q = q.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    if (projection) {
      // searchTerms is normally left out — it is a few hundred fragments per
      // order and nothing renders it. It is only fetched when a second typed
      // word has to be checked against it, which narrowBySearch does here.
      const needsTerms = searchWords(query.search ?? '').length > 1;
      q = q.select(...projection, ...(needsTerms ? ['searchTerms'] : []));
    }

    const after = decodeCursor(query.cursor);
    if (after) q = q.startAfter(after.createdAt, col.doc(after.id));

    // One more than asked for, purely to learn whether a next page exists
    // without running a second query for the answer.
    if (query.limit) q = q.limit(query.limit + 1);

    const snap = await q.get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const hits = narrowBySearch(rows, query.search, term);
    // Stripped again on the way out: it was fetched to filter with, and it is
    // several hundred fragments per order that no screen displays.
    if (projection) for (const o of hits) delete o.searchTerms;
    return toPage(hits, query.limit);
  }

  const all = await unionForCaller(caller);
  const filtered = all.filter((o) => matchesFilters(o, query));

  // A cursor naming a row that is no longer in the set — the order was
  // reassigned away between one page and the next — resolves to the end rather
  // than the start. Restarting would serve page one again, and a "load more"
  // button that quietly re-serves the first page never terminates.
  const after = decodeCursor(query.cursor);
  const at    = after ? filtered.findIndex((o) => o.id === after.id) : -1;
  const rows  = after
    ? (at === -1 ? [] : filtered.slice(at + 1))
    : filtered;

  const page = toPage(query.limit ? rows.slice(0, query.limit + 1) : rows, query.limit);
  return projection
    ? { ...page, orders: page.orders.map((o) => trimTo(o, projection)) }
    : page;
}

/**
 * Every order the caller may see, unpaged.
 *
 * Kept for the screens that genuinely aggregate over the whole set — analytics
 * works out margin by month and cannot do that from one page. Everything that
 * merely *shows a list* should call listVisibleOrdersPage instead: on the
 * current collection this reads ten thousand documents and takes about
 * seventeen seconds.
 */
export async function listVisibleOrders(
  caller: Caller,
  query: OrderQuery = {},
): Promise<Record<string, unknown>[]> {
  const { orders } = await listVisibleOrdersPage(caller, { ...query, limit: undefined });
  return orders;
}

/**
 * How many visible orders sit in each status.
 *
 * The filter tabs show a count beside every status, and they used to get it by
 * counting a ten-thousand-element array in the browser — which meant the
 * browser had to be sent all ten thousand. Firestore's count() reads at one
 * document per thousand counted, so the whole row of tabs costs about eleven
 * reads instead of ten thousand.
 */
export async function countVisibleOrdersByStatus(
  caller: Caller,
  statuses: readonly string[],
): Promise<Record<string, number>> {
  const col = adminDb.collection(COL);

  if (canSeeAllParties(caller.profile)) {
    const counts = await Promise.all(
      statuses.map((s) =>
        col.where('parentOrderId', '==', null).where('status', '==', s).count().get()
          .then((r) => [s, r.data().count] as const),
      ),
    );
    return Object.fromEntries(counts);
  }

  // The union path already holds every row it can see in memory, so counting
  // them there is free and avoids four aggregations per status.
  const all = (await unionForCaller(caller)).filter((o) => !o.parentOrderId);
  return Object.fromEntries(
    statuses.map((s) => [s, all.filter((o) => o.status === s).length]),
  );
}

/** The four-query union that stands in for a query the rules could approve. */
async function unionForCaller(caller: Caller): Promise<Record<string, unknown>[]> {
  const col = adminDb.collection(COL);
  const groupIds = caller.profile.groupIds ?? [];
  // array-contains-any caps at 30 values, far more work groups than one person
  // would ever belong to.
  const someGroups = groupIds.slice(0, 30);
  const byGroup = (field: string) =>
    someGroups.length
      ? col.where(field, 'array-contains-any', someGroups).get()
      : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] });

  const [mine, viaGroup, viaClient, viaClientGroup] = await Promise.all([
    col.where('assignedToUids', 'array-contains', caller.uid).get(),
    byGroup('assignedToGroupIds'),
    col.where('clientOwnerUids', 'array-contains', caller.uid).get(),
    byGroup('clientOwnerGroupIds'),
  ]);

  const byId = new Map<string, Record<string, unknown>>();
  for (const d of [...mine.docs, ...viaGroup.docs, ...viaClient.docs, ...viaClientGroup.docs]) {
    byId.set(d.id, { id: d.id, ...d.data() });
  }

  // Sorted here rather than in the queries: each query would need its own
  // composite index to carry an orderBy, and the union has to be re-sorted
  // afterwards regardless.
  return [...byId.values()].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

/**
 * Applies the words the query could not.
 *
 * Only one fragment goes to Firestore, so "palm beach" comes back as every load
 * matching "palm". The rest are checked here against the same stored fragments,
 * which keeps the meaning of a multi-word search as narrowing rather than
 * widening.
 *
 * This filters a page after it was counted, so a page can come back shorter
 * than the limit while more results still exist. That is the honest trade for
 * multi-word search without an index per combination of words, and the list
 * keeps its Load more button while a cursor remains.
 */
function narrowBySearch(
  rows: Record<string, unknown>[],
  search: string | undefined,
  usedTerm: string,
): Record<string, unknown>[] {
  const rest = searchWords(search ?? '').slice(1);
  if (!usedTerm || rest.length === 0) return rows;
  return rows.filter((o) => {
    const terms = new Set((o.searchTerms as string[] | undefined) ?? []);
    return rest.every((w) => terms.has(w.slice(0, 12)));
  });
}

/** Whole-query match for the union path, which has the orders in memory. */
function matchesSearch(order: Record<string, unknown>, search: string): boolean {
  const terms = new Set((order.searchTerms as string[] | undefined) ?? []);
  const words = searchWords(search);
  return words.length === 0 || words.every((w) => terms.has(w.slice(0, 12)));
}

/** The in-memory equivalent of the where() clauses the privileged path pushes down. */
function matchesFilters(order: Record<string, unknown>, query: OrderQuery): boolean {
  if (query.status && order.status !== query.status) return false;
  if (query.carrierId && order.carrierId !== query.carrierId) return false;
  if (query.clientId && order.clientId !== query.clientId) return false;
  if (query.shipperId && order.shipperId !== query.shipperId) return false;
  if (query.consigneeId && order.consigneeId !== query.consigneeId) return false;
  if (query.hasDocument && !order[query.hasDocument]) return false;
  if (query.search && !matchesSearch(order, query.search)) return false;
  if (query.pickupFrom && toMillis(order.pickupDate) < query.pickupFrom) return false;
  if (query.parentOrderId != null) {
    const want = query.parentOrderId || null;
    if ((order.parentOrderId ?? null) !== want) return false;
  }
  return true;
}

/** What each `fields` value selects. `full` projects nothing and sends it all. */
const PROJECTIONS: Record<string, readonly string[] | null> = {
  list:      LIST_FIELDS,
  analytics: ANALYTICS_FIELDS,
  full:      null,
};

function trimTo(order: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { id: order.id };
  for (const f of fields) if (order[f] !== undefined) out[f] = order[f];
  return out;
}

/** Splits off the extra row fetched to detect a next page, and mints its cursor. */
function toPage(rows: Record<string, unknown>[], limit?: number): OrderPage {
  if (!limit || rows.length <= limit) return { orders: rows, cursor: null };
  const page = rows.slice(0, limit);
  return { orders: page, cursor: encodeCursor(page[page.length - 1]) };
}

/**
 * Cursors are opaque to the browser on purpose: they name a position in a
 * result set the caller may not see all of, and a client that could forge one
 * would be naming a document id it was never given.
 */
function encodeCursor(order: Record<string, unknown>): string {
  const raw = `${toMillis(order.createdAt)}:${order.id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const at  = raw.indexOf(':');
  if (at < 1) return null;
  const millis = Number(raw.slice(0, at));
  const id     = raw.slice(at + 1);
  if (!Number.isFinite(millis) || !id) return null;
  return { createdAt: new Date(millis), id };
}

/** Firestore Timestamps sort by their epoch millis; anything missing sorts last. */
function toMillis(value: unknown): number {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}

/**
 * The three answers an order id can produce, kept apart — the sibling of
 * `PartyAccess`, and there for the same reason. A broker sent an order link by
 * a colleague used to land on "Order not found", which is untrue and tells them
 * nothing to do next; "this is Maria's load" tells them who to ask.
 */
export type OrderAccess =
  | { status: 'ok'; order: Record<string, unknown> }
  | { status: 'missing' }
  | { status: 'denied'; ownerName: string };

export async function readOrder(caller: Caller, orderId: string): Promise<OrderAccess> {
  const snap = await adminDb.collection(COL).doc(orderId).get();
  if (!snap.exists) return { status: 'missing' };

  const data = snap.data()!;
  if (canSeeOrder(data, caller.uid, caller.profile)) {
    return { status: 'ok', order: { id: snap.id, ...data } };
  }
  return { status: 'denied', ownerName: await orderOwnerLabel(data) };
}

/**
 * Who to go and ask about an order.
 *
 * The order's own owner is named first and its client's owner only as a
 * fallback, because those are two different conversations: the broker running
 * the load can answer about the load, while the client's owner is merely the
 * reason the order is visible to them at all.
 *
 * An order with neither is not unowned-and-shared the way a party would be —
 * canSeeOrder() keeps it to admin, dispatch and finance — so the empty string
 * here means "ask an administrator", not "nobody owns this".
 */
export async function orderOwnerLabel(order: FirebaseFirestore.DocumentData): Promise<string> {
  const own = await ownerLabel(
    order.assignedToUids ?? [],
    '',
    order.assignedToGroupIds ?? [],
    order.assignedToEmails ?? [],
  );
  if (own !== 'another user') return own;

  const viaClient = await ownerLabel(
    order.clientOwnerUids ?? [],
    '',
    order.clientOwnerGroupIds ?? [],
  );
  return viaClient === 'another user' ? '' : viaClient;
}

/**
 * Who to go and ask about each of these orders, resolved in a handful of reads.
 *
 * The Documents screen can show hundreds of licence rows belonging to loads the
 * reader cannot open, and each one needs a name, a uid to message and a phone
 * number. Done per row that is three lookups apiece; this collects the distinct
 * owners first and fetches each one once.
 *
 * Precedence follows orderOwnerLabel() deliberately — the order's own owner
 * before the client's — because they are two different conversations. The
 * broker running the load can answer about the load; the client's owner is
 * merely the reason it is theirs at all.
 */
export async function resolveOwnerContacts(
  orders: { id: string; data: FirebaseFirestore.DocumentData }[],
): Promise<Map<string, OwnerContact>> {
  type Target =
    | { kind: 'uid'; id: string }
    | { kind: 'group'; id: string }
    | { kind: 'email'; value: string }
    | null;

  const targetFor = (o: FirebaseFirestore.DocumentData): Target => {
    const uid = (o.assignedToUids ?? [])[0];
    if (uid) return { kind: 'uid', id: uid };
    const group = (o.assignedToGroupIds ?? [])[0];
    if (group) return { kind: 'group', id: group };
    const email = (o.assignedToEmails ?? [])[0];
    if (email) return { kind: 'email', value: email };
    // Falls through to the client's owner for the same reason the order
    // carries clientOwner* at all: owning the client is the second way in.
    const viaUid = (o.clientOwnerUids ?? [])[0];
    if (viaUid) return { kind: 'uid', id: viaUid };
    const viaGroup = (o.clientOwnerGroupIds ?? [])[0];
    if (viaGroup) return { kind: 'group', id: viaGroup };
    return null;
  };

  const targets = new Map<string, Target>();
  for (const o of orders) targets.set(o.id, targetFor(o.data));

  const uids   = [...new Set([...targets.values()].filter((t) => t?.kind === 'uid').map((t) => (t as { id: string }).id))];
  const groups = [...new Set([...targets.values()].filter((t) => t?.kind === 'group').map((t) => (t as { id: string }).id))];

  // getAll rejects an empty argument list, so neither read is attempted when
  // nothing of that kind is owed.
  const [userDocs, groupDocs] = await Promise.all([
    uids.length   ? adminDb.getAll(...uids.map((u) => adminDb.collection('users').doc(u)))         : Promise.resolve([]),
    groups.length ? adminDb.getAll(...groups.map((g) => adminDb.collection('workGroups').doc(g)))  : Promise.resolve([]),
  ]);

  const userById  = new Map(userDocs.map((d) => [d.id, d.data()]));
  const groupById = new Map(groupDocs.map((d) => [d.id, d.data()]));

  const out = new Map<string, OwnerContact>();
  for (const [orderId, target] of targets) {
    if (!target) {
      // Not "unowned and therefore everyone's" — canSeeOrder keeps an ownerless
      // order to admin, dispatch and finance, so the reader is being pointed at
      // them rather than at nobody.
      out.set(orderId, { uid: null, name: '', phone: null, extension: null });
      continue;
    }
    if (target.kind === 'uid') {
      const d = userById.get(target.id);
      out.set(orderId, {
        uid:       d ? target.id : null,
        name:      (d?.displayName as string) || (d?.email as string) || '',
        // Only the US work number. `phoneOther` is somebody's Guatemala or
        // Mexico line and is not what a colleague chasing a licence should dial.
        phone:     (d?.phone as string) || null,
        extension: (d?.extension as string) || null,
      });
      continue;
    }
    if (target.kind === 'group') {
      // A group is named but cannot be messaged: a direct thread needs one
      // account on the other end. "Talk to Gabe's Team" is still the honest
      // answer — see ownerLabel().
      out.set(orderId, {
        uid: null,
        name: (groupById.get(target.id)?.name as string) || '',
        phone: null,
        extension: null,
      });
      continue;
    }
    // Invited, never signed in. There is no profile to name or message, so the
    // address they were invited at is the most useful thing there is.
    out.set(orderId, { uid: null, name: target.value, phone: null, extension: null });
  }
  return out;
}

/**
 * The order a *number* refers to, if the caller may see it.
 *
 * Numbers rather than ids, because this exists for the number somebody types
 * into chat — nobody pastes a Firestore document id into a message about a
 * load. A load can be known by two numbers at once (see orderDisplayNumber),
 * so both are tried: the sequence number first, then the BATS id, which is
 * what the older half of the company still says out loud.
 *
 * `limit(1)` on each. An order number is unique by construction — it comes out
 * of a counter transaction — and a BATS id was unique in the system it came
 * from; a duplicate would be a data fault, and answering with the first is
 * better than refusing to answer at all.
 */
export async function readOrderByNumber(caller: Caller, number: string): Promise<OrderAccess> {
  const wanted = number.trim();
  if (!wanted) return { status: 'missing' };

  const col = adminDb.collection(COL);
  for (const field of ['orderNumber', 'batsId'] as const) {
    const snap = await col.where(field, '==', wanted).limit(1).get();
    if (snap.empty) continue;

    const doc  = snap.docs[0];
    const data = doc.data();
    if (canSeeOrder(data, caller.uid, caller.profile)) {
      return { status: 'ok', order: { id: doc.id, ...data } };
    }
    // Deliberately no owner name here, unlike readOrder. Somebody who follows
    // an order link chose to open it and is owed an explanation; a number that
    // happened to appear in a message they were reading is not something they
    // asked about, and naming its owner would turn every room into a way to
    // ask who works which load.
    return { status: 'denied', ownerName: '' };
  }
  return { status: 'missing' };
}

/**
 * Loads one order only if the caller is entitled to it; 403s rather than 404s.
 * The throwing face of `readOrder`.
 */
export async function getVisibleOrder(
  caller: Caller,
  orderId: string,
): Promise<Record<string, unknown>> {
  const access = await readOrder(caller, orderId);
  if (access.status === 'missing') throw new AdminAuthError('Order not found', 404);
  if (access.status === 'denied') {
    // 403 rather than 404 on purpose: the order exists, and telling the caller
    // so is not a leak when they already had to name its id to get here.
    throw new AdminAuthError('You do not have access to this order', 403);
  }
  return access.order;
}
