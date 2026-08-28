import type { Timestamp } from 'firebase/firestore';

/**
 * Where a client or a load came from — a referral, a load board, a campaign.
 *
 * A managed list rather than free text on each record, because the whole point
 * of recording a source is to total it up later. Typed by hand, the same
 * source arrives as "Google", "google ads" and "GoogleAds" and reports on it
 * are worthless. Orders and parties therefore store a `sourceId` pointing
 * here, plus a denormalized `sourceName` for display.
 *
 * Lead sources are reference data and grant nothing, the same as `sites`:
 * every signed-in user can read the list so a picker can render, and only
 * admins can change it, through /api/lead-sources. Who may set the source *on
 * a record* is a different question — see canEditSource() in
 * src/lib/accessControl.ts.
 */
export interface LeadSource {
  id: string;
  name: string;
  /** Normalized `toSourceKey(name)`. Stored so imports can match on it. */
  nameKey: string;
  /**
   * Retired sources stay in the collection rather than being deleted, so the
   * orders that reference them keep a working label. Inactive ones drop out of
   * the pickers but still render on records that already carry them.
   */
  isActive: boolean;
  createdAt: Timestamp | null;
  createdBy: string;
  updatedAt: Timestamp | null;
}

/**
 * Normalizes a source name for matching.
 *
 * Deliberately simpler than `toNameKey` in src/types/party.ts: that one
 * canonicalizes company suffixes (Inc, LLC) because it is matching business
 * names. A lead source is a label someone chose, so case, punctuation and
 * spacing are the only noise worth removing.
 *
 * Keep in sync with the copy in scripts/import-bats.js.
 */
export function toSourceKey(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Document id for a source, derived from its key.
 *
 * Deterministic and readable (`ls-google-ads`) rather than hashed, so that the
 * two importers, the API and the browser all arrive at the same id for the
 * same name without sharing a hashing implementation — the browser has no
 * `crypto.createHash`. Being derived also makes a re-import idempotent: the
 * second run addresses the document the first one wrote instead of creating a
 * duplicate.
 */
export function leadSourceDocId(key: string): string {
  return `ls-${key.replace(/\s+/g, '-')}`;
}
