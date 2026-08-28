/**
 * Turn BATS owner names into real ownership, after the fact.
 *
 * The BATS import now resolves owners as it runs (src/lib/ownerResolution.ts),
 * so most records arrive already assigned. This script is the mop-up for the
 * ones that did not: names that matched nobody at the time, which resolve once
 * the person has been invited or the work group created. Run it whenever you
 * onboard reps.
 *
 * A record whose owner name matches nothing is left exactly as it is — the name
 * stays as text, and the record stays visible only to admin, dispatch and
 * finance until somebody is assigned. Ambiguous names are skipped and listed,
 * never guessed: a wrong owner hands one broker another broker's book of
 * business, which is far worse than a record someone has to look at.
 *
 * Matching is against `allowedUsers`, which holds everyone, not `users`, which
 * holds only people who have signed in. Someone who exists but has never logged
 * in is assigned for real — the assignment is simply held under their email
 * until their first sign-in converts it to a uid.
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  KEEP IN SYNC with src/lib/ownerResolution.ts and the mirror of it in
 * scripts/import-bats.js. Security rules cannot import TypeScript and neither
 * can a plain node script, so the matcher exists in three places on purpose.
 * ─────────────────────────────────────────────────────────────────────────────
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

const NO_OWNER = { uids: [], groupIds: [], emails: [], unresolved: true, ambiguous: false };

function addLabel(map, label, person) {
  const key = norm(label);
  if (!key) return;
  const list = map.get(key) || [];
  if (!list.some((p) => p.email === person.email)) list.push(person);
  map.set(key, list);
}

async function loadOwnerDirectory() {
  const [groupSnap, allowSnap, userSnap] = await Promise.all([
    db.collection('workGroups').get(),
    db.collection('allowedUsers').get(),
    db.collection('users').get(),
  ]);

  const groups = new Map();
  groupSnap.forEach((doc) => {
    const key = norm(doc.data().name);
    if (key) groups.set(key, doc.id);
  });

  const byEmail = new Map();
  const people  = new Map();

  allowSnap.forEach((doc) => {
    const d = doc.data();
    const email = String(d.email || doc.id).trim().toLowerCase();
    if (!email) return;
    const person = { email, uid: d.uid || null };
    byEmail.set(email, person);
    addLabel(people, [d.firstName, d.lastName].filter(Boolean).join(' '), person);
    addLabel(people, d.displayName || '', person);
    addLabel(people, email.split('@')[0], person);
  });

  userSnap.forEach((doc) => {
    const d = doc.data();
    const email = String(d.email || '').trim().toLowerCase();
    if (!email) return;
    let person = byEmail.get(email);
    if (!person) {
      person = { email, uid: doc.id };
      byEmail.set(email, person);
      addLabel(people, email.split('@')[0], person);
    }
    person.uid = doc.id;
    addLabel(people, d.displayName || '', person);
  });

  console.log('People on the allowlist: ' + allowSnap.size +
    '  (' + userSnap.size + ' have signed in)');
  console.log('Work groups:             ' + groupSnap.size +
    (groupSnap.size ? '  (' + groupSnap.docs.map((d) => d.data().name).join(', ') + ')' : ''));

  return { groups, people, byEmail };
}

function forPerson(person) {
  return person.uid
    ? { uids: [person.uid], groupIds: [], emails: [], unresolved: false, ambiguous: false }
    : { uids: [], groupIds: [], emails: [person.email], unresolved: false, ambiguous: false };
}

function resolveSegment(dir, name) {
  const key = norm(name);
  if (!key) return NO_OWNER;

  const groupId = dir.groups.get(key);
  if (groupId) {
    return { uids: [], groupIds: [groupId], emails: [], unresolved: false, ambiguous: false };
  }

  const hits = dir.people.get(key) || [];
  if (hits.length === 1) return forPerson(hits[0]);
  if (hits.length > 1) return Object.assign({}, NO_OWNER, { ambiguous: true });
  return NO_OWNER;
}

function resolveOwner(dir, rawName) {
  const name = String(rawName || '').trim();
  if (!name) return NO_OWNER;

  const override = MANUAL.get(norm(name));
  if (override) {
    if (override.toLowerCase().startsWith('group:')) {
      const groupId = dir.groups.get(norm(override.slice(6)));
      return groupId
        ? { uids: [], groupIds: [groupId], emails: [], unresolved: false, ambiguous: false }
        : NO_OWNER;
    }
    const person = dir.byEmail.get(String(override).trim().toLowerCase());
    return person ? forPerson(person) : NO_OWNER;
  }

  const parts = name.split('/').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return NO_OWNER;

  const uids = [], groupIds = [], emails = [];
  for (const part of parts) {
    const hit = resolveSegment(dir, part);
    if (hit.unresolved) return Object.assign({}, NO_OWNER, { ambiguous: hit.ambiguous });
    uids.push.apply(uids, hit.uids);
    groupIds.push.apply(groupIds, hit.groupIds);
    emails.push.apply(emails, hit.emails);
  }
  return {
    uids: [...new Set(uids)],
    groupIds: [...new Set(groupIds)],
    emails: [...new Set(emails)],
    unresolved: false,
    ambiguous: false,
  };
}

function hasOwner(r) {
  return r.uids.length > 0 || r.groupIds.length > 0 || r.emails.length > 0;
}

/**
 * Collects the records of one collection that still carry an unresolved name.
 * `nameField` differs because a party keeps the BATS text in `assignedToName`
 * and an order keeps it in `assignedTo`.
 */
async function planCollection(dir, collectionName, nameField, stats) {
  const snap = await db.collection(collectionName).get();
  const plan = [];

  snap.forEach((doc) => {
    const d = doc.data();
    const name = String(d[nameField] || '').trim();
    if (!name) return;
    // Already owned: never re-decide a record somebody has since assigned.
    if ((d.assignedToUids || []).length
      || (d.assignedToGroupIds || []).length
      || (d.assignedToEmails || []).length) return;

    stats.named++;
    const owners = resolveOwner(dir, name);
    if (!hasOwner(owners)) {
      if (owners.ambiguous) stats.ambiguous++;
      else stats.misses.set(name, (stats.misses.get(name) || 0) + 1);
      return;
    }
    plan.push({ ref: doc.ref, id: doc.id, name, owners, clientId: d.clientId || null });
  });

  return plan;
}

/** Names for the history entries, resolved once for the whole run. */
async function labelMap(plans) {
  const uids = new Set(), groupIds = new Set();
  for (const p of plans) {
    for (const u of p.owners.uids) uids.add(u);
    for (const g of p.owners.groupIds) groupIds.add(g);
  }
  const labels = new Map();
  const refs = [
    ...[...uids].map((u) => db.collection('users').doc(u)),
    ...[...groupIds].map((g) => db.collection('workGroups').doc(g)),
  ];
  if (!refs.length) return labels;
  const docs = await db.getAll.apply(db, refs);
  for (const doc of docs) {
    const d = doc.data();
    if (!d) continue;
    if (uids.has(doc.id)) labels.set('user:' + doc.id, d.displayName || d.email || doc.id);
    else labels.set('group:' + doc.id, d.name || doc.id);
  }
  return labels;
}

function eventsFor(plan, labels) {
  const o = plan.owners;
  return [
    ...o.uids.map((id) => ({
      action: 'changed', targetType: 'user', targetId: id, targetLabel: labels.get('user:' + id) || id,
    })),
    ...o.groupIds.map((id) => ({
      action: 'changed', targetType: 'group', targetId: id, targetLabel: labels.get('group:' + id) || id,
    })),
    ...o.emails.map((id) => ({
      action: 'changed', targetType: 'email', targetId: id, targetLabel: id,
    })),
  ];
}

async function applyPlan(plans, nameField, labels, now) {
  const CHUNK = 300;
  for (let i = 0; i < plans.length; i += CHUNK) {
    const batch = db.batch();
    for (const p of plans.slice(i, i + CHUNK)) {
      const patch = {
        assignedToUids:     p.owners.uids,
        assignedToGroupIds: p.owners.groupIds,
        assignedToEmails:   p.owners.emails,
        updatedAt:          now,
      };
      // The BATS text and a real assignment are alternative answers to the same
      // question; once there is an owner, the name lives on in the history.
      patch[nameField] = '';
      batch.update(p.ref, patch);

      const col = p.ref.collection('ownerEvents');
      eventsFor(p, labels).forEach((event, n) => {
        batch.set(col.doc(), Object.assign({}, event, {
          actorUid:  'resolve-party-owners',
          actorName: 'Owner resolution script',
          actorIp:   null,
          at:        now,
          // Kept so the timeline can say what the name used to be.
          fromName:  p.name,
        }));
      });
    }
    await batch.commit();
  }
}

/**
 * Owning a client carries all of its orders, and the rules read that from a
 * mirror on each order rather than by querying. A party that just changed hands
 * has to push the new owners out, or its new owner cannot see the orders they
 * were just given.
 */
async function syncClientOwners(partyIds, now) {
  let touched = 0;
  for (const partyId of partyIds) {
    const party = await db.collection('parties').doc(partyId).get();
    if (!party.exists) continue;
    const d = party.data();
    const clientOwnerUids     = d.assignedToUids || [];
    const clientOwnerGroupIds = d.assignedToGroupIds || [];

    const orders = await db.collection('orders').where('clientId', '==', partyId).get();
    if (orders.empty) continue;

    const CHUNK = 300;
    for (let i = 0; i < orders.docs.length; i += CHUNK) {
      const batch = db.batch();
      for (const doc of orders.docs.slice(i, i + CHUNK)) {
        batch.update(doc.ref, { clientOwnerUids, clientOwnerGroupIds, updatedAt: now });
      }
      await batch.commit();
    }
    touched += orders.size;
  }
  return touched;
}

function reportMisses(stats, label) {
  const unresolved = [...stats.misses.values()].reduce((a, b) => a + b, 0);
  console.log('\n' + label);
  console.log('  still carrying a name: ' + stats.named);
  console.log('  resolvable:            ' + stats.resolvable);
  console.log('  ambiguous (skipped):   ' + stats.ambiguous);
  console.log('  no match:              ' + unresolved);
  if (stats.misses.size) {
    for (const [name, n] of [...stats.misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
      console.log('    ' + String(n).padStart(5) + '  ' + name);
    }
  }
}

async function main() {
  const now = Timestamp.now();
  console.log(DRY_RUN ? '-- DRY RUN: nothing will be written --\n' : '-- APPLYING --\n');

  const dir = await loadOwnerDirectory();

  const partyStats = { named: 0, ambiguous: 0, resolvable: 0, misses: new Map() };
  const orderStats = { named: 0, ambiguous: 0, resolvable: 0, misses: new Map() };

  const partyPlan = await planCollection(dir, 'parties', 'assignedToName', partyStats);
  const orderPlan = await planCollection(dir, 'orders', 'assignedTo', orderStats);
  partyStats.resolvable = partyPlan.length;
  orderStats.resolvable = orderPlan.length;

  reportMisses(partyStats, 'Clients / shippers / consignees');
  reportMisses(orderStats, 'Orders');

  if (partyStats.misses.size || orderStats.misses.size) {
    console.log('\nInvite these people, or map one explicitly:');
    console.log('  --map "Nery Mendez=nery@totaltransportlogistics.us"');
    console.log('  --map "TTL Team 1=group:Team 1"   (create the work group in Settings first)');
  }

  if (DRY_RUN) {
    console.log('\nNothing written. Re-run without --dry-run to apply.');
    return;
  }

  const labels = await labelMap([...partyPlan, ...orderPlan]);
  await applyPlan(partyPlan, 'assignedToName', labels, now);
  await applyPlan(orderPlan, 'assignedTo', labels, now);

  const touched = await syncClientOwners(partyPlan.map((p) => p.id), now);

  console.log('\nAssigned ' + partyPlan.length + ' client/shipper/consignee record(s) and '
    + orderPlan.length + ' order(s).');
  console.log('Refreshed the client-owner mirror on ' + touched + ' order(s).');
}

main().catch((e) => { console.error(e); process.exit(1); });
