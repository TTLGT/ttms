/**
 * Move second phone numbers out of the old `phoneGt` field.
 *
 * A person's second number used to be Guatemala or nothing, and lived in a
 * field called `phoneGt`. It is now one field with the country beside it —
 * `phoneOther` + `phoneOtherRegion` — so that a Mexican number, or any other,
 * has somewhere to go. See src/lib/phone.ts.
 *
 * **The app does not need this script to be correct.** Everything reads the
 * number through `otherPhone()`, which understands both shapes, and every save
 * writes the new fields and blanks the old one. This is tidying: it moves the
 * records nobody has re-saved, so that the old field is empty everywhere and
 * can eventually be deleted from the types.
 *
 * What it does to one record:
 *   phoneGt: '+(502) 4874-0227'   →   phoneOther:       '+(502) 4874-0227'
 *                                     phoneOtherRegion: 'GT'
 *                                     phoneGt:          ''
 *
 * Every number it moves is a Guatemala number, because Guatemala is the only
 * country the old field could hold. It never guesses a country and never
 * touches a record that already has `phoneOther` filled in — where the two
 * disagree, the new field is the one that was saved most recently and wins by
 * being left alone. Such records are listed so someone can look at them.
 *
 * Three collections carry the field: the allowlist, the live profiles mirrored
 * from it, and the archive of removed people. All three are done in one pass,
 * because leaving one behind would put a stale number back on screen.
 *
 * Usage:
 *   node scripts/migrate-phone-other.js --dry-run   — report only
 *   node scripts/migrate-phone-other.js             — apply
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

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

/** The collections that carry a second phone number, and how to name a row. */
const TARGETS = [
  { name: 'allowedUsers', label: (id, d) => d.email || id },
  { name: 'users',        label: (id, d) => d.email || id },
  { name: 'removedUsers', label: (id, d) => d.email || id },
];

async function planCollection(target) {
  const snap = await db.collection(target.name).get();

  const moves    = [];
  const conflicts = [];

  snap.forEach((doc) => {
    const d = doc.data();
    const legacy = String(d.phoneGt || '').trim();
    if (!legacy) return;

    const current = String(d.phoneOther || '').trim();
    if (current) {
      // Both filled. The new field is the more recent save, so it stands — but
      // the two numbers are named here, because a difference between them is
      // the one case where a human should decide rather than a script.
      if (current !== legacy) {
        conflicts.push({ who: target.label(doc.id, d), current, legacy });
      }
      // Same number in both places: nothing to decide, just clear the old one.
      moves.push({ ref: doc.ref, who: target.label(doc.id, d), from: legacy, keep: current });
      return;
    }

    moves.push({ ref: doc.ref, who: target.label(doc.id, d), from: legacy, keep: null });
  });

  return { moves, conflicts };
}

async function apply(moves) {
  // Batched in 400s: a Firestore batch takes 500 writes, and each move here is
  // one write, so this leaves room without needing to be exact.
  for (let i = 0; i < moves.length; i += 400) {
    const batch = db.batch();
    for (const move of moves.slice(i, i + 400)) {
      const patch = { phoneGt: '' };
      if (move.keep === null) {
        patch.phoneOther       = move.from;
        patch.phoneOtherRegion = 'GT';
      }
      batch.update(move.ref, patch);
    }
    await batch.commit();
  }
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — nothing will be written.\n' : 'Applying changes.\n');

  let total = 0;
  const plans = [];

  for (const target of TARGETS) {
    const plan = await planCollection(target);
    plans.push({ target, plan });
    total += plan.moves.length;

    console.log(target.name + ': ' + plan.moves.length + ' record(s) to move');
    for (const move of plan.moves) {
      console.log(move.keep === null
        ? '  ' + move.who + '  ' + move.from + ' → Other phone (Guatemala)'
        : '  ' + move.who + '  clearing the old field, already moved');
    }

    for (const c of plan.conflicts) {
      console.log('  ⚠ ' + c.who + ' has two different numbers: keeping '
        + c.current + ', discarding the old ' + c.legacy);
    }
    console.log('');
  }

  if (total === 0) {
    console.log('Nothing to move — the old field is already empty everywhere.');
    return;
  }

  if (DRY_RUN) {
    console.log('Nothing written. Re-run without --dry-run to apply.');
    return;
  }

  for (const { plan } of plans) await apply(plan.moves);
  console.log('Moved ' + total + ' record(s).');
}

main().catch((e) => { console.error(e); process.exit(1); });
