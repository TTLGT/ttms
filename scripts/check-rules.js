/**
 * Compiles firestore.rules and storage.rules without deploying them.
 *
 * `node scripts/deploy-rules.js --dry-run` reports what it *would* upload and
 * nothing more — it never compiles, so a syntax error passes the dry-run
 * cleanly and only surfaces on a real deploy, by which point the broken rules
 * are live. This closes that gap.
 *
 * The trick is that creating a ruleset is what runs Google's compiler. A
 * ruleset that no release points at is inert: it changes nothing, and this
 * deletes it again immediately. **The release endpoint is never called here.**
 * Live rules are untouched whether this passes or fails.
 *
 * Usage:
 *   node scripts/check-rules.js
 *   node scripts/check-rules.js --only firestore
 *   node scripts/check-rules.js --keep     leave the ruleset for inspection
 *
 * Same credentials as deploy-rules.js — .env.local, no firebase login needed.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    // `.` does not match a carriage return in JS, so a .env.local saved with
    // Windows line endings needs the \r trimmed or every value keeps one.
    const m = line.replace(/\r$/, '').match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const { cert } = require('firebase-admin/app');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const BASE      = 'https://firebaserules.googleapis.com/v1';

const keep   = process.argv.includes('--keep');
const onlyAt = process.argv.indexOf('--only');
const only   = onlyAt === -1 ? null : process.argv[onlyAt + 1];

const TARGETS = [
  { key: 'firestore', file: 'firestore.rules' },
  { key: 'storage',   file: 'storage.rules'   },
];

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

/**
 * The compiler reports a problem as a source position plus a message. Printed
 * as `file:line:col` so an editor can jump straight to it — a rules error
 * quoted without its line number means reading the whole file to find it.
 */
function reportIssues(issues) {
  for (const issue of issues || []) {
    const at = issue.sourcePosition || {};
    const where = [at.fileName, at.line, at.column].filter(Boolean).join(':');
    console.error(`  ${issue.severity || 'ERROR'}  ${where}  ${issue.description}`);
  }
}

async function check(target) {
  const content = fs.readFileSync(path.join(__dirname, '..', target.file), 'utf8');

  let created;
  try {
    created = await api(`${BASE}/projects/${projectId}/rulesets`, {
      method: 'POST',
      body: JSON.stringify({ source: { files: [{ name: target.file, content }] } }),
    });
  } catch (err) {
    console.error(`✗ ${target.file}`);
    // A compile failure comes back as 400 with the problems in the details.
    const details = (err.body && err.body.error && err.body.error.details) || [];
    for (const detail of details) reportIssues(detail.issues);
    if (details.length === 0) console.error(`  ${err.message}`);
    return false;
  }

  const id = created.name.split('/').pop();

  // Warnings still compile — an unused function, a shadowed name — and are
  // worth printing, because the ruleset they came from is about to disappear.
  if (created.metadata && created.metadata.services) {
    console.log(`  services: ${created.metadata.services.join(', ')}`);
  }

  if (keep) {
    console.log(`✓ ${target.file} compiles — ruleset ${id} kept (nothing released)`);
    return true;
  }

  await api(`${BASE}/projects/${projectId}/rulesets/${id}`, { method: 'DELETE' })
    .catch((e) => console.warn(`  (could not delete ruleset ${id}: ${e.message})`));

  console.log(`✓ ${target.file} compiles`);
  return true;
}

async function main() {
  if (!projectId) throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set.');

  const targets = only ? TARGETS.filter((t) => t.key === only) : TARGETS;
  if (targets.length === 0) throw new Error(`Unknown --only target "${only}".`);

  console.log(`Compiling rules against ${projectId}. Nothing is released.\n`);

  let ok = true;
  for (const target of targets) ok = (await check(target)) && ok;

  if (!ok) {
    console.error('\nRules did not compile. Nothing was deployed.');
    process.exit(1);
  }
  console.log('\nAll rules compile. Deploy them with: node scripts/deploy-rules.js');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
