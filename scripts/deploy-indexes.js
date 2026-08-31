/**
 * Create the Firestore composite indexes listed in firestore.indexes.json.
 *
 * Why this exists: the paginated list screens ask Firestore questions it can
 * only answer with a composite index, and an index that does not exist is not a
 * slow query — it is a failed one. Before this, the only route was clicking the
 * link out of each error message in turn, sixteen times, with nothing in the
 * repository recording what was created or why.
 *
 * This is the sibling of deploy-rules.js and works the same way: the
 * service-account credential in .env.local already carries the cloud-platform
 * scope the Firestore Admin API checks.
 *
 * Creating an index is additive and reversible. It writes no documents and
 * changes no data; it costs storage, and it takes a few minutes to build over a
 * collection this size, during which the queries that need it still fail.
 *
 * Safe to re-run: existing indexes are listed first and matching ones skipped,
 * so a second pass reports "already present" and does nothing.
 *
 * Usage:
 *   node scripts/deploy-indexes.js --dry-run   — report what is missing
 *   node scripts/deploy-indexes.js             — create the missing ones
 *   node scripts/deploy-indexes.js --list      — show what already exists
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const LIST    = process.argv.includes('--list');

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

const { cert } = require('firebase-admin/app');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const BASE = 'https://firestore.googleapis.com/v1';
const PARENT = `projects/${projectId}/databases/(default)`;

const credential = cert({
  projectId,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey:  (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
});

let cachedToken = null;
async function accessToken() {
  if (!cachedToken) cachedToken = (await credential.getAccessToken()).access_token;
  return cachedToken;
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body.error && body.error.message) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * A comparable form of one index: the collection, then each field and its
 * direction, in order. Order matters — the same fields sorted differently are
 * a different index and answer different queries.
 *
 * `__name__` is dropped before comparing. Firestore appends it implicitly and
 * reports it back on every index it returns, so leaving it in would make every
 * existing index look different from the one asked for and the script would
 * try to create them all a second time.
 */
function signature(collectionGroup, fields) {
  const parts = fields
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath}:${f.order || (f.arrayConfig ? 'ARRAY' : '?')}`);
  return `${collectionGroup}|${parts.join(',')}`;
}

/**
 * Every composite index on the database, keyed by signature.
 *
 * Asked for once, with `-` as the collection group. The API ignores the
 * collection in that path and returns the whole database's indexes whatever is
 * put there — asking per collection returns the same full list each time, so
 * the group an index belongs to has to be read out of its resource name rather
 * than assumed from the URL it came back on. Getting that wrong labels every
 * index with whichever collection was asked about last, which is how a chat
 * index came to be reported as belonging to `carriers`.
 */
async function existingIndexes() {
  const found = new Map();
  const url = `${BASE}/${PARENT}/collectionGroups/-/indexes`;
  let page = await api(url);
  for (;;) {
    for (const ix of page.indexes || []) {
      const group = ix.name.split('/collectionGroups/')[1].split('/')[0];
      found.set(signature(group, ix.fields || []), { ...ix, collectionGroup: group });
    }
    if (!page.nextPageToken) break;
    page = await api(`${url}?pageToken=${encodeURIComponent(page.nextPageToken)}`);
  }
  return found;
}

function describe(ix) {
  return ix.fields.map((f) => {
    // An array field is indexed for containment, not sorted — printing it as
    // "asc" alongside the sorted ones reads as a direction it does not have.
    if (f.arrayConfig) return `${f.fieldPath} [array]`;
    return `${f.fieldPath} ${f.order === 'DESCENDING' ? 'desc' : 'asc'}`;
  }).join(', ');
}

async function main() {
  if (!projectId) {
    console.error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set — is .env.local present?');
    process.exit(1);
  }

  const file = path.join(__dirname, '..', 'firestore.indexes.json');
  const wanted = JSON.parse(fs.readFileSync(file, 'utf8')).indexes || [];
  console.log(`Project ${projectId}\n`);
  const have = await existingIndexes();

  if (LIST) {
    console.log(`${have.size} composite index(es) on the database:\n`);
    for (const ix of have.values()) {
      console.log('  ' + ix.collectionGroup.padEnd(10) + describe(ix) + '   [' + (ix.state || '?') + ']');
    }
    // A building index is not yet a usable one, and that is exactly the window
    // in which the page still looks broken. Say so rather than let READY be
    // assumed from the index merely being listed.
    const notReady = [...have.values()].filter((ix) => ix.state && ix.state !== 'READY');
    if (notReady.length) {
      console.log(`\n${notReady.length} still building — the queries needing them fail until they are READY.`);
    }
    return;
  }

  const missing = wanted.filter((ix) => !have.has(signature(ix.collectionGroup, ix.fields)));

  console.log(`Wanted:   ${wanted.length}`);
  console.log(`Present:  ${wanted.length - missing.length}`);
  console.log(`Missing:  ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('Nothing to do — every index this app needs already exists.');
    return;
  }

  for (const ix of missing) {
    console.log('  ' + ix.collectionGroup.padEnd(10) + describe(ix));
  }

  if (DRY_RUN) {
    console.log('\n-- DRY RUN: nothing created. Re-run without --dry-run to apply. --');
    return;
  }

  console.log('\nCreating…');
  let created = 0;
  for (const ix of missing) {
    const url = `${BASE}/${PARENT}/collectionGroups/${ix.collectionGroup}/indexes`;
    try {
      await api(url, {
        method: 'POST',
        body: JSON.stringify({ queryScope: ix.queryScope || 'COLLECTION', fields: ix.fields }),
      });
      created++;
      console.log('  created  ' + ix.collectionGroup.padEnd(10) + describe(ix));
    } catch (e) {
      // A concurrent creation, or one added by clicking a console link, comes
      // back as ALREADY_EXISTS. That is success, not failure.
      if (e.status === 409) {
        console.log('  exists   ' + ix.collectionGroup.padEnd(10) + describe(ix));
        continue;
      }
      // A 403 is about the credential, not this index, so every remaining one
      // would fail identically. Stop and say what to do — sixteen copies of
      // the same permission error buries the one line that matters.
      if (e.status === 403) {
        console.log('  FAILED   ' + ix.collectionGroup.padEnd(10) + describe(ix));
        console.error(
          '\nThe service account in .env.local may read indexes but not create them.\n' +
          'That is the Firebase Admin SDK default: it grants Firestore data access\n' +
          'and the Rules API (which is why deploy-rules.js works), but not\n' +
          'datastore.indexes.create.\n\n' +
          'Two ways round it:\n\n' +
          '  1. Deploy them as yourself with the Firebase CLI — no IAM change:\n' +
          '       npx -y firebase-tools login\n' +
          `       npx -y firebase-tools deploy --only firestore:indexes --project ${projectId}\n` +
          '     It reads the same firestore.indexes.json this script does.\n\n' +
          '  2. Grant the service account the "Cloud Datastore Index Admin" role\n' +
          '     (roles/datastore.indexAdmin) in Google Cloud IAM, then re-run this\n' +
          '     script. Do that if you want it to keep working unattended.\n',
        );
        process.exitCode = 1;
        return;
      }
      console.log('  FAILED   ' + ix.collectionGroup.padEnd(10) + describe(ix) + '\n           ' + e.message);
    }
  }

  if (created === 0) return;

  console.log(
    '\nIndexes build in the background — a few minutes over a collection this size.\n' +
    'Queries needing one keep failing until it reports READY.\n' +
    'Run with --list to check state.'
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
