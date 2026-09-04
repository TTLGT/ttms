/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Puts `signatureWaived: false` on every order that does not carry it.
 *
 * ## Why this exists
 *
 * Dispatching a load without waiting for the client to sign is recorded on the
 * order as `signatureWaivedAt` — a timestamp, because who decided and when is
 * the point of keeping it. Application code always asks
 * `clientSignatureSatisfied()`, which reads that timestamp and nothing else.
 *
 * The dashboard cannot. Its "Unsigned Agreements" figure is a Firestore
 * aggregation over ten thousand orders rather than a filter in the browser, and
 * Firestore has no way to ask "is this field null **or absent**" in one query.
 * A `!=` skips documents missing the field, and an `== null` skips them too. So
 * the boolean mirror exists purely to be queryable, and a mirror is only useful
 * if every document has one.
 *
 * Until this has run, `where('signatureWaived', '==', false)` matches nothing,
 * and the card counts only the orders missing a carrier signature. On today's
 * book that happens to be the same number — every unsigned order is missing
 * both — so nothing looks wrong. The moment one load is dispatched on a waiver
 * and its carrier signs, the count starts drifting quietly, which is the worst
 * way for a number staff work from to be wrong.
 *
 * ## What it does not do
 *
 * It never writes `true`. A waiver is a decision somebody made, recorded with
 * their name through /api/orders/{id}/waive-signature; this script only fills
 * in the absence of one. It also leaves `signatureWaivedAt` alone entirely —
 * an order that already has one keeps it, and gets `signatureWaived: true` to
 * match, which is the one case where the two could otherwise disagree.
 *
 * ## Usage
 *
 *   node scripts/backfill-signature-waived.js --dry-run   — report, write nothing
 *   node scripts/backfill-signature-waived.js             — apply
 *
 * ⚠️  .env.local points at the live project. Run --dry-run first and read it.
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

/** Firestore's hard limit on one batch. */
const BATCH_LIMIT = 500;
/** Read in pages so a ten-thousand-order book does not arrive at once. */
const PAGE = 400;

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — nothing will be written\n' : 'APPLYING\n');

  let cursor  = null;
  let scanned = 0;
  let toWrite = [];
  let written = 0;
  let already = 0;
  let waived  = 0;

  for (;;) {
    // Ordered by document id: the only field guaranteed present on every
    // order, and stable while the collection is being written to underneath.
    let q = db.collection('orders').orderBy('__name__').limit(PAGE);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data();

      if (typeof data.signatureWaived === 'boolean') {
        already++;
        continue;
      }

      // An order that already carries a waiver timestamp gets `true`, so the
      // mirror agrees with the record it mirrors. In practice there are none
      // — the field is new — but writing `false` over a real waiver would hide
      // it from the dashboard, and that is not a mistake worth risking.
      const value = data.signatureWaivedAt ? true : false;
      if (value) waived++;
      toWrite.push({ ref: doc.ref, value });
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }

  console.log(`Scanned:                    ${scanned}`);
  console.log(`Already had the field:      ${already}`);
  console.log(`To set false:               ${toWrite.length - waived}`);
  console.log(`To set true (real waivers): ${waived}`);

  if (!toWrite.length) {
    console.log('\nNothing to do.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry run — no writes made. Re-run without --dry-run to apply.');
    return;
  }

  for (let i = 0; i < toWrite.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { ref, value } of toWrite.slice(i, i + BATCH_LIMIT)) {
      // `update`, not `set(..., {merge:true})`: this must never create a
      // document, and it must not touch `updatedAt` — a derived field being
      // filled in is not somebody editing the load, and bumping the timestamp
      // would push ten thousand orders to the top of every "recently changed"
      // list in the app.
      batch.update(ref, { signatureWaived: value });
    }
    await batch.commit();
    written += Math.min(BATCH_LIMIT, toWrite.length - i);
    console.log(`  committed ${written}/${toWrite.length}`);
  }

  console.log(`\nDone. ${written} orders updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
