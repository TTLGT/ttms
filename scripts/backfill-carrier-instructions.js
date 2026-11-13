/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Gives older orders the standard carrier special instructions.
 *
 * New orders start with DEFAULT_CARRIER_INSTRUCTIONS in the carrier box (see
 * src/components/orders/NotesAndInstructionsFields.tsx). This fills the same
 * text into orders saved before that, where the box is still empty.
 *
 * ## What it leaves alone
 *
 * - Orders that already have carrier instructions. Somebody wrote those.
 * - Delivered, completed and cancelled loads. Nothing more will be printed for
 *   the carrier, so there is nothing to gain.
 * - Orders with a Dispatch Sheet link that is still live (sent or signed, not
 *   revoked or replaced). The carrier instructions are part of the sheet's
 *   fingerprint (carrierSectionHashes), so changing them would hold the sheet
 *   and ask the carrier to sign again. A broker can still add the text by hand
 *   with the "Add the standard text" link on the edit page.
 *
 * It does not touch `updatedAt`: filling in a default is not somebody editing
 * the load.
 *
 * ## Usage
 *
 *   node scripts/backfill-carrier-instructions.js --dry-run   — report, write nothing
 *   node scripts/backfill-carrier-instructions.js             — apply
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

/** Keep in step with DEFAULT_CARRIER_INSTRUCTIONS in NotesAndInstructionsFields.tsx. */
const DEFAULT_CARRIER_INSTRUCTIONS =
  'We need pictures of the unit at the pickup location to avoid any damage liability from the carrier. '
  + 'Any damages will be disputed by the customer. To process payment efficiently, please email the following '
  + 'to accounting@totaltransportlogistics.us: the invoice, BOL per load, W9, and payment method information. '
  + 'Payments will not be processed if any of the paperwork and information is missing. '
  + 'DO NOT DELIVER UNTIL THE BROKER CONFIRMS CUSTOMER PAID IN FULL. (918) 510-6747';

/** Loads still ahead of delivery. Read only these, to spare the daily read quota. */
const OPEN_STATUSES = ['quote', 'booked', 'carrier_assigned', 'carrier_signed', 'shipper_signed', 'in_transit'];

const BATCH_LIMIT = 500;

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — nothing will be written\n' : 'APPLYING\n');

  // Orders with a live Dispatch Sheet link: one equality filter, no index needed.
  const links = await db.collection('signing_tokens').where('type', '==', 'carrier_agreement').get();
  const liveSheet = new Set(
    links.docs.map((d) => d.data()).filter((t) => !t.revokedAt && !t.replacedAt).map((t) => t.orderId),
  );

  const snap = await db.collection('orders').where('status', 'in', OPEN_STATUSES).get();

  let hasText = 0, sheetOut = 0;
  const toWrite = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (String(data.carrierInstructions ?? '').trim()) { hasText++; continue; }
    if (liveSheet.has(doc.id)) { sheetOut++; continue; }
    toWrite.push({ ref: doc.ref, label: data.orderNumber || doc.id, status: data.status });
  }

  console.log(`Open orders scanned:                    ${snap.size}`);
  console.log(`Already have carrier instructions:      ${hasText}`);
  console.log(`Skipped, Dispatch Sheet already out:    ${sheetOut}`);
  console.log(`To fill with the standard text:         ${toWrite.length}`);
  for (const w of toWrite) console.log(`  ${w.label}  (${w.status})`);

  if (!toWrite.length) { console.log('\nNothing to do.'); return; }
  if (DRY_RUN) { console.log('\nDry run — no writes made. Re-run without --dry-run to apply.'); return; }

  let written = 0;
  for (let i = 0; i < toWrite.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { ref } of toWrite.slice(i, i + BATCH_LIMIT)) {
      batch.update(ref, { carrierInstructions: DEFAULT_CARRIER_INSTRUCTIONS });
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
