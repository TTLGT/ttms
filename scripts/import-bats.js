/**
 * BATS CRM → Firestore one-time import script
 *
 * Usage:
 *   node scripts/import-bats.js                  — import all three collections
 *   node scripts/import-bats.js --only orders    — skip carriers & customers (already done)
 *   node scripts/import-bats.js --only carriers
 *   node scripts/import-bats.js --only customers
 *
 * Flags:
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
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

// ── Firebase Admin ────────────────────────────────────────────────────────────
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp }       = require('firebase-admin/firestore');

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
      if      (ch === '"')                       { inQ = true; }
      else if (ch === ',')                       { row.push(field); field = ''; }
      else if (ch === '\r' && nx === '\n')       { row.push(field); field = ''; rows.push(row); row = []; i++; }
      else if (ch === '\n' || ch === '\r')       { row.push(field); field = ''; rows.push(row); row = []; }
      else                                       { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadCSV(filepath) {
  const rows = parseCSV(fs.readFileSync(filepath, 'utf8'));
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).filter(r => r.some(f => f.trim()));
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

/** Parse "City, ST Zip" or "Facility | Phone | City, ST Zip" → Address object */
function parseOrderAddress(raw) {
  const blank = { street: '', city: '', state: '', zip: '', country: '' };
  if (!raw || !raw.trim()) return blank;
  const segments = raw.split('|').map(s => s.trim());
  const addrPart = segments[segments.length - 1];
  const m = addrPart.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (m) return { street: '', city: m[1].trim(), state: m[2].trim(), zip: (m[3] || '').trim(), country: 'US' };
  return { ...blank, city: addrPart };
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

// ── Parse CLI flags ───────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const onlyIdx    = args.indexOf('--only');
const onlyCol    = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const delayIdx   = args.indexOf('--batch-delay');
const BATCH_DELAY = delayIdx >= 0 ? parseInt(args[delayIdx + 1]) || 1000 : 1000;

function shouldRun(col) {
  return !onlyCol || onlyCol === col;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Batch write helper ────────────────────────────────────────────────────────
async function batchWrite(records, collectionName, getId) {
  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = db.batch();
    for (const rec of records.slice(i, i + CHUNK)) {
      const id  = getId(rec);
      const ref = id ? db.collection(collectionName).doc(id) : db.collection(collectionName).doc();
      batch.set(ref, rec, { merge: true });
    }
    await batch.commit();
    written += Math.min(CHUNK, records.length - i);
    process.stdout.write(`  ${collectionName}: ${written}/${records.length}\r`);
    if (i + CHUNK < records.length) await sleep(BATCH_DELAY);
  }
  console.log(`  ${collectionName}: ${written} records written.      `);
}

// ── Find CSV files ────────────────────────────────────────────────────────────
function findCSV(prefix) {
  const root = path.join(__dirname, '..');
  const files = fs.readdirSync(root).filter(f => f.startsWith(prefix) && f.endsWith('.csv'));
  if (!files.length) throw new Error(`No CSV file found matching "${prefix}*.csv" in project root`);
  return files.map(f => path.join(root, f));
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

  const records = rows.map(r => ({
    batsId:           str(r[0]),
    companyName:      str(r[1]),
    mc:               str(r[2]),
    isActive:         str(r[3]).toLowerCase() === 'active',
    phone:            str(r[4]),
    address:          str(r[5]),
    fax:              str(r[6]),
    contactName:      str(r[7]),
    dot:              '',
    email:            str(r[9]),
    dispatcher:       str(r[10]),
    dispatcherPhone:  str(r[11]),
    dispatcherEmail:  str(r[12]),
    billingContact:   str(r[13]),
    billingPhone:     str(r[14]),
    billingEmail:     str(r[15]),
    insuranceExpiration:   null,
    insuranceProvider:     '',
    insurancePolicyNumber: '',
    notes:            '',
    createdAt:        now,
    updatedAt:        now,
  })).filter(c => c.batsId && c.companyName);

  await batchWrite(records, 'carriers', c => `bats-${c.batsId}`);
}

// ── Import Customers ──────────────────────────────────────────────────────────
// Cols (positional): 0=Id,1=Name,2=Status,3=IsEnabled,4=Type,5=Phone,6=Phone2,
//   7=Fax,8=Company,9=Address,10=Address2,11=City,12=State,13=Zip,14=Country,
//   15=Email,16=Created,17=CreditCardNumber(skip),18=CreditCardExpiration(skip),
//   19=AssignedTo,20=LeadSourceId,21=LeadSourceName,22=MustSpecifyReferralSource
async function importCustomers() {
  const [filepath] = findCSV('customers-export');
  console.log(`\nCustomers: ${filepath}`);
  const rows = loadCSV(filepath);
  const now  = Timestamp.now();

  const records = rows.map(r => ({
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
  })).filter(c => c.batsId && c.name);

  await batchWrite(records, 'customers', c => `bats-${c.batsId}`);
}

// ── Import Orders ─────────────────────────────────────────────────────────────
// Cols: Id,IsDuplicate,DuplicateId,OrderType,MasterOrderId,Status,SecondaryStatus,
//   Created,CustomerName,CustomerPhone,CustomerEmail,Vehicles,Origin,Destination,
//   FirstAvailablePickup,TransportType,TotalTariff,TotalCarrierFee,TotalBrokerFee,
//   AssignedTo,SourceName,Dispatched,PickedUp,Delivered,AssignedPickup,AssignedDelivery
async function importOrders() {
  const files = findCSV('orders-export');
  console.log(`\nOrders: ${files.length} file(s)`);

  const seen    = new Map();  // batsId → record (for deduplication)
  const now     = Timestamp.now();

  for (const filepath of files) {
    const rows = loadCSV(filepath);
    for (const r of rows) {
      const batsId = str(r[0]);
      if (!batsId || isNaN(Number(batsId))) continue;  // skip garbled rows
      if (seen.has(batsId)) continue;                   // deduplicate

      const agreedRate  = parseFloat(r[16]) || 0;
      const carrierPay  = parseFloat(r[17]) || 0;
      const brokerFee   = parseFloat(r[18]) || 0;

      seen.set(batsId, {
        batsId,
        orderNumber:     batsId,
        status:          mapOrderStatus(str(r[5])),
        shipperId:       '',
        shipperName:     str(r[8]),
        parentOrderId:   null,
        commodity:       str(r[11]),
        vehicles:        str(r[11]),
        pieces:          0,
        weight:          0,
        transportType:   str(r[15]),
        origin:          parseOrderAddress(str(r[12])),
        destination:     parseOrderAddress(str(r[13])),
        pickupDate:      ts(str(r[24])),    // AssignedPickup
        deliveryDate:    ts(str(r[25])),    // AssignedDelivery
        dispatchedAt:    ts(str(r[21])),
        pickedUpAt:      ts(str(r[22])),
        deliveredAt:     ts(str(r[23])),
        carrierId:       null,
        carrierName:     '',
        driverName:      '',
        driverPhone:     '',
        driverLicenseStoragePath: null,
        bolStoragePath:  null,
        invoiceStoragePath: null,
        podStoragePath:  null,
        agreedRate,
        carrierPay,
        brokerFee,
        assignedTo:      str(r[19]),
        sourceName:      str(r[20]),
        notes:           '',
        carrierSignedAt: null,
        carrierSignerName: null,
        carrierSignerIp: null,
        shipperSignedAt: null,
        shipperSignerName: null,
        shipperSignerIp: null,
        createdBy:       'bats-import',
        createdAt:       ts(str(r[7])) || now,
        updatedAt:       now,
      });
    }
  }

  const records = [...seen.values()];
  console.log(`  ${records.length} unique orders after dedup`);
  await batchWrite(records, 'orders', o => `bats-${o.batsId}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('BATS → Firestore import starting…');
  console.log(`Project: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);

  try {
    if (shouldRun('carriers'))  await importCarriers();
    if (shouldRun('customers')) await importCustomers();
    if (shouldRun('orders'))    await importOrders();
    console.log('\nDone.');
  } catch (err) {
    console.error('\nImport failed:', err.message);
    process.exit(1);
  }
}

main();
