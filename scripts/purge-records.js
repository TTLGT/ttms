/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Clears the operational records — orders, parties and carriers — and can keep
 * a small, self-consistent sample to go on building against.
 *
 * ## Why this exists
 *
 * The operational records in this project came out of a BATS import, and BATS
 * is still the system of record for them. Roughly nine thousand of those loads
 * landed in `carrier_assigned` and were never advanced, so the dashboard counts
 * them as open forever — which is what made one card read ten thousand
 * documents on every mount and spend a day of Spark allowance in five views.
 *
 * Clearing them is not data loss while BATS holds the originals: the importer
 * can put back a current set whenever it is wanted. What this buys is a project
 * whose read cost matches the work actually being done in it, which is what
 * makes it safe to keep building against.
 *
 * ## Keeping a sample, and the shape the imported data actually has
 *
 * Measured on 2026-09-10, across the whole book of 10,377 orders:
 *
 *   every order carries a `clientId`
 *   two orders carry a `carrierId`
 *   two carry a `consigneeId`, one a `shipperId`
 *
 * The BATS import linked clients and nothing else. The 11,169 carriers are
 * real records but no order points at one, and `carrierName` is empty too — so
 * "twelve carriers and their orders" is not a set that exists here. There are
 * no related orders to keep. The two exceptions are the orders entered by hand
 * through the app, which are fully linked and are by far the most useful test
 * records in the project; those are kept unconditionally, whatever else is.
 *
 * So the sample is built in three parts, and only the first is a closure:
 *
 *   clients   the busiest by order count, and up to `--orders-per-client`
 *             of each one's loads. Kept orders pull in every party and
 *             carrier they name, so nothing survives pointing at a record
 *             that has gone — which is what makes it a closure. In practice
 *             that adds nothing on imported orders and everything on the
 *             hand-entered ones.
 *   carriers  chosen on their own, because nothing links them to an order.
 *             Preferring the ones carrying an `insuranceExpiration` so the
 *             dashboard card that watches for lapsing insurance has something
 *             to show.
 *   suborders any that hang off a kept order, and any parent a kept suborder
 *             hangs off. Particular to this app: a suborder carries its own
 *             carrier and BOL but takes its client from the parent, so one
 *             kept without its parent has no client at all.
 *
 * ## What it removes
 *
 *   orders                  and every `ownerEvents` entry under them
 *   parties                 and every `ownerEvents` entry under them
 *   carriers
 *   signing_tokens          each one names an order that will not exist
 *   orderAccessRequests     a loan against a load that is gone
 *   partyAccessRequests     the same, against a client that is gone
 *   conversations (record)  the `rec_order_*` rooms, with messages and replies
 *   Storage: bols/ invoices/ pods/ driver-licenses/
 *
 * Every one of those is meaningless without the record it points at. Leaving
 * any of them behind is worse than deleting it: a signing token whose order has
 * gone still validates, and `POST /api/sign/[token]` would write a signature
 * onto a document that is not there.
 *
 * ## What it deliberately leaves alone
 *
 *   allowedUsers users removedUsers   — people, and the only thing that grants
 *                                       access. Never touched here.
 *   teams workGroups sites            — reference data that outlives the records
 *   appSettings                       — the company's own configuration
 *   chatReads chatThreads             — per-person state, not per-record
 *   conversations (company/direct/group)
 *   profileUpdateRequests             — about people, not loads
 *   leadSources                       — reference data a re-import needs
 *   laneDistances                     — every one of these was paid for at the
 *                                       Google per-lookup rate. They are keyed
 *                                       by lane, not by order, so they stay
 *                                       useful and deleting them would mean
 *                                       buying them a second time.
 *   Storage: avatars/                 — people's photos, not order documents
 *
 * ## Usage
 *
 *   node scripts/purge-records.js --dry-run
 *   node scripts/purge-records.js --dry-run --keep-clients 12 --keep-carriers 12
 *   node scripts/purge-records.js --keep-clients 12 --keep-carriers 12 \
 *                                 --confirm DELETE-ALL-RECORDS
 *
 * With no `--keep-*` flag nothing is kept and the collections are emptied.
 *
 * `--scan N` (default 2000) is how many of the newest orders are read to work
 * out who the busiest clients and carriers are. Reading the whole book would
 * cost ten thousand reads to answer a question a recent sample answers just as
 * well, and the newest orders are the ones whose shape is worth testing against.
 *
 * ⚠️  .env.local points at the live project. There is no undo and no snapshot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM = process.argv[process.argv.indexOf('--confirm') + 1];
const TOKEN   = 'DELETE-ALL-RECORDS';

/** Reads a numeric flag, or a default when it is absent or not a number. */
function numArg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

const KEEP_CLIENTS      = numArg('--keep-clients', 0);
const KEEP_CARRIERS     = numArg('--keep-carriers', 0);
const ORDERS_PER_CLIENT = numArg('--orders-per-client', 10);
const SCAN              = numArg('--scan', 2000);
const SAMPLING          = KEEP_CLIENTS > 0 || KEEP_CARRIERS > 0;

/*
 * Deliberately not the house "--dry-run or apply" pattern.
 *
 * Every other script here rewrites a field and can be run again if it goes
 * wrong. This one cannot, so an argv typo must not be enough to fire it: the
 * apply path needs the token spelled out, and no argument at all does nothing.
 */
if (!DRY_RUN && CONFIRM !== TOKEN) {
  console.error(
    'Refusing to run.\n\n' +
    '  Survey:  node scripts/purge-records.js --dry-run\n' +
    `  Apply:   node scripts/purge-records.js --confirm ${TOKEN}\n`,
  );
  process.exit(1);
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
const { getFirestore }                 = require('firebase-admin/firestore');
const { getStorage }                   = require('firebase-admin/storage');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}
const db = getFirestore();

/** Storage prefixes tied to an order. `avatars/` is not one, and is absent on purpose. */
const PURGE_PREFIXES = ['bols/', 'invoices/', 'pods/', 'driver-licenses/'];

/** Read and delete in pages so a ten-thousand-order book does not arrive at once. */
const PAGE = 300;

/** How many documents are deleted at the same time. See purgeCollection. */
const CONCURRENCY = numArg('--concurrency', 25);

const str = (v) => (typeof v === 'string' ? v : '');

/* ------------------------------------------------------------------ sample */

/**
 * Works out what to keep, as four sets of ids with no dangling reference
 * between them.
 *
 * Returns null when no `--keep-*` flag was given, which the callers read as
 * "keep nothing" rather than "keep everything" — an empty set and an absent one
 * would otherwise be the same value with opposite meanings.
 */
async function buildKeepSet() {
  if (!SAMPLING) return null;

  // Newest first: a recent order is the shape worth testing against, and a
  // BATS record from years ago is not. `select()` cuts what crosses the wire —
  // it does not cut the read count, which is why the scan is capped at all.
  const snap = await db.collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(SCAN)
    .select('clientId', 'carrierId', 'shipperId', 'consigneeId', 'parentOrderId')
    .get();

  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Busiest first, so the sample has clients with a handful of loads each
  // rather than twelve clients holding one order between them.
  const counts = new Map();
  for (const r of rows) {
    const v = str(r.clientId);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const clients = new Set(
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, KEEP_CLIENTS).map(([id]) => id),
  );

  /*
   * An order survives on its client, and only so many per client.
   *
   * Without the cap the twelve busiest clients bring several hundred loads with
   * them, which is a volume the project has no use for and which puts the
   * dashboard back to reading hundreds of documents a mount. Ten each is enough
   * to see a list paginate and a filter do something.
   */
  const perClient = new Map();
  const orders = new Set();
  for (const r of rows) {
    const client = str(r.clientId);
    if (!clients.has(client)) continue;
    const taken = perClient.get(client) ?? 0;
    if (taken >= ORDERS_PER_CLIENT) continue;
    perClient.set(client, taken + 1);
    orders.add(r.id);
  }

  /*
   * The hand-entered orders, kept whatever the sampling decided.
   *
   * These are the only orders in the project that carry a carrier, a shipper
   * and a consignee — the import linked none of them — so they are the only
   * records that exercise the full model end to end. Losing them to an
   * arbitrary cut-off would leave a test set that cannot test very much.
   */
  for (const r of rows) {
    if (str(r.carrierId) || str(r.shipperId) || str(r.consigneeId)) orders.add(r.id);
  }

  // A suborder takes its client from its parent, so it never matches on its own
  // merits and has to be pulled in by the parent it hangs off — and vice versa.
  // Read from the scanned rows rather than a fresh query: a suborder is created
  // alongside its parent, so both sit inside the same recent window.
  for (const r of rows) {
    const parent = str(r.parentOrderId);
    if (parent && orders.has(parent)) orders.add(r.id);
  }
  for (const r of rows) {
    const parent = str(r.parentOrderId);
    if (parent && orders.has(r.id)) orders.add(parent);
  }

  // The closure. Every party and carrier named by a surviving order is kept,
  // whether or not it was one of the twelve — this is the step that stops a
  // kept order pointing at a shipper that has been deleted.
  const parties  = new Set(clients);
  const carriers = new Set();
  for (const r of rows) {
    if (!orders.has(r.id)) continue;
    for (const f of ['clientId', 'shipperId', 'consigneeId']) {
      if (str(r[f])) parties.add(str(r[f]));
    }
    if (str(r.carrierId)) carriers.add(str(r.carrierId));
  }

  /*
   * Carriers are chosen on their own, because nothing links them to an order.
   *
   * Ordered by `insuranceExpiration` to put the ones with a real date first —
   * the dashboard counts carriers whose insurance is lapsing, and a sample
   * with none leaves that card permanently empty and untestable.
   *
   * On the BATS data that ordering buys nothing, and it is worth knowing why
   * rather than assuming it worked: `importCarriers()` writes
   * `insuranceExpiration: null` on every row, because the carriers export has
   * no insurance column. Firestore treats null as a value and sorts it first,
   * so this returns twelve carriers with no date rather than refusing to match
   * — the lapsing-insurance card stays empty until somebody fills a date in by
   * hand. The ordering is kept anyway: it costs nothing and starts doing what
   * it says the moment any carrier has a real expiry.
   */
  if (carriers.size < KEEP_CARRIERS) {
    const withInsurance = await db.collection('carriers')
      .orderBy('insuranceExpiration', 'asc')
      .limit(KEEP_CARRIERS * 2)
      .select('companyName')
      .get();
    for (const d of withInsurance.docs) {
      if (carriers.size >= KEEP_CARRIERS) break;
      carriers.add(d.id);
    }
  }
  if (carriers.size < KEEP_CARRIERS) {
    // Nothing carried an expiry date. Any carrier is better than none.
    const any = await db.collection('carriers')
      .orderBy('__name__').limit(KEEP_CARRIERS * 2).select('companyName').get();
    for (const d of any.docs) {
      if (carriers.size >= KEEP_CARRIERS) break;
      carriers.add(d.id);
    }
  }

  return { orders, parties, carriers, clients, scanned: rows.length };
}

/* ------------------------------------------------------------------ survey */

/** Counts a collection, minus whatever the keep set spares. */
async function countCollection(name, keep) {
  const total = (await db.collection(name).count().get()).data().count;
  const kept  = keep ? keep.size : 0;
  return { total, kept, deleting: Math.max(0, total - kept) };
}

async function survey(keepSet) {
  console.log('DRY RUN — nothing will be deleted\n');
  console.log(`Project: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}\n`);

  if (keepSet) {
    console.log(`Sample: scanned the ${keepSet.scanned} newest orders.`);
    console.log(`  ${String(keepSet.clients.size).padStart(5)} clients kept (asked for ${KEEP_CLIENTS})`);
    console.log(`  ${String(keepSet.carriers.size).padStart(5)} carriers kept (ceiling ${KEEP_CARRIERS})`);
    console.log(`  ${String(keepSet.orders.size).padStart(5)} orders kept`);
    console.log(`  ${String(keepSet.parties.size).padStart(5)} parties kept — the ${keepSet.clients.size} clients`);
    console.log('        plus the shippers and consignees those orders name\n');
  } else {
    console.log('No --keep-* flag: every record will be removed.\n');
  }

  const plan = [
    ['orders',   keepSet && keepSet.orders],
    ['parties',  keepSet && keepSet.parties],
    ['carriers', keepSet && keepSet.carriers],
  ];

  console.log('Firestore                  total     keep   delete');
  let deleting = 0;
  for (const [name, keep] of plan) {
    const c = await countCollection(name, keep);
    deleting += c.deleting;
    console.log(
      `  ${name.padEnd(22)} ${String(c.total).padStart(6)}` +
      `   ${String(c.kept).padStart(6)}   ${String(c.deleting).padStart(6)}`,
    );
  }

  // These follow their record rather than being sampled, so they are reported
  // as totals: whatever survives does so because the order it names survived.
  for (const name of ['signing_tokens', 'orderAccessRequests', 'partyAccessRequests']) {
    const n = (await db.collection(name).count().get()).data().count;
    console.log(`  ${name.padEnd(22)} ${String(n).padStart(6)}        —   follows its record`);
  }
  const rooms = (await db.collection('conversations')
    .where('kind', '==', 'record').count().get()).data().count;
  console.log(`  ${'conversations (record)'.padEnd(22)} ${String(rooms).padStart(6)}        —   follows its order`);

  console.log(`\n  roughly ${deleting} documents to delete, plus their ownerEvents.`);

  console.log('\nStorage');
  const bucket = getStorage().bucket();
  for (const prefix of PURGE_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix });
    console.log(`  ${prefix.padEnd(22)} ${String(files.length).padStart(6)} file(s)`);
  }

  console.log('\nLeft alone: allowedUsers, users, removedUsers, teams, workGroups,');
  console.log('sites, appSettings, chatReads, chatThreads, leadSources, laneDistances,');
  console.log('profileUpdateRequests, company/direct/group conversations, avatars/.');

  const flags = SAMPLING ? `--keep-clients ${KEEP_CLIENTS} --keep-carriers ${KEEP_CARRIERS} ` : '';
  console.log(`\nTo apply:  node scripts/purge-records.js ${flags}--confirm ${TOKEN}`);
}

/* ------------------------------------------------------------------- apply */

/**
 * Empties one collection, a page at a time, sparing anything in `keep`.
 *
 * `recursiveDelete` per document rather than a plain delete: `orders` and
 * `parties` carry an `ownerEvents` subcollection, and deleting the parent on
 * its own leaves those orphaned and unreachable — still stored, still billed,
 * and invisible to every query that might have found them again.
 *
 * Paging past what is kept rather than restarting each time: with a keep set,
 * the first page would otherwise come back full of the same spared documents
 * for ever and the loop would not end.
 */
async function purgeCollection(name, keep, decide) {
  let removed = 0;
  let spared  = 0;
  let cursor  = null;

  for (;;) {
    // Ordered by document id: the only field guaranteed present on every
    // document, and stable while the collection is emptied underneath.
    let q = db.collection(name).orderBy('__name__').limit(PAGE);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;
    cursor = snap.docs[snap.docs.length - 1];

    const doomed = [];
    for (const doc of snap.docs) {
      if (decide ? decide(doc) : (keep && keep.has(doc.id))) { spared++; continue; }
      doomed.push(doc.ref);
    }

    /*
     * Deleted a slice at a time rather than one after another.
     *
     * `recursiveDelete` is a round trip per document, and awaiting each in turn
     * puts thirty thousand of them end to end — an hour of latency to do a few
     * minutes of work. The slice width is what keeps that from becoming a
     * thundering herd: Firestore will start refusing writes if this is turned
     * up much further, and a purge that trips its own rate limit is slower than
     * one that never did.
     */
    for (let i = 0; i < doomed.length; i += CONCURRENCY) {
      await Promise.all(
        doomed.slice(i, i + CONCURRENCY).map((ref) => db.recursiveDelete(ref)),
      );
      removed += Math.min(CONCURRENCY, doomed.length - i);
      process.stdout.write(`\r  ${name}: ${removed} removed`);
    }
  }

  process.stdout.write(
    `\r  ${name.padEnd(22)} ${String(removed).padStart(6)} removed` +
    `${spared ? `, ${spared} kept` : ''}          \n`,
  );
  return removed;
}

async function main() {
  const keepSet = await buildKeepSet();
  if (DRY_RUN) return survey(keepSet);

  console.log(`APPLYING — deleting records from ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}\n`);
  if (keepSet) {
    console.log(
      `Keeping ${keepSet.orders.size} orders, ${keepSet.parties.size} parties, ` +
      `${keepSet.carriers.size} carriers.\n`,
    );
  }
  console.log('Firestore');

  const keptOrders = keepSet ? keepSet.orders : new Set();
  let total = 0;

  total += await purgeCollection('orders',   keepSet && keepSet.orders);
  total += await purgeCollection('parties',  keepSet && keepSet.parties);
  total += await purgeCollection('carriers', keepSet && keepSet.carriers);

  // The three below hang off an order or a party by a field rather than by id,
  // so each is spared on the record it names rather than on its own id.
  total += await purgeCollection('signing_tokens', null,
    (d) => keptOrders.has(str(d.data().orderId)));
  total += await purgeCollection('orderAccessRequests', null,
    (d) => keptOrders.has(str(d.data().orderId)));
  total += await purgeCollection('partyAccessRequests', null,
    (d) => keepSet ? keepSet.parties.has(str(d.data().partyId)) : false);

  // A record room's id is `rec_order_{orderId}` (see recordConversationId), so
  // the order it belongs to is read off the id rather than a field.
  total += await purgeCollection('conversations', null, (d) => {
    if (d.data().kind !== 'record') return true;            // spare direct/group/company
    return keptOrders.has(d.id.replace(/^rec_order_/, ''));
  });

  console.log('\nStorage');
  const bucket = getStorage().bucket();
  for (const prefix of PURGE_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix });
    let gone = 0;
    for (const file of files) {
      // Every one of these paths starts with the order id — `bols/{id}.pdf`,
      // `driver-licenses/{id}/{file}` — so the owning order comes off the name.
      const rest    = file.name.slice(prefix.length);
      const orderId = rest.split('/')[0].replace(/\.pdf$/i, '');
      if (keptOrders.has(orderId)) continue;
      await file.delete().catch(() => {});
      gone++;
    }
    console.log(`  ${prefix.padEnd(22)} ${String(gone).padStart(6)} file(s) removed`);
  }

  console.log(`\nDone. ${total} top-level document(s) removed, plus their subcollections.`);
  console.log('People, settings and reference data were not touched.');
}

main().catch((err) => {
  /*
   * The failure this is most likely to hit, and the one worth naming.
   *
   * Deleting ten thousand orders spends ten thousand deletes, and Spark allows
   * twenty thousand a day. A run that stops here has still deleted everything
   * it reported up to that point — the script holds no state of its own, so
   * running it again continues from whatever is left. Pass the same `--keep-*`
   * flags on the second run: the sample is recomputed from the orders that are
   * still there, and without them the kept records would be deleted too.
   */
  if (String(err && err.code) === '8' || /RESOURCE_EXHAUSTED|Quota/i.test(String(err && err.message))) {
    console.error('\nStopped: the project is out of daily Firestore quota.');
    console.error('What was reported as deleted above is gone for good. Run this again');
    console.error('after midnight Pacific WITH THE SAME --keep-* FLAGS to continue.');
    process.exit(2);
  }
  console.error(err);
  process.exit(1);
});
