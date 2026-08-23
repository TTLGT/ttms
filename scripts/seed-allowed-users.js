/**
 * Seeds the sign-in allowlist from everyone who already has access.
 *
 * Run this ONCE when switching from the old domain-based login to the
 * allowlist. Without it, the first person to sign in after deploying is locked
 * out unless they are a bootstrap admin — the allowlist starts empty.
 *
 * It reads every existing `users/{uid}` profile plus every enabled Firebase Auth
 * account and creates the matching `allowedUsers/{email}` entry, preserving the
 * roles already on the profile.
 *
 * Usage:
 *   node scripts/seed-allowed-users.js --dry-run   — show what would be created
 *   node scripts/seed-allowed-users.js             — write the entries
 *
 * Requires .env.local in the project root with:
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
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

// ── Firebase Admin ───────────────────────────────────────────────────────────
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue }     = require('firebase-admin/firestore');
const { getAuth }                      = require('firebase-admin/auth');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
const db   = getFirestore();
const auth = getAuth();

const BOOTSTRAP_ADMIN_EMAILS = [
  'it@totaltransportlogistics.us',
  'operations@totaltransportlogistics.us',
  'dispatch@totaltransportlogistics.us',
];

const dryRun = process.argv.includes('--dry-run');
const norm   = (e) => (e || '').trim().toLowerCase();

async function main() {
  console.log(dryRun ? '── DRY RUN — nothing will be written ──\n' : '── Seeding allowlist ──\n');

  /** @type {Map<string, {email:string,isAdmin:boolean,isDispatcher:boolean,isFinance:boolean,uid:string|null,source:string}>} */
  const candidates = new Map();

  // 1. Existing profiles — these people are actively using the system.
  const profiles = await db.collection('users').get();
  for (const doc of profiles.docs) {
    const d = doc.data();
    const email = norm(d.email);
    if (!email) continue;
    candidates.set(email, {
      email,
      isAdmin:      d.isAdmin === true,
      isDispatcher: d.isDispatcher === true,
      isFinance:    d.isFinance === true,
      uid:          doc.id,
      source:       'users profile',
    });
  }

  // 2. Auth accounts with no profile yet — they could sign in before, so keep
  //    them working rather than silently cutting them off.
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      const email = norm(u.email);
      if (!email || u.disabled || candidates.has(email)) continue;
      candidates.set(email, {
        email,
        isAdmin:      false,
        isDispatcher: false,
        isFinance:    false,
        uid:          u.uid,
        source:       'auth account (no profile)',
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // 3. Bootstrap admins are always present and always admin.
  for (const email of BOOTSTRAP_ADMIN_EMAILS) {
    const existing = candidates.get(email);
    candidates.set(email, {
      email,
      isAdmin:      true,
      isDispatcher: existing ? existing.isDispatcher : false,
      isFinance:    existing ? existing.isFinance : false,
      uid:          existing ? existing.uid : null,
      source:       existing ? `${existing.source} + bootstrap` : 'bootstrap admin',
    });
  }

  if (candidates.size === 0) {
    console.log('No existing users found. The allowlist will start empty —');
    console.log('sign in with a bootstrap admin account to add your team.\n');
    return;
  }

  let created = 0, skipped = 0;

  for (const person of [...candidates.values()].sort((a, b) => a.email.localeCompare(b.email))) {
    const ref  = db.collection('allowedUsers').doc(person.email);
    const snap = await ref.get();

    const roles = [
      person.isAdmin      ? 'Admin'      : null,
      person.isDispatcher ? 'Dispatcher' : null,
      person.isFinance    ? 'Finance'    : null,
    ].filter(Boolean).join(', ') || 'no roles';

    if (snap.exists) {
      console.log(`  = ${person.email.padEnd(42)} already on the allowlist`);
      skipped++;
      continue;
    }

    console.log(`  + ${person.email.padEnd(42)} ${roles.padEnd(28)} (${person.source})`);

    if (!dryRun) {
      await ref.set({
        email:        person.email,
        isAdmin:      person.isAdmin,
        isDispatcher: person.isDispatcher,
        isFinance:    person.isFinance,
        uid:          person.uid,
        invitedBy:    'system:migration',
        invitedAt:    FieldValue.serverTimestamp(),
        lastLoginAt:  null,
      });
    }
    created++;
  }

  console.log(
    `\n${dryRun ? 'Would create' : 'Created'} ${created} entr${created === 1 ? 'y' : 'ies'}` +
    `${skipped ? `, skipped ${skipped} already present` : ''}.`,
  );
  if (dryRun) console.log('Re-run without --dry-run to apply.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
