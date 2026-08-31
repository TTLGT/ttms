/**
 * Give every order the fragments the Orders search box looks it up by.
 *
 * Firestore cannot search for text inside a field — there is no `LIKE
 * '%morris%'` — so each order stores a list of the fragments it should answer
 * to, and the search runs as a single `array-contains` lookup. That stays fast
 * at any size, which the old approach (download everything, filter in the
 * browser) did not.
 *
 * Until this has run, the Orders search box finds nothing: the field it queries
 * does not exist yet. Browsing and the status tabs work either way.
 *
 * Safe to re-run: an order whose stored fragments already match what its
 * current values produce is skipped, so a second pass finds nothing to do. It
 * writes `searchTerms` and nothing else — `updatedAt` is deliberately left
 * alone, since this is a derived index field rather than an edit anybody made,
 * and touching it would reorder "recently changed".
 *
 * Usage:
 *   node scripts/backfill-order-search-terms.js --dry-run   — report only
 *   node scripts/backfill-order-search-terms.js             — apply
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with orderSearchTerms() and searchWords() in
 * src/types/order.ts. A plain node script cannot import TypeScript, so the rule
 * lives in two places on purpose. If they disagree, an order saved through the
 * app stops matching the search this script set up — and nothing will fail
 * loudly, it will just quietly not be found.
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

// ── Mirror of src/types/order.ts ────────────────────────────────────────────
const MIN_TERM = 2;
const MAX_TERM = 12;
const MAX_TERMS = 400;

function searchWords(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function prefixesOf(word) {
  const out = [];
  const limit = Math.min(word.length, MAX_TERM);
  for (let n = Math.min(MIN_TERM, word.length); n <= limit; n++) out.push(word.slice(0, n));
  return out;
}

function segmentsOf(word) {
  const out = [];
  for (let i = 0; i < word.length; i++) {
    for (let n = MIN_TERM; n <= Math.min(word.length - i, MAX_TERM); n++) {
      out.push(word.substr(i, n));
    }
  }
  return out.length ? out : [word];
}

function orderSearchTerms(order) {
  const addr = (a) => [(a && a.city) || '', (a && a.state) || ''];
  const numbers = [order.orderNumber, order.batsId, order.previousOrderNumber]
    .map((v) => String(v || ''));
  const text = [order.shipperName, order.clientName, order.consigneeName,
                order.carrierName, order.commodity,
                ...addr(order.origin), ...addr(order.destination)]
    .map((v) => String(v || ''));

  const terms = new Set();
  const add = (values, fragments) => {
    for (const value of values) {
      for (const word of searchWords(value)) {
        for (const fragment of fragments(word)) terms.add(fragment);
        if (terms.size > MAX_TERMS) return;
      }
    }
  };
  add(numbers, segmentsOf);
  add(text, prefixesOf);
  return [...terms].slice(0, MAX_TERMS);
}

// ── end mirror ──────────────────────────────────────────────────────────────

function same(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

const BATCH = 400;

async function main() {
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const snap = await db.collection('orders').get();
  console.log('Orders scanned:       ' + snap.size);

  const writes = [];
  let already = 0;
  let termTotal = 0;
  let widest = { number: '', count: 0 };

  for (const doc of snap.docs) {
    const data  = doc.data();
    const terms = orderSearchTerms(data);
    termTotal += terms.length;
    if (terms.length > widest.count) {
      widest = { number: data.orderNumber || doc.id, count: terms.length };
    }
    if (same(data.searchTerms, terms)) { already++; continue; }
    writes.push({ id: doc.id, terms, label: data.orderNumber || doc.id });
  }

  console.log('  already correct:    ' + already);
  console.log('  to write:           ' + writes.length);
  console.log('  average fragments:  ' + Math.round(termTotal / Math.max(snap.size, 1)) + ' per order');
  console.log('  most on one order:  ' + widest.count + '  (' + widest.number + ')');

  if (DRY_RUN) {
    console.log('\nSample — what these orders would become findable by:');
    for (const w of writes.slice(0, 5)) {
      console.log('  ' + String(w.label).padEnd(14) + w.terms.slice(0, 14).join(' ') + ' …');
    }
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  let done = 0;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) {
      batch.update(db.collection('orders').doc(w.id), { searchTerms: w.terms });
    }
    await batch.commit();
    done += Math.min(BATCH, writes.length - i);
    console.log('  written ' + done + ' / ' + writes.length);
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
