import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { can, canSeeOrder, canSeeParty } from './accessControl';
import type { Caller } from './partyAccess';
import { queueSuggestionsFor } from './plannerQueuesServer';
import { dueFollowUps } from './clientSalesServer';
import { ORDER_STATUSES, clientSignatureSatisfied, orderDisplayNumber } from '@/types/order';
import { PENDING_PICKUP, STALE_DAYS } from '@/types/orderView';
import { officeToday } from '@/types/celebration';
import {
  MAX_CLIENTS_CHECKED,
  MAX_SUGGESTIONS_PER_GROUP,
  QUIET_AFTER_DAYS,
  SUGGESTION_GROUP_OF,
  SUGGESTION_RANK,
  type PlanSuggestion,
  type SuggestionKind,
} from '@/types/dailyPlan';

/*
 * What the planning pop-up suggests — the things already waiting on somebody
 * in TTMS, turned into tasks they can accept with a tap. See
 * src/types/dailyPlan.ts.
 *
 * **Only ever the caller's own work, and never wider than what they can open.**
 * "Their loads" are the two routes `canSeeOrder()` grants a person — the load
 * assigned to them and the load whose client they own — the same definition
 * as a book of business (lib/bookOfBusiness.ts), and every row is put through
 * `canSeeOrder()` again before it becomes a suggestion. An admin sees the
 * whole book but is offered only the loads that are theirs: a pop-up listing
 * the company's every unsigned SA would be a report, not a plan.
 *
 * **Bounded by one person's open book.** Loads are read through the
 * `parentOrderId + status + assignedToUids` (and `clientOwnerUids`) indexes
 * that already exist, open statuses only and a projection of the fields read
 * here — a few dozen documents for a busy broker. Clients going quiet are two
 * `count()` aggregations each over the `clientId + createdAt` index (one read
 * per thousand counted), for at most MAX_CLIENTS_CHECKED clients. It runs
 * when the pop-up opens, which is once or twice a day per person.
 *
 * Nothing here is stored. A suggestion becomes a task only when the person
 * picks it, through the ordinary create route.
 */

const OPEN_STATUSES: readonly string[] = ORDER_STATUSES.filter((s) => s !== 'completed' && s !== 'cancelled');

/** What the rules below read, plus what `canSeeOrder()` does. */
const LOAD_FIELDS = [
  'orderNumber', 'batsId', 'status', 'clientName', 'origin', 'destination',
  'pickupDate', 'deliveryDate', 'podStoragePath', 'updatedAt',
  'shipperSignedAt', 'signatureWaivedAt', 'clientSignatureRecord',
  'assignedToUids', 'assignedToGroupIds', 'assignedToEmails', 'clientOwnerUids', 'clientOwnerGroupIds',
] as const;

const PARTY_FIELDS = [
  'companyName', 'contactName', 'roles',
  'assignedToUids', 'assignedToName', 'assignedToGroupIds', 'assignedToEmails',
] as const;

type Row = FirebaseFirestore.DocumentData;

/**
 * A stored pickup or delivery date as a calendar day. The order forms save
 * `new Date('YYYY-MM-DD')`, which is midnight UTC of that day, so the UTC
 * date is the day somebody typed — reading it in office time would move
 * every one of them to the evening before.
 */
function dayOf(v: unknown): string | null {
  const ts = v as { toDate?: () => Date } | null | undefined;
  return typeof ts?.toDate === 'function' ? ts.toDate().toISOString().slice(0, 10) : null;
}

function millisOf(v: unknown): number {
  const ts = v as { toMillis?: () => number } | null | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}

function cityOf(v: unknown): string {
  const a = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return typeof a.city === 'string' ? a.city.trim() : '';
}

function suggestion(
  kind: SuggestionKind, recordId: string, title: string, why: string,
  order: { id: string; number: string } | null,
): PlanSuggestion {
  return {
    id: `${kind}:${recordId}`,
    kind,
    group: SUGGESTION_GROUP_OF[kind],
    title: title.slice(0, 200),
    why: why.slice(0, 200),
    order,
    rank: SUGGESTION_RANK[kind],
  };
}

/** The rules, one load at a time. A load gives at most one suggestion: the most pressing. */
function fromLoad(id: string, o: Row, today: string, staleBefore: number): PlanSuggestion | null {
  const number = orderDisplayNumber(o);
  if (!number) return null;
  const order = { id, number };
  const client = typeof o.clientName === 'string' && o.clientName.trim() ? o.clientName.trim() : 'The client';
  const status = String(o.status ?? '');

  if (status === 'in_transit' && dayOf(o.deliveryDate) === today) {
    const to = cityOf(o.destination);
    return suggestion('delivery', id, `Check in with the driver on load ${number}`, to ? `Delivers today in ${to}` : 'Delivers today', order);
  }
  if ((PENDING_PICKUP as readonly string[]).includes(status) && dayOf(o.pickupDate) === today) {
    const from = cityOf(o.origin);
    return suggestion('pickup', id, `Confirm today's pickup on load ${number}`, from ? `Picking up today in ${from}` : 'Picking up today', order);
  }
  // Booked is the step where the client's signature is the next thing to
  // happen; past it the carrier side has its own review queue.
  if ((status === 'booked' || status === 'carrier_assigned') && !clientSignatureSatisfied(o)) {
    return suggestion('sa', id, `Get the SA signed for load ${number}`, `${client} hasn't signed yet`, order);
  }
  if (status === 'delivered' && !o.podStoragePath) {
    return suggestion('pod', id, `Get the POD for load ${number}`, 'Delivered, no proof of delivery yet', order);
  }
  if (status === 'quote' && millisOf(o.updatedAt) > 0 && millisOf(o.updatedAt) <= staleBefore) {
    const days = Math.floor((Date.now() - millisOf(o.updatedAt)) / 86_400_000);
    return suggestion('quote', id, `Follow up on the quote for ${client}`, `Load ${number} · no change in ${days} days`, order);
  }
  return null;
}

async function loadSuggestions(caller: Caller, today: string): Promise<PlanSuggestion[]> {
  const col = adminDb.collection('orders');
  // Top-level loads only, like the Orders list: a suborder is the same piece of work.
  const open = (q: FirebaseFirestore.Query) =>
    q.where('parentOrderId', '==', null).where('status', 'in', [...OPEN_STATUSES]).select(...LOAD_FIELDS).get();

  const queries = [
    open(col.where('assignedToUids', 'array-contains', caller.uid)),
    open(col.where('clientOwnerUids', 'array-contains', caller.uid)),
  ];
  if (caller.email) queries.push(open(col.where('assignedToEmails', 'array-contains', caller.email.toLowerCase())));
  const snaps = await Promise.all(queries);

  const byId = new Map<string, Row>();
  for (const snap of snaps) for (const d of snap.docs) byId.set(d.id, d.data());

  const staleBefore = Date.now() - STALE_DAYS * 86_400_000;
  const out: PlanSuggestion[] = [];
  for (const [id, o] of byId) {
    if (!canSeeOrder(o, caller.uid, caller.profile)) continue;
    const s = fromLoad(id, o, today, staleBefore);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Clients of theirs with loads in the past but none in QUIET_AFTER_DAYS — the
 * client type's Dormant (src/types/clientSnapshot.ts), worked out with two
 * counts rather than every load the client ever had. A client with no load
 * at all is a prospect, which is a lead, not a client gone quiet.
 */
async function quietClients(caller: Caller): Promise<PlanSuggestion[]> {
  const parties = adminDb.collection('parties');
  const queries = [parties.where('assignedToUids', 'array-contains', caller.uid).select(...PARTY_FIELDS).get()];
  if (caller.email) {
    queries.push(parties.where('assignedToEmails', 'array-contains', caller.email.toLowerCase()).select(...PARTY_FIELDS).get());
  }
  const snaps = await Promise.all(queries);
  const clients = new Map<string, Row>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const p = d.data();
      if (!(p.roles ?? []).includes('client')) continue;
      if (!canSeeParty(p, caller.uid, caller.profile)) continue;
      clients.set(d.id, p);
    }
  }

  const since = Timestamp.fromMillis(Date.now() - QUIET_AFTER_DAYS * 86_400_000);
  const orders = adminDb.collection('orders');
  const checked = [...clients.entries()].slice(0, MAX_CLIENTS_CHECKED);
  const quiet = await Promise.all(checked.map(async ([id, p]) => {
    const recent = await orders.where('clientId', '==', id).where('createdAt', '>=', since).count().get();
    if (recent.data().count > 0) return null;
    // The last load, for the "why": one document, through the same index.
    const last = await orders.where('clientId', '==', id).orderBy('createdAt', 'desc').limit(1).select('createdAt').get();
    if (last.empty) return null;
    return { id, p, lastAt: millisOf(last.docs[0].data().createdAt) };
  }));

  return quiet
    .filter((q): q is { id: string; p: Row; lastAt: number } => !!q)
    // Longest quiet last: somebody gone three months is likelier to come back than somebody gone two years.
    .sort((a, b) => b.lastAt - a.lastAt)
    .map(({ id, p, lastAt }) => {
      const name = String(p.companyName ?? '').trim() || String(p.contactName ?? '').trim() || 'A client';
      const days = Math.floor((Date.now() - lastAt) / 86_400_000);
      return suggestion('quiet', id, `Call ${name}`, `No load in ${days} days`, null);
    });
}

/** The caller's leads with a next step due by today, as "Follow up with …". */
async function leadSuggestions(caller: Caller, today: string): Promise<PlanSuggestion[]> {
  const due = await dueFollowUps(caller, today);
  return due
    .sort((a, b) => (a.nextDue ?? '').localeCompare(b.nextDue ?? ''))
    .map((s) => suggestion(
      'lead', s.partyId,
      `Follow up with ${s.partyName || 'a lead'}`,
      s.nextStep ? `${s.nextStep}${s.nextDue && s.nextDue < today ? ' (overdue)' : ''}` : 'Lead follow-up due',
      null,
    ));
}

/**
 * Everything the pop-up suggests to this caller, most pressing first, at most
 * MAX_SUGGESTIONS_PER_GROUP from each group: the queues their role decides
 * (lib/plannerQueuesServer.ts), then their own loads and clients. Somebody
 * who cannot open orders at all (an intern) has no loads to be offered and
 * is not queried for them.
 */
export async function planSuggestionsFor(caller: Caller): Promise<PlanSuggestion[]> {
  const today = officeToday();
  const ownBook = can(caller.profile, 'orders.view');
  const [queues, loads, clients, leads] = await Promise.all([
    queueSuggestionsFor(caller),
    ownBook ? loadSuggestions(caller, today) : Promise.resolve([] as PlanSuggestion[]),
    // A failure here costs a group of suggestions, never the pop-up.
    ownBook ? quietClients(caller).catch(() => [] as PlanSuggestion[]) : Promise.resolve([] as PlanSuggestion[]),
    // Leads whose next step is due (step 4b): one query on the caller's own
    // leads, no loads read. Drawn ahead of the quiet clients, since the
    // broker set the date themselves.
    ownBook ? leadSuggestions(caller, today).catch(() => [] as PlanSuggestion[]) : Promise.resolve([] as PlanSuggestion[]),
  ]);
  const byRank = (a: PlanSuggestion, b: PlanSuggestion) => a.rank - b.rank || a.title.localeCompare(b.title);
  return [
    ...queues.slice(0, MAX_SUGGESTIONS_PER_GROUP + 2),
    ...loads.sort(byRank).slice(0, MAX_SUGGESTIONS_PER_GROUP),
    ...[...leads, ...clients].slice(0, MAX_SUGGESTIONS_PER_GROUP),
  ];
}
