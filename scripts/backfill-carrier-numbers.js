/**
 * Reduce every carrier's `mc` and `dot` to digits alone — "MC-123456" becomes
 * "123456" — so the number search on the carriers list and the order carrier
 * picker can find them.
 *
 * Why this is needed: that search answers a number with an exact match on the
 * stored field, and the add-carrier forms used to suggest typing "MC-123456".
 * A carrier saved that way could not be found by the 123456 printed on a rate
 * confirmation. The app now stores digits only (carrierNumber() in
 * src/types/carrier.ts, applied in createCarrier and updateCarrier); this
 * brings the carriers saved before that into line.
 *
 * What it will not touch, and lists instead for somebody to fix by hand:
 *   - a value holding two separate numbers ("MC 123456 / FF 7890") — squashing
 *     those together would invent a number that belongs to nobody;
 *   - a value with no digits at all ("pending", "N/A") — reducing it would
 *     silently erase whatever the person who typed it meant.
 *
 * Safe to re-run: a value that is already digits is skipped. It writes only
 * `mc` and `dot`, and leaves `updatedAt` alone — this is a format fix, not an
 * edit anybody made, and touching it would reorder "recently changed".
 *
 * Usage:
 *   node scripts/backfill-carrier-numbers.js --dry-run   — report only
 *   node scripts/backfill-carrier-numbers.js             — apply
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with carrierNumber() in src/types/carrier.ts. A plain node
 * script cannot import TypeScript, so the normalization lives in two places on
 * purpose.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    // Strip a Windows CR first — `.` does not match one, so a CRLF file would
    // otherwise match nothing and every value would come back undefined.
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

/** Mirror of carrierNumber() in src/types/carrier.ts. Keep the two identical. */
function carrierNumber(raw) {
  return (raw || '').replace(/\D+/g, '');
}

/**
 * What to do with one stored value: nothing, rewrite it, or leave it for a
 * person. Hyphens and spaces *inside* a run of digits ("1234-567") are read as
 * formatting, not as a second number; anything else between two runs is.
 */
function classify(raw) {
  const value = typeof raw === 'string' ? raw : '';
  if (!value.trim())            return { kind: 'blank' };
  if (/^\d+$/.test(value))      return { kind: 'ok' };
  const runs = value.match(/\d[\d\s-]*\d|\d/g) || [];
  if (runs.length === 0)        return { kind: 'no_digits' };
  if (runs.length > 1)          return { kind: 'several' };
  return { kind: 'rewrite', to: carrierNumber(value) };
}

// Firestore caps a batch at 500 writes.
const BATCH = 400;

async function main() {
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const snap = await db.collection('carriers').get();
  console.log('Carriers scanned:        ' + snap.size + '\n');

  const writes = [];
  const manual = [];
  const tally  = { mc: {}, dot: {} };

  for (const doc of snap.docs) {
    const data  = doc.data();
    const patch = {};
    for (const field of ['mc', 'dot']) {
      const c = classify(data[field]);
      tally[field][c.kind] = (tally[field][c.kind] || 0) + 1;
      if (c.kind === 'rewrite') patch[field] = c.to;
      if (c.kind === 'several' || c.kind === 'no_digits') {
        manual.push({ id: doc.id, name: data.companyName, field, value: data[field], why: c.kind });
      }
    }
    if (Object.keys(patch).length) {
      writes.push({ id: doc.id, name: data.companyName, before: { mc: data.mc, dot: data.dot }, patch });
    }
  }

  for (const field of ['mc', 'dot']) {
    const t = tally[field];
    console.log(field.toUpperCase() + ':');
    console.log('  blank:                 ' + (t.blank     || 0));
    console.log('  already digits:        ' + (t.ok        || 0));
    console.log('  to rewrite:            ' + (t.rewrite   || 0));
    console.log('  several numbers (skip):' + ' ' + (t.several   || 0));
    console.log('  no digits (skip):      ' + (t.no_digits || 0));
  }
  console.log('\nCarriers to write:       ' + writes.length);

  if (manual.length) {
    console.log('\nLeft alone — fix these by hand on the carrier page:');
    for (const m of manual) {
      console.log('  ' + String(m.name).slice(0, 36).padEnd(38) + m.field.toUpperCase().padEnd(5)
        + JSON.stringify(m.value) + '  (' + (m.why === 'several' ? 'two numbers' : 'no digits') + ')');
    }
  }

  if (DRY_RUN) {
    console.log('\nSample of what would change:');
    for (const w of writes.slice(0, 20)) {
      const parts = Object.entries(w.patch)
        .map(([f, to]) => f.toUpperCase() + ' ' + JSON.stringify(w.before[f]) + ' -> ' + JSON.stringify(to));
      console.log('  ' + String(w.name).slice(0, 36).padEnd(38) + parts.join(', '));
    }
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  let done = 0;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) {
      batch.update(db.collection('carriers').doc(w.id), w.patch);
    }
    await batch.commit();
    done += Math.min(BATCH, writes.length - i);
    console.log('  written ' + done + ' / ' + writes.length);
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
