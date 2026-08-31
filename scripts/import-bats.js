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
 * toNameKey + SUFFIX_CANON, partyDocId, registerParty, flushParties, and the
 * whole owner-resolution block (src/lib/ownerResolution.ts) plus the opening
 * ownership-history entry (src/lib/ownership.ts). Ownership is the one that
 * bites hardest if it drifts: an importer that does not write assignedToUids
 * leaves every record it touches visible only to admin, dispatch and finance.
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

// ── Lead sources ──────────────────────────────────────────────────────────────
// KEEP IN SYNC with src/types/leadSource.ts and src/lib/batsImport.ts.

function toSourceKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function leadSourceDocId(key) {
  return `ls-${key.replace(/\s+/g, '-')}`;
}

/**
 * Loads the managed lead-source list, keyed for matching.
 *
 * Matching is on `nameKey`, not on the derived document id, so that a source an
 * admin has renamed is still found rather than being re-created under its new
 * name's id.
 */
async function loadLeadSources() {
  const snap = await db.collection('leadSources').select('nameKey').get();
  const byKey = new Map();
  snap.forEach((d) => byKey.set(d.get('nameKey') || '', d.id));
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
function resolveSource(dir, rawName) {
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
async function flushLeadSources(dir, now) {
  if (dir.pending.size === 0) return 0;

  const rows = [...dir.pending.values()];
  if (DRY_RUN) {
    console.log(`      would add ${rows.length} new lead source(s): ${rows.map((r) => r.name).join(', ')}`);
    return 0;
  }

  const batch = db.batch();
  for (const r of rows) {
    // merge:true so a name seen in both the customers and orders files, or in a
    // later run, never resets a source an admin has since renamed or retired.
    batch.set(db.collection('leadSources').doc(r.id), {
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
  console.log(`      added ${rows.length} new lead source(s)`);
  return rows.length;
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

/**
 * Mirror of carrierNameKey() in src/types/carrier.ts.
 *
 * ⚠️  KEEP IN SYNC. A plain node script cannot import TypeScript. If the two
 * disagree, a carrier imported here stops matching the search the app builds.
 *
 * Deliberately not toNameKey below: that one canonicalises company suffixes so
 * it can decide whether two names are the same company, which is the wrong job
 * here. This one only has to match what somebody has typed so far.
 */
function carrierNameKey(raw) {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

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
    'notes',
    'carrierSignedAt', 'carrierSignerName', 'carrierSignerIp',
    'shipperSignedAt', 'shipperSignerName', 'shipperSignerIp',
    'clientSignedAt',  'clientSignerName',  'clientSignerIp',
    'partyApprovals',
    // Ownership is assigned on creation and maintained in the TMS afterwards.
    // A refreshed export still carries the original BATS rep name, so without
    // this a re-import would hand every reassigned load back to whoever used to
    // own it. clientOwnerUids/clientOwnerGroupIds are deliberately absent: they
    // mirror the client party and must move when the client changes hands.
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
function preferExisting(prior, incoming) {
  return prior || incoming || null;
}

/** Fields needing a comparison rather than a straight "existing value wins". */
/**
 * An order number, once issued, is permanent.
 *
 * A stored number that came from the sequence wins over anything an import
 * computes -- it is printed on rate confirmations, BOLs and invoices that have
 * left the building, and a load the carrier calls TTL26000042 must not become
 * something else here. A stored number that is *not* from the sequence is a
 * BATS id or a pre-sequence random number, and gives way to the real one that
 * assignOrderNumbers() worked out; that is what makes historical orders
 * numberable at all.
 */
function keepIssuedNumber(prior, incoming) {
  if (typeof prior === 'string' && parseOrderNumber(prior)) return prior;
  return incoming || prior || null;
}

const RECONCILE = {
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

// -- Owner resolution ---------------------------------------------------------
// Mirror of src/lib/ownerResolution.ts. BATS records the owning rep as a name,
// never as an account; this turns that name into user ids, work group ids, or --
// for somebody who exists but has never signed in -- an email to hold the
// assignment under until first sign-in mints a uid.
//
// Matching runs against `allowedUsers`, which holds everyone, NOT against
// `users`, which holds only people who have signed in at least once. Existing
// is the test, not having logged in. Work groups own records; teams do not, and
// are deliberately absent here.

function normalizeOwnerName(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const NO_OWNER = { uids: [], groupIds: [], emails: [], unresolved: true, ambiguous: false };

function addOwnerLabel(map, label, person) {
  const key = normalizeOwnerName(label);
  if (!key) return;
  const list = map.get(key) || [];
  // One person can reach the same key by several labels; they must still count
  // as one candidate or everybody would look ambiguous against themselves.
  if (!list.some((p) => p.email === person.email)) list.push(person);
  map.set(key, list);
}

async function loadOwnerDirectory(overrides) {
  const [groupSnap, allowSnap, userSnap] = await Promise.all([
    db.collection('workGroups').get(),
    db.collection('allowedUsers').get(),
    db.collection('users').get(),
  ]);

  const groups = new Map();
  groupSnap.forEach((doc) => {
    const key = normalizeOwnerName(doc.data().name);
    if (key) groups.set(key, doc.id);
  });

  const byEmail = new Map();
  const people = new Map();

  allowSnap.forEach((doc) => {
    const d = doc.data();
    const email = String(d.email || doc.id).trim().toLowerCase();
    if (!email) return;
    const person = { email, uid: d.uid || null };
    byEmail.set(email, person);
    addOwnerLabel(people, [d.firstName, d.lastName].filter(Boolean).join(' '), person);
    addOwnerLabel(people, d.displayName || '', person);
    addOwnerLabel(people, email.split('@')[0], person);
  });

  userSnap.forEach((doc) => {
    const d = doc.data();
    const email = String(d.email || '').trim().toLowerCase();
    if (!email) return;
    let person = byEmail.get(email);
    if (!person) {
      // A bootstrap admin can hold a profile without an allowlist entry.
      person = { email, uid: doc.id };
      byEmail.set(email, person);
      addOwnerLabel(people, email.split('@')[0], person);
    }
    person.uid = doc.id;
    addOwnerLabel(people, d.displayName || '', person);
  });

  return { groups, people, byEmail, overrides: overrides || new Map() };
}

function forPerson(person) {
  return person.uid
    ? { uids: [person.uid], groupIds: [], emails: [], unresolved: false, ambiguous: false }
    : { uids: [], groupIds: [], emails: [person.email], unresolved: false, ambiguous: false };
}

function resolveSegment(dir, name) {
  const key = normalizeOwnerName(name);
  if (!key) return NO_OWNER;

  const groupId = dir.groups.get(key);
  if (groupId) {
    return { uids: [], groupIds: [groupId], emails: [], unresolved: false, ambiguous: false };
  }

  const hits = dir.people.get(key) || [];
  if (hits.length === 1) return forPerson(hits[0]);
  if (hits.length > 1) return Object.assign({}, NO_OWNER, { ambiguous: true });
  return NO_OWNER;
}

/**
 * "Gabe/Axel" is two owners, not an unmatchable name. Every part must resolve:
 * a partial match is treated as no match, because assigning half the owners
 * would quietly drop the other half.
 */
function resolveOwner(dir, rawName) {
  const name = String(rawName == null ? '' : rawName).trim();
  if (!name) return NO_OWNER;

  const override = dir.overrides.get(normalizeOwnerName(name));
  if (override) {
    if (override.toLowerCase().startsWith('group:')) {
      const groupId = dir.groups.get(normalizeOwnerName(override.slice(6)));
      return groupId
        ? { uids: [], groupIds: [groupId], emails: [], unresolved: false, ambiguous: false }
        : NO_OWNER;
    }
    const person = dir.byEmail.get(String(override).trim().toLowerCase());
    return person ? forPerson(person) : NO_OWNER;
  }

  const parts = name.split('/').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return NO_OWNER;

  const uids = [], groupIds = [], emails = [];
  for (const part of parts) {
    const hit = resolveSegment(dir, part);
    if (hit.unresolved) return Object.assign({}, NO_OWNER, { ambiguous: hit.ambiguous });
    uids.push.apply(uids, hit.uids);
    groupIds.push.apply(groupIds, hit.groupIds);
    emails.push.apply(emails, hit.emails);
  }

  return {
    uids: [...new Set(uids)],
    groupIds: [...new Set(groupIds)],
    emails: [...new Set(emails)],
    unresolved: false,
    ambiguous: false,
  };
}

function hasOwner(r) {
  return r.uids.length > 0 || r.groupIds.length > 0 || r.emails.length > 0;
}

/** Accumulates the match report printed at the end of each file. */
function newTally() {
  return { assigned: 0, ambiguous: 0, misses: new Map() };
}

function tallyOwner(tally, name, resolved) {
  if (hasOwner(resolved)) { tally.assigned++; return; }
  if (!String(name || '').trim()) return;
  if (resolved.ambiguous) { tally.ambiguous++; return; }
  tally.misses.set(name, (tally.misses.get(name) || 0) + 1);
}

function reportTally(tally, label) {
  const unresolved = [...tally.misses.values()].reduce((a, b) => a + b, 0);
  console.log('      owners: ' + tally.assigned + ' assigned, ' + tally.ambiguous +
    ' ambiguous (skipped), ' + unresolved + ' left as text');
  if (tally.misses.size) {
    const top = [...tally.misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log('      no match for these ' + label + ' names (kept as text, ' +
      'visible to admin/dispatch/finance only):');
    for (const [name, n] of top) console.log('        ' + String(n).padStart(5) + '  ' + name);
  }
}

/** Display names for every uid and group id the opening entries will mention. */
async function ownerLabelMap(opened) {
  const uids = new Set(), groupIds = new Set();
  for (const rec of opened) {
    if (!rec.owners) continue;
    for (const u of rec.owners.uids) uids.add(u);
    for (const g of rec.owners.groupIds) groupIds.add(g);
  }
  const labels = new Map();
  const refs = [
    ...[...uids].map((u) => db.collection('users').doc(u)),
    ...[...groupIds].map((g) => db.collection('workGroups').doc(g)),
  ];
  if (!refs.length) return labels;
  const docs = await db.getAll.apply(db, refs);
  for (const doc of docs) {
    const d = doc.data();
    if (!d) continue;
    if (uids.has(doc.id)) labels.set('user:' + doc.id, d.displayName || d.email || doc.id);
    else labels.set('group:' + doc.id, d.name || doc.id);
  }
  return labels;
}

function openingEvents(rec, labels) {
  const o = rec.owners;
  if (!o || !hasOwner(o)) {
    return [{ action: 'added', targetType: 'text', targetId: '', targetLabel: String(rec.name).trim() }];
  }
  return [
    ...o.uids.map((id) => ({
      action: 'added', targetType: 'user', targetId: id, targetLabel: labels.get('user:' + id) || id,
    })),
    ...o.groupIds.map((id) => ({
      action: 'added', targetType: 'group', targetId: id, targetLabel: labels.get('group:' + id) || id,
    })),
    ...o.emails.map((id) => ({
      action: 'added', targetType: 'email', targetId: id, targetLabel: id,
    })),
  ];
}

/**
 * The opening ownership-history entry, written for every record the import
 * creates -- matched or not. An unmatched BATS name is a real historical owner,
 * recorded as a `text` target that grants nothing, so the timeline starts where
 * the data did rather than at the first manual edit. A fixed document id keeps
 * it idempotent across re-runs.
 */
async function writeOpeningHistory(collectionName, opened, now) {
  const withNames = opened.filter((o) => String(o.name || '').trim());
  if (!withNames.length || DRY_RUN) return;

  const labels = await ownerLabelMap(withNames);

  const CHUNK = 200;
  for (let i = 0; i < withNames.length; i += CHUNK) {
    const batch = db.batch();
    for (const rec of withNames.slice(i, i + CHUNK)) {
      const col = db.collection(collectionName).doc(rec.id).collection('ownerEvents');
      openingEvents(rec, labels).forEach((event, n) => {
        batch.set(col.doc('bats-origin-' + n), Object.assign({}, event, {
          actorUid:  'bats-import',
          actorName: 'BATS import',
          actorIp:   null,
          at:        now,
        }));
      });
    }
    await batch.commit();
  }
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
      owners: null,
      sourceId: null,
      sourceName: '',
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
  draft.owners         ||= extra.owners         || null;
  draft.sourceId       ||= (extra.source && extra.source.id)   || null;
  draft.sourceName     ||= (extra.source && extra.source.name) || '';
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
    .select('roles', 'assignedToUids', 'assignedToGroupIds', 'assignedToEmails',
            'assignedToName', 'contactName', 'contacts', 'notes', 'sourceId')
    .get();
  snap.forEach((doc) => {
    const v = doc.data();
    existing.set(doc.id, {
      roles:              v.roles              || [],
      assignedToUids:     v.assignedToUids     || [],
      assignedToGroupIds: v.assignedToGroupIds || [],
      assignedToEmails:   v.assignedToEmails   || [],
      assignedToName:     v.assignedToName     || '',
      contactName:        v.contactName        || '',
      contacts:           v.contacts           || [],
      notes:              v.notes              || '',
      sourceId:           v.sourceId           || null,
    });
  });

  // Final ownership per party, so the orders that reference them can mirror it.
  const ownership = new Map();
  // New parties only -- an existing one keeps the history it already has.
  const opened = [];

  const records = [...reg.values()].map((d) => {
    const prior  = existing.get(d.id);
    const merged = new Set([...((prior && prior.roles) || []), ...d.roles]);

    // A name the importer resolved becomes real ownership; one it could not
    // stays as text. The two are exclusive -- keeping both would leave two
    // answers to "who owns this" with nothing saying which wins.
    const resolved = d.owners && hasOwner(d.owners) ? d.owners : null;
    const uids     = prior ? prior.assignedToUids     : (resolved ? resolved.uids : []);
    const groupIds = prior ? prior.assignedToGroupIds : (resolved ? resolved.groupIds : []);
    const emails   = prior ? prior.assignedToEmails   : (resolved ? resolved.emails : []);

    ownership.set(d.id, { uids, groupIds });
    if (!prior) opened.push({ id: d.id, name: d.assignedToName, owners: d.owners });

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
      sourceId:   (prior && prior.sourceId) || d.sourceId || null,
      sourceName: d.sourceName,
      createdAt: now,
      updatedAt: now,
    };
  });

  const result = await batchWrite(records, 'parties', (r) => r._docId);
  await writeOpeningHistory('parties', opened, now);
  result.ownership = ownership;
  return result;
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
    // The carriers list searches on nameKey, so a carrier imported without one
    // exists but cannot be found by name. Rewritten whenever the name is, or a
    // renamed carrier stays findable only under its old name.
    nameKey:               carrierNameKey(str(r[1])),
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
  const dir     = await loadOwnerDirectory();
  const sources = await loadLeadSources();
  const tally   = newTally();
  const reg = new Map();
  for (const c of records) {
    const owners = resolveOwner(dir, c.assignedTo);
    tallyOwner(tally, c.assignedTo, owners);
    registerParty(reg, c.company || c.name, 'client', {
      batsId:  c.batsId,
      phone:   c.phone,
      email:   c.email,
      // BATS's LeadSourceName, matched to the managed list so the client lands
      // with its source already selected rather than as unattributed text.
      source:  resolveSource(sources, c.leadSourceName),
      address: { street: c.address, city: c.city, state: c.state, zip: c.zip, country: c.country },
      // BATS names the owning rep. Resolved here into real owners so the party
      // lands assigned rather than merely private; a name matching nobody falls
      // back to the text. Both are ignored if the party already exists.
      assignedToName: c.assignedTo,
      owners,
    });
  }
  // Sources must exist before the parties that point at them.
  await flushLeadSources(sources, now);
  await flushParties(reg, now);
  reportTally(tally, 'customer');

  await batchWrite(records, 'customers', (c) => `bats-${c.batsId}`);
}

// ── Import Orders ─────────────────────────────────────────────────────────────
// Cols: Id,IsDuplicate,DuplicateId,OrderType,MasterOrderId,Status,SecondaryStatus,
//   Created,CustomerName,CustomerPhone,CustomerEmail,Vehicles,Origin,Destination,
//   FirstAvailablePickup,TransportType,TotalTariff,TotalCarrierFee,TotalBrokerFee,
//   AssignedTo,SourceName,Dispatched,PickedUp,Delivered,AssignedPickup,AssignedDelivery
const SEQ_DIGITS = 6;

/**
 * The order-number format.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with src/lib/orderNumber.ts and the mirror in
 * scripts/backfill-order-numbers.js. A plain node script cannot import
 * TypeScript, so the format lives in three places on purpose.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function formatOrderNumber(year, seq) {
  return 'TTL' + (year - 2000) + String(seq).padStart(SEQ_DIGITS, '0');
}

function parseOrderNumber(value) {
  const m = /^TTL(\d+)(\d{6})$/.exec(String(value == null ? '' : value));
  if (!m) return null;
  return { year: 2000 + Number(m[1]), seq: Number(m[2]) };
}

/**
 * Reserves a block of consecutive numbers in one transaction.
 *
 * One transaction per order would mean thousands of sequential round trips
 * against a single counter document -- past what Firestore sustains on one
 * document, and slow enough to time a big import out. Moving the counter by
 * the whole batch costs the same as moving it by one.
 */
async function reserveOrderNumbers(year, count) {
  const ref = db.collection('counters').doc('orderNumber-' + year);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.exists ? Number(snap.data().last) : 0;
    const from = (Number.isFinite(last) ? last : 0) + 1;
    tx.set(ref, { year, last: from + count - 1, updatedAt: Timestamp.now() }, { merge: true });
    return from;
  });
}

/**
 * Gives every order in the run its TTMS order number.
 *
 * An order already carrying a sequence number keeps it, always. A number goes
 * onto paperwork the moment the rate confirmation is sent, so reissuing one
 * would mean the load in the TMS and the load in the carrier's file no longer
 * agree. That check is what makes the import safe to re-run.
 *
 * Everything else -- a genuinely new row, or a historical order still carrying
 * its BATS id -- is numbered in creation order within its own year, so the
 * numbers reflect the sequence the loads were actually booked in rather than
 * the order the CSV happens to list them. `createdAt` is the BATS order date
 * (column 7), which is why this can be done at all.
 *
 * BATS ids break the ties. Many exported rows carry a date with no time, so a
 * busy day arrives as a block of identical timestamps; the BATS id is itself
 * sequential, so it puts that block back into the order the loads were taken.
 */
async function assignOrderNumbers(records, existingNumbers) {
  const needing = [];

  for (const rec of records) {
    const stored = existingNumbers.get(`bats-${rec.batsId}`);
    if (stored && parseOrderNumber(stored)) {
      rec.orderNumber = stored;
    } else {
      // The old number is kept so a load stays findable by what staff called
      // it for the last decade. Set only on the first numbering.
      if (stored) rec.previousOrderNumber = stored;
      needing.push(rec);
    }
  }
  if (needing.length === 0) return;

  const byYear = new Map();
  for (const rec of needing) {
    const year = rec.createdAt.toDate().getFullYear();
    const group = byYear.get(year) || [];
    group.push(rec);
    byYear.set(year, group);
  }

  for (const [year, group] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    group.sort((a, b) => {
      const at = a.createdAt.toMillis(), bt = b.createdAt.toMillis();
      if (at !== bt) return at - bt;
      return Number(a.batsId) - Number(b.batsId);
    });
    const from = await reserveOrderNumbers(year, group.length);
    group.forEach((rec, i) => { rec.orderNumber = formatOrderNumber(year, from + i); });
  }
}

async function importOrders() {
  const files = findCSV('orders-export');
  console.log(`\nOrders: ${files.length} file(s)`);

  const seen = new Map();  // batsId → record (for deduplication)
  const reg  = new Map();
  const now  = Timestamp.now();
  // Read the directory once for the whole run, not per row: a BATS file is tens
  // of thousands of rows against a few dozen people.
  const dir     = await loadOwnerDirectory();
  const sources = await loadLeadSources();
  const tally   = newTally();

  for (const filepath of files) {
    const rows = loadCSV(filepath);
    for (const r of rows) {
      const batsId = str(r[0]);
      if (!batsId || isNaN(Number(batsId))) continue;  // skip garbled rows
      if (seen.has(batsId)) continue;                   // deduplicate

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
      // passed through, any client seen only here landed with no owner at all --
      // which reads as unowned, meaning visible to every signed-in user.
      const ownerName = str(r[19]);
      const owners    = resolveOwner(dir, ownerName);
      tallyOwner(tally, ownerName, owners);

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
        status:                   mapOrderStatus(str(r[5])),
        clientId,
        clientName,
        shipperId,
        shipperName:              origin.facility,
        consigneeId,
        consigneeName:            dest.facility,
        // Col 4 is MasterOrderId — set on a suborder, empty on a standalone
        // load. Imported orders are keyed `bats-<BATS Id>`, so the parent's
        // document id can be built from it directly with no lookup. A master
        // that never made it into the export leaves a dangling id; the
        // suborders tab simply finds nothing, which is the same as today.
        parentOrderId:            masterId ? `bats-${masterId}` : null,
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
        firstAvailablePickup:     ts(str(r[14])),  // FirstAvailablePickup
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
        assignedTo:               ownerName,
        // Resolved owners for the order itself, independent of the client's.
        // An order can be worked by someone who does not own the customer.
        assignedToUids:           owners.uids,
        assignedToGroupIds:       owners.groupIds,
        assignedToEmails:         owners.emails,
        // Filled in below, once flushParties reports where the client landed.
        clientOwnerUids:          [],
        clientOwnerGroupIds:      [],
        sourceId:                 source.id,
        sourceName:               source.name,
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

  // Sources first, then parties, then the orders that reference both.
  await flushLeadSources(sources, now);
  // Parties must land before the orders that reference them.
  const partyResult = await flushParties(reg, now);
  const ownership   = partyResult.ownership || new Map();

  // Mirror each client's final ownership onto its orders. Done after the flush
  // because the client may have been created by this very run, or may have been
  // owned by someone in the TMS for months -- either way it is the stored state,
  // not the CSV, that decides. Rules cannot query for this, which is why it is
  // denormalized onto every order.
  for (const o of records) {
    const owners = ownership.get(o.clientId);
    o.clientOwnerUids     = owners ? owners.uids     : [];
    o.clientOwnerGroupIds = owners ? owners.groupIds : [];
  }

  // Which orders are new has to be settled before batchWrite runs, so the
  // opening history goes only to records that did not already exist. The
  // stored order number is read in the same pass -- see assignOrderNumbers().
  const existingNumbers = new Map();
  const existingIds     = new Set();
  (await db.collection('orders').select('orderNumber').get()).docs.forEach((d) => {
    existingIds.add(d.id);
    const n = d.get('orderNumber');
    if (typeof n === 'string' && n) existingNumbers.set(d.id, n);
  });

  await assignOrderNumbers(records, existingNumbers);
  const opened = records
    .filter((o) => !existingIds.has(`bats-${o.batsId}`))
    .map((o) => ({
      id:     `bats-${o.batsId}`,
      name:   o.assignedTo,
      owners: {
        uids:     o.assignedToUids,
        groupIds: o.assignedToGroupIds,
        emails:   o.assignedToEmails,
      },
    }));

  const missingShipper   = records.filter((o) => !o.shipperId).length;
  const missingConsignee = records.filter((o) => !o.consigneeId).length;

  await batchWrite(records, 'orders', (o) => `bats-${o.batsId}`);
  await writeOpeningHistory('orders', opened, now);
  reportTally(tally, 'order');

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
