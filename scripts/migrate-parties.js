/**
 * Party model backfill
 *
 * Migrates the old single-shipper order model onto the shared `parties`
 * collection, where one record can act as client, shipper and/or consignee.
 *
 * What it does:
 *   1. Copies every `customers` doc into `parties` with the `client` role.
 *   2. Re-reads each order. `order.shipperName` historically held the BATS
 *      CustomerName — the client — so it moves to `clientName`/`clientId`.
 *   3. Recovers the real shipper and consignee from the facility names packed
 *      into the order's Origin/Destination strings where BATS supplied them,
 *      creating parties for each and linking them onto the order.
 *
 * Usage:
 *   node scripts/migrate-parties.js --dry-run    — report only, writes nothing
 *   node scripts/migrate-parties.js              — apply
 *
 * Safe to re-run: parties use deterministic ids derived from the normalized
 * name, and orders already carrying a clientId are left alone.
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');

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

// ── Name normalization (mirrors src/types/party.ts) ──────────────────────────
// Canonicalized, not removed: dropping suffixes entirely would merge
// "Acme Corp" with "Acme Inc". Keep in step with src/types/party.ts.
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

function partyDocId(key) {
  return 'p-' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

// ── Location parsing (mirrors src/lib/batsImport.ts) ─────────────────────────
function isPhoneLike(s) {
  const digits = s.replace(/\D/g, '');
  return digits.length >= 7 && digits.length / s.length > 0.5;
}

function parseOrderLocation(raw) {
  const blank = { street: '', city: '', state: '', zip: '', country: '' };
  if (!raw || !String(raw).trim()) return { facility: '', phone: '', address: blank };

  const segments = String(raw).split('|').map((s) => s.trim()).filter(Boolean);
  const addrPart = segments[segments.length - 1] || '';
  const lead     = segments.slice(0, -1);

  const phone    = lead.find((s) => isPhoneLike(s)) || '';
  const facility = lead.find((s) => !isPhoneLike(s)) || '';

  const m = addrPart.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  const address = m
    ? { street: '', city: m[1].trim(), state: m[2].trim(), zip: (m[3] || '').trim(), country: 'US' }
    : Object.assign({}, blank, { city: addrPart });

  return { facility, phone, address };
}

/**
 * Orders imported before this migration had Origin/Destination parsed down to
 * an address object, discarding the facility segment. Where that happened the
 * facility is unrecoverable from Firestore alone, so the order keeps an empty
 * shipper until the next BATS import refills it from the CSV.
 */
function facilityFromOrder(order, which) {
  const raw = which === 'origin' ? order._rawOrigin : order._rawDestination;
  if (raw) return parseOrderLocation(raw);
  return {
    facility: '',
    phone: '',
    address: (which === 'origin' ? order.origin : order.destination) || null,
  };
}

// ── Party registry ───────────────────────────────────────────────────────────
const registry = new Map();

function registerParty(name, role, extra) {
  const key = toNameKey(name);
  if (!key) return '';
  let d = registry.get(key);
  if (!d) {
    d = {
      id: partyDocId(key),
      companyName: String(name).trim(),
      contactName: '',
      nameKey: key,
      batsId: null,
      phone: '',
      email: '',
      address: null,
      roles: new Set(),
      defaultOrigin: null,
      defaultDest: null,
      assignedToUids: [],
      assignedToName: '',
      notes: '',
    };
    registry.set(key, d);
  }
  d.roles.add(role);
  const e = extra || {};
  // First non-empty value wins, so a sparse later row cannot blank out details.
  d.batsId        = d.batsId        || e.batsId        || null;
  d.contactName   = d.contactName   || e.contactName   || '';
  d.phone         = d.phone         || e.phone         || '';
  d.email         = d.email         || e.email         || '';
  d.address       = d.address       || e.address       || null;
  d.defaultOrigin = d.defaultOrigin || e.defaultOrigin || null;
  d.defaultDest   = d.defaultDest   || e.defaultDest   || null;
  d.assignedToName = d.assignedToName || e.assignedToName || '';
  if (e.assignedToUids && e.assignedToUids.length && !d.assignedToUids.length) {
    d.assignedToUids = e.assignedToUids;
  }
  return d.id;
}

async function commit(writes) {
  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + CHUNK)) batch.set(w.ref, w.data, { merge: true });
    await batch.commit();
  }
}

async function main() {
  const now = Timestamp.now();
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  // 1. Customers become client parties.
  const customersSnap = await db.collection('customers').get();
  customersSnap.forEach((doc) => {
    const c = doc.data();
    const name = (c.company || '').trim() || (c.name || '').trim();
    if (!name) return;
    registerParty(name, 'client', {
      batsId:      c.batsId || null,
      contactName: (c.company && c.name) ? c.name : '',
      phone:       c.phone || '',
      email:       c.email || '',
      address: {
        street:  c.address || '',
        city:    c.city    || '',
        state:   c.state   || '',
        zip:     c.zip     || '',
        country: c.country || 'US',
      },
      assignedToUids: c.assignedToUids || [],
      // BATS records the owning rep as a name, and most reps have no TMS
      // account yet. Keeping the name marks the record as owned-but-unclaimed
      // so it is not treated as free-for-all; scripts/resolve-party-owners.js
      // converts it to a uid once the account exists.
      assignedToName: (c.assignedTo || '').trim(),
    });
  });
  console.log('Customers scanned:      ' + customersSnap.size + ' -> ' + registry.size + ' parties so far');

  // 2. Orders: remap the client, recover shipper and consignee.
  const ordersSnap = await db.collection('orders').get();
  const orderWrites = [];
  let remappedClient = 0, gotShipper = 0, gotConsignee = 0, alreadyDone = 0;

  ordersSnap.forEach((doc) => {
    const o = doc.data();
    if (o.clientId) { alreadyDone++; return; }

    const clientName = (o.clientName || o.shipperName || '').trim();
    const clientId   = clientName ? registerParty(clientName, 'client', {}) : '';
    if (clientId) remappedClient++;

    const originLoc = facilityFromOrder(o, 'origin');
    const destLoc   = facilityFromOrder(o, 'destination');

    const shipperId = originLoc.facility
      ? registerParty(originLoc.facility, 'shipper', {
          phone: originLoc.phone, address: originLoc.address, defaultOrigin: originLoc.address,
        })
      : '';
    const consigneeId = destLoc.facility
      ? registerParty(destLoc.facility, 'consignee', {
          phone: destLoc.phone, address: destLoc.address, defaultDest: destLoc.address,
        })
      : '';
    if (shipperId)   gotShipper++;
    if (consigneeId) gotConsignee++;

    orderWrites.push({
      ref: doc.ref,
      data: {
        clientId,
        clientName,
        shipperId,
        shipperName:      originLoc.facility || '',
        consigneeId,
        consigneeName:    destLoc.facility || '',
        clientSignedAt:   o.clientSignedAt   || null,
        clientSignerName: o.clientSignerName || null,
        clientSignerIp:   o.clientSignerIp   || null,
        updatedAt:        now,
      },
    });
  });

  // 3. Union roles with anything already stored, so a role applied by hand in
  //    the app survives the migration.
  // Ownership, contacts and notes are maintained inside the TMS. This script is
  // re-runnable and may run after a BATS import has already created a party, so
  // anything already stored wins over what the CSV-derived registry holds.
  const priorById = new Map();
  const partiesSnap = await db.collection('parties')
    .select('roles', 'assignedToUids', 'assignedToGroupIds', 'assignedToName',
            'contactName', 'contacts', 'notes')
    .get();
  partiesSnap.forEach((d) => {
    const v = d.data();
    priorById.set(d.id, {
      roles:          v.roles          || [],
      assignedToUids: v.assignedToUids || [],
      assignedToGroupIds: v.assignedToGroupIds || [],
      assignedToName: v.assignedToName || '',
      contactName:    v.contactName    || '',
      contacts:       v.contacts       || [],
      notes:          v.notes          || '',
      exists:         true,
    });
  });

  const partyWrites = [...registry.values()].map((d) => {
    const prior = priorById.get(d.id);
    return {
      ref: db.collection('parties').doc(d.id),
      data: {
        batsId:      d.batsId,
        companyName: d.companyName,
        nameKey:     d.nameKey,
        phone:       d.phone,
        email:       d.email,
        address:     d.address || { street: '', city: '', state: '', zip: '', country: 'US' },
        roles:       [...new Set([...(prior ? prior.roles : []), ...d.roles])].sort(),
        defaultOrigin:  d.defaultOrigin,
        defaultDest:    d.defaultDest,
        contactName:    prior ? prior.contactName    : d.contactName,
        contacts:       prior ? prior.contacts       : [],
        notes:          prior ? prior.notes          : d.notes,
        assignedToUids: prior ? prior.assignedToUids : d.assignedToUids,
        assignedToName: prior ? prior.assignedToName : d.assignedToName,
        // Always written: the unowned-parties query matches on == [] and would
        // skip any document missing the field entirely.
        assignedToGroupIds: prior ? prior.assignedToGroupIds : [],
        createdAt:      now,
        updatedAt:      now,
      },
    };
  });

  const byRole = { client: 0, shipper: 0, consignee: 0 };
  for (const w of partyWrites) for (const r of w.data.roles) byRole[r]++;

  const owned    = partyWrites.filter((w) => w.data.assignedToUids.length > 0).length;
  const claimable = partyWrites.filter((w) => w.data.assignedToName).length;
  const open     = partyWrites.length - owned - claimable;

  console.log('Orders scanned:         ' + ordersSnap.size);
  console.log('  already migrated:     ' + alreadyDone);
  console.log('  client remapped:      ' + remappedClient);
  console.log('  shipper recovered:    ' + gotShipper);
  console.log('  consignee recovered:  ' + gotConsignee);
  console.log('\nParties to write:       ' + partyWrites.length);
  console.log('  as client:            ' + byRole.client);
  console.log('  as shipper:           ' + byRole.shipper);
  console.log('  as consignee:         ' + byRole.consignee);
  console.log('\nOwnership:');
  console.log('  owned by a TMS user:  ' + owned);
  console.log('  owned by name only:   ' + claimable + '  (private until the rep gets an account)');
  console.log('  unowned / open:       ' + open);

  if (gotShipper === 0 && ordersSnap.size > 0) {
    console.log(
      '\nNote: no shipper facilities were recoverable from Firestore, because the\n' +
      'original import discarded them. Re-run the BATS orders import after this\n' +
      'migration to populate shippers and consignees from the CSV.'
    );
  }

  if (DRY_RUN) {
    console.log('\nSample of parties that would be written:');
    for (const w of partyWrites.slice(0, 15)) {
      console.log('  ' + w.data.companyName.padEnd(38) + ' [' + w.data.roles.join(', ') + ']');
    }
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  await commit(partyWrites);
  console.log('\nWrote ' + partyWrites.length + ' parties.');
  await commit(orderWrites);
  console.log('Updated ' + orderWrites.length + ' orders.');
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
