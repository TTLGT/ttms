/**
 * Compares the LIVE firestore.rules / storage.rules against the repo copies.
 *
 * `deploy-rules.js --dry-run` does not answer this question. It reports how
 * many lines it would upload and never contacts the Rules API at all, so it
 * cannot tell you whether what is running in production matches what is
 * committed. That is the exact gap that let the repo rules sit undeployed for
 * five weeks while users saw "Missing or insufficient permissions".
 *
 * This script closes it: it reads the ruleset behind each release and diffs the
 * source against the local file. It is strictly READ-ONLY — it creates no
 * rulesets and moves no releases. Run it before deploying to find out whether
 * you need to, and after deploying to confirm you did.
 *
 * Usage:
 *   node scripts/compare-rules.js
 *   node scripts/compare-rules.js --only firestore
 *   node scripts/compare-rules.js --only storage
 *
 * Exit code is 1 when the two differ, so it can gate a script or a CI step.
 *
 * Requires the same .env.local values as deploy-rules.js:
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
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

const onlyAt = process.argv.indexOf('--only');
const only   = onlyAt === -1 ? null : process.argv[onlyAt + 1];

const TARGETS = [
  { key: 'firestore', file: 'firestore.rules', release: 'cloud.firestore' },
  { key: 'storage',   file: 'storage.rules',   release: `firebase.storage/${bucket}` },
];

const credential = cert({
  projectId,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  // The key sits on one line with escaped \n sequences; they must become real
  // newlines or OpenSSL rejects the PEM with "DECODER routines::unsupported".
  privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
});

let cachedToken = null;
async function accessToken() {
  if (!cachedToken) cachedToken = (await credential.getAccessToken()).access_token;
  return cachedToken;
}

async function api(url) {
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body.error && body.error.message) || `HTTP ${res.status}`);
  return body;
}

// Line endings and trailing whitespace are not semantically part of a rule, and
// a file edited on Windows would otherwise report drift against a ruleset
// uploaded with LF endings.
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();

async function main() {
  if (!projectId) throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set.');

  const targets = only ? TARGETS.filter((t) => t.key === only) : TARGETS;
  if (targets.length === 0) {
    throw new Error(`Unknown --only target "${only}". Use "firestore" or "storage".`);
  }
  if (targets.some((t) => t.key === 'storage') && !bucket) {
    throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.');
  }

  console.log(`── Comparing live rules with repo ──\nProject: ${projectId}\n`);

  let drift = false;

  for (const target of targets) {
    const release = await api(`${BASE}/projects/${projectId}/releases/${target.release}`);
    const ruleset = await api(`${BASE}/${release.rulesetName}`);

    console.log(`${target.file}:`);
    console.log(`  live ruleset  ${release.rulesetName.split('/').pop()}  (created ${ruleset.createTime})`);

    // deploy-rules.js uploads one file per ruleset, so the first entry is the
    // whole story for anything this repo deployed. A ruleset published from the
    // Console could in principle bundle more; say so rather than compare blind.
    const files = ruleset.source.files || [];
    if (files.length > 1) {
      console.log(`  note: live ruleset bundles ${files.length} files; comparing "${files[0].name}" only`);
    }

    const live = norm((files[0] || { content: '' }).content);
    const repo = norm(fs.readFileSync(path.join(__dirname, '..', target.file), 'utf8'));

    if (live === repo) {
      console.log('  MATCH — live rules are identical to the repo copy\n');
      continue;
    }

    drift = true;
    const liveLines = live.split('\n');
    const repoLines = repo.split('\n');
    console.log(`  DIFFERS — live ${liveLines.length} lines, repo ${repoLines.length} lines`);

    // The first differing line is usually enough to recognise which era the
    // live copy is from, without dumping the whole ruleset to the terminal.
    for (let i = 0; i < Math.max(liveLines.length, repoLines.length); i++) {
      if (liveLines[i] !== repoLines[i]) {
        console.log(`  first difference at line ${i + 1}:`);
        console.log(`    live: ${liveLines[i] === undefined ? '(end of file)' : liveLines[i]}`);
        console.log(`    repo: ${repoLines[i] === undefined ? '(end of file)' : repoLines[i]}`);
        break;
      }
    }

    const out = path.join(__dirname, '..', `live-${target.file}.tmp`);
    fs.writeFileSync(out, (files[0] || { content: '' }).content);
    console.log(`  live copy written to ${path.relative(path.join(__dirname, '..'), out)} for a full diff\n`);
  }

  console.log(drift
    ? 'Drift found. Deploy the repo copy with: node scripts/deploy-rules.js'
    : 'No drift. Nothing to deploy.');

  return drift ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
