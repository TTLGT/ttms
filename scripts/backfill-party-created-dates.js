/**
 * Give each migrated party the date the client was actually won.
 *
 * migrate-parties.js stamped every party it created with the moment it ran, so
 * the whole book of business looks as though it arrived on one day. That is
 * harmless as a record but wrong as a number: the dashboard's "New Clients This
 * Month" reads the createdAt of a party, and it would report seven thousand new
 * clients for the month the migration happened, then nothing the month after.
 *
 * The real date survived the original import as `batsCreatedAt` on the customer
 * row, so it can be put back. Where several customers collapsed onto one party
 * — the migration keys on the normalized name, so "Acme Corp." and "ACME
 * Corporation" are one record — the EARLIEST date wins, because that is when
 * the relationship started.
 *
 * Only touches parties whose createdAt is later than the date being restored,
 * so it cannot drag a genuinely new client backwards, and a second pass finds
 * nothing to do.
 *
 * Usage:
 *   node scripts/backfill-party-created-dates.js --dry-run   — report only
 *   node scripts/backfill-party-created-dates.js             — apply
 *
 * The party id is a hash of the normalized name. Rather than copy that rule a
 * fourth time, this script lifts it out of migrate-parties.js at runtime — see
 * loadNameKeyFrom below for why.
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

/*
  The name key is READ OUT OF migrate-parties.js rather than copied here.

  Every party id in the database is a hash of that function's output, so a
  copy that drifted by a single character would hash to an id matching no
  party, and this script would silently skip the very records it exists to
  correct. Nothing would fail; the dates would just stay wrong. (Writing it
  out by hand once already lost the word boundaries in the suffix rules,
  which quietly turned suffix canonicalisation off.)

  Lifting the source text makes drift impossible. It is an unusual thing to
  do, and it is the right trade for a one-off correction whose entire job is
  matching ids another script generated.
*/
function loadNameKeyFrom(scriptPath) {
  const src   = fs.readFileSync(scriptPath, 'utf8');
  const from  = src.indexOf('const SUFFIX_CANON = [');
  const to    = src.indexOf('// \u2500\u2500 Location parsing');
  if (from === -1 || to === -1 || to < from) {
    throw new Error(
      'Could not find the name-key block in migrate-parties.js — it has been ' +
      'moved or renamed. Check that this script still lifts the right code.',
    );
  }
  // `crypto` is passed in rather than required inside: the lifted block uses it
  // to hash the key, and a bare `new Function` body has no module scope.
  return new Function('crypto', src.slice(from, to) + ';return { toNameKey, partyDocId };')(
    require('crypto'),
  );
}

const { toNameKey, partyDocId } = loadNameKeyFrom(
  path.join(__dirname, 'migrate-parties.js'),
);

function partyIdFor(name) {
  const key = toNameKey(name);
  return key ? partyDocId(key) : null;
}

const BATCH = 400;

async function main() {
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  // Earliest BATS date per party id.
  const earliest = new Map();
  const customers = await db.collection('customers').get();
  let noDate = 0, noName = 0;

  for (const doc of customers.docs) {
    const c = doc.data();
    const name = (c.company || '').trim() || (c.name || '').trim();
    const id   = partyIdFor(name);
    if (!id) { noName++; continue; }

    const at = c.batsCreatedAt;
    if (!at || typeof at.toMillis !== 'function') { noDate++; continue; }

    const prior = earliest.get(id);
    if (!prior || at.toMillis() < prior.toMillis()) earliest.set(id, at);
  }

  console.log('Customers scanned:      ' + customers.size);
  console.log('  no usable name:       ' + noName);
  console.log('  no BATS created date: ' + noDate);
  console.log('  distinct parties:     ' + earliest.size);

  /*
    Not every party came from a customer row. The migration also created one for
    each client named on an order, and those have no customer record and so no
    BATS created date. Their first load is the next best evidence of when the
    relationship started — better, certainly, than the day the migration ran.
  */
  const orders = await db.collection('orders').select('clientId', 'createdAt').get();
  let fromOrders = 0;
  for (const doc of orders.docs) {
    const { clientId, createdAt } = doc.data();
    if (!clientId || !createdAt || typeof createdAt.toMillis !== 'function') continue;
    // Customer dates win: a client can have been on the books long before the
    // first load that survived into this system.
    const prior = earliest.get(clientId);
    if (!prior) { earliest.set(clientId, createdAt); fromOrders++; continue; }
    if (createdAt.toMillis() < prior.toMillis()) earliest.set(clientId, createdAt);
  }
  console.log('  dated from first load:' + String(fromOrders).padStart(7)
    + '  (parties with no customer row)');

  // Only rewrite where the stored date is later than the real one.
  const parties = await db.collection('parties').get();
  const writes = [];
  let missing = 0, alreadyOlder = 0;

  for (const doc of parties.docs) {
    const want = earliest.get(doc.id);
    if (!want) { missing++; continue; }
    const have = doc.data().createdAt;
    if (have && typeof have.toMillis === 'function' && have.toMillis() <= want.toMillis()) {
      alreadyOlder++;
      continue;
    }
    writes.push({ id: doc.id, name: doc.data().companyName, at: want, was: have });
  }

  console.log('');
  console.log('Parties scanned:        ' + parties.size);
  console.log('  no matching customer: ' + missing + '  (left alone)');
  console.log('  already correct:      ' + alreadyOlder);
  console.log('  to correct:           ' + writes.length);

  if (writes.length) {
    const years = {};
    writes.forEach((w) => {
      const y = w.at.toDate().getFullYear();
      years[y] = (years[y] || 0) + 1;
    });
    console.log('  restored by year:     ' + JSON.stringify(years));
  }

  if (DRY_RUN) {
    console.log('\nSample of what would change:');
    for (const w of writes.slice(0, 10)) {
      const from = w.was && w.was.toDate ? w.was.toDate().toISOString().slice(0, 10) : '(none)';
      console.log('  ' + String(w.name).slice(0, 34).padEnd(36) +
        from + '  ->  ' + w.at.toDate().toISOString().slice(0, 10));
    }
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  let done = 0;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) {
      batch.update(db.collection('parties').doc(w.id), { createdAt: w.at });
    }
    await batch.commit();
    done += Math.min(BATCH, writes.length - i);
    console.log('  written ' + done + ' / ' + writes.length);
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
