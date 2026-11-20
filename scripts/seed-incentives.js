/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads a month of incentives into TTMS from a spec file: the goals, the prize,
 * who takes part, their own targets and anything already recorded for them.
 *
 * ## Why this exists
 *
 * The first programme (November 2026, the Black Friday bonus) was run in a
 * spreadsheet for three weeks before the Incentives section existed. This
 * carries it over so nobody retypes nineteen people's figures by hand. Later
 * months are set up on the page itself (Incentives → Set up); this is for an
 * import, not a routine.
 *
 * ## The spec file
 *
 *   {
 *     "month": "2026-11",
 *     "program": { "title": …, "goals": [...], "prize": {...}, … },   // as in src/types/incentive.ts
 *     "people": [
 *       { "name": "ANDREW GALICIA",          // as the spreadsheet spells it
 *         "email": "…",                      // optional: settles a name that does not match
 *         "targets": { "g1": 10, "g5": 5070 },
 *         "marks":   { "g1": { "value": 31.6 }, "g5": { "value": 6670 } },
 *         "prizeValue": null }
 *     ]
 *   }
 *
 * Names are matched against the allowlist (first and last name, or the
 * display name), ignoring case and accents, then on first name + surname
 * initial for the nicknames a spreadsheet uses ("Javi" for Javier). Anybody
 * not matched exactly once is reported and nothing is written: add their
 * `email` to the spec and run it again.
 *
 * ## What it does not do
 *
 * - It refuses a month that already has a programme, unless --replace. A
 *   month set up on the page is somebody's work.
 * - It never touches the allowlist or anybody's account.
 * - Marks are stamped as recorded by "Spreadsheet import", so every card says
 *   where its number came from.
 *
 * ## Usage
 *
 *   node scripts/seed-incentives.js --file <spec.json> --dry-run
 *   node scripts/seed-incentives.js --file <spec.json>
 *   node scripts/seed-incentives.js --file <spec.json> --replace
 *
 * ⚠️  .env.local points at the live project. Run --dry-run first and read it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const REPLACE = process.argv.includes('--replace');
const fileArg = process.argv[process.argv.indexOf('--file') + 1];
if (!process.argv.includes('--file') || !fileArg) {
  console.error('Usage: node scripts/seed-incentives.js --file <spec.json> [--dry-run] [--replace]');
  process.exit(1);
}

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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

const COLLECTION = 'incentivePrograms';
const IMPORTER = { byUid: 'import', byName: 'Spreadsheet import' };

function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Same as fullName() in src/types/allowedUser.ts. */
function fullName(d) {
  const joined = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
  return joined || String(d.displayName || '').trim();
}

function resolve(person, staff) {
  if (person.email) {
    const hit = staff.find((s) => s.email === String(person.email).toLowerCase().trim());
    return hit ? [hit] : [];
  }
  const want = fold(person.name);
  const exact = staff.filter((s) => s.names.some((n) => n === want));
  if (exact.length) return exact;
  // "JAVI DURAN" → a first name starting "javi" and a surname word "duran".
  const [first, ...rest] = want.split(' ');
  const last = rest[rest.length - 1];
  if (!first || !last) return [];
  return staff.filter((s) => s.names.some((n) => {
    const w = n.split(' ');
    return w[0] && (w[0].startsWith(first) || first.startsWith(w[0])) && w.slice(1).includes(last);
  }));
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — nothing will be written\n' : 'APPLYING\n');
  const spec = JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8'));
  const month = spec.month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('The spec needs "month": "YYYY-MM".');

  const ref = db.collection(COLLECTION).doc(month);
  const existing = await ref.get();
  if (existing.exists && !REPLACE) {
    console.log(`${month} already has a programme ("${existing.data().title}"). Run with --replace to overwrite it.`);
    process.exit(1);
  }

  const allow = await db.collection('allowedUsers').get();
  const staff = allow.docs
    .map((d) => ({ email: d.id, data: d.data() }))
    .filter((s) => typeof s.data.uid === 'string' && s.data.uid && s.data.suspended !== true)
    .map((s) => ({
      email: s.email,
      uid: s.data.uid,
      name: fullName(s.data) || s.email,
      names: [fold(fullName(s.data)), fold(s.data.displayName)].filter(Boolean),
    }));

  const goalIds = new Set((spec.program.goals || []).map((g) => g.id));
  const perPerson = new Set((spec.program.goals || []).filter((g) => g.perPerson).map((g) => g.id));
  const participants = [];
  const progress = [];
  const problems = [];

  for (const person of spec.people) {
    const hits = resolve(person, staff);
    if (hits.length !== 1) {
      problems.push(`${person.name}: ${hits.length === 0 ? 'no TTMS account matches' : `matches ${hits.map((h) => h.name).join(', ')}`}`);
      continue;
    }
    const who = hits[0];
    if (participants.some((p) => p.uid === who.uid)) { problems.push(`${person.name}: same account as somebody above (${who.name})`); continue; }
    const targets = {};
    for (const [k, v] of Object.entries(person.targets || {})) {
      if (!perPerson.has(k)) { problems.push(`${person.name}: target for ${k}, which is not a per-person goal`); continue; }
      if (typeof v === 'number' && Number.isFinite(v)) targets[k] = v;
    }
    participants.push({ uid: who.uid, name: who.name, targets });

    const now = new Date().toISOString();
    const marks = {};
    for (const [k, m] of Object.entries(person.marks || {})) {
      if (!goalIds.has(k)) { problems.push(`${person.name}: mark for unknown goal ${k}`); continue; }
      marks[k] = {
        value: typeof m.value === 'number' ? m.value : null,
        done: m.done === true, na: m.na === true, note: m.note || '',
        at: now, ...IMPORTER,
      };
    }
    progress.push({ uid: who.uid, sheetName: person.name, ttmsName: who.name, email: who.email, marks,
      prizeValue: typeof person.prizeValue === 'number' ? person.prizeValue : null });
  }

  console.log(`Programme: ${month} — "${spec.program.title}"`);
  console.log(`  ${spec.program.goals.length} goals, paying up to ${spec.program.goals.reduce((s, g) => s + g.reward, 0)} (${spec.program.currency || 'GTQ'})`);
  console.log(`  prize: ${spec.program.prize ? spec.program.prize.title : 'none'}\n`);
  console.log('People:');
  for (const p of progress) {
    const t = participants.find((x) => x.uid === p.uid).targets;
    const marks = Object.entries(p.marks).map(([k, m]) => `${k}=${m.value ?? (m.done ? 'done' : '—')}`).join(' ');
    const targets = Object.entries(t).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`  ${p.sheetName.padEnd(18)} → ${p.ttmsName} <${p.email}>`);
    console.log(`  ${''.padEnd(18)}   targets ${targets || '—'} · marks ${marks || '—'}`);
  }

  if (problems.length) {
    console.log('\nNot matched — add "email" to these people in the spec and run again:');
    for (const p of problems) console.log(`  ${p}`);
    console.log('\nTTMS accounts that could be added (signed in, not suspended):');
    const used = new Set(participants.map((p) => p.uid));
    for (const s of staff.filter((s) => !used.has(s.uid)).sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  ${s.name} <${s.email}>`);
    }
    // Progress is kept by uid, which an account gets at its first sign-in —
    // so somebody invited but never signed in cannot take part yet.
    const pending = allow.docs.filter((d) => !d.data().uid && d.data().suspended !== true);
    if (pending.length) {
      console.log('\nOn the allowlist but never signed in (cannot take part until they do):');
      for (const d of pending) console.log(`  ${fullName(d.data()) || d.id} <${d.id}>`);
    }
    console.log('\nNothing written.');
    process.exit(1);
  }

  if (DRY_RUN) { console.log('\nDry run complete. Nothing written.'); return; }

  const now = new Date().toISOString();
  const program = JSON.parse(JSON.stringify({
    ...spec.program, month, participants, updatedAt: now, updatedByName: IMPORTER.byName,
  }));
  const batch = db.batch();
  batch.set(ref, program);
  if (REPLACE) {
    const old = await ref.collection('progress').get();
    for (const d of old.docs) batch.delete(d.ref);
  }
  for (const p of progress) {
    batch.set(ref.collection('progress').doc(p.uid), { marks: p.marks, prizeValue: p.prizeValue, prizeNote: '' });
  }
  batch.create(ref.collection('events').doc(), {
    at: now, ...IMPORTER, kind: 'program',
    from: null, to: { title: program.title, imported: progress.length },
  });
  await batch.commit();
  console.log(`\nWrote ${month}: the programme and ${progress.length} people.`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
