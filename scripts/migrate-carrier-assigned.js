/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Moves every order stored as `carrier_assigned` to `booked`.
 *
 * ## Why this exists
 *
 * Carrier Assigned stopped being a step on 2026-10-09. A carrier is found
 * whenever one is found — before the client signs or after — so the status
 * only ever said that somebody remembered to click it, and it sat between
 * Booked and Client Signed as if it were a stage the client's signature had
 * to wait for. The step after Booked is now Client Signed.
 *
 * The app already reads a stored `carrier_assigned` as Booked
 * (`displayStatus()` in src/types/order.ts) and refuses to write it again, so
 * nothing breaks while this has not run. What it fixes is everything that
 * filters on the stored string: the Orders tabs, the per-status counts, the
 * dashboard cards.
 *
 * ## What it writes
 *
 * For each order, in one batch with the order: `status: 'booked'`, and an
 * entry in the order's change log saying the status moved and why, so a
 * broker who remembers the load as Carrier Assigned can see what happened to
 * it. `updatedAt` is left alone — a status being renamed is not somebody
 * working the load, and bumping it would reorder every "recently changed" list.
 *
 * Nothing else on the order is touched. The carrier stays assigned; only the
 * label for where the load stands changes.
 *
 * ## Usage
 *
 *   node scripts/migrate-carrier-assigned.js --dry-run   — list them, write nothing
 *   node scripts/migrate-carrier-assigned.js             — apply
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
    // Strip a Windows CR first: `.` does not match it, and every value would
    // come back undefined.
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

/** Two writes per order (the order and its log entry), under the 500 limit. */
const ORDERS_PER_BATCH = 200;

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — nothing will be written\n' : 'APPLYING\n');

  // One equality filter: served by Firestore's automatic single-field index.
  const snap = await db.collection('orders').where('status', '==', 'carrier_assigned').get();

  console.log(`Orders stored as Carrier Assigned: ${snap.size}\n`);
  for (const doc of snap.docs) {
    const d = doc.data();
    const number = d.orderNumber || d.batsId || doc.id;
    const carrier = d.carrierName || '(no carrier)';
    console.log(`  ${String(number).padEnd(14)} ${String(d.clientName || '').slice(0, 30).padEnd(30)} ${carrier}`);
  }

  if (snap.empty) {
    console.log('Nothing to do.');
    return;
  }
  if (DRY_RUN) {
    console.log('\nDry run — no writes made. Re-run without --dry-run to move these to Booked.');
    return;
  }

  const now = Timestamp.now();
  let written = 0;
  for (let i = 0; i < snap.docs.length; i += ORDERS_PER_BATCH) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + ORDERS_PER_BATCH)) {
      batch.update(doc.ref, { status: 'booked' });
      // The shape writeChange() in src/lib/recordHistory.ts writes. No person
      // made this change, so it is signed by TTMS rather than left "Unknown".
      batch.set(doc.ref.collection('changes').doc(), {
        action:     'event',
        summary:    'Carrier Assigned is no longer a step, so this load moved to Booked. The carrier is still assigned; the next step is the client’s signature.',
        fields:     [{ field: 'status', from: 'carrier_assigned', to: 'booked' }],
        actorUid:   '',
        actorName:  'TTMS',
        actorEmail: '',
        via:        'app',
        at:         now,
      });
    }
    await batch.commit();
    written += Math.min(ORDERS_PER_BATCH, snap.docs.length - i);
    console.log(`  committed ${written}/${snap.size}`);
  }

  console.log(`\nDone. ${written} orders moved to Booked.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
