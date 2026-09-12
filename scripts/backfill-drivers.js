/**
 * Turn the drivers named on existing orders into `drivers` records, and link
 * each order to the record it produced.
 *
 * Why this exists: before the `drivers` collection, a driver was three free-text
 * fields typed onto a load — `driverName`, `driverPhone`,
 * `driverLicenseStoragePath` — and the only link to a carrier was that both
 * happened to sit on the same order. Every carrier's Drivers tab would start
 * empty, while the answer was already in the order book. This reads it back out.
 *
 * What it does, per order that has BOTH a `carrierId` and a `driverName`:
 *   - groups the orders by carrier and by normalized driver name;
 *   - creates one `drivers` document per group, taking the phone and licence
 *     from the most recent load that had them;
 *   - sets `driverId` on each of those orders.
 *
 * What it deliberately does NOT do:
 *   - guess that "M. Delgado" and "Mike Delgado" are one person. They stay two
 *     records. Merging them is a human decision, and filing a licence against
 *     the wrong driver is worse than a duplicate row somebody can retire.
 *   - touch an order with no carrier. A driver with no carrier has nothing to
 *     hang off, and inventing one would put a driver on the wrong company.
 *   - rewrite `driverName` or `driverPhone` on any order. Those stay exactly as
 *     typed — they are the record of what was true on the day, which is the
 *     whole reason the order keeps its own copy.
 *   - change `updatedAt` on the orders. `driverId` is a derived link, not an
 *     edit somebody made, and stamping it would reorder "recently changed".
 *
 * Safe to re-run: an order that already has a `driverId` is skipped, and a
 * driver whose name is already on file for that carrier is reused rather than
 * duplicated.
 *
 * Usage:
 *   node scripts/backfill-drivers.js --dry-run   — report only
 *   node scripts/backfill-drivers.js             — apply
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with driverNameKey() in src/types/driver.ts. A plain node
 * script cannot import TypeScript, so the normalization lives in two places on
 * purpose. If they disagree, a driver saved through the app stops matching the
 * records this script created, and a second copy is minted on the next booking.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    // `.` does not match a carriage return in JS, so a .env.local saved with
    // Windows CRLF endings would match nothing and every value would come
    // back undefined. Strip the CR before matching.
    const m = line.replace(/\r$/, '').match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue }     = require('firebase-admin/firestore');

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

/** Mirror of driverNameKey() in src/types/driver.ts. Keep the two identical. */
function driverNameKey(raw) {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Newest first, so the first hit is the most recent load. */
function byCreatedDesc(a, b) {
  const at = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
  const bt = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
  return bt - at;
}

// Firestore caps a batch at 500 writes.
const BATCH = 400;

async function main() {
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const [orderSnap, carrierSnap, driverSnap] = await Promise.all([
    db.collection('orders').get(),
    db.collection('carriers').get(),
    db.collection('drivers').get(),
  ]);

  const carrierNames = new Map();
  for (const d of carrierSnap.docs) carrierNames.set(d.id, d.data().companyName || '(unnamed)');

  // Drivers already on file, so a re-run reuses them instead of duplicating.
  const existing = new Map(); // `${carrierId}|${nameKey}` -> driverId
  for (const d of driverSnap.docs) {
    const data = d.data();
    existing.set(`${data.carrierId}|${driverNameKey(data.name)}`, d.id);
  }

  const groups   = new Map(); // key -> { carrierId, name, orders: [] }
  let noCarrier  = 0;
  let noDriver   = 0;
  let alreadySet = 0;

  for (const doc of orderSnap.docs) {
    const o = doc.data();
    if (o.driverId) { alreadySet++; continue; }
    if (!o.driverName || !String(o.driverName).trim()) { noDriver++; continue; }
    if (!o.carrierId) { noCarrier++; continue; }

    const nameKey = driverNameKey(o.driverName);
    if (!nameKey) { noDriver++; continue; }

    const key = `${o.carrierId}|${nameKey}`;
    if (!groups.has(key)) {
      groups.set(key, { carrierId: o.carrierId, name: String(o.driverName).trim(), orders: [] });
    }
    groups.get(key).orders.push({ id: doc.id, ...o });
  }

  console.log('Orders scanned:              ' + orderSnap.size);
  console.log('  no driver named:           ' + noDriver);
  console.log('  driver but no carrier:     ' + noCarrier + '  (skipped — nothing to attach to)');
  console.log('  already linked:            ' + alreadySet);
  console.log('Driver records to create:    '
    + [...groups.keys()].filter((k) => !existing.has(k)).length);
  console.log('Driver records reused:       '
    + [...groups.keys()].filter((k) => existing.has(k)).length);
  console.log('Orders to link:              '
    + [...groups.values()].reduce((n, g) => n + g.orders.length, 0));

  const plan = [];
  for (const [key, group] of groups) {
    group.orders.sort(byCreatedDesc);
    // The most recent load that actually recorded each detail wins: a phone
    // typed once and left blank since is still the phone we have.
    const withPhone   = group.orders.find((o) => o.driverPhone && String(o.driverPhone).trim());
    const withLicense = group.orders.find((o) => o.driverLicenseStoragePath);
    plan.push({
      key,
      existingId: existing.get(key) || null,
      carrierId:  group.carrierId,
      name:       group.name,
      phone:      withPhone ? String(withPhone.driverPhone).trim() : '',
      licensePath: withLicense ? withLicense.driverLicenseStoragePath : null,
      orderIds:   group.orders.map((o) => o.id),
    });
  }
  plan.sort((a, b) => b.orderIds.length - a.orderIds.length);

  if (DRY_RUN) {
    console.log('\nWhat would be created (largest first):\n');
    for (const p of plan.slice(0, 30)) {
      const carrier = carrierNames.get(p.carrierId) || p.carrierId;
      console.log(
        '  ' + String(p.name).slice(0, 24).padEnd(26)
        + String(carrier).slice(0, 28).padEnd(30)
        + String(p.orderIds.length).padStart(3) + ' load(s)'
        + (p.phone ? '  ' + p.phone : '  (no phone)')
        + (p.licensePath ? '  +licence' : '')
        + (p.existingId ? '  [reuses existing record]' : '')
      );
    }
    if (plan.length > 30) console.log('  … and ' + (plan.length - 30) + ' more');
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  // Drivers first: an order must never be pointed at a record that does not
  // exist yet, so the link is only written once the record is committed.
  let created = 0;
  const orderLinks = [];
  for (const p of plan) {
    let driverId = p.existingId;
    if (!driverId) {
      const ref = await db.collection('drivers').add({
        carrierId:         p.carrierId,
        name:              p.name,
        nameKey:           driverNameKey(p.name),
        phone:             p.phone,
        licenseNumber:     '',
        licenseExpiration: null,
        licenseStoragePath: p.licensePath,
        isActive:          true,
        // Says where the record came from, so nobody wonders why a driver
        // appeared with no expiry date and no CDL number on it.
        notes:             'Created from order history by scripts/backfill-drivers.js',
        createdAt:         FieldValue.serverTimestamp(),
        updatedAt:         FieldValue.serverTimestamp(),
      });
      driverId = ref.id;
      created++;
    }
    for (const orderId of p.orderIds) orderLinks.push({ orderId, driverId });
  }
  console.log('\nDriver records created: ' + created);

  let done = 0;
  for (let i = 0; i < orderLinks.length; i += BATCH) {
    const batch = db.batch();
    for (const link of orderLinks.slice(i, i + BATCH)) {
      // driverId only. Nothing else on the order is touched — see the header.
      batch.update(db.collection('orders').doc(link.orderId), { driverId: link.driverId });
    }
    await batch.commit();
    done += Math.min(BATCH, orderLinks.length - i);
    console.log('  orders linked ' + done + ' / ' + orderLinks.length);
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
