/**
 * Give every carrier a `nameKey` — its company name, lowercased — so the
 * carriers page can search in the database instead of in the browser.
 *
 * Why this is needed: the carriers list used to read all eleven thousand
 * documents (about six megabytes, ten seconds) and filter them with
 * `String.includes` as the user typed. Paging that list means the search has to
 * become a query, and a Firestore range query is case-sensitive. Roughly four
 * fifths of the imported names are in block capitals and the rest are not, so
 * searching for "tyjo" would never reach "TYJO LOGISTICS" without a normalized
 * key to match against.
 *
 * Until this has run, name search on the carriers page finds nothing — the
 * field it queries does not exist yet. DOT and MC search, and plain browsing,
 * work either way.
 *
 * Safe to re-run: a carrier whose key already matches its name is skipped, so a
 * second pass finds nothing to do. It only ever writes `nameKey` (and the
 * `updatedAt` stamp is deliberately left alone — this is a derived index field,
 * not an edit anybody made, and touching it would reorder "recently changed").
 *
 * Usage:
 *   node scripts/backfill-carrier-name-keys.js --dry-run   — report only
 *   node scripts/backfill-carrier-name-keys.js             — apply
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with carrierNameKey() in src/types/carrier.ts. A plain node
 * script cannot import TypeScript, so the normalization lives in two places on
 * purpose. If they disagree, a carrier saved through the app stops matching the
 * search that this script set up.
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

/** Mirror of carrierNameKey() in src/types/carrier.ts. Keep the two identical. */
function carrierNameKey(raw) {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Firestore caps a batch at 500 writes.
const BATCH = 400;

async function main() {
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const snap = await db.collection('carriers').get();
  console.log('Carriers scanned:     ' + snap.size);

  const writes = [];
  let already = 0;
  let blank   = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const key  = carrierNameKey(data.companyName);

    if (!key) { blank++; continue; }
    if (data.nameKey === key) { already++; continue; }
    writes.push({ id: doc.id, name: data.companyName, key });
  }

  console.log('  already correct:    ' + already);
  console.log('  no usable name:     ' + blank + '  (left alone — nothing to key on)');
  console.log('  to write:           ' + writes.length);

  if (DRY_RUN) {
    console.log('\nSample of keys that would be written:');
    for (const w of writes.slice(0, 15)) {
      console.log('  ' + String(w.name).slice(0, 38).padEnd(40) + '-> ' + w.key);
    }
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  let done = 0;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) {
      batch.update(db.collection('carriers').doc(w.id), { nameKey: w.key });
    }
    await batch.commit();
    done += Math.min(BATCH, writes.length - i);
    console.log('  written ' + done + ' / ' + writes.length);
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
