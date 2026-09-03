/**
 * Give every party a `phoneKeys` array — its phone numbers reduced to digits —
 * so a client, shipper or consignee can be found by the number that rang in.
 *
 * Why this is needed: Firestore can only match a whole field value, so
 * searching "4695769974" against a `phone` saved as "+1 (469) 576-9974" finds
 * nothing. The app writes the key alongside the number on every save from now
 * on; the seven thousand records BATS imported predate the field and need this
 * one pass.
 *
 * Until it has run, phone lookup on the order form finds nothing for imported
 * records — the field it queries does not exist on them yet. Name search, and
 * lookup of anything created since, work either way. Nothing breaks; the
 * broker simply gets "not on file" for a customer who is, which is the
 * duplicate this whole feature exists to prevent — so run it.
 *
 * Safe to re-run: a party whose keys already match its numbers is skipped, so a
 * second pass finds nothing to do. It only ever writes `phoneKeys` — `updatedAt`
 * is deliberately left alone, because this is a derived index field rather than
 * an edit anybody made, and touching it would reorder "recently changed".
 *
 * Usage:
 *   node scripts/backfill-party-phone-keys.js --dry-run   — report only
 *   node scripts/backfill-party-phone-keys.js             — apply
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with toPhoneKey() / partyPhoneKeys() in src/types/party.ts.
 * A plain node script cannot import TypeScript, so the normalization lives in
 * two places on purpose. If they disagree, a party saved through the app stops
 * matching the search this script set up.
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

/** Mirror of toPhoneKey() in src/types/party.ts. Keep the two identical. */
function toPhoneKey(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
}

/** Mirror of partyPhoneKeys() in src/types/party.ts. */
function partyPhoneKeys(data) {
  const keys = [toPhoneKey(data.phone), toPhoneKey(data.phone2)].filter(Boolean);
  return Array.from(new Set(keys));
}

const sameKeys = (a, b) =>
  Array.isArray(a) && a.length === b.length && b.every((k) => a.includes(k));

// Firestore caps a batch at 500 writes.
const BATCH = 400;

async function main() {
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const snap = await db.collection('parties').get();
  console.log('Parties scanned:      ' + snap.size);

  const writes = [];
  let already = 0;
  let blank   = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const keys = partyPhoneKeys(data);

    // A party with no usable number is left alone rather than written an empty
    // array: there is nothing to find it by either way, and skipping it keeps
    // the write count honest about what actually changed.
    if (keys.length === 0) { blank++; continue; }
    if (sameKeys(data.phoneKeys, keys)) { already++; continue; }

    writes.push({
      id:    doc.id,
      name:  data.companyName || data.contactName || doc.id,
      phone: data.phone || data.phone2 || '',
      keys,
    });
  }

  console.log('  already correct:    ' + already);
  console.log('  no usable number:   ' + blank + '  (left alone — nothing to key on)');
  console.log('  to write:           ' + writes.length);

  if (DRY_RUN) {
    console.log('\nSample of keys that would be written:');
    for (const w of writes.slice(0, 15)) {
      console.log('  ' + String(w.name).slice(0, 30).padEnd(32)
        + String(w.phone).slice(0, 18).padEnd(20) + '-> ' + w.keys.join(', '));
    }
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  let done = 0;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) {
      batch.update(db.collection('parties').doc(w.id), { phoneKeys: w.keys });
    }
    await batch.commit();
    done += Math.min(BATCH, writes.length - i);
    console.log('  written ' + done + ' / ' + writes.length);
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
