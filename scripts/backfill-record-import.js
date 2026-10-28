/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Puts the "Record import" label on every order that came from BATS, and the
 * two signature-recorded mirrors on every order.
 *
 * ## Why this exists
 *
 * A load imported from BATS was never processed in TTMS: its agreements were
 * not sent, signed or checked here. `recordImport: true` is what shows that
 * as the Record import label, which admin or dispatch take off once they
 * have looked a load over. The importers set it on everything they create
 * from now on; this sets it on what they created before.
 *
 * A signature can also be recorded from a verified signed copy uploaded to
 * the load (src/types/signatureRecord.ts) — mostly the BATS e-signed SAs and
 * dispatch sheets of those same loads. The dashboard's "Unsigned Agreements"
 * figure is a Firestore aggregation, and Firestore cannot ask "null or
 * absent", so `clientSignatureRecorded` / `carrierSignatureRecorded` must be
 * present on every order, as `false` until something is recorded. The same
 * reasoning, and the same shape, as scripts/backfill-signature-waived.js.
 *
 * Until this has run, the unsigned card's clauses on those fields match
 * nothing and the card reads 0 — so run it straight after the deploy.
 *
 * ## What it does not do
 *
 * - It never removes a label, and never puts one on a load that already
 *   carries the field either way: `false` there is somebody's decision.
 * - It writes `true` to a mirror only where a record already exists — in
 *   practice none, because the record is new.
 * - It leaves `updatedAt` alone. A derived field being filled in is not
 *   somebody editing the load.
 *
 * ## Usage
 *
 *   node scripts/backfill-record-import.js --dry-run   — report, write nothing
 *   node scripts/backfill-record-import.js             — apply
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
    // Strip a Windows CR before matching, or every value comes back undefined.
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

const BATCH_LIMIT = 500;
const PAGE = 400;

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — nothing will be written\n' : 'APPLYING\n');

  let cursor = null;
  let scanned = 0;
  const toWrite = [];
  const counts = { label: 0, clientFlag: 0, carrierFlag: 0, alreadyDone: 0 };

  for (;;) {
    let q = db.collection('orders').orderBy('__name__').limit(PAGE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned++;
      const d = doc.data();
      const patch = {};
      if (typeof d.recordImport !== 'boolean' && d.batsId) {
        patch.recordImport = true;
        counts.label++;
      }
      if (typeof d.clientSignatureRecorded !== 'boolean') {
        patch.clientSignatureRecorded = Boolean(d.clientSignatureRecord);
        counts.clientFlag++;
      }
      if (typeof d.carrierSignatureRecorded !== 'boolean') {
        patch.carrierSignatureRecorded = Boolean(d.carrierSignatureRecord);
        counts.carrierFlag++;
      }
      if (Object.keys(patch).length) toWrite.push({ ref: doc.ref, patch });
      else counts.alreadyDone++;
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }

  console.log(`Scanned:                                 ${scanned}`);
  console.log(`Already complete:                        ${counts.alreadyDone}`);
  console.log(`To label "Record import" (from BATS):    ${counts.label}`);
  console.log(`To get clientSignatureRecorded:          ${counts.clientFlag}`);
  console.log(`To get carrierSignatureRecorded:         ${counts.carrierFlag}`);
  console.log(`Orders to update:                        ${toWrite.length}`);

  if (!toWrite.length) { console.log('\nNothing to do.'); return; }
  if (DRY_RUN) { console.log('\nDry run — no writes made. Re-run without --dry-run to apply.'); return; }

  let written = 0;
  for (let i = 0; i < toWrite.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    // `update`, never `set`: this must not create a document.
    for (const { ref, patch } of toWrite.slice(i, i + BATCH_LIMIT)) batch.update(ref, patch);
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
