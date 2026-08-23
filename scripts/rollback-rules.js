/**
 * Point a Firebase rules release back at an earlier ruleset.
 *
 * Rulesets are immutable and are never deleted when you deploy a new one, so
 * rolling back is just repointing the release. Use this if a rules deploy locks
 * people out — it is far faster than editing rules under pressure.
 *
 * Usage:
 *   node scripts/rollback-rules.js --list
 *   node scripts/rollback-rules.js --to <rulesetId> [--only firestore|storage]
 *
 * Requires the same .env.local values as deploy-rules.js. Like that script it
 * can UPDATE an existing release but not create one.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

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

const argAt   = (flag) => process.argv.indexOf(flag);
const argVal  = (flag) => (argAt(flag) === -1 ? null : process.argv[argAt(flag) + 1]);
const listing = process.argv.includes('--list');
const target  = argVal('--to');
const only    = argVal('--only') || 'firestore';

const RELEASE = {
  firestore: 'cloud.firestore',
  storage:   `firebase.storage/${bucket}`,
};

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
  if (!res.ok) throw new Error((body.error && body.error.message) || `HTTP ${res.status}`);
  return body;
}

async function main() {
  if (!projectId) throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set.');

  const releaseName = RELEASE[only];
  if (!releaseName) throw new Error(`Unknown --only target "${only}".`);

  const current = await api(`${BASE}/projects/${projectId}/releases/${releaseName}`);
  console.log('Currently live: ' + current.rulesetName.split('/').pop());

  if (listing || !target) {
    const { rulesets = [] } = await api(`${BASE}/projects/${projectId}/rulesets?pageSize=20`);
    console.log('\nRecent rulesets (newest first):');
    for (const r of rulesets) {
      const id = r.name.split('/').pop();
      const live = r.name === current.rulesetName ? '  <- live' : '';
      console.log('  ' + id + '  ' + r.createTime + live);
    }
    if (!target) {
      console.log('\nRe-run with --to <rulesetId> to roll back.');
      return;
    }
  }

  const rulesetName = `projects/${projectId}/rulesets/${target}`;
  const fullName    = `projects/${projectId}/releases/${releaseName}`;
  await api(`${BASE}/${fullName}`, {
    method: 'PATCH',
    body: JSON.stringify({ release: { name: fullName, rulesetName } }),
  });
  console.log('\nRolled back ' + releaseName + ' -> ' + target);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
