/**
 * Build src/lib/data/emoji.json — the list the chat emoji picker draws from.
 *
 * Why this exists: the full emoji set, with names and search words, is a
 * published dataset (`emojibase-data`, MIT) rather than something to type out.
 * But the package as shipped is ~1.5 MB of JSON carrying fields the picker
 * never reads, and importing it directly would put all of that in front of
 * everybody who opens the picker. This trims it to what the picker uses and
 * writes it next to zipCentroids.json, so the app does not depend on the
 * package at run time at all — it is a devDependency for this script only.
 *
 * Writes one local file. Touches no Firestore, no Storage, nothing remote.
 *
 * Re-run after `npm update emojibase-data` to pick up a new Unicode release,
 * and commit the result.
 *
 *   node scripts/build-emoji-data.js
 */

const fs = require('fs');
const path = require('path');

const data = require('emojibase-data/en/data.json');
const meta = require('emojibase-data/meta/groups.json');

// The picker's tabs, in the order people expect them. Group 2 ("component")
// is skin-tone swatches and hair-style pieces — building blocks of other
// emoji, not things anybody sends on their own.
const GROUPS = [
  { id: 0, label: 'Smileys & emotion' },
  { id: 1, label: 'People & body' },
  { id: 3, label: 'Animals & nature' },
  { id: 4, label: 'Food & drink' },
  { id: 5, label: 'Travel & places' },
  { id: 6, label: 'Activities' },
  { id: 7, label: 'Objects' },
  { id: 8, label: 'Symbols' },
  { id: 9, label: 'Flags' },
];

for (const g of GROUPS) {
  if (!(String(g.id) in meta.groups)) throw new Error(`emojibase has no group ${g.id} any more`);
}

const groups = GROUPS.map((g) => ({
  label: g.label,
  emoji: data
    .filter((e) => e.group === g.id)
    .sort((a, b) => a.order - b.order)
    .map((e) => {
      const row = {
        e: e.emoji,
        n: e.label,
        // Search words. The label is searched too, so it is not repeated here.
        t: (e.tags ?? []).filter((t) => !e.label.includes(t)).join(' '),
        v: e.version,
      };
      // Only the five single-tone variants, in tone order. Emoji with two
      // people in them also carry mixed pairs (light + dark, and so on) —
      // twenty-five of them each — which a one-tone setting cannot choose
      // between, so they are left out rather than half-offered.
      const skins = (e.skins ?? [])
        .filter((s) => typeof s.tone === 'number')
        .sort((a, b) => a.tone - b.tone)
        .map((s) => s.emoji);
      if (skins.length === 5) row.s = skins;
      return row;
    }),
}));

const out = path.join(__dirname, '..', 'src', 'lib', 'data', 'emoji.json');
fs.writeFileSync(out, JSON.stringify({ groups }));

const count = groups.reduce((n, g) => n + g.emoji.length, 0);
const kb = Math.round(fs.statSync(out).size / 1024);
console.log(`Wrote ${count} emoji in ${groups.length} groups to ${path.relative(process.cwd(), out)} (${kb} KB).`);
