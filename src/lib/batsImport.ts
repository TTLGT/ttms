import { Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { adminDb } from './firebase-admin';
import { parseCsv } from './csv';
import { toNameKey } from '@/types/party';
import { STATUS_RANK } from '@/types/order';
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
    'notes', 'parentOrderId',
    'carrierSignedAt', 'carrierSignerName', 'carrierSignerIp',
    'shipperSignedAt', 'shipperSignerName', 'shipperSignerIp',
    'clientSignedAt',  'clientSignerName',  'clientSignerIp',
    'partyApprovals',
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

/** Fields needing a comparison rather than a straight "existing value wins". */
const RECONCILE: Partial<Record<ImportCollection, Record<string, (p: unknown, i: unknown) => unknown>>> = {
  orders: { status: reconcileStatus },
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
  extra: Partial<Omit<PartyDraft, 'id' | 'nameKey' | 'roles'>> = {},
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
  return draft.id;
}

/**
 * Writes the registry to `parties`, unioning roles with whatever is already
 * stored so a role applied by hand in the app is never dropped by an import.
 */
async function flushParties(reg: PartyRegistry, now: Timestamp): Promise<ImportResult> {
  if (reg.size === 0) return { collection: 'parties', written: 0, skipped: 0, total: 0 };

  // Fields the import must never overwrite. Ownership, contacts and notes are
  // maintained inside the TMS; a CSV re-upload knows nothing about them, so
  // blanking them here would silently destroy work every time someone
  // refreshed the data.
  interface Preserved {
    roles: PartyRole[];
    assignedToUids: string[];
    assignedToGroupIds: string[];
    assignedToName: string;
    contactName: string;
    contacts: unknown[];
    notes: string;
  }

  const existing = new Map<string, Preserved>();
  const snap = await adminDb.collection('parties')
    .select('roles', 'assignedToUids', 'assignedToGroupIds', 'assignedToName',
            'contactName', 'contacts', 'notes')
    .get();
  snap.forEach((doc) => {
    const v = doc.data();
    existing.set(doc.id, {
      roles:          (v.roles ?? []) as PartyRole[],
      assignedToUids: (v.assignedToUids ?? []) as string[],
      assignedToGroupIds: (v.assignedToGroupIds ?? []) as string[],
      assignedToName: (v.assignedToName ?? '') as string,
      contactName:    (v.contactName ?? '') as string,
      contacts:       (v.contacts ?? []) as unknown[],
      notes:          (v.notes ?? '') as string,
    });
  });

  const records = [...reg.values()].map((d) => {
    const prior  = existing.get(d.id);
    const merged = new Set<PartyRole>([...(prior?.roles ?? []), ...d.roles]);
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
      contactName:    prior?.contactName    ?? '',
      contacts:       prior?.contacts       ?? [],
      notes:          prior?.notes          ?? '',
      assignedToUids: prior?.assignedToUids ?? [],
      assignedToName: prior ? prior.assignedToName : d.assignedToName,
      // Must always be written: listVisibleParties finds unowned records with
      // `where('assignedToGroupIds', '==', [])`, which never matches a document
      // where the field is absent.
      assignedToGroupIds: prior?.assignedToGroupIds ?? [],
      createdAt:      now,
      updatedAt:      now,
    };
  });

  return batchWrite(records, 'parties', (r) => r._docId as string);
}

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
  const reg: PartyRegistry = new Map();
  for (const c of records) {
    registerParty(reg, c.company || c.name, 'client', {
      batsId:  c.batsId,
      phone:   c.phone,
      email:   c.email,
      address: { street: c.address, city: c.city, state: c.state, zip: c.zip, country: c.country },
      // BATS names the owning rep; this makes the party private to them rather
      // than open to everyone. Ignored if the party already exists.
      assignedToName: c.assignedTo,
    });
  }
  await flushParties(reg, now);

  return batchWrite(records, 'customers', (c) => `bats-${c.batsId}`);
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

  for (const text of texts) {
    const rows = loadCSV(text);
    for (const r of rows) {
      const batsId = str(r[0]);
      if (!batsId || isNaN(Number(batsId))) continue; // skip garbled rows
      if (seen.has(batsId)) continue;                  // deduplicate

      const agreedRate = parseFloat(r[16]) || 0;
      const carrierPay = parseFloat(r[17]) || 0;
      const brokerFee  = parseFloat(r[18]) || 0;

      // Col 8 is CustomerName — the client, not the shipper. The shipper and
      // consignee are the facility names packed into Origin and Destination.
      const clientName = str(r[8]);
      const origin     = parseOrderLocation(str(r[12]));
      const dest       = parseOrderLocation(str(r[13]));

      const clientId = registerParty(reg, clientName, 'client', {
        phone: str(r[9]),
        email: str(r[10]),
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
        orderNumber:               batsId,
        status:                    mapOrderStatus(str(r[5])),
        clientId,
        clientName,
        shipperId,
        shipperName:               origin.facility,
        consigneeId,
        consigneeName:             dest.facility,
        parentOrderId:             null,
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
        assignedTo:                str(r[19]),
        sourceName:                str(r[20]),
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
  const partyResult = await flushParties(reg, now);

  const records = [...seen.values()];
  const missingShipper   = records.filter((o) => !o.shipperId).length;
  const missingConsignee = records.filter((o) => !o.consigneeId).length;

  const result = await batchWrite(records, 'orders', (o) => `bats-${o.batsId}`);
  return {
    ...result,
    notes:
      `${partyResult.total} parties linked. ` +
      `${records.length - missingShipper}/${records.length} orders got a shipper from Origin, ` +
      `${records.length - missingConsignee}/${records.length} got a consignee from Destination.`,
  };
}
