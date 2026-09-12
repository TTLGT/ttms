/**
 * Stamp `US` on every phone number that was stored before a country could be
 * chosen alongside it.
 *
 * Why this is needed at all: nothing breaks without it. `phoneRegionOf()`
 * answers US for a missing field, so every screen already dials and formats
 * these numbers exactly as it did before. What the stamp buys is that the
 * field says what the app assumes — so a number that really is Mexican can be
 * told apart from one nobody has looked at yet, and so a future change of
 * default cannot silently re-label thousands of American numbers.
 *
 * It also means `phoneKeys` can be rebuilt from a region the record carries
 * rather than from a guess. Run this first, then:
 *
 *   node scripts/backfill-party-phone-keys.js --dry-run
 *   node scripts/backfill-party-phone-keys.js
 *
 * which re-files every party under the fuller set of keys — national,
 * international and legacy. Those two steps are separate on purpose: this one
 * only ever adds a label, and that one only ever rewrites a derived index.
 *
 * What gets stamped:
 *   parties  phoneRegion, phone2Region        (only where there is a number)
 *   carriers phoneRegion, dispatcherPhoneRegion, billingPhoneRegion
 *   drivers  phoneRegion
 *   orders   driverPhoneRegion                 (only where a driver phone exists)
 *
 * A record that already carries a region is left alone — including one an
 * admin has set to Mexico, which is the case this must never trample. Safe to
 * re-run: a second pass finds nothing to do.
 *
 * `updatedAt` is deliberately not touched. This is a label the app already
 * assumed, not an edit anybody made, and stamping it would reorder every
 * "recently changed" list in the system.
 *
 * Usage:
 *   node scripts/backfill-phone-regions.js --dry-run   — report only
 *   node scripts/backfill-phone-regions.js             — apply
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
const { getFirestore }                 = require('firebase-admin/firestore');

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

/** Mirror of RECORD_PHONE_REGIONS in src/lib/phone.ts. */
const REGIONS = ['US', 'MX', 'CA', 'GT'];
const DEFAULT = 'US';

/** Which field carries the country for which number, per collection. */
const TARGETS = [
  { collection: 'parties',  pairs: [['phone', 'phoneRegion'], ['phone2', 'phone2Region']] },
  { collection: 'carriers', pairs: [
    ['phone', 'phoneRegion'],
    ['dispatcherPhone', 'dispatcherPhoneRegion'],
    ['billingPhone', 'billingPhoneRegion'],
  ] },
  { collection: 'drivers',  pairs: [['phone', 'phoneRegion']] },
  { collection: 'orders',   pairs: [['driverPhone', 'driverPhoneRegion']] },
];

const hasNumber = (v) => String(v || '').replace(/\D/g, '').length >= 7;

// Firestore caps a batch at 500 writes.
const BATCH = 400;

async function main() {
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const writes = [];

  for (const target of TARGETS) {
    const snap = await db.collection(target.collection).get();
    let stamped = 0;
    let already = 0;
    let noNumber = 0;

    for (const doc of snap.docs) {
      const data  = doc.data();
      const patch = {};

      for (const [numberField, regionField] of target.pairs) {
        if (!hasNumber(data[numberField])) { noNumber++; continue; }
        // Never overwrite a country somebody has already chosen.
        if (REGIONS.includes(data[regionField])) { already++; continue; }
        patch[regionField] = DEFAULT;
        stamped++;
      }

      if (Object.keys(patch).length) {
        writes.push({ collection: target.collection, id: doc.id, patch });
      }
    }

    console.log(target.collection.padEnd(10)
      + String(snap.size).padStart(6) + ' scanned'
      + String(stamped).padStart(6) + ' to stamp'
      + String(already).padStart(6) + ' already set'
      + String(noNumber).padStart(6) + ' no number');
  }

  console.log('\nDocuments to write: ' + writes.length);

  if (DRY_RUN) {
    console.log('\nSample:');
    for (const w of writes.slice(0, 15)) {
      console.log('  ' + w.collection.padEnd(10) + w.id.padEnd(24) + JSON.stringify(w.patch));
    }
    if (writes.length > 15) console.log('  … and ' + (writes.length - 15) + ' more');
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  let done = 0;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) {
      batch.update(db.collection(w.collection).doc(w.id), w.patch);
    }
    await batch.commit();
    done += Math.min(BATCH, writes.length - i);
    console.log('  written ' + done + ' / ' + writes.length);
  }

  console.log('\nDone. Now re-file the party phone keys:');
  console.log('  node scripts/backfill-party-phone-keys.js --dry-run');
}

main().catch((e) => { console.error(e); process.exit(1); });
