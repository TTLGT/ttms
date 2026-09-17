/**
 * Give every chat message and thread reply a `searchTerms` array — the words
 * it can be found by — so the chat search box can reach history written before
 * search existed.
 *
 * Why this is needed: Firestore cannot look inside a string, so searching is
 * an `array-contains` against a list of words worked out when the message is
 * saved. The app writes that list on every message from now on. Everything
 * said before this shipped has no such field, and **a Firestore query skips a
 * document that is missing the field entirely** rather than failing — so until
 * this has run, searching finds only what has been said since, and nothing
 * anywhere says why. That is the whole reason this script exists.
 *
 * A message that was taken back is given an empty list, deliberately: a
 * tombstone must not be findable by words it no longer shows.
 *
 * Safe to re-run: a message whose stored terms already match what its text
 * produces is skipped, so a second pass finds nothing to do. It only ever
 * writes `searchTerms` — `editedAt` and the conversation's `updatedAt` are
 * left alone, because this is a derived index field rather than an edit
 * anybody made, and touching either would reorder everyone's conversation list
 * and mark old messages as edited.
 *
 * Usage:
 *   node scripts/backfill-chat-search-terms.js --dry-run   — report only
 *   node scripts/backfill-chat-search-terms.js             — apply
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with chatSearchTerms() in src/types/conversation.ts.
 * A plain node script cannot import TypeScript, so the word list is built in
 * two places on purpose. If they disagree, a message written through the app
 * stops matching the search this script set up — and neither half fails
 * loudly.
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

/** Mirror of MIN_CHAT_TERM / MAX_CHAT_TERMS in src/types/conversation.ts. */
const MIN_CHAT_TERM  = 2;
const MAX_CHAT_TERMS = 600;

/** Mirror of chatSearchTerms() in src/types/conversation.ts. Keep identical. */
function chatSearchTerms(message) {
  const words = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= MIN_CHAT_TERM);

  const terms = new Set();
  for (const word of words(message.text))       terms.add(word);
  for (const word of words(message.senderName)) terms.add(word);
  for (const file of message.attachments || []) {
    for (const word of words(file && file.name)) terms.add(word);
  }
  return [...terms].slice(0, MAX_CHAT_TERMS);
}

/** Whether two term lists hold the same words. Order is not meaningful. */
function sameTerms(a, b) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const have = new Set(a);
  return b.every((t) => have.has(t));
}

/**
 * Walks one collection of messages and fixes what needs fixing.
 *
 * Committed in batches of 400 rather than one write per document: Firestore
 * allows 500 in a batch, and a room with four thousand messages in it would
 * otherwise be four thousand round trips.
 */
async function backfillCollection(ref, label, stats) {
  const snap = await ref.get();
  let batch = db.batch();
  let queued = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    stats.seen += 1;

    // A message that was taken back answers to nothing. Its text is already
    // gone; the words must go with it.
    const wanted = data.deletedAt ? [] : chatSearchTerms(data);

    if (sameTerms(data.searchTerms, wanted)) { stats.skipped += 1; continue; }

    stats.written += 1;
    if (stats.written <= 5) {
      const preview = String(data.text || '(no text)').slice(0, 60).replace(/\s+/g, ' ');
      console.log(`  ${label} ${docSnap.id}: ${wanted.length} terms — "${preview}"`);
    }

    if (DRY_RUN) continue;

    batch.update(docSnap.ref, { searchTerms: wanted });
    queued += 1;
    if (queued === 400) { await batch.commit(); batch = db.batch(); queued = 0; }
  }

  if (!DRY_RUN && queued > 0) await batch.commit();
}

async function main() {
  console.log(DRY_RUN ? 'Dry run — nothing will be written.\n' : 'Applying.\n');

  const conversations = await db.collection('conversations').get();
  const stats = { seen: 0, written: 0, skipped: 0 };

  for (const conversation of conversations.docs) {
    const name = conversation.data().name || conversation.id;
    const before = stats.written;

    await backfillCollection(conversation.ref.collection('messages'), 'message', stats);
    await backfillCollection(conversation.ref.collection('replies'),  'reply',   stats);

    if (stats.written > before) {
      console.log(`${name}: ${stats.written - before} to write`);
    }
  }

  console.log(`\n${stats.seen} messages and replies in ${conversations.size} conversations.`);
  console.log(`${stats.written} ${DRY_RUN ? 'would be written' : 'written'}, ${stats.skipped} already correct.`);
  if (DRY_RUN && stats.written > 0) {
    console.log('\nRun again without --dry-run to apply.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
