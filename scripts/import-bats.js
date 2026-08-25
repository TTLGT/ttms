/**
 * BATS CRM → Firestore import script
 *
 * Usage:
 *   node scripts/import-bats.js --dry-run        — report what would change, write nothing
 *   node scripts/import-bats.js                  — import all three collections
 *   node scripts/import-bats.js --only orders    — skip carriers & customers
 *
 * Flags:
 *   --dry-run             report only; no writes at all. Run this first.
 *   --only <collection>   only run that collection (carriers | customers | orders)
 *   --batch-delay <ms>    ms to wait between batches (default 1000)
 *
 * Requires .env.local in the project root with:
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 *
 * Place the BATS CSV exports in the project root:
 *   carriers-export-*.csv
 *   customers-export-*.csv
 *   orders-export-*.csv   (handles multiple files — deduplicates by BATS Id)
 *
 * Re-running with a newer export is safe and fast: each row is hashed and
 * compared against the last-imported hash (stored as _importHash on the doc),
 * so unchanged rows are skipped entirely and only new/changed rows are written.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC WITH `src/lib/batsImport.ts`
 *
 * That module is the same importer, used by Settings → BATS Data Import. This
 * script exists because the in-app route is capped at 60s (`maxDuration`),
 * which a full ~27,000-row backfill cannot finish inside; run locally, this has
 * no timeout and can pace itself with --batch-delay.
 *
 * The duplication is deliberate but dangerous, and it has already bitten once:
 * the August party rebuild (660d057) updated the TS module and left this file
 * on the old shipper-based schema, so running it would have silently written
 * pre-migration records over migrated ones. Security rules can't import
 * TypeScript and neither can a plain node script — so if you change the record
 * shape, PRESERVE list, or party logic in either file, change it in both.
 *
 * Specifically mirrored below: PRESERVE, RECONCILE/reconcileStatus, STATUS_RANK,
 * toNameKey + SUFFIX_CANON, partyDocId, registerParty, flushParties.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    // `.` does not match a carriage return in JS, so a .env.local saved with
    // Windows CRLF endings would match nothing at all and every value would
    // come back undefined. Strip the CR before matching.
    const m = line.replace(/\r$/, '').match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

// ── Parse CLI flags ───────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const onlyIdx     = args.indexOf('--only');
const onlyCol     = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const delayIdx    = args.indexOf('--batch-delay');
const BATCH_DELAY = delayIdx >= 0 ? parseInt(args[delayIdx + 1]) || 1000 : 1000;

function shouldRun(col) {
  return !onlyCol || onlyCol === col;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Firebase Admin ────────────────────────────────────────────────────────────
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp }      = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

// ── CSV parser (handles quoted fields with embedded commas/newlines) ──────────
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') { field += '"'; i++; }
      else if (ch === '"')           { inQ = false; }
      else                           { field += ch; }
    } else {
      if      (ch === '"')                 { inQ = true; }
      else if (ch === ',')                 { row.push(field); field = ''; }
      else if (ch === '\r' && nx === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; }
      else if (ch === '\n' || ch === '\r') { row.push(field); field = ''; rows.push(row); row = []; }
      else                                 { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadCSV(filepath) {
  const rows = parseCSV(fs.readFileSync(filepath, 'utf8'));
  if (rows.length < 2) return [];
  return rows.slice(1).filter((r) => r.some((f) => f.trim()));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ts(dateStr) {
  if (!dateStr || !dateStr.trim()) return null;
  const d = new Date(dateStr.trim());
  return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

function str(val) {
  return (val || '').trim();
}

function isPhoneLike(s) {
  const digits = s.replace(/\D/g, '');
  return digits.length >= 7 && digits.length / s.length > 0.5;
}

/**
 * Parse "City, ST Zip" or "Facility | Phone | City, ST Zip".
 *
 * BATS packs the pickup/delivery facility and its phone into the same field as
 * the address. The facility on Origin is the shipper and the one on Destination
 * is the consignee, so both are kept rather than discarded.
 */
function parseOrderLocation(raw) {
  const blank = { street: '', city: '', state: '', zip: '', country: '' };
  if (!raw || !raw.trim()) return { facility: '', phone: '', address: blank };

  const segments = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const addrPart = segments[segments.length - 1] || '';
  const lead     = segments.slice(0, -1);

  // A lead segment that is mostly digits is the phone, not a facility name.
  const phone    = lead.find((s) => isPhoneLike(s)) || '';
  const facility = lead.find((s) => !isPhoneLike(s)) || '';

  const m = addrPart.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  const address = m
    ? { street: '', city: m[1].trim(), state: m[2].trim(), zip: (m[3] || '').trim(), country: 'US' }
    : { ...blank, city: addrPart };

  return { facility, phone, address };
}

function mapOrderStatus(batsStatus) {
  const MAP = {
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

// ── Name key (mirrors toNameKey in src/types/party.ts) ────────────────────────
// Suffixes are canonicalized rather than removed: dropping them entirely would
// merge "Acme Corp" with "Acme Inc", which are different companies, and a wrong
// merge is much harder to undo than a duplicate is to clean up.
const SUFFIX_CANON = [
  [/\b(incorporated|inc)\b/g, 'inc'],
  [/\b(corporation|corp)\b/g, 'corp'],
  [/\b(llc|l l c)\b/g,        'llc'],
  [/\b(limited|ltd)\b/g,      'ltd'],
  [/\b(company|co)\b/g,       'co'],
  [/\b(llp|l l p)\b/g,        'llp'],
];

function toNameKey(raw) {
  let out = String(raw || '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  for (const [re, canon] of SUFFIX_CANON) out = out.replace(re, canon);
  return out.trim().replace(/\s+/g, ' ');
}

// ── Change detection ─────────────────────────────────────────────────────────
// Hash every field except createdAt/updatedAt (which churn every run) so we can
// skip re-writing rows whose actual content hasn't changed since last import.
function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Timestamp) return `T:${value.toMillis()}`;
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${k}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashRecord(rec) {
  const { createdAt, updatedAt, ...stable } = rec;
  void createdAt; void updatedAt;
  return crypto.createHash('sha1').update(stableStringify(stable)).digest('hex');
}

/**
 * Fields that belong to the TMS, not to BATS.
 *
 * A CSV row carries no knowledge of them, so the import must leave them alone
 * on any document that already exists. Without this, re-importing to pick up a
 * changed phone number would also blank the assigned carrier, the uploaded BOL
 * and the e-signature audit trail on every order it rewrote.
 */
const PRESERVE = {
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

/** Fields whose loss would be most alarming — counted in the dry-run report. */
const AUDIT_FIELDS = {
  orders: ['carrierId', 'bolStoragePath', 'invoiceStoragePath', 'podStoragePath',
           'carrierSignedAt', 'shipperSignedAt', 'clientSignedAt'],
  carriers: ['insuranceExpiration', 'dot'],
  customers: ['notes'],
  parties: [],
};

const STATUS_RANK = {
  quote:            0,
  booked:           1,
  carrier_assigned: 2,
  carrier_signed:   3,
  shipper_signed:   4,
  in_transit:       5,
  delivered:        6,
  completed:        7,
};

/**
 * Merges an imported status with the one already stored.
 *
 * BATS and the TMS both move an order forward, but they are not always in step:
 * dispatch may have advanced a load here while BATS still shows it awaiting
 * signature. Taking the further-along of the two lets a refresh push an order
 * forward without ever undoing work done in the TMS.
 *
 * Cancellation is sticky in both directions — if either system says a load
 * died, a re-import will not quietly revive it.
 */
function reconcileStatus(prior, incoming) {
  const a = prior, b = incoming;
  if (!a) return b;
  if (a === 'cancelled' || b === 'cancelled') return 'cancelled';

  const rankA = STATUS_RANK[a];
  const rankB = STATUS_RANK[b];
  if (rankA === undefined) return b;
  if (rankB === undefined) return a;
  return rankB > rankA ? b : a;
}

/** Fields needing a comparison rather than a straight "existing value wins". */
const RECONCILE = {
  orders: { status: reconcileStatus },
};

/** Cheaply pull the hash, createdAt and preserved fields of every existing doc. */
async function loadExistingMeta(collectionName) {
  const fields = [
    '_importHash',
    'createdAt',
    ...PRESERVE[collectionName],
    ...Object.keys(RECONCILE[collectionName] || {}),
  ];
  const snap = await db.collection(collectionName).select(...fields).get();
  const map  = new Map();
  snap.forEach((doc) => map.set(doc.id, doc.data()));
  return map;
}

// ── Batch write helper ────────────────────────────────────────────────────────
async function batchWrite(records, collectionName, getId) {
  const existing = await loadExistingMeta(collectionName);

  const toWrite = [];
  let skipped = 0, created = 0, updated = 0, protectedDocs = 0;

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
      updated++;
      for (const field of PRESERVE[collectionName]) {
        if (prior[field] !== undefined) stored[field] = prior[field];
      }
      for (const [field, merge] of Object.entries(RECONCILE[collectionName] || {})) {
        stored[field] = merge(prior[field], stored[field]);
      }
      // Does this doc actually hold TMS-owned data that PRESERVE is saving?
      const holdsWork = (AUDIT_FIELDS[collectionName] || []).some((f) => {
        const v = prior[f];
        return v !== undefined && v !== null && v !== '';
      });
      if (holdsWork) protectedDocs++;
    } else {
      created++;
    }

    toWrite.push({
      id,
      data: {
        ...stored,
        createdAt:   (prior && prior.createdAt) || rec.createdAt,
        _importHash: hash,
      },
    });
  }

  if (DRY_RUN) {
    console.log(
      `  ${collectionName}: would write ${toWrite.length} ` +
      `(${created} new, ${updated} updated), ${skipped} unchanged skipped ` +
      `(${records.length} total).`
    );
    if (protectedDocs) {
      console.log(
        `      ${protectedDocs} existing ${collectionName} hold TMS-owned data ` +
        `(carrier, documents or signatures) — preserved, not overwritten.`
      );
    }
    return { written: 0, skipped, created, updated, protectedDocs, total: records.length };
  }

  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const batch = db.batch();
    for (const { id, data } of toWrite.slice(i, i + CHUNK)) {
      const ref = id ? db.collection(collectionName).doc(id) : db.collection(collectionName).doc();
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
    written += Math.min(CHUNK, toWrite.length - i);
    process.stdout.write(`  ${collectionName}: ${written}/${toWrite.length} written\r`);
    if (i + CHUNK < toWrite.length) await sleep(BATCH_DELAY);
  }
  console.log(
    `  ${collectionName}: ${written} written ` +
    `(${created} new, ${updated} updated), ${skipped} unchanged skipped ` +
    `(${records.length} total).      `
  );
  return { written, skipped, created, updated, protectedDocs, total: records.length };
}

// ── Party registry ───────────────────────────────────────────────────────────
// Clients, shippers and consignees are all parties. The same company can show
// up as a customer row and as a pickup facility on an order, so every name is
// funnelled through one registry keyed on its normalized form. That collapses
// "Acme Corp." and "ACME Corporation" onto a single record.

/** Deterministic id so repeat imports converge on the same document. */
function partyDocId(key) {
  return `p-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
}

function registerParty(reg, name, role, extra = {}) {
  const key = toNameKey(name);
  if (!key) return '';

  let draft = reg.get(key);
  if (!draft) {
    draft = {
      id: partyDocId(key),
      companyName: String(name).trim(),
      nameKey: key,
      batsId: null,
      phone: '',
      email: '',
      address: null,
      roles: new Set(),
      defaultOrigin: null,
      defaultDest: null,
      assignedToName: '',
    };
    reg.set(key, draft);
  }
  draft.roles.add(role);
  // First non-empty value wins, so a later sparse row cannot blank out details.
  draft.batsId         ||= extra.batsId         || null;
  draft.phone          ||= extra.phone          || '';
  draft.email          ||= extra.email          || '';
  draft.address        ||= extra.address        || null;
  draft.defaultOrigin  ||= extra.defaultOrigin  || null;
  draft.defaultDest    ||= extra.defaultDest    || null;
  draft.assignedToName ||= extra.assignedToName || '';
  return draft.id;
}

/**
 * Writes the registry to `parties`, unioning roles with whatever is already
 * stored so a role applied by hand in the app is never dropped by an import.
 */
async function flushParties(reg, now) {
  if (reg.size === 0) return { written: 0, skipped: 0, total: 0 };

  // Fields the import must never overwrite. Ownership, contacts and notes are
  // maintained inside the TMS; a CSV re-upload knows nothing about them, so
  // blanking them here would silently destroy work every time someone
  // refreshed the data.
  const existing = new Map();
  const snap = await db.collection('parties')
    .select('roles', 'assignedToUids', 'assignedToGroupIds', 'assignedToName',
            'contactName', 'contacts', 'notes')
    .get();
  snap.forEach((doc) => {
    const v = doc.data();
    existing.set(doc.id, {
      roles:              v.roles              || [],
      assignedToUids:     v.assignedToUids     || [],
      assignedToGroupIds: v.assignedToGroupIds || [],
      assignedToName:     v.assignedToName     || '',
      contactName:        v.contactName        || '',
      contacts:           v.contacts           || [],
      notes:              v.notes              || '',
    });
  });

  const records = [...reg.values()].map((d) => {
    const prior  = existing.get(d.id);
    const merged = new Set([...((prior && prior.roles) || []), ...d.roles]);
    return {
      _docId:        d.id,
      batsId:        d.batsId,
      companyName:   d.companyName,
      nameKey:       d.nameKey,
      phone:         d.phone,
      email:         d.email,
      address:       d.address || { street: '', city: '', state: '', zip: '', country: '' },
      roles:         [...merged].sort(),
      defaultOrigin: d.defaultOrigin,
      defaultDest:   d.defaultDest,
      // Existing values win; the CSV only supplies these for a brand-new party.
      contactName:    prior ? prior.contactName    : '',
      contacts:       prior ? prior.contacts       : [],
      notes:          prior ? prior.notes          : '',
      assignedToUids: prior ? prior.assignedToUids : [],
      assignedToName: prior ? prior.assignedToName : d.assignedToName,
      // Must always be written: listVisibleParties finds unowned records with
      // `where('assignedToGroupIds', '==', [])`, which never matches a document
      // where the field is absent.
      assignedToGroupIds: prior ? prior.assignedToGroupIds : [],
      createdAt: now,
      updatedAt: now,
    };
  });

  return batchWrite(records, 'parties', (r) => r._docId);
}

// ── Find CSV files ────────────────────────────────────────────────────────────
function findCSV(prefix) {
  const root  = path.join(__dirname, '..');
  const files = fs.readdirSync(root).filter((f) => f.startsWith(prefix) && f.endsWith('.csv'));
  if (!files.length) throw new Error(`No CSV file found matching "${prefix}*.csv" in project root`);
  return files.map((f) => path.join(root, f));
}

// ── Import Carriers ───────────────────────────────────────────────────────────
// Cols: Id,Name,McNumber,Status,Phone,Address,Fax,MainContact,ContactPhone,
//       ContactEmail,Dispatcher,DispatcherPhone,DispatcherEmail,
//       BillingContact,BillingPhone,BillingEmail
async function importCarriers() {
  const [filepath] = findCSV('carriers-export');
  console.log(`\nCarriers: ${filepath}`);
  const rows = loadCSV(filepath);
  const now  = Timestamp.now();

  const records = rows.map((r) => ({
    batsId:                str(r[0]),
    companyName:           str(r[1]),
    mc:                    str(r[2]),
    isActive:              str(r[3]).toLowerCase() === 'active',
    phone:                 str(r[4]),
    address:               str(r[5]),
    fax:                   str(r[6]),
    contactName:           str(r[7]),
    dot:                   '',
    email:                 str(r[9]),
    dispatcher:            str(r[10]),
    dispatcherPhone:       str(r[11]),
    dispatcherEmail:       str(r[12]),
    billingContact:        str(r[13]),
    billingPhone:          str(r[14]),
    billingEmail:          str(r[15]),
    insuranceExpiration:   null,
    insuranceProvider:     '',
    insurancePolicyNumber: '',
    notes:                 '',
    createdAt:             now,
    updatedAt:             now,
  })).filter((c) => c.batsId && c.companyName);

  await batchWrite(records, 'carriers', (c) => `bats-${c.batsId}`);
}

// ── Import Customers ──────────────────────────────────────────────────────────
// Cols: 0=Id,1=Name,2=Status,3=IsEnabled,4=Type,5=Phone,6=Phone2,7=Fax,8=Company,
//   9=Address,10=Address2,11=City,12=State,13=Zip,14=Country,15=Email,16=Created,
//   17=CreditCardNumber(skip),18=CreditCardExpiration(skip),19=AssignedTo,
//   20=LeadSourceId,21=LeadSourceName,22=MustSpecifyReferralSource
async function importCustomers() {
  const [filepath] = findCSV('customers-export');
  console.log(`\nCustomers: ${filepath}`);
  const rows = loadCSV(filepath);
  const now  = Timestamp.now();

  const records = rows.map((r) => ({
    batsId:         str(r[0]),
    name:           str(r[1]),
    status:         str(r[2]),
    isEnabled:      str(r[3]).toLowerCase() === 'true',
    type:           str(r[4]),
    phone:          str(r[5]),
    phone2:         str(r[6]),
    fax:            str(r[7]),
    company:        str(r[8]),
    address:        str(r[9]),
    address2:       str(r[10]),
    city:           str(r[11]),
    state:          str(r[12]),
    zip:            str(r[13]),
    country:        str(r[14]),
    email:          str(r[15]),
    batsCreatedAt:  ts(r[16]),
    // r[17] = CreditCardNumber — intentionally skipped
    // r[18] = CreditCardExpiration — intentionally skipped
    assignedTo:     str(r[19]),
    leadSourceId:   str(r[20]),
    leadSourceName: str(r[21]),
    notes:          '',
    createdAt:      now,
    updatedAt:      now,
  })).filter((c) => c.batsId && c.name);

  // Customers are clients in TMS terms; seed them into the shared party list so
  // orders can link to the same record a shipper or consignee would use.
  const reg = new Map();
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

  await batchWrite(records, 'customers', (c) => `bats-${c.batsId}`);
}

// ── Import Orders ─────────────────────────────────────────────────────────────
// Cols: Id,IsDuplicate,DuplicateId,OrderType,MasterOrderId,Status,SecondaryStatus,
//   Created,CustomerName,CustomerPhone,CustomerEmail,Vehicles,Origin,Destination,
//   FirstAvailablePickup,TransportType,TotalTariff,TotalCarrierFee,TotalBrokerFee,
//   AssignedTo,SourceName,Dispatched,PickedUp,Delivered,AssignedPickup,AssignedDelivery
async function importOrders() {
  const files = findCSV('orders-export');
  console.log(`\nOrders: ${files.length} file(s)`);

  const seen = new Map();  // batsId → record (for deduplication)
  const reg  = new Map();
  const now  = Timestamp.now();

  for (const filepath of files) {
    const rows = loadCSV(filepath);
    for (const r of rows) {
      const batsId = str(r[0]);
      if (!batsId || isNaN(Number(batsId))) continue;  // skip garbled rows
      if (seen.has(batsId)) continue;                   // deduplicate

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
        orderNumber:              batsId,
        status:                   mapOrderStatus(str(r[5])),
        clientId,
        clientName,
        shipperId,
        shipperName:              origin.facility,
        consigneeId,
        consigneeName:            dest.facility,
        parentOrderId:            null,
        commodity:                str(r[11]),
        vehicles:                 str(r[11]),
        pieces:                   0,
        weight:                   0,
        transportType:            str(r[15]),
        origin:                   origin.address,
        destination:              dest.address,
        // Kept verbatim so the facility segment stays recoverable if the
        // parsing rules ever need to change.
        _rawOrigin:               str(r[12]),
        _rawDestination:          str(r[13]),
        pickupDate:               ts(str(r[24])),  // AssignedPickup
        deliveryDate:             ts(str(r[25])),  // AssignedDelivery
        dispatchedAt:             ts(str(r[21])),
        pickedUpAt:               ts(str(r[22])),
        deliveredAt:              ts(str(r[23])),
        carrierId:                null,
        carrierName:              '',
        driverName:               '',
        driverPhone:              '',
        driverLicenseStoragePath: null,
        bolStoragePath:           null,
        invoiceStoragePath:       null,
        podStoragePath:           null,
        agreedRate,
        carrierPay,
        brokerFee,
        assignedTo:               str(r[19]),
        sourceName:               str(r[20]),
        notes:                    '',
        carrierSignedAt:          null,
        carrierSignerName:        null,
        carrierSignerIp:          null,
        shipperSignedAt:          null,
        shipperSignerName:        null,
        shipperSignerIp:          null,
        clientSignedAt:           null,
        clientSignerName:         null,
        clientSignerIp:           null,
        createdBy:                'bats-import',
        createdAt:                ts(str(r[7])) || now,
        updatedAt:                now,
      });
    }
  }

  const records = [...seen.values()];
  console.log(`  ${records.length} unique orders after dedup`);

  // Parties must land before the orders that reference them.
  await flushParties(reg, now);

  const missingShipper   = records.filter((o) => !o.shipperId).length;
  const missingConsignee = records.filter((o) => !o.consigneeId).length;

  await batchWrite(records, 'orders', (o) => `bats-${o.batsId}`);

  console.log(
    `      ${records.length - missingShipper}/${records.length} orders got a shipper from Origin, ` +
    `${records.length - missingConsignee}/${records.length} got a consignee from Destination.`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? 'BATS → Firestore import — DRY RUN, nothing will be written' : 'BATS → Firestore import starting…');
  console.log(`Project: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);

  try {
    if (shouldRun('carriers'))  await importCarriers();
    if (shouldRun('customers')) await importCustomers();
    if (shouldRun('orders'))    await importOrders();
    console.log(DRY_RUN ? '\nDry run complete — no data was changed.' : '\nDone.');
  } catch (err) {
    console.error('\nImport failed:', err.message);
    process.exit(1);
  }
}

main();
