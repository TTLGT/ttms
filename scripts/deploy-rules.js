/**
 * Deploys firestore.rules and storage.rules to the live Firebase project.
 *
 * Committing a rules file changes nothing on its own — the rules only take
 * effect once they are uploaded as a ruleset and a release is pointed at it.
 * Skipping this step is how the repo rules sat undeployed for five weeks while
 * Settings → People With Access returned "Missing or insufficient permissions".
 *
 * This talks to the Firebase Rules REST API with the admin service account, so
 * it needs no `firebase login` and no CLI install.
 *
 * Usage:
 *   node scripts/deploy-rules.js --dry-run   — show what would be deployed
 *   node scripts/deploy-rules.js             — upload and release
 *   node scripts/deploy-rules.js --only firestore
 *   node scripts/deploy-rules.js --only storage
 *
 * Requires .env.local in the project root with:
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 *
 * NOTE: the service account can UPDATE an existing release but cannot CREATE
 * one — it lacks `firebaserules.releases.create`. Both releases already exist,
 * so this script covers day-to-day changes. If you ever add a new bucket or a
 * new database, that first release has to be published from the Firebase
 * Console by an Owner account; after that this script takes over again.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    // `.` does not match a carriage return in JS, so a .env.local saved with
    // Windows CRLF endings would match nothing at all and every value would
    // come back undefined. Strip the CR before matching.
    const m = line.replace(/\r$/, '').match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const { cert } = require('firebase-admin/app');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const bucket    = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const BASE      = 'https://firebaserules.googleapis.com/v1';

const dryRun = process.argv.includes('--dry-run');
const onlyAt = process.argv.indexOf('--only');
const only   = onlyAt === -1 ? null : process.argv[onlyAt + 1];

// Each target is a local rules file plus the release that must point at it.
const TARGETS = [
  { key: 'firestore', file: 'firestore.rules', release: 'cloud.firestore' },
  { key: 'storage',   file: 'storage.rules',   release: `firebase.storage/${bucket}` },
];

// firebase-admin's service-account credential already requests the
// cloud-platform scope, which is what the Rules API checks.
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
    err.body = body;
    throw err;
  }
  return body;
}

/** Uploads the local file as a new ruleset and returns its resource name. */
async function createRuleset(fileName) {
  const content = fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8');
  const created = await api(`${BASE}/projects/${projectId}/rulesets`, {
    method: 'POST',
    body: JSON.stringify({ source: { files: [{ name: fileName, content }] } }),
  });
  console.log(`  ruleset  ${created.name.split('/').pop()}`);
  return created.name;
}

async function pointRelease(releaseName, rulesetName) {
  const fullName = `projects/${projectId}/releases/${releaseName}`;
  try {
    await api(`${BASE}/${fullName}`, {
      method: 'PATCH',
      body: JSON.stringify({ release: { name: fullName, rulesetName } }),
    });
    console.log(`  release  ${releaseName} -> updated`);
  } catch (err) {
    if (err.status === 404) {
      throw new Error(
        `Release "${releaseName}" does not exist yet. The service account cannot ` +
        'create one — publish it once from the Firebase Console, then re-run this.',
      );
    }
    throw err;
  }
}

async function main() {
  if (!projectId) throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set.');

  const targets = only ? TARGETS.filter((t) => t.key === only) : TARGETS;
  if (targets.length === 0) {
    throw new Error(`Unknown --only target "${only}". Use "firestore" or "storage".`);
  }
  if (targets.some((t) => t.key === 'storage') && !bucket) {
    throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.');
  }

  console.log(
    `${dryRun ? '── DRY RUN — nothing will be deployed ──' : '── Deploying rules ──'}\n` +
    `Project: ${projectId}\n`,
  );

  for (const target of targets) {
    console.log(`${target.file}:`);

    if (dryRun) {
      const lines = fs.readFileSync(path.join(__dirname, '..', target.file), 'utf8').split('\n').length;
      console.log(`  would upload ${lines} lines and point ${target.release} at it\n`);
      continue;
    }

    const rulesetName = await createRuleset(target.file);
    await pointRelease(target.release, rulesetName);
    console.log('');
  }

  console.log(dryRun ? 'Re-run without --dry-run to apply.' : 'Done — rules are live.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('\nFailed:', err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});
