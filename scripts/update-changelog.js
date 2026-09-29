#!/usr/bin/env node
/**
 * Copies the git history into src/lib/data/changelog.json, which is what the
 * Change history page (/dashboard/changes) reads.
 *
 *   node scripts/update-changelog.js            # add anything new
 *   node scripts/update-changelog.js --dry-run  # say what would be added
 *
 * Runs by itself as `prebuild`, so every `npm run build` — the local one
 * before a push and Vercel's after it — records whatever has been committed.
 * It writes a file in the repo and nothing else; it never touches Firestore.
 *
 * Why a committed file rather than reading git when the page loads: the
 * deployed site has no repository to read. And why not rebuild it from
 * scratch each time: Vercel clones only the last few commits, so a file built
 * from `git log` alone would shrink to about ten entries on every deploy. The
 * file is the record and git only ever adds to it — an entry is never removed
 * or rewritten once it is in, even if the commit disappears from view.
 *
 * The one gap that leaves: more commits pushed at once than Vercel clones,
 * with no local build in between to add them to the file. The next local
 * build fills them in from the full history, so nothing is lost for good.
 *
 * If git is missing or fails, the file is left as it is and the build carries
 * on — a history page a few entries short is no reason to block a release.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const OUT = path.join(__dirname, '..', 'src', 'lib', 'data', 'changelog.json');

// Control characters as separators: they cannot appear in a commit message
// typed at a keyboard, so a body with any punctuation at all parses cleanly.
const FIELD = '\x1f';
const RECORD = '\x1e';

function readGit() {
  const raw = execFileSync(
    'git',
    ['log', `--format=%H${FIELD}%aI${FIELD}%an${FIELD}%s${FIELD}%b${RECORD}`],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  return raw
    .split(RECORD)
    .map((r) => r.replace(/^\s+/, ''))
    .filter(Boolean)
    .map((r) => {
      const [hash, date, author, subject, body = ''] = r.split(FIELD);
      return {
        hash,
        // The author's own clock, with its offset — which here is the office's,
        // so the day a change is filed under is the day it was made in Guatemala.
        date,
        author,
        subject: subject.trim(),
        // The co-author trailer is on nearly every commit and describes nothing.
        body: body
          .split('\n')
          .filter((line) => !/^Co-Authored-By:/i.test(line.trim()))
          .join('\n')
          .trim(),
      };
    });
}

function readFile() {
  try {
    const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    return Array.isArray(data.changes) ? data.changes : [];
  } catch {
    return [];
  }
}

function main() {
  let fromGit;
  try {
    fromGit = readGit();
  } catch (e) {
    console.warn(`[changelog] git log failed, keeping the file as it is: ${e.message.split('\n')[0]}`);
    return;
  }

  const existing = readFile();
  const known = new Set(existing.map((c) => c.hash));
  const added = fromGit.filter((c) => !known.has(c.hash));

  if (added.length === 0) {
    console.log(`[changelog] up to date (${existing.length} changes)`);
    return;
  }

  // Newest first, which is how the page shows them; ties broken by hash so the
  // file comes out byte-for-byte the same however it was assembled.
  const changes = [...existing, ...added].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || a.hash.localeCompare(b.hash),
  );

  for (const c of added) console.log(`[changelog] + ${c.date.slice(0, 10)} ${c.hash.slice(0, 7)} ${c.subject}`);

  if (DRY_RUN) {
    console.log(`[changelog] dry run: would add ${added.length}, making ${changes.length}`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ changes }, null, 2) + '\n');
  console.log(`[changelog] added ${added.length}, now ${changes.length}`);
}

main();
