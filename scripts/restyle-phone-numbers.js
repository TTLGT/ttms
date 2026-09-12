/**
 * Rewrite every stored phone number into the current house format.
 *
 * Why: the US and Canada form changed from `+(469) 935-4100` to
 * `+1 (469) 935-4100`. The old shape put a `+` in front of an *area* code with
 * no country code after it, which read as though 469 were a country and could
 * not be dialled as printed from Monterrey or Guatemala City. Formatting is
 * applied on save, so without this pass every number already in Firestore
 * keeps the old shape until somebody happens to edit that record.
 *
 * This only ever restyles. A number whose digits do not match the country on
 * its record is left exactly as it is — never blanked, never reinterpreted —
 * and so is a record whose number is already in the current format. Safe to
 * re-run: a second pass finds nothing to do.
 *
 * What it covers:
 *   parties      phone, phone2                        (region from the record)
 *   carriers     phone, dispatcherPhone, billingPhone
 *   drivers      phone
 *   orders       driverPhone
 *   allowedUsers phone (US work line), phoneOther + phoneOtherRegion
 *   users        the same two, which are mirrored there
 *
 * ⚠️  `allowedUsers` and `users` are the access list. This touches two string
 * fields on them and nothing else — no roles, no permissions, no email, no
 * uid — so it cannot affect who may sign in. Read the patch in the dry run
 * before applying it anyway.
 *
 * `updatedAt` is deliberately not touched: restyling is not an edit anybody
 * made, and stamping it would reorder every "recently changed" list.
 *
 * Run `scripts/backfill-phone-regions.js` first, so each number is restyled
 * against the country its record carries rather than the US default.
 *
 * Usage:
 *   node scripts/restyle-phone-numbers.js --dry-run   — report only
 *   node scripts/restyle-phone-numbers.js             — apply
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with normalizePhone() and format() in src/lib/phone.ts. A
 * plain node script cannot import TypeScript. If they disagree, this pass
 * writes a shape the app would immediately rewrite on the next save.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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

/* ── Mirror of src/lib/phone.ts. Keep identical. ──────────────────────────── */

const REGIONS = {
  US: { code: '1',   nationalLength: 10, legacyPrefixes: [] },
  CA: { code: '1',   nationalLength: 10, legacyPrefixes: [] },
  MX: { code: '52',  nationalLength: 10, legacyPrefixes: ['1', '044', '045'] },
  GT: { code: '502', nationalLength: 8,  legacyPrefixes: [] },
};

/** Mexico City (55, 56), Guadalajara (33) and Monterrey (81). The whole list. */
const MX_TWO_DIGIT_AREAS = ['55', '56', '33', '81'];

function format(national, region) {
  if (region === 'US' || region === 'CA') {
    return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  if (region === 'MX') {
    const area = MX_TWO_DIGIT_AREAS.includes(national.slice(0, 2)) ? 2 : 3;
    const mid  = area === 2 ? 4 : 3;
    return `+(52) ${national.slice(0, area)} ${national.slice(area, area + mid)}`
      + `-${national.slice(area + mid)}`;
  }
  return `+(502) ${national.slice(0, 4)}-${national.slice(4)}`;
}

/** Returns the canonical form, or '' when the digits do not fit the region. */
function normalizePhone(value, region) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';

  const spec = REGIONS[region] || REGIONS.US;
  const { code, nationalLength, legacyPrefixes } = spec;

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);

  const prefixes = [
    ...legacyPrefixes.map((p) => code + p),
    code,
    ...legacyPrefixes,
  ].sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (digits.length === prefix.length + nationalLength && digits.startsWith(prefix)) {
      digits = digits.slice(prefix.length);
      break;
    }
  }

  if (digits.length !== nationalLength) return '';
  return format(digits, region);
}

/* ─────────────────────────────────────────────────────────────────────────── */

const regionOf = (v) => (REGIONS[v] ? v : 'US');

/**
 * Each collection, and which field says the country for which number.
 * `region: null` means the staff US work line, which has no region field —
 * it is US by definition, which is why it is stored under `phone`.
 */
const TARGETS = [
  { collection: 'parties',  pairs: [
    ['phone', 'phoneRegion'], ['phone2', 'phone2Region'],
  ] },
  { collection: 'carriers', pairs: [
    ['phone', 'phoneRegion'],
    ['dispatcherPhone', 'dispatcherPhoneRegion'],
    ['billingPhone', 'billingPhoneRegion'],
  ] },
  { collection: 'drivers',  pairs: [['phone', 'phoneRegion']] },
  { collection: 'orders',   pairs: [['driverPhone', 'driverPhoneRegion']] },
  { collection: 'allowedUsers', pairs: [
    ['phone', null], ['phoneOther', 'phoneOtherRegion'],
  ] },
  { collection: 'users', pairs: [
    ['phone', null], ['phoneOther', 'phoneOtherRegion'],
  ] },
];

const BATCH = 400;

async function main() {
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const writes = [];

  for (const target of TARGETS) {
    const snap = await db.collection(target.collection).get();
    let restyle = 0;
    let already = 0;
    let unreadable = 0;
    let blank = 0;

    for (const doc of snap.docs) {
      const data  = doc.data();
      const patch = {};

      for (const [numberField, regionField] of target.pairs) {
        const current = data[numberField];
        if (!current || !String(current).trim()) { blank++; continue; }

        // A staff US line has no region field and needs none.
        const region = regionField ? regionOf(data[regionField]) : 'US';
        const next   = normalizePhone(current, region);

        // Digits that do not fit the country on the record. Left alone: it may
        // be a real number filed under the wrong country, and blanking it here
        // would destroy the only copy.
        if (!next) { unreadable++; continue; }
        if (next === current) { already++; continue; }

        patch[numberField] = next;
        restyle++;
      }

      if (Object.keys(patch).length) {
        writes.push({ collection: target.collection, id: doc.id, patch, before: data });
      }
    }

    console.log(target.collection.padEnd(14)
      + String(snap.size).padStart(5) + ' scanned'
      + String(restyle).padStart(6) + ' to restyle'
      + String(already).padStart(6) + ' already'
      + String(unreadable).padStart(6) + ' left as typed'
      + String(blank).padStart(6) + ' blank');
  }

  console.log('\nDocuments to write: ' + writes.length);

  if (DRY_RUN) {
    console.log('\nSample of what would change:');
    for (const w of writes.slice(0, 20)) {
      for (const [field, next] of Object.entries(w.patch)) {
        console.log('  ' + w.collection.padEnd(13)
          + String(w.before[field]).padEnd(22) + '-> ' + next);
      }
    }
    if (writes.length > 20) console.log('  … and ' + (writes.length - 20) + ' more documents');
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

  console.log('\nDone. Party phone keys are unaffected — they are built from');
  console.log('digits, and restyling changes none of them.');
}

main().catch((e) => { console.error(e); process.exit(1); });
