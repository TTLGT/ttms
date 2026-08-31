import { Timestamp } from 'firebase-admin/firestore';
import { formatOrderNumber, parseOrderNumber, reserveOrderNumbers } from './orderNumber';
import { createHash } from 'crypto';
import { adminDb } from './firebase-admin';
import { parseCsv } from './csv';
import { toNameKey } from '@/types/party';
import { STATUS_RANK } from '@/types/order';
import { carrierNameKey } from '@/types/carrier';
import { loadOwnerDirectory, resolveOwner, hasOwner } from './ownerResolution';
import { leadSourceDocId, toSourceKey } from '@/types/leadSource';
import { labelOwners, ownerTargets, writeOwnerEvents } from './ownership';
import { IMPORT_ORIGIN_EVENT_ID } from '@/types/ownerEvent';
import type { OwnerDirectory, ResolvedOwner } from './ownerResolution';
import type { OwnerSet, PendingOwnerEvent } from './ownership';
import type { OrderStatus } from '@/types/order';
import type { PartyRole } from '@/types/party';

export type ImportCollection = 'carriers' | 'customers' | 'orders' | 'parties';

export interface ImportResult {
  collection: ImportCollection;
  written: number;
  skipped: number;
  total: number;
  /** Human-readable extra detail, shown under the row in the import panel. */
  notes?: string;
  /** How the BATS owner names in this file resolved — see OwnerReport. */
  owners?: OwnerReport;
}

/**
 * What the import made of the owner names it saw.
 *
 * Surfaced in the import panel because an admin has to be able to check who
 * was assigned before trusting the run. A silent import that quietly assigned
 * the wrong rep to a book of business would be very hard to notice afterwards.
 */
export interface OwnerReport {
  /** Records that came out of the import with a real owner on them. */
  assigned: number;
  /** Names matching more than one person; skipped rather than guessed. */
  ambiguous: number;
  /** Names matching nobody; left as text for an admin to assign. */
  unresolved: number;
  /** The unmatched names themselves, commonest first, capped for display. */
  unresolvedNames: string[];
}

/** Accumulates an OwnerReport across the rows of a file. */
class OwnerTally {
  assigned = 0;
  ambiguous = 0;
  private readonly misses = new Map<string, number>();

  record(name: string, resolved: ResolvedOwner): void {
    if (hasOwner(resolved)) { this.assigned++; return; }
    if (!name.trim()) return;               // no owner named at all is not a miss
    if (resolved.ambiguous) { this.ambiguous++; return; }
    this.misses.set(name, (this.misses.get(name) ?? 0) + 1);
  }

  report(): OwnerReport {
    const names = [...this.misses.entries()].sort((a, b) => b[1] - a[1]);
    return {
      assigned:   this.assigned,
      ambiguous:  this.ambiguous,
      unresolved: names.reduce((sum, [, n]) => sum + n, 0),
      unresolvedNames: names.slice(0, 25).map(([name, n]) => `${name} (${n})`),
    };
  }
}

/** The importer has no signed-in actor behind it, so it names itself. */
const IMPORT_ACTOR = { uid: 'bats-import', name: 'BATS import', ip: null };

function toOwnerSet(r: ResolvedOwner): OwnerSet {
  return { uids: r.uids, groupIds: r.groupIds, emails: r.emails };
}

/**
 * The opening history entry for a record the import is creating.
 *
 * Written for every record, matched or not. An unmatched BATS name is a real
 * historical owner — it is who BATS says held the record — so it goes in as a
 * `text` target that grants nothing, rather than being dropped on the floor.
 * Without this the timeline would start at the first manual edit and lose the
 * only evidence of who originally had the account.
 */
async function openingOwnerEvents(name: string, resolved: ResolvedOwner): Promise<PendingOwnerEvent[]> {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return [];

  if (!hasOwner(resolved)) {
    return [{ action: 'added', targetType: 'text', targetId: '', targetLabel: trimmed }];
  }
  const owners = toOwnerSet(resolved);
  const labels = await labelOwners(owners);
  return ownerTargets(owners, labels).map((t) => ({ action: 'added' as const, ...t }));
}

function loadCSV(text: string): string[][] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  return rows.slice(1).filter((r) => r.some((f) => f.trim()));
}

function ts(dateStr: string | undefined): Timestamp | null {
  if (!dateStr || !dateStr.trim()) return null;
  const d = new Date(dateStr.trim());
  return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

function str(val: string | undefined): string {
  return (val || '').trim();
}

interface OrderLocation {
  /** The facility/party name, when BATS supplied one. */
  facility: string;
  phone: string;
  address: { street: string; city: string; state: string; zip: string; country: string };
}

/**
 * Parse "City, ST Zip" or "Facility | Phone | City, ST Zip".
 *
 * BATS packs the pickup/delivery facility and its phone into the same field as
 * the address. The facility on Origin is the shipper and the one on Destination
 * is the consignee, so both are kept rather than discarded.
 */
function parseOrderLocation(raw: string): OrderLocation {
  const blank = { street: '', city: '', state: '', zip: '', country: '' };
  if (!raw || !raw.trim()) return { facility: '', phone: '', address: blank };

  const segments = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const addrPart = segments[segments.length - 1] ?? '';
  const lead     = segments.slice(0, -1);

  // A lead segment that is mostly digits is the phone, not a facility name.
  const phone    = lead.find((s) => isPhoneLike(s)) ?? '';
  const facility = lead.find((s) => !isPhoneLike(s)) ?? '';

  const m = addrPart.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  const address = m
    ? { street: '', city: m[1].trim(), state: m[2].trim(), zip: (m[3] || '').trim(), country: 'US' }
    : { ...blank, city: addrPart };

  return { facility, phone, address };
}

// ── Lead sources ────────────────────────────────────────────────────────────
// KEEP IN SYNC with the copies in scripts/import-bats.js. `toSourceKey` and
// `leadSourceDocId` come from src/types/leadSource.ts, which the script cannot
// import.

interface SourceDirectory {
  byKey: Map<string, string>;
  pending: Map<string, { id: string; name: string; nameKey: string }>;
}

/**
 * Loads the managed lead-source list, keyed for matching.
 *
 * Matching is on `nameKey`, not on the derived document id, so that a source an
 * admin has renamed is still found rather than being re-created under its new
 * name's id.
 */
async function loadLeadSources(): Promise<SourceDirectory> {
  const snap = await adminDb.collection('leadSources').select('nameKey').get();
  const byKey = new Map<string, string>();
  snap.forEach((d) => byKey.set((d.get('nameKey') as string) || '', d.id));
  return { byKey, pending: new Map() };
}

/**
 * Matches a BATS source name to the managed list, queueing it for creation the
 * first time it is seen.
 *
 * This is what makes an imported record arrive with its source already
 * selected: the free text BATS carried is resolved to a real list entry here,
 * and the record stores that id. The raw text is returned alongside and kept on
 * the record as a fallback label.
 *
 * A source an admin has since retired stays retired — it is still in the
 * collection, so it matches here and is never re-created as active.
 */
function resolveSource(dir: SourceDirectory, rawName: string): { id: string | null; name: string } {
  const name = str(rawName);
  const key  = toSourceKey(name);
  if (!key) return { id: null, name: '' };

  const found = dir.byKey.get(key);
  if (found) return { id: found, name };

  // Not on the list yet. The id is derived from the key, so it can be handed to
  // the record now and the document written in the same run.
  const id = leadSourceDocId(key);
  if (!dir.pending.has(key)) dir.pending.set(key, { id, name, nameKey: key });
  return { id, name };
}

/** Writes the sources the CSVs named that the list did not already have. */
async function flushLeadSources(dir: SourceDirectory, now: Timestamp): Promise<number> {
  if (dir.pending.size === 0) return 0;

  const rows = [...dir.pending.values()];
  const batch = adminDb.batch();
  for (const r of rows) {
    // merge:true so a name seen in both the customers and orders files, or in a
    // later run, never resets a source an admin has since renamed or retired.
    batch.set(adminDb.collection('leadSources').doc(r.id), {
      name:      r.name,
      nameKey:   r.nameKey,
      isActive:  true,
      createdAt: now,
      createdBy: 'bats-import',
      updatedAt: now,
    }, { merge: true });
    dir.byKey.set(r.nameKey, r.id);
  }
  await batch.commit();
  dir.pending.clear();
  return rows.length;
}

function isPhoneLike(s: string): boolean {
  const digits = s.replace(/\D/g, '');
  return digits.length >= 7 && digits.length / s.length > 0.5;
}

function mapOrderStatus(batsStatus: string): string {
  const MAP: Record<string, string> = {
    FindMeACarrier:            'quote',
    SearchingForCarriers:      'quote',
    Unposted:                  'quote',
    AwaitingCustomerSignature: 'booked',
    AwaitingCarrierSignature:  'carrier_assigned',
    AwaitingDispatch:          'carrier_assigned',
    Dispatched:                'carrier_assigned',
    PickedUp:                  'in_transit',
    Delivered:                 'delivered',
    Cancelled:                 'cancelled',
  };
  return MAP[batsStatus] || 'quote';
}

// ── Change detection ─────────────────────────────────────────────────────────
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Timestamp) return `T:${value.toMillis()}`;
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${k}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashRecord(rec: Record<string, unknown>): string {
  const { createdAt, updatedAt, ...stable } = rec;
  void createdAt; void updatedAt;
  return createHash('sha1').update(stableStringify(stable)).digest('hex');
}

/**
 * Fields that belong to the TMS, not to BATS.
 *
 * A CSV row carries no knowledge of them, so the import must leave them alone
 * on any document that already exists. Without this, re-importing to pick up a
 * changed phone number would also blank the assigned carrier, the uploaded BOL
 * and the e-signature audit trail on every order it rewrote.
 */
const PRESERVE: Record<ImportCollection, string[]> = {
  orders: [
    'carrierId', 'carrierName', 'driverName', 'driverPhone',
    'driverLicenseStoragePath', 'bolStoragePath', 'invoiceStoragePath', 'podStoragePath',
    'notes',
    'carrierSignedAt', 'carrierSignerName', 'carrierSignerIp',
    'shipperSignedAt', 'shipperSignerName', 'shipperSignerIp',
    'clientSignedAt',  'clientSignerName',  'clientSignerIp',
    'partyApprovals',
    // Ownership is assigned on creation and maintained in the TMS afterwards.
    // A refreshed export still carries the original BATS rep name, so without
    // this a re-import would hand every reassigned load back to whoever used
    // to own it. Note clientOwnerUids/clientOwnerGroupIds are deliberately
    // absent: they are a mirror of the client party and must be free to move
    // when the client changes hands.
    'assignedToUids', 'assignedToGroupIds', 'assignedToEmails',
    // orderNumber is deliberately NOT here. PRESERVE forces the stored value
    // unconditionally, which would pin a historical order to the BATS id it
    // arrived with and make retroactive numbering impossible. It needs the
    // conditional treatment in RECONCILE instead.
  ],
  carriers: [
    'insuranceExpiration', 'insuranceProvider', 'insurancePolicyNumber',
    'dot', 'notes',
  ],
  customers: ['notes', 'assignedToUids'],
  // Parties are protected inside flushParties, which needs the values before
  // the records are built.
  parties: [],
};

/**
 * Merges an imported status with the one already stored.
 *
 * BATS and the TMS both move an order forward, but they are not always in
 * step: dispatch may have advanced a load here while BATS still shows it
 * awaiting signature. Taking the further-along of the two lets a refresh push
 * an order forward without ever undoing work done in the TMS.
 *
 * Cancellation is treated as sticky in both directions — if either system says
 * a load died, a re-import will not quietly revive it.
 */
function reconcileStatus(prior: unknown, incoming: unknown): unknown {
  const a = prior as OrderStatus | undefined;
  const b = incoming as OrderStatus;
  if (!a) return b;
  if (a === 'cancelled' || b === 'cancelled') return 'cancelled';

  const rankA = STATUS_RANK[a as Exclude<OrderStatus, 'cancelled'>];
  const rankB = STATUS_RANK[b as Exclude<OrderStatus, 'cancelled'>];
  if (rankA === undefined) return b;
  if (rankB === undefined) return a;
  return rankB > rankA ? b : a;
}

/**
 * Keeps a stored value, but lets the CSV fill an empty one.
 *
 * Neither field this covers can be a plain PRESERVE entry. PRESERVE lets any
 * stored value — null included — beat the CSV, and every order imported before
 * these columns were read holds null in both. A refresh would keep re-applying
 * that null and no historical order would ever get its master link or its lead
 * source. A value set in the TMS still wins, because BATS knows nothing about a
 * split done here or a source an owner picked here.
 */
function preferExisting(prior: unknown, incoming: unknown): unknown {
  return prior || incoming || null;
}

/**
 * An order number, once issued, is permanent.
 *
 * A stored number that came from the sequence wins over anything an import
 * computes — it is printed on rate confirmations, BOLs and invoices that have
 * left the building, and a load the carrier calls TTL26000042 must not become
 * something else here. A stored number that is *not* from the sequence is a
 * BATS id or a pre-sequence random number, and gives way to the real one that
 * assignOrderNumbers() worked out; that is what makes historical orders
 * numberable at all.
 */
function keepIssuedNumber(prior: unknown, incoming: unknown): unknown {
  if (typeof prior === 'string' && parseOrderNumber(prior)) return prior;
  return incoming || prior || null;
}

/** Fields needing a comparison rather than a straight "existing value wins". */
const RECONCILE: Partial<Record<ImportCollection, Record<string, (p: unknown, i: unknown) => unknown>>> = {
  orders: {
    status:        reconcileStatus,
    parentOrderId: preferExisting,
    sourceId:      preferExisting,
    orderNumber:   keepIssuedNumber,
    // Whatever the order was called first is what is worth keeping, so an
    // existing value always wins over one this run worked out.
    previousOrderNumber: preferExisting,
  },
};

async function loadExistingMeta(collectionName: ImportCollection) {
  const fields = [
    '_importHash',
    'createdAt',
    ...PRESERVE[collectionName],
    ...Object.keys(RECONCILE[collectionName] ?? {}),
  ];
  const snap = await adminDb.collection(collectionName).select(...fields).get();
  const map = new Map<string, Record<string, unknown>>();
  snap.forEach((doc) => map.set(doc.id, doc.data()));
  return map;
}

async function batchWrite(
  records: Record<string, unknown>[],
  collectionName: ImportCollection,
  getId: (rec: Record<string, unknown>) => string,
): Promise<ImportResult> {
  const existing = await loadExistingMeta(collectionName);

  const toWrite: { id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;
  for (const rec of records) {
    const id    = getId(rec);
    const hash  = hashRecord(rec);
    const prior = id ? existing.get(id) : null;

    if (prior && prior._importHash === hash) {
      skipped++;
      continue;
    }

    const { _docId, ...stored } = rec;
    void _docId;

    // Work the TMS owns survives the refresh; BATS only supplies the rest.
    if (prior) {
      for (const field of PRESERVE[collectionName]) {
        if (prior[field] !== undefined) stored[field] = prior[field];
      }
      for (const [field, merge] of Object.entries(RECONCILE[collectionName] ?? {})) {
        stored[field] = merge(prior[field], stored[field]);
      }
    }

    toWrite.push({
      id,
      data: {
        ...stored,
        createdAt:   (prior?.createdAt as Timestamp | undefined) || rec.createdAt,
        _importHash: hash,
      },
    });
  }

  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const batch = adminDb.batch();
    for (const { id, data } of toWrite.slice(i, i + CHUNK)) {
      const ref = id ? adminDb.collection(collectionName).doc(id) : adminDb.collection(collectionName).doc();
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
    written += Math.min(CHUNK, toWrite.length - i);
  }

  return { collection: collectionName, written, skipped, total: records.length };
}

// ── Party registry ───────────────────────────────────────────────────────────
// Clients, shippers and consignees are all parties. The same company can show
// up as a customer row and as a pickup facility on an order, so every name is
// funnelled through one registry keyed on its normalized form. That collapses
// "Acme Corp." and "ACME Corporation" onto a single record.

interface PartyDraft {
  id: string;
  companyName: string;
  nameKey: string;
  batsId: string | null;
  phone: string;
  email: string;
  address: Record<string, string> | null;
  roles: Set<PartyRole>;
  defaultOrigin: Record<string, string> | null;
  defaultDest: Record<string, string> | null;
  /** Owning rep as BATS names them; only applied when the party is new. */
  assignedToName: string;
  /**
   * That name resolved to accounts and work groups, or null when the row
   * named nobody. Only applied when the party is new — see flushParties.
   */
  owners: ResolvedOwner | null;
  /** Managed lead source, matched from the CSV's free text by resolveSource. */
  sourceId: string | null;
  /** That free text, kept as the fallback label when nothing matched. */
  sourceName: string;
}

type PartyRegistry = Map<string, PartyDraft>;

/** Deterministic id so repeat imports converge on the same document. */
function partyDocId(key: string): string {
  return `p-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
}

function registerParty(
  reg: PartyRegistry,
  name: string,
  role: PartyRole,
  extra: Partial<Omit<PartyDraft, 'id' | 'nameKey' | 'roles' | 'sourceId' | 'sourceName'>>
    & { source?: { id: string | null; name: string } } = {},
): string {
  const key = toNameKey(name);
  if (!key) return '';

  let draft = reg.get(key);
  if (!draft) {
    draft = {
      id: partyDocId(key),
      companyName: name.trim(),
      nameKey: key,
      batsId: null,
      phone: '',
      email: '',
      address: null,
      roles: new Set<PartyRole>(),
      defaultOrigin: null,
      defaultDest: null,
      assignedToName: '',
      owners: null,
      sourceId: null,
      sourceName: '',
    };
    reg.set(key, draft);
  }
  draft.roles.add(role);
  // First non-empty value wins, so a later sparse row cannot blank out details.
  draft.batsId        ||= extra.batsId        ?? null;
  draft.phone         ||= extra.phone         ?? '';
  draft.email         ||= extra.email         ?? '';
  draft.address       ||= extra.address       ?? null;
  draft.defaultOrigin ||= extra.defaultOrigin ?? null;
  draft.defaultDest   ||= extra.defaultDest   ?? null;
  draft.assignedToName ||= extra.assignedToName ?? '';
  draft.owners        ||= extra.owners        ?? null;
  draft.sourceId      ||= extra.source?.id    ?? null;
  draft.sourceName    ||= extra.source?.name  ?? '';
  return draft.id;
}

/**
 * Writes the registry to `parties`, unioning roles with whatever is already
 * stored so a role applied by hand in the app is never dropped by an import.
 */
/**
 * Final ownership of each party the run touched, keyed by party id.
 *
 * Orders need this to stamp their `clientOwner*` mirror, and it has to be the
 * state *after* the flush: the client may have been created moments ago by
 * this same run, or may have been owned by someone in the TMS for months.
 */
export type PartyOwnership = Map<string, { uids: string[]; groupIds: string[] }>;

async function flushParties(
  reg: PartyRegistry,
  now: Timestamp,
): Promise<{ result: ImportResult; ownership: PartyOwnership }> {
  if (reg.size === 0) {
    return {
      result: { collection: 'parties', written: 0, skipped: 0, total: 0 },
      ownership: new Map(),
    };
  }

  // Fields the import must never overwrite. Ownership, contacts and notes are
  // maintained inside the TMS; a CSV re-upload knows nothing about them, so
  // blanking them here would silently destroy work every time someone
  // refreshed the data.
  interface Preserved {
    roles: PartyRole[];
    assignedToUids: string[];
    assignedToGroupIds: string[];
    assignedToEmails: string[];
    assignedToName: string;
    contactName: string;
    contacts: unknown[];
    notes: string;
    sourceId: string | null;
  }

  const existing = new Map<string, Preserved>();
  const snap = await adminDb.collection('parties')
    .select('roles', 'assignedToUids', 'assignedToGroupIds', 'assignedToEmails',
            'assignedToName', 'contactName', 'contacts', 'notes', 'sourceId')
    .get();
  snap.forEach((doc) => {
    const v = doc.data();
    existing.set(doc.id, {
      roles:          (v.roles ?? []) as PartyRole[],
      assignedToUids: (v.assignedToUids ?? []) as string[],
      assignedToGroupIds: (v.assignedToGroupIds ?? []) as string[],
      assignedToEmails:   (v.assignedToEmails ?? []) as string[],
      assignedToName: (v.assignedToName ?? '') as string,
      contactName:    (v.contactName ?? '') as string,
      contacts:       (v.contacts ?? []) as unknown[],
      notes:          (v.notes ?? '') as string,
      sourceId:       (v.sourceId ?? null) as string | null,
    });
  });

  const ownership: PartyOwnership = new Map();
  /** New parties only — an existing one keeps the history it already has. */
  const opened: { id: string; name: string; owners: ResolvedOwner | null }[] = [];

  const records = [...reg.values()].map((d) => {
    const prior  = existing.get(d.id);
    const merged = new Set<PartyRole>([...(prior?.roles ?? []), ...d.roles]);

    // A name the importer resolved becomes real ownership; one it could not
    // stays as text. The two are exclusive — keeping both would leave two
    // answers to "who owns this" with nothing saying which wins.
    const resolved = d.owners && hasOwner(d.owners) ? d.owners : null;
    const uids     = prior ? prior.assignedToUids     : (resolved?.uids ?? []);
    const groupIds = prior ? prior.assignedToGroupIds : (resolved?.groupIds ?? []);
    const emails   = prior ? prior.assignedToEmails   : (resolved?.emails ?? []);

    ownership.set(d.id, { uids, groupIds });
    if (!prior) opened.push({ id: d.id, name: d.assignedToName, owners: d.owners });

    return {
      _docId:         d.id,
      batsId:         d.batsId,
      companyName:    d.companyName,
      nameKey:        d.nameKey,
      phone:          d.phone,
      email:          d.email,
      address:        d.address ?? { street: '', city: '', state: '', zip: '', country: '' },
      roles:          [...merged].sort(),
      defaultOrigin:  d.defaultOrigin,
      defaultDest:    d.defaultDest,
      // Existing values win; the CSV only supplies these for a brand-new party.
      contactName:    prior?.contactName ?? '',
      contacts:       prior?.contacts    ?? [],
      notes:          prior?.notes       ?? '',
      assignedToUids: uids,
      assignedToName: prior ? prior.assignedToName : (resolved ? '' : d.assignedToName),
      // Must always be written: listVisibleParties finds unowned records with
      // `where('assignedToGroupIds', '==', [])`, which never matches a document
      // where the field is absent. The same is true of assignedToEmails, which
      // joined that query when ownership-by-email was added.
      assignedToGroupIds: groupIds,
      assignedToEmails:   emails,
      // A source an owner picked in the TMS wins; the CSV only fills a blank.
      // The raw name is BATS's to supply, so it is refreshed either way and
      // acts as the fallback label when nothing matched the managed list.
      sourceId:   prior?.sourceId || d.sourceId || null,
      sourceName: d.sourceName,
      createdAt:      now,
      updatedAt:      now,
    };
  });

  const result = await batchWrite(records, 'parties', (r) => r._docId as string);
  await writeOpeningHistory('parties', opened, now);
  return { result, ownership };
}

/**
 * Writes each new record's opening ownership entry.
 *
 * Only for records this run created. Re-running the import against a refreshed
 * export must not append a second "imported as X" to a record that has since
 * changed hands — the fixed event id makes the write idempotent, and skipping
 * existing records means a later manual assignment is never overwritten by an
 * older BATS name.
 */
async function writeOpeningHistory(
  collectionName: 'parties' | 'orders',
  opened: { id: string; name: string; owners: ResolvedOwner | null }[],
  now: Timestamp,
): Promise<void> {
  const withNames = opened.filter((o) => (o.name ?? '').trim());
  if (withNames.length === 0) return;

  const CHUNK = 200;
  for (let i = 0; i < withNames.length; i += CHUNK) {
    const batch = adminDb.batch();
    for (const rec of withNames.slice(i, i + CHUNK)) {
      const events = await openingOwnerEvents(rec.name, rec.owners ?? NO_OWNER);
      if (events.length === 0) continue;
      writeOwnerEvents(
        batch,
        adminDb.collection(collectionName).doc(rec.id),
        events,
        IMPORT_ACTOR,
        now,
        IMPORT_ORIGIN_EVENT_ID,
      );
    }
    await batch.commit();
  }
}

/** Stand-in for a row whose owner column was never resolved. */
const NO_OWNER: ResolvedOwner = {
  uids: [], groupIds: [], emails: [], unresolved: true, ambiguous: false,
};

// ── Carriers ────────────────────────────────────────────────────────────────
// Cols: Id,Name,McNumber,Status,Phone,Address,Fax,MainContact,ContactPhone,
//       ContactEmail,Dispatcher,DispatcherPhone,DispatcherEmail,
//       BillingContact,BillingPhone,BillingEmail
export async function importCarriersCSV(text: string): Promise<ImportResult> {
  const rows = loadCSV(text);
  const now  = Timestamp.now();

  const records = rows.map((r) => ({
    batsId:                str(r[0]),
    companyName:            str(r[1]),
    // Written on every import for the same reason createCarrier writes it: the
    // carriers list searches on nameKey, so a carrier that arrives without one
    // exists but cannot be found by name. It also has to be rewritten whenever
    // the name is, or a renamed carrier stays searchable only under the name it
    // used to have. See carrierNameKey in src/types/carrier.ts.
    nameKey:                carrierNameKey(str(r[1])),
    mc:                     str(r[2]),
    isActive:               str(r[3]).toLowerCase() === 'active',
    phone:                  str(r[4]),
    address:                str(r[5]),
    fax:                    str(r[6]),
    contactName:            str(r[7]),
    dot:                    '',
    email:                  str(r[9]),
    dispatcher:             str(r[10]),
    dispatcherPhone:        str(r[11]),
    dispatcherEmail:        str(r[12]),
    billingContact:         str(r[13]),
    billingPhone:           str(r[14]),
    billingEmail:           str(r[15]),
    insuranceExpiration:    null,
    insuranceProvider:      '',
    insurancePolicyNumber:  '',
    notes:                  '',
    createdAt:              now,
    updatedAt:              now,
  })).filter((c) => c.batsId && c.companyName);

  return batchWrite(records, 'carriers', (c) => `bats-${c.batsId}`);
}

// ── Customers ───────────────────────────────────────────────────────────────
// Cols: 0=Id,1=Name,2=Status,3=IsEnabled,4=Type,5=Phone,6=Phone2,7=Fax,8=Company,
//   9=Address,10=Address2,11=City,12=State,13=Zip,14=Country,15=Email,16=Created,
//   17=CreditCardNumber(skip),18=CreditCardExpiration(skip),19=AssignedTo,
//   20=LeadSourceId,21=LeadSourceName,22=MustSpecifyReferralSource
export async function importCustomersCSV(text: string): Promise<ImportResult> {
  const rows = loadCSV(text);
  const now  = Timestamp.now();

  const records = rows.map((r) => ({
    batsId:          str(r[0]),
    name:            str(r[1]),
    status:          str(r[2]),
    isEnabled:       str(r[3]).toLowerCase() === 'true',
    type:            str(r[4]),
    phone:           str(r[5]),
    phone2:          str(r[6]),
    fax:             str(r[7]),
    company:         str(r[8]),
    address:         str(r[9]),
    address2:        str(r[10]),
    city:            str(r[11]),
    state:           str(r[12]),
    zip:             str(r[13]),
    country:         str(r[14]),
    email:           str(r[15]),
    batsCreatedAt:   ts(r[16]),
    // r[17] = CreditCardNumber — intentionally skipped
    // r[18] = CreditCardExpiration — intentionally skipped
    assignedTo:      str(r[19]),
    leadSourceId:    str(r[20]),
    leadSourceName:  str(r[21]),
    notes:           '',
    createdAt:       now,
    updatedAt:       now,
  })).filter((c) => c.batsId && c.name);

  // Customers are clients in TMS terms; seed them into the shared party list so
  // orders can link to the same record a shipper or consignee would use.
  const dir     = await loadOwnerDirectory();
  const sources = await loadLeadSources();
  const tally   = new OwnerTally();
  const reg: PartyRegistry = new Map();
  for (const c of records) {
    const owners = resolveOwner(dir, c.assignedTo);
    tally.record(c.assignedTo, owners);
    registerParty(reg, c.company || c.name, 'client', {
      batsId:  c.batsId,
      phone:   c.phone,
      email:   c.email,
      // BATS's LeadSourceName, matched to the managed list so the client lands
      // with its source already selected rather than as unattributed text.
      source:  resolveSource(sources, c.leadSourceName),
      address: { street: c.address, city: c.city, state: c.state, zip: c.zip, country: c.country },
      // BATS names the owning rep. Resolved here into real owners so the party
      // lands assigned rather than merely private; a name matching nobody
      // falls back to the text, which keeps it out of everyone's hands until
      // an admin assigns someone. Both are ignored if the party already exists.
      assignedToName: c.assignedTo,
      owners,
    });
  }
  // Sources must exist before the parties that point at them.
  await flushLeadSources(sources, now);
  await flushParties(reg, now);

  const result = await batchWrite(records, 'customers', (c) => `bats-${c.batsId}`);
  return { ...result, owners: tally.report() };
}

/**
 * Gives every order in the run its TTMS order number.
 *
 * An order already carrying a sequence number keeps it, always. A number goes
 * onto paperwork the moment the rate confirmation is sent, so reissuing one
 * would mean the load in the TMS and the load in the carrier's file no longer
 * agree. That check is what makes the import safe to re-run.
 *
 * Everything else — a genuinely new row, or a historical order still carrying
 * its BATS id — is numbered in creation order within its own year, so the
 * numbers reflect the sequence the loads were actually booked in rather than
 * the order the CSV happens to list them. `createdAt` is the BATS order date
 * (column 7), which is why this can be done at all.
 *
 * BATS ids break the ties. Many exported rows carry a date with no time, so a
 * busy day arrives as a block of identical timestamps; the BATS id is itself
 * sequential, so it puts that block back into the order the loads were taken.
 */
async function assignOrderNumbers(
  records: Record<string, unknown>[],
  existingNumbers: Map<string, string>,
): Promise<void> {
  const needing: Record<string, unknown>[] = [];

  for (const rec of records) {
    const stored = existingNumbers.get(`bats-${rec.batsId}`);
    if (stored && parseOrderNumber(stored)) {
      rec.orderNumber = stored;
    } else {
      // The BATS id is kept so it stays findable by the number staff used for
      // the last decade. Set only on the first numbering, never overwritten.
      if (stored) rec.previousOrderNumber = stored;
      needing.push(rec);
    }
  }
  if (needing.length === 0) return;

  const byYear = new Map<number, Record<string, unknown>[]>();
  for (const rec of needing) {
    const created = rec.createdAt as Timestamp;
    const year = created.toDate().getFullYear();
    const group = byYear.get(year) ?? [];
    group.push(rec);
    byYear.set(year, group);
  }

  for (const [year, group] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    group.sort(byCreationOrder);
    // One reservation for the whole year rather than one per order: the
    // counter is a single document, and thousands of sequential transactions
    // against it would outrun what Firestore sustains on one.
    const from = await reserveOrderNumbers(year, group.length);
    group.forEach((rec, i) => { rec.orderNumber = formatOrderNumber(year, from + i); });
  }
}

/** Oldest first, with the BATS id settling same-day ties. */
function byCreationOrder(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const at = (a.createdAt as Timestamp).toMillis();
  const bt = (b.createdAt as Timestamp).toMillis();
  if (at !== bt) return at - bt;
  return Number(a.batsId) - Number(b.batsId);
}

// ── Orders ──────────────────────────────────────────────────────────────────
// Cols: Id,IsDuplicate,DuplicateId,OrderType,MasterOrderId,Status,SecondaryStatus,
//   Created,CustomerName,CustomerPhone,CustomerEmail,Vehicles,Origin,Destination,
//   FirstAvailablePickup,TransportType,TotalTariff,TotalCarrierFee,TotalBrokerFee,
//   AssignedTo,SourceName,Dispatched,PickedUp,Delivered,AssignedPickup,AssignedDelivery
export async function importOrdersCSVs(texts: string[]): Promise<ImportResult> {
  const seen = new Map<string, Record<string, unknown>>();
  const reg: PartyRegistry = new Map();
  const now  = Timestamp.now();
  const dir     = await loadOwnerDirectory();
  const sources = await loadLeadSources();
  const tally   = new OwnerTally();

  for (const text of texts) {
    const rows = loadCSV(text);
    for (const r of rows) {
      const batsId = str(r[0]);
      if (!batsId || isNaN(Number(batsId))) continue; // skip garbled rows
      if (seen.has(batsId)) continue;                  // deduplicate

      // Guarded the same way as the row's own Id: BATS writes an empty cell on
      // a standalone order, and garbled rows turn up in these exports.
      const masterRaw  = str(r[4]);
      const masterId   = masterRaw && !isNaN(Number(masterRaw)) ? masterRaw : '';

      const agreedRate = parseFloat(r[16]) || 0;
      const carrierPay = parseFloat(r[17]) || 0;
      const brokerFee  = parseFloat(r[18]) || 0;

      // Col 8 is CustomerName — the client, not the shipper. The shipper and
      // consignee are the facility names packed into Origin and Destination.
      const clientName = str(r[8]);
      const origin     = parseOrderLocation(str(r[12]));
      const dest       = parseOrderLocation(str(r[13]));

      // Column 19 is the rep who owns this load. It owns the client too: the
      // order file is often where a customer first appears, and until this was
      // passed through, any client seen only here landed with no owner at all
      // — which reads as unowned, meaning visible to every signed-in user.
      const ownerName = str(r[19]);
      const owners    = resolveOwner(dir, ownerName);
      tally.record(ownerName, owners);

      // Col 20 is SourceName — where the load came from. Matched to the managed
      // list here so an imported order opens with its source already selected.
      const source = resolveSource(sources, r[20]);

      const clientId = registerParty(reg, clientName, 'client', {
        phone: str(r[9]),
        email: str(r[10]),
        assignedToName: ownerName,
        owners,
      });
      const shipperId = registerParty(reg, origin.facility, 'shipper', {
        phone:         origin.phone,
        address:       origin.address,
        defaultOrigin: origin.address,
      });
      const consigneeId = registerParty(reg, dest.facility, 'consignee', {
        phone:       dest.phone,
        address:     dest.address,
        defaultDest: dest.address,
      });

      seen.set(batsId, {
        batsId,
        // orderNumber is not set from the CSV. BATS's id is kept in `batsId`,
        // and the order gets a TTMS sequence number from assignOrderNumbers()
        // below, once the whole run can be put in date order.
        status:                    mapOrderStatus(str(r[5])),
        clientId,
        clientName,
        shipperId,
        shipperName:               origin.facility,
        consigneeId,
        consigneeName:             dest.facility,
        // Col 4 is MasterOrderId — set on a suborder, empty on a standalone
        // load. Imported orders are keyed `bats-<BATS Id>`, so the parent's
        // document id can be built from it directly with no lookup. A master
        // that never made it into the export leaves a dangling id; the
        // suborders tab simply finds nothing, which is the same as today.
        parentOrderId:             masterId ? `bats-${masterId}` : null,
        commodity:                 str(r[11]),
        vehicles:                  str(r[11]),
        pieces:                    0,
        weight:                    0,
        transportType:             str(r[15]),
        origin:                    origin.address,
        destination:               dest.address,
        // Kept verbatim so the facility segment stays recoverable if the
        // parsing rules ever need to change.
        _rawOrigin:                str(r[12]),
        _rawDestination:           str(r[13]),
        firstAvailablePickup:      ts(str(r[14])), // FirstAvailablePickup
        pickupDate:                ts(str(r[24])), // AssignedPickup
        deliveryDate:              ts(str(r[25])), // AssignedDelivery
        dispatchedAt:              ts(str(r[21])),
        pickedUpAt:                ts(str(r[22])),
        deliveredAt:               ts(str(r[23])),
        carrierId:                 null,
        carrierName:               '',
        driverName:                '',
        driverPhone:               '',
        driverLicenseStoragePath:  null,
        bolStoragePath:            null,
        invoiceStoragePath:        null,
        podStoragePath:            null,
        agreedRate,
        carrierPay,
        brokerFee,
        assignedTo:                ownerName,
        // Resolved owners for the order itself, independent of the client's.
        // An order can be worked by someone who does not own the customer.
        assignedToUids:            owners.uids,
        assignedToGroupIds:        owners.groupIds,
        assignedToEmails:          owners.emails,
        // Filled in below, once flushParties reports where the client landed.
        clientOwnerUids:           [] as string[],
        clientOwnerGroupIds:       [] as string[],
        sourceId:                  source.id,
        sourceName:                source.name,
        notes:                     '',
        carrierSignedAt:           null,
        carrierSignerName:         null,
        carrierSignerIp:           null,
        shipperSignedAt:           null,
        shipperSignerName:         null,
        shipperSignerIp:           null,
        clientSignedAt:            null,
        clientSignerName:          null,
        clientSignerIp:            null,
        createdBy:                 'bats-import',
        createdAt:                 ts(str(r[7])) || now,
        updatedAt:                 now,
      });
    }
  }

  // Parties must land before the orders that reference them.
  // Sources first, then parties, then the orders that reference both.
  await flushLeadSources(sources, now);
  const { result: partyResult, ownership } = await flushParties(reg, now);

  const records = [...seen.values()];
  const missingShipper   = records.filter((o) => !o.shipperId).length;
  const missingConsignee = records.filter((o) => !o.consigneeId).length;

  // Mirror each client's final ownership onto its orders. Done after the flush
  // because the client may have been created by this very run, or may have
  // been owned by someone in the TMS for months — either way it is the stored
  // state, not the CSV, that decides. See syncClientOwners() for why rules
  // need this denormalized at all.
  for (const o of records) {
    const owners = ownership.get(o.clientId as string);
    o.clientOwnerUids     = owners?.uids     ?? [];
    o.clientOwnerGroupIds = owners?.groupIds ?? [];
  }

  // Which orders are new has to be settled before batchWrite runs, so the
  // opening history goes only to records that did not already exist. The
  // stored order number is read in the same pass — see assignOrderNumbers().
  const existingNumbers = new Map<string, string>();
  const existingIds     = new Set<string>();
  (await adminDb.collection('orders').select('orderNumber').get()).docs.forEach((d) => {
    existingIds.add(d.id);
    const n = d.get('orderNumber');
    if (typeof n === 'string' && n) existingNumbers.set(d.id, n);
  });

  await assignOrderNumbers(records, existingNumbers);

  const opened = records
    .filter((o) => !existingIds.has(`bats-${o.batsId}`))
    .map((o) => ({
      id:     `bats-${o.batsId}`,
      name:   o.assignedTo as string,
      owners: {
        uids:     o.assignedToUids as string[],
        groupIds: o.assignedToGroupIds as string[],
        emails:   o.assignedToEmails as string[],
        unresolved: false,
        ambiguous:  false,
      } as ResolvedOwner,
    }));

  const result = await batchWrite(records, 'orders', (o) => `bats-${o.batsId}`);
  await writeOpeningHistory('orders', opened, now);

  return {
    ...result,
    owners: tally.report(),
    notes:
      `${partyResult.total} parties linked. ` +
      `${records.length - missingShipper}/${records.length} orders got a shipper from Origin, ` +
      `${records.length - missingConsignee}/${records.length} got a consignee from Destination.`,
  };
}
