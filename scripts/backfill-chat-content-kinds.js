/**
 * Give every chat message and thread reply a `contentKinds` array — what it is
 * carrying — so the Files panel in a conversation's settings can reach the
 * photos, documents and links sent before that panel existed.
 *
 * Why this is needed: Firestore cannot ask whether an array is non-empty or
 * whether a string holds a link, so "every photo in this room" is an
 * `array-contains` against a list worked out when the message is saved. The app
 * writes it on every message from now on. Everything sent before this shipped
 * has no such field, and **a Firestore query skips a document that is missing
 * the field entirely** rather than failing — so until this has run the panel
 * shows only what has been sent since, and nothing anywhere says why. That is
 * the whole reason this script exists.
 *
 * A message that was taken back is filed as carrying nothing, deliberately: a
 * photo somebody removed must not go on hanging in a panel the whole room can
 * open.
 *
 * A message carrying neither a file nor a link is left untouched rather than
 * written with an empty list — an absent field and an empty one both never
 * match an `array-contains`, and most of a room is ordinary talk.
 *
 * Safe to re-run: a message whose stored list already matches what its content
 * produces is skipped, so a second pass finds nothing to do. It only ever
 * writes `contentKinds` — `editedAt` and the conversation's `updatedAt` are
 * left alone, because this is a derived index field rather than an edit
 * anybody made, and touching either would reorder everyone's conversation list
 * and mark old messages as edited.
 *
 * Usage:
 *   node scripts/backfill-chat-content-kinds.js --dry-run   — report only
 *   node scripts/backfill-chat-content-kinds.js             — apply
 *
 * ───────────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with contentKindsFor() and linksIn() in
 * src/types/conversation.ts. A plain node script cannot import TypeScript, so
 * the two live in two places on purpose. If they disagree, a file sent through
 * the app stops appearing in the panel this script set up — and neither half
 * fails loudly.
 * ───────────────────────────────────────────────────────────────────────────────────
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

/** Mirror of linksIn() in src/types/conversation.ts. Keep identical. */
function linksIn(text) {
  const found = String(text || '').match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || [];
  const out = [];
  for (const raw of found) {
    const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, '');
    if (!trimmed) continue;
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/** Mirror of contentKindsFor() in src/types/conversation.ts. Keep identical. */
function contentKindsFor(message) {
  const kinds = new Set();
  for (const file of message.attachments || []) {
    kinds.add(file && file.isImage ? 'media' : 'doc');
  }
  if (linksIn(message.text).length > 0) kinds.add('link');
  return [...kinds];
}

/** Whether two lists hold the same kinds. Order is not meaningful. */
function sameKinds(a, b) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const have = new Set(a);
  return b.every((k) => have.has(k));
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

    // A message that was taken back is carrying nothing any more, whatever is
    // still stored on it.
    const wanted = data.deletedAt ? [] : contentKindsFor(data);

    // An absent field and an empty list are the same thing to an
    // `array-contains` — both never match — so a message carrying neither a
    // file nor a link is left alone rather than written to. That is most of a
    // room, and writing `[]` over all of it would be thousands of writes to
    // say nothing. It also makes a second run report nothing to do.
    const nothingToFile = wanted.length === 0 && data.contentKinds === undefined;

    if (nothingToFile || sameKinds(data.contentKinds, wanted)) {
      stats.skipped += 1;
      continue;
    }

    stats.written += 1;
    if (stats.written <= 5) {
      const preview = String(data.text || '(no text)').slice(0, 60).replace(/\s+/g, ' ');
      console.log(`  ${label} ${docSnap.id}: [${wanted.join(', ') || 'nothing'}] — "${preview}"`);
    }

    if (DRY_RUN) continue;

    batch.update(docSnap.ref, { contentKinds: wanted });
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
