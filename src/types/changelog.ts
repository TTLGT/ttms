/**
 * The Change history — every change made to TTMS itself, one entry per
 * commit, read from src/lib/data/changelog.json. That file is written by
 * scripts/update-changelog.js on every build; see that script for why it is
 * a committed file rather than a live read of git.
 *
 * ## One account, by address, on purpose
 *
 * The page is for the IT role account and nobody else, admins included. That
 * is a person-shaped question rather than an ability, so it is an email test
 * and not a permission: a permission would be grantable from Settings, and
 * the point is that it is not. The address is the role account every console
 * is reached through, not a person, so this does not break when staff change.
 *
 * Nothing here is secret in the way payroll is — the entries describe code —
 * but they do name security rules, routes and how each boundary is enforced,
 * which is a map nobody else needs.
 *
 * This module is pure and browser-safe; the JSON is imported only by
 * /api/changelog, so the history is never shipped in a page bundle.
 */

import { normalizeEmail } from '@/lib/accessControl';

export const CHANGELOG_VIEWER_EMAIL = 'it@totaltransportlogistics.us';

/** The whole gate. The API route and the sidebar both ask this. */
export function canSeeChangelog(email: string | null | undefined): boolean {
  return normalizeEmail(email) === CHANGELOG_VIEWER_EMAIL;
}

/** One change as stored in the JSON — exactly what git said. */
export interface StoredChange {
  hash: string;
  /** ISO 8601 with the author's offset, which is office time (UTC−6). */
  date: string;
  author: string;
  subject: string;
  body: string;
}

export type ChangeType = 'feature' | 'improvement' | 'fix' | 'security' | 'maintenance';

export const CHANGE_TYPES: readonly ChangeType[] = [
  'feature', 'improvement', 'fix', 'security', 'maintenance',
];

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  feature:     'New',
  improvement: 'Change',
  fix:         'Fix',
  security:    'Security',
  maintenance: 'Maintenance',
};

/** What the page receives: the stored change plus what is worked out from it. */
export interface Change extends StoredChange {
  type: ChangeType;
  /** `YYYY-MM-DD` in office time — what the date filters compare against. */
  day: string;
}

/**
 * Sorts a change into a type from the wording of its title.
 *
 * A guess, and labelled as one on the page. Commits here are written as plain
 * sentences ("Let finance recheck a lane's mileage") rather than tagged, so
 * the verb is the best evidence there is. Worked out when the history is
 * served rather than stored in the file, so improving these patterns
 * re-sorts every entry, old ones included, with no script to re-run.
 *
 * Order matters: a fix to a security rule is a fix first. Security is kept
 * narrow on purpose — words like "permission" also appear in ordinary
 * features ("ask for notification permission"), and a Security label on
 * those would make the filter useless for finding the real ones.
 */
export function changeTypeOf(subject: string): ChangeType {
  const s = subject.trim();
  if (/^fix(\(.+\))?:|^(fix|stop|repair|correct|restore)\b|\bagain\b/i.test(s)) return 'fix';
  if (/\b(security|allowlist|require auth|live rules|rules deploy)\b/i.test(s)) return 'security';
  if (/^(chore|docs|refactor|build|ci|test|style)(\(.+\))?:/i.test(s)) return 'maintenance';
  if (/\b(handbook|claude\.md|readme|git rule)\b|^record who\b/i.test(s)) return 'maintenance';
  if (/^(feat(\(.+\))?:|add|let|give|show|introduce|create|allow|enable|capture|greet|say|find|list|open|ask|count|point|initial commit)\b/i.test(s)) {
    return 'feature';
  }
  return 'improvement';
}

export function toChange(stored: StoredChange): Change {
  return { ...stored, type: changeTypeOf(stored.subject), day: stored.date.slice(0, 10) };
}
