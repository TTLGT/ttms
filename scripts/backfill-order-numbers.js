/**
 * Give every order already in Firestore a TTMS order number, retroactively.
 *
 * Orders imported from BATS carried their BATS id in `orderNumber`, and orders
 * created in the TMS before the sequence existed carried four random digits
 * (`TTL-2026-4821`). This walks the whole collection and numbers everything
 * that has no sequence number yet, in the order the loads were actually
 * created, year by year.
 *
 * What it does NOT do is renumber an order that already has a sequence number.
 * A number reaches a carrier the moment a rate confirmation goes out, so it is
 * issued once and never moved. That also makes this script safe to re-run: a
 * second pass finds nothing left to do.
 *
 * The previous number is kept in `previousOrderNumber` (and a BATS id was
 * always in `batsId` besides), so nothing is lost and the change is reversible.
 *
 * Ordering:
 *   - Grouped by the calendar year of `createdAt`, which for a BATS order is
 *     the BATS order date, not the day it was imported.
 *   - Sorted oldest first inside the year.
 *   - Ties broken by BATS id. Exported rows often carry a date with no time,
 *     so a busy day arrives as a block of identical timestamps; the BATS id is
 *     itself sequential and puts that block back in the order it was booked.
 *   - Orders with no usable `createdAt` are skipped and listed, never guessed
 *     into a year.
 *
 * The per-year counter in `counters/orderNumber-{year}` is advanced to the
 * highest number handed out, so orders created afterwards carry on from there
 * instead of colliding with a retroactive one.
 *
 * Usage:
 *   node scripts/backfill-order-numbers.js --dry-run   — report only
 *   node scripts/backfill-order-numbers.js             — apply
 *   node scripts/backfill-order-numbers.js --year 2024 — one year only
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with src/lib/orderNumber.ts (formatOrderNumber,
 * parseOrderNumber) and the mirror of the numbering pass in
 * scripts/import-bats.js. A plain node script cannot import TypeScript, so the
 * format lives in three places on purpose.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

let ONLY_YEAR = null;
const yearFlag = process.argv.indexOf('--year');
if (yearFlag !== -1 && process.argv[yearFlag + 1]) {
  ONLY_YEAR = Number(process.argv[yearFlag + 1]);
  if (!Number.isFinite(ONLY_YEAR)) {
    console.error('--year needs a four-digit year, e.g. --year 2024');
    process.exit(1);
  }
}

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

const SEQ_DIGITS = 6;

function formatOrderNumber(year, seq) {
  return 'TTL' + (year - 2000) + String(seq).padStart(SEQ_DIGITS, '0');
}

function parseOrderNumber(value) {
  const m = /^TTL(\d+)(\d{6})$/.exec(String(value == null ? '' : value));
  if (!m) return null;
  return { year: 2000 + Number(m[1]), seq: Number(m[2]) };
}

function createdMillis(data) {
  const c = data.createdAt;
  if (c instanceof Timestamp) return c.toMillis();
  if (c && typeof c.toDate === 'function') return c.toDate().getTime();
  if (typeof c === 'number') return c;
  return null;
}

async function main() {
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const snap = await db.collection('orders')
    .select('orderNumber', 'batsId', 'createdAt', 'previousOrderNumber')
    .get();

  // Numbers already issued, per year. Retroactive numbering starts above the
  // highest of them so it can never land on a number a live order carries.
  const takenTop  = new Map();
  const needing   = new Map();   // year -> rows to number
  const undated   = [];
  let alreadyDone = 0;

  snap.forEach((doc) => {
    const d = doc.data();
    const parsed = parseOrderNumber(d.orderNumber);

    if (parsed) {
      alreadyDone++;
      takenTop.set(parsed.year, Math.max(takenTop.get(parsed.year) || 0, parsed.seq));
      return;
    }

    const millis = createdMillis(d);
    if (millis === null) { undated.push(doc.id); return; }

    const year = new Date(millis).getFullYear();
    if (ONLY_YEAR !== null && year !== ONLY_YEAR) return;

    const list = needing.get(year) || [];
    list.push({
      id:       doc.id,
      batsId:   d.batsId || null,
      previous: typeof d.orderNumber === 'string' ? d.orderNumber : '',
      // previousOrderNumber is written once. If a run was interrupted after
      // setting it, the original must not be overwritten with whatever value
      // this run happens to see.
      keepPrevious: typeof d.previousOrderNumber === 'string' && d.previousOrderNumber !== '',
      millis,
    });
    needing.set(year, list);
  });

  const years = [...needing.keys()].sort((a, b) => a - b);

  console.log(snap.size + ' order(s) in the collection.');
  console.log(alreadyDone + ' already numbered — left untouched.');
  if (undated.length) {
    console.log('\n' + undated.length + ' order(s) have no usable createdAt and were skipped:');
    console.log('  ' + undated.slice(0, 10).join(', ') + (undated.length > 10 ? ', …' : ''));
    console.log('  Give them a createdAt and re-run, or number them by hand.');
  }
  if (!years.length) {
    console.log('\nNothing to number.');
    return;
  }

  // Assign first, print second, so the dry run shows exactly what an apply
  // would write rather than a description of it.
  const plan = [];
  for (const year of years) {
    const group = needing.get(year);
    group.sort((a, b) => {
      if (a.millis !== b.millis) return a.millis - b.millis;
      const an = Number(a.batsId), bn = Number(b.batsId);
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      return String(a.id).localeCompare(String(b.id));
    });

    const startedAt = takenTop.get(year) || 0;
    let seq = startedAt;
    for (const row of group) {
      seq++;
      plan.push(Object.assign({}, row, { year, seq, orderNumber: formatOrderNumber(year, seq) }));
    }

    const first = formatOrderNumber(year, startedAt + 1);
    const last  = formatOrderNumber(year, seq);
    const head  = startedAt
      ? '  (continues after ' + formatOrderNumber(year, startedAt) + ', already issued)'
      : '';
    console.log('\n' + year + ': ' + group.length + ' order(s)  ' + first + ' → ' + last + head);
    for (const row of plan.filter((p) => p.year === year).slice(0, 3)) {
      const was = row.previous || '(blank)';
      console.log('    ' + was.padEnd(14) + ' → ' + row.orderNumber
        + '   ' + new Date(row.millis).toISOString().slice(0, 10));
    }
    if (group.length > 3) console.log('    … ' + (group.length - 3) + ' more');
  }

  // Worth saying out loud: an already-issued number in a year being backfilled
  // means those orders sort ahead of older ones only being numbered now.
  const overlap = years.filter((y) => takenTop.get(y));
  if (overlap.length) {
    console.log('\nNote: ' + overlap.join(', ') + ' already had issued numbers. The retroactive');
    console.log('numbers continue above them, so those orders sort earlier than their date.');
  }

  if (DRY_RUN) {
    console.log('\n' + plan.length + ' order(s) would be numbered. Nothing written.');
    console.log('Re-run without --dry-run to apply.');
    return;
  }

  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < plan.length; i += CHUNK) {
    const batch = db.batch();
    for (const row of plan.slice(i, i + CHUNK)) {
      const update = { orderNumber: row.orderNumber };
      if (!row.keepPrevious && row.previous) update.previousOrderNumber = row.previous;
      batch.update(db.collection('orders').doc(row.id), update);
    }
    await batch.commit();
    written += Math.min(CHUNK, plan.length - i);
    console.log('  written ' + written + '/' + plan.length);
  }

  // Move each counter past everything just handed out, or the next order
  // created would be given a number a backfilled one already carries.
  for (const year of years) {
    const top = plan.filter((p) => p.year === year).reduce((m, p) => Math.max(m, p.seq), 0);
    await db.collection('counters').doc('orderNumber-' + year).set(
      { year, last: top, updatedAt: Timestamp.now() },
      { merge: true },
    );
    console.log('  counters/orderNumber-' + year + ' → last ' + top);
  }

  console.log('\nNumbered ' + plan.length + ' order(s). BATS ids are untouched in batsId;');
  console.log('the previous number is in previousOrderNumber.');
}

main().catch((e) => { console.error(e); process.exit(1); });
