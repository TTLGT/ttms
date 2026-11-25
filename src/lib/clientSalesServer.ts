import { adminDb } from './firebase-admin';
import { canSeeParty } from './accessControl';
import { readParty, type Caller } from './partyAccess';
import { maySee, salesDaysFor, seesEveryone, tap } from './salesDayServer';
import { rewardSalesDay } from './taskGameServer';
import { officeToday } from '@/types/celebration';
import { isCalendarDateString } from '@/types/attendance';
import { isBookedStatus } from '@/types/clientSnapshot';
import { partyDisplayName } from '@/types/party';
import { sellsLoads } from '@/types/salesDay';
import {
  ACTIVITY_SHOWN, CLIENT_SALES_COLLECTION, MAX_ACTIVITY_TEXT, MAX_NEXT_STEP, WON_SHOWN_DAYS,
  isActivityKind, isLeadStage, leadColumn, stageAfterContact,
  type ActivityEntry, type ActivityEventKind, type ClientSales, type ClientSalesView, type LeadCard, type LeadStage,
} from '@/types/clientSales';

/*
 * Leads and sales activity, server side — see src/types/clientSales.ts for
 * what this is and who may see it.
 *
 * `clientSales/{partyId}` and its `activity` subcollection have no Firestore
 * rule, so this file is the only way in. Reading a client's side costs the
 * document, up to ACTIVITY_SHOWN entries, and up to 50 of the client's loads
 * (status only) to know whether it has been quoted or booked — an equality
 * query on `clientId`, which needs no composite index. The board costs one
 * query for the person's leads plus that last read per lead still open.
 */

export class SalesActivityRefused extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const col = () => adminDb.collection(CLIENT_SALES_COLLECTION);

type Row = Record<string, unknown>;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const uids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function iso(v: unknown): string | null {
  if (typeof v === 'string') return v;
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

function readSales(partyId: string, d: Row | undefined): ClientSales | null {
  if (!d) return null;
  return {
    partyId,
    partyName: str(d.partyName, 200),
    isLead: d.isLead === true,
    stage: isLeadStage(d.stage) ? d.stage : 'found',
    brokerUid: typeof d.brokerUid === 'string' && d.brokerUid ? d.brokerUid : null,
    brokerName: str(d.brokerName, 200),
    nextStep: str(d.nextStep, MAX_NEXT_STEP),
    nextDue: typeof d.nextDue === 'string' && isCalendarDateString(d.nextDue) ? d.nextDue : null,
    lost: d.lost === true,
    lostReason: str(d.lostReason, MAX_NEXT_STEP),
    wonAt: iso(d.wonAt),
    lastContactAt: iso(d.lastContactAt),
    createdAt: iso(d.createdAt),
  };
}

function readEntry(id: string, d: Row): ActivityEntry {
  return {
    id,
    kind: (typeof d.kind === 'string' ? d.kind : 'note') as ActivityEventKind,
    text: str(d.text, MAX_ACTIVITY_TEXT),
    stage: isLeadStage(d.stage) ? d.stage : null,
    at: iso(d.at) ?? '',
    byUid: typeof d.byUid === 'string' ? d.byUid : '',
    byName: str(d.byName, 200),
  };
}

async function displayNameOf(uid: string): Promise<string> {
  const d = (await adminDb.collection('users').doc(uid).get()).data();
  return typeof d?.displayName === 'string' ? d.displayName : '';
}

/** The people whose work this client is: its owners, and whoever is named on the lead. */
function brokersOf(party: { assignedToUids?: string[] }, sales: ClientSales | null): string[] {
  const out = new Set(uids(party.assignedToUids));
  if (sales?.brokerUid) out.add(sales.brokerUid);
  return [...out];
}

/**
 * May the caller see this client's sales side? A broker working it, their
 * Sales Manager, or `sales.viewAll`. A client nobody works yet (no owner, no
 * lead) can be picked up by anybody who sells — that is how a lead on shared
 * reference data starts — but there is no history to see until they do.
 */
function access(caller: Caller, party: { assignedToUids?: string[] }, sales: ClientSales | null): { see: boolean; write: boolean } {
  const brokers = brokersOf(party, sales);
  const see = seesEveryone(caller) || brokers.some((u) => maySee(caller, u));
  const unworked = brokers.length === 0 && sellsLoads(caller.profile);
  return { see, write: see || unworked };
}

/** Has the client been quoted, and has it booked? Up to 50 loads, status only. */
async function loadFacts(partyId: string): Promise<{ quoted: boolean; booked: boolean }> {
  const snap = await adminDb.collection('orders').where('clientId', '==', partyId).select('status').limit(50).get();
  const statuses = snap.docs.map((d) => String(d.data().status ?? ''));
  return { quoted: statuses.length > 0, booked: statuses.some(isBookedStatus) };
}

async function openClient(caller: Caller, partyId: string) {
  const res = await readParty(caller, partyId);
  if (res.status === 'missing') throw new SalesActivityRefused('That client is not in TTMS.', 404);
  if (res.status === 'denied') throw new SalesActivityRefused('You do not have access to this record.', 403);
  const roles = res.party.roles ?? [];
  if (roles.length && !roles.includes('client')) {
    throw new SalesActivityRefused('Calls and leads are kept on clients only.', 400);
  }
  return res.party;
}

// ── A client's page ──────────────────────────────────────────────────────────

export async function clientSalesView(caller: Caller, partyId: string): Promise<ClientSalesView> {
  const party = await openClient(caller, partyId);
  const doc = await col().doc(partyId).get();
  const sales = readSales(partyId, doc.data());
  const { see, write } = access(caller, party, sales);
  // Somebody who may open the client but not its sales side is told only
  // that; they are not sent the stage, the broker or a single entry.
  if (!see && !write) return { visible: false, sales: null, activity: [], booked: false, quoted: false };

  const [facts, entries] = await Promise.all([
    loadFacts(partyId),
    see && doc.exists
      ? col().doc(partyId).collection('activity').orderBy('at', 'desc').limit(ACTIVITY_SHOWN).get()
      : Promise.resolve(null),
  ]);
  if (sales && facts.booked && !sales.wonAt) {
    // First time anybody looked since it booked. Best-effort: the board reads
    // it to keep the lead in First load for a month without re-reading loads.
    const wonAt = new Date().toISOString();
    sales.wonAt = wonAt;
    await col().doc(partyId).set({ wonAt }, { merge: true }).catch(() => {});
  }
  return {
    visible: true,
    sales,
    activity: entries ? entries.docs.map((d) => readEntry(d.id, d.data())) : [],
    ...facts,
  };
}

// ── Changing it ──────────────────────────────────────────────────────────────

export type SalesAction =
  | { action: 'log'; kind: 'call' | 'email' | 'note'; text?: string }
  | { action: 'lead' }
  | { action: 'stage'; stage: LeadStage }
  | { action: 'next'; nextStep?: string; nextDue?: string | null }
  | { action: 'lost'; reason?: string }
  | { action: 'reopen' };

function parseAction(raw: unknown): SalesAction {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Row;
  switch (r.action) {
    case 'log':
      if (!isActivityKind(r.kind)) throw new SalesActivityRefused('Log a call, an email or a note.', 400);
      return { action: 'log', kind: r.kind, text: str(r.text, MAX_ACTIVITY_TEXT) };
    case 'lead': return { action: 'lead' };
    case 'stage':
      if (!isLeadStage(r.stage)) throw new SalesActivityRefused('Pick Found, Contacted or Quoted. First load moves by itself.', 400);
      return { action: 'stage', stage: r.stage };
    case 'next': {
      const nextDue = r.nextDue === null || r.nextDue === '' ? null : String(r.nextDue ?? '');
      if (nextDue !== null && !isCalendarDateString(nextDue)) throw new SalesActivityRefused('That is not a date.', 400);
      return { action: 'next', nextStep: str(r.nextStep, MAX_NEXT_STEP), nextDue };
    }
    case 'lost': return { action: 'lost', reason: str(r.reason, MAX_NEXT_STEP) };
    case 'reopen': return { action: 'reopen' };
    default: throw new SalesActivityRefused('Nothing to do.', 400);
  }
}

/**
 * One change to a client's sales side, with its history entry in the same
 * batch. Logging a call or an email also counts it on the caller's own
 * today's targets — the "Log a call" button is the +1 with a name on it.
 */
export async function actOnClient(caller: Caller, partyId: string, raw: unknown): Promise<ClientSalesView> {
  const act = parseAction(raw);
  const party = await openClient(caller, partyId);
  const ref = col().doc(partyId);
  const sales = readSales(partyId, (await ref.get()).data());
  if (!access(caller, party, sales).write) {
    throw new SalesActivityRefused('Only the broker working this client, their Sales Manager or an admin can log its calls and leads.', 403);
  }
  const now = new Date().toISOString();
  const partyName = partyDisplayName(party);
  const owners = uids(party.assignedToUids);
  // Who a new record names as working it: the caller if they own the client
  // or sell, otherwise its first owner (a manager logging a call on a
  // report's client does not take it over).
  const defaultBroker = owners.includes(caller.uid) || !owners.length
    ? { uid: caller.uid, name: caller.displayName }
    : { uid: owners[0], name: await displayNameOf(owners[0]) };

  const base: Row = sales ? { partyName, updatedAt: now } : {
    partyId, partyName, isLead: false, stage: 'found',
    brokerUid: defaultBroker.uid, brokerName: defaultBroker.name,
    nextStep: '', nextDue: null, lost: false, lostReason: '', wonAt: null,
    lastContactAt: null, createdAt: now, updatedAt: now,
  };
  const entry = (kind: ActivityEventKind, text: string, stage: LeadStage | null = null) => ({
    kind, text, stage, at: now, byUid: caller.uid, byName: caller.displayName,
  });
  const batch = adminDb.batch();
  const log = (e: ReturnType<typeof entry>) => batch.create(ref.collection('activity').doc(), e);
  const isLead = sales?.isLead ?? false;
  const stage = sales?.stage ?? 'found';

  switch (act.action) {
    case 'log': {
      if (act.kind === 'note' && !act.text) throw new SalesActivityRefused('Write the note first.', 400);
      const update: Row = { ...base };
      if (act.kind !== 'note') {
        update.lastContactAt = now;
        if (isLead) update.stage = stageAfterContact(stage);
      }
      batch.set(ref, update, { merge: true });
      log(entry(act.kind, act.text ?? ''));
      break;
    }
    case 'lead': {
      if ((await loadFacts(partyId)).booked) {
        throw new SalesActivityRefused('This client has already booked a load, so it is a client, not a lead.', 409);
      }
      if (isLead && !sales?.lost) throw new SalesActivityRefused('This client is already a lead.', 409);
      batch.set(ref, {
        ...base, isLead: true, stage, lost: false, lostReason: '',
        // Whoever starts the lead works it, unless it already names somebody.
        brokerUid: sales?.brokerUid ?? defaultBroker.uid,
        brokerName: sales?.brokerName || defaultBroker.name,
      }, { merge: true });
      log(entry('lead', ''));
      break;
    }
    case 'stage':
      if (!isLead) throw new SalesActivityRefused('Make this client a lead first.', 409);
      batch.set(ref, { ...base, stage: act.stage }, { merge: true });
      log(entry('stage', '', act.stage));
      break;
    case 'next':
      batch.set(ref, { ...base, nextStep: act.nextStep ?? '', nextDue: act.nextDue ?? null }, { merge: true });
      log(entry('next', [act.nextStep, act.nextDue].filter(Boolean).join(' · ')));
      break;
    case 'lost':
      if (!isLead) throw new SalesActivityRefused('Only a lead can be marked lost.', 409);
      batch.set(ref, { ...base, lost: true, lostReason: act.reason ?? '' }, { merge: true });
      log(entry('lost', act.reason ?? ''));
      break;
    case 'reopen':
      batch.set(ref, { ...base, lost: false, lostReason: '' }, { merge: true });
      log(entry('reopened', ''));
      break;
  }
  await batch.commit();

  // Counted on the caller's own day, never the broker's: it was the caller's
  // call. Best-effort — the call is logged whether or not the tally moves.
  if (act.action === 'log' && act.kind !== 'note' && sellsLoads(caller.profile)) {
    const today = officeToday();
    await tap(caller.uid, today, act.kind === 'call' ? 'calls' : 'emails', 1)
      // And game mode's XP for it, the same as a tap on the Today card.
      .then(async () => {
        const [day] = await salesDaysFor([caller.uid], today);
        if (day) await rewardSalesDay(caller.uid, day);
      })
      .catch(() => {});
  }
  return clientSalesView(caller, partyId);
}

// ── My leads ─────────────────────────────────────────────────────────────────

/**
 * One person's leads for the board: the caller's own, or — for their Sales
 * Manager or `sales.viewAll` — somebody else's. Lost leads and ones that
 * booked more than WON_SHOWN_DAYS ago are left off. A lead whose client the
 * caller can no longer open is left off too.
 */
export async function leadsBoard(caller: Caller, uid: string): Promise<LeadCard[]> {
  if (!maySee(caller, uid)) throw new SalesActivityRefused('You can see your own leads, and your team’s if you lead one.', 403);
  const snap = await col().where('brokerUid', '==', uid).get();
  const open = snap.docs
    .map((d) => readSales(d.id, d.data())!)
    .filter((s) => s.isLead && !s.lost);
  const cutoff = Date.now() - WON_SHOWN_DAYS * 86_400_000;
  const shown = open.filter((s) => !s.wonAt || Date.parse(s.wonAt) >= cutoff);
  if (!shown.length) return [];

  const [parties, sources] = await Promise.all([
    adminDb.getAll(...shown.map((s) => adminDb.collection('parties').doc(s.partyId))),
    adminDb.collection('leadSources').select('name').get(),
  ]);
  const sourceName = new Map(sources.docs.map((d) => [d.id, String(d.data().name ?? '')]));

  const cards: LeadCard[] = [];
  await Promise.all(shown.map(async (s, i) => {
    const p = parties[i];
    if (!p.exists) return;
    const data = p.data()!;
    if (!canSeeParty(data, caller.uid, caller.profile)) return;
    const facts = s.wonAt ? { booked: true, quoted: true } : await loadFacts(s.partyId);
    if (facts.booked && !s.wonAt) {
      s.wonAt = new Date().toISOString();
      await col().doc(s.partyId).set({ wonAt: s.wonAt }, { merge: true }).catch(() => {});
    }
    const sourceId = typeof data.sourceId === 'string' ? data.sourceId : '';
    cards.push({
      ...s,
      partyName: partyDisplayName({ companyName: data.companyName ?? '', contactName: data.contactName ?? '' }) || s.partyName,
      column: leadColumn(s.stage, facts),
      sourceLabel: (sourceId && sourceName.get(sourceId)) || str(data.sourceName, 120),
    });
  }));
  return cards.sort((a, b) => (a.nextDue ?? '9999').localeCompare(b.nextDue ?? '9999') || a.partyName.localeCompare(b.partyName));
}

/** The caller's own leads with a follow-up due by today, for the planning pop-up. */
export async function dueFollowUps(caller: Caller, today: string): Promise<ClientSales[]> {
  const snap = await col().where('brokerUid', '==', caller.uid).get();
  return snap.docs
    .map((d) => readSales(d.id, d.data())!)
    .filter((s) => s.isLead && !s.lost && !s.wonAt && !!s.nextDue && s.nextDue <= today);
}
