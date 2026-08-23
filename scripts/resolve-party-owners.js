/**
 * Turn BATS owner names into real ownership.
 *
 * BATS records the owning rep as a display name ("Nery Mendez"), not an
 * account. Parties carry that string in `assignedToName`, which makes them
 * private-but-unclaimed: nobody but admin/dispatch/finance can see them, and
 * the collision warning names the rep so a requester knows who to ask.
 *
 * Run this whenever you onboard reps. For every party whose `assignedToName`
 * matches a TMS user, it moves ownership into `assignedToUids` so that person
 * sees their own book of business and can approve requests themselves.
 *
 * Matching is on the user's display name or the local part of their email,
 * compared case- and punctuation-insensitively. Anything ambiguous is skipped
 * and listed, never guessed.
 *
 * Usage:
 *   node scripts/resolve-party-owners.js --dry-run   — report only
 *   node scripts/resolve-party-owners.js             — apply
 *   node scripts/resolve-party-owners.js --map "Nery Mendez=nery@ttl.us"
 *   node scripts/resolve-party-owners.js --map "TTL Gabe's Team=group:Gabe's Team"
 *        (repeatable; maps a BATS name to a user or to a work group)
 *
 * Names holding two people ("Gabe/Axel", "Manny / Mary") are split on / and
 * both are assigned, since a record can have several owners.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const MANUAL = new Map();
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--map' && process.argv[i + 1]) {
    const eq = process.argv[i + 1].indexOf('=');
    if (eq === -1) continue;
    const name   = process.argv[i + 1].slice(0, eq);
    const target = process.argv[i + 1].slice(eq + 1).trim();
    if (name && target) MANUAL.set(norm(name), target);
  }
}

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

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp }      = require('firebase-admin/firestore');

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

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function main() {
  const now = Timestamp.now();
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const usersSnap = await db.collection('users').get();
  const byKey = new Map();   // normalized name/email-local -> [uid]
  const byEmail = new Map();

  usersSnap.forEach((d) => {
    const u = d.data();
    const email = (u.email || '').toLowerCase();
    if (email) byEmail.set(email, d.id);
    for (const candidate of [u.displayName, email.split('@')[0]]) {
      const k = norm(candidate);
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, []);
      if (!byKey.get(k).includes(d.id)) byKey.get(k).push(d.id);
    }
  });
  console.log('TMS user accounts: ' + usersSnap.size);

  const groupsSnap = await db.collection('workGroups').get();
  const groupByName = new Map();
  groupsSnap.forEach((d) => groupByName.set(norm(d.data().name), d.id));
  console.log('Work groups:       ' + groupsSnap.size +
    (groupsSnap.size ? '  (' + [...groupsSnap.docs.map((d) => d.data().name)].join(', ') + ')' : ''));

  const partiesSnap = await db.collection('parties')
    .where('assignedToName', '!=', '')
    .get();

  const writes = [];
  const unresolved = new Map();
  let ambiguous = 0;

  partiesSnap.forEach((doc) => {
    const p = doc.data();
    if ((p.assignedToUids || []).length > 0) return;   // already owned

    const name = (p.assignedToName || '').trim();
    const key  = norm(name);

    // An explicit mapping wins, and may point at a work group instead of a user.
    if (MANUAL.has(key)) {
      const target = MANUAL.get(key);
      if (target.toLowerCase().startsWith('group:')) {
        const groupName = target.slice(6).trim();
        const groupId   = groupByName.get(norm(groupName));
        if (!groupId) {
          unresolved.set(name + '  -> no group named "' + groupName + '"',
            (unresolved.get(name) || 0) + 1);
          return;
        }
        writes.push({
          ref: doc.ref,
          data: { assignedToGroupIds: [groupId], assignedToName: '', updatedAt: now },
        });
        return;
      }
      const uid = byEmail.get(target.toLowerCase());
      if (!uid) { unresolved.set(name, (unresolved.get(name) || 0) + 1); return; }
      writes.push({
        ref: doc.ref,
        data: { assignedToUids: [uid], assignedToName: '', updatedAt: now },
      });
      return;
    }

    // "Gabe/Axel" is two owners, not an unresolvable name — a record can be
    // owned by several people.
    const parts = name.split('/').map((x) => x.trim()).filter(Boolean);
    const uids  = [];
    let failed  = false;
    for (const part of parts) {
      const hits = byKey.get(norm(part)) || [];
      if (hits.length === 1) uids.push(hits[0]);
      else if (hits.length > 1) { ambiguous++; failed = true; break; }
      else { failed = true; break; }
    }

    if (failed || uids.length === 0) {
      unresolved.set(name, (unresolved.get(name) || 0) + 1);
      return;
    }

    writes.push({
      ref: doc.ref,
      data: { assignedToUids: [...new Set(uids)], assignedToName: '', updatedAt: now },
    });
  });

  console.log('Parties owned by name:  ' + partiesSnap.size);
  console.log('  resolvable to a user: ' + writes.length);
  console.log('  ambiguous (skipped):  ' + ambiguous);
  console.log('  still unresolved:     ' + [...unresolved.values()].reduce((a, b) => a + b, 0));

  if (unresolved.size) {
    console.log('\nBATS names with no matching account:');
    for (const [name, n] of [...unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
      console.log('  ' + String(n).padStart(5) + '  ' + name);
    }
    console.log('\nInvite these people, or map one explicitly:');
    console.log('  --map "Nery Mendez=nery@totaltransportlogistics.us"');
    console.log('  --map "TTL Team 1=group:Team 1"   (create the work group in Settings first)');
  }

  if (DRY_RUN) {
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + CHUNK)) batch.update(w.ref, w.data);
    await batch.commit();
  }
  console.log('\nTransferred ownership on ' + writes.length + ' parties.');
}

main().catch((e) => { console.error(e); process.exit(1); });
