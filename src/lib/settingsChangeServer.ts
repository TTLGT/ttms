import type { DocumentData, Transaction, WriteBatch } from 'firebase-admin/firestore';
import { FieldValue, adminDb } from '@/lib/firebase-admin';
import { can, normalizeEmail, type RoleFlags } from '@/lib/accessControl';
import {
  AREA_PERMISSIONS,
  MAX_TEXT_VALUE,
  SETTINGS_AREAS,
  describeChanges,
  isSettingsArea,
  type FieldChange,
  type SettingsArea,
  type SettingsChange,
} from '@/types/settingsChange';

/**
 * Writing and reading the settings change log. See src/types/settingsChange.ts.
 *
 * Every route that saves a company setting calls `logSettingsChange()`. Where
 * the route makes one write, the entry goes into the same batch, so a setting
 * can never change without its entry (the same rule the order change log
 * keeps). Where a route's write is buried in a helper, the entry is written
 * just after it and a failure is logged rather than thrown: the save already
 * happened, and refusing to say so would be worse than a missing line.
 */

export const SETTINGS_CHANGES = 'settingsChanges';
/**
 * The newest entry for each area, one document per area, written beside every
 * entry. It is what the "Last changed by" line under a page title reads: one
 * document instead of a scan of the log on every page view.
 */
export const SETTINGS_CHANGES_LATEST = 'settingsChangesLatest';

export interface ChangeCaller {
  uid: string;
  email?: string | null;
}

/** The name to print beside an entry. One read; settings saves are rare. */
async function nameOf(caller: ChangeCaller): Promise<string> {
  try {
    const snap = await adminDb.collection('users').doc(caller.uid).get();
    const name = snap.data()?.displayName;
    if (typeof name === 'string' && name.trim()) return name.trim();
  } catch {
    // The email below is still a perfectly good name.
  }
  return caller.email ?? 'Somebody';
}

export interface ChangeInput {
  area: SettingsArea;
  summary: string;
  caller: ChangeCaller;
  /** What was stored before and after — diffed into `changes`. */
  before?: unknown;
  after?: unknown;
  /** Names for top-level keys a person would not recognise. */
  labels?: Record<string, string>;
  /**
   * Long text kept whole, for the agreement terms: a legal change is read as a
   * before-and-after, and cutting it at 160 characters would hide the clause
   * that changed.
   */
  text?: { field: string; from: string; to: string };
}

async function buildEntry(input: ChangeInput) {
  let changes: FieldChange[] = [];
  let truncated = false;
  if (input.text) {
    changes = [{
      field: input.text.field,
      from: input.text.from.slice(0, MAX_TEXT_VALUE),
      to: input.text.to.slice(0, MAX_TEXT_VALUE),
    }];
  } else if (input.before !== undefined || input.after !== undefined) {
    ({ changes, truncated } = describeChanges(input.before, input.after, input.labels));
  }
  return {
    area: input.area,
    summary: input.summary,
    changes,
    truncated,
    byUid: input.caller.uid,
    byEmail: normalizeEmail(input.caller.email ?? '') || null,
    byName: await nameOf(input.caller),
    at: FieldValue.serverTimestamp(),
  };
}

/**
 * Record one save.
 *
 * With `into`, the entry is added to that batch or transaction and nothing is
 * written until the caller commits — use it wherever the route has one. Without
 * it the entry is written now, best-effort.
 *
 * A save that changed nothing (a Save pressed on an unchanged card) writes no
 * entry: "Vivian changed nothing" is noise in the one place people look to
 * find out what happened.
 */
export async function logSettingsChange(
  input: ChangeInput,
  into?: WriteBatch | Transaction,
): Promise<void> {
  const entry = await buildEntry(input);
  const nothing = !input.text
    && (input.before !== undefined || input.after !== undefined)
    && entry.changes.length === 0;
  if (nothing) return;
  if (input.text && input.text.from === input.text.to) return;

  const ref = adminDb.collection(SETTINGS_CHANGES).doc();
  const latest = adminDb.collection(SETTINGS_CHANGES_LATEST).doc(input.area);
  // Only the who, when and what for the latest copy — the before-and-after
  // can be long, and the title line never shows it.
  const { changes: _changes, ...head } = entry;
  if (into) {
    // Both batch and transaction have a `set(ref, data)` of this shape.
    (into as WriteBatch).set(ref, entry);
    (into as WriteBatch).set(latest, { ...head, entryId: ref.id });
    return;
  }
  try {
    const batch = adminDb.batch();
    batch.set(ref, entry);
    batch.set(latest, { ...head, entryId: ref.id });
    await batch.commit();
  } catch (e) {
    console.error('[settings-changes] could not record a change', input.area, e);
  }
}

/**
 * Names for a handful of uids, for entries about membership. A log that says
 * "added 9xQ2…" answers nothing. One batched read.
 */
export async function namesForUids(uids: string[]): Promise<string[]> {
  if (uids.length === 0) return [];
  const snaps = await adminDb.getAll(...uids.map((u) => adminDb.collection('users').doc(u)));
  return snaps.map((s, i) => {
    const d = s.data();
    return (typeof d?.displayName === 'string' && d.displayName.trim())
      || (typeof d?.email === 'string' && d.email)
      || uids[i];
  });
}

/** Reads the caller's profile once, for `can()`. Bootstrap admins pass as admin. */
export async function profileFor(uid: string): Promise<RoleFlags | null> {
  const snap = await adminDb.collection('users').doc(uid).get();
  return snap.exists ? (snap.data() as RoleFlags) : null;
}

/** Which areas this profile may read the history of. */
export function areasFor(profile: RoleFlags | null, bootstrap: boolean): SettingsArea[] {
  if (bootstrap) return [...SETTINGS_AREAS];
  return SETTINGS_AREAS.filter((area) => AREA_PERMISSIONS[area].some((p) => can(profile, p)));
}

function toEntry(id: string, d: DocumentData): SettingsChange | null {
  if (!isSettingsArea(d.area)) return null;
  return {
    id,
    area: d.area,
    summary: typeof d.summary === 'string' ? d.summary : '',
    changes: Array.isArray(d.changes) ? d.changes : [],
    truncated: d.truncated === true,
    byName: typeof d.byName === 'string' ? d.byName : '',
    byEmail: typeof d.byEmail === 'string' ? d.byEmail : '',
    at: d.at?.toDate?.()?.toISOString?.() ?? null,
  };
}

/** The newest entry of each of these areas, from the one-per-area copies. */
export async function latestSettingsChanges(areas: SettingsArea[]): Promise<SettingsChange[]> {
  if (areas.length === 0) return [];
  const snaps = await adminDb.getAll(...areas.map((a) => adminDb.collection(SETTINGS_CHANGES_LATEST).doc(a)));
  return snaps
    .filter((s) => s.exists)
    .map((s) => toEntry(s.get('entryId') ?? s.id, { ...s.data(), changes: [] }))
    .filter((e): e is SettingsChange => e !== null);
}

/**
 * The newest entries the reader may see.
 *
 * One query ordered by time (a single-field index, which Firestore keeps by
 * itself), filtered to the reader's areas in memory. The collection grows by a
 * handful of entries a week, so reading the newest few hundred and dropping
 * the ones somebody may not see costs less than an index per area would.
 */
export async function listSettingsChanges(
  areas: SettingsArea[],
  opts: { area?: SettingsArea; limit?: number } = {},
): Promise<SettingsChange[]> {
  const allowed = new Set(areas);
  if (opts.area && !allowed.has(opts.area)) return [];

  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  let query = adminDb.collection(SETTINGS_CHANGES).orderBy('at', 'desc').limit(opts.area ? 500 : limit);
  // One area: an equality filter alone is served without a composite index,
  // so it is sorted here instead of by the query.
  if (opts.area) query = adminDb.collection(SETTINGS_CHANGES).where('area', '==', opts.area).limit(500);

  const snap = await query.get();
  return snap.docs
    .map((doc) => toEntry(doc.id, doc.data()))
    .filter((e): e is SettingsChange => e !== null && allowed.has(e.area))
    .sort((a, b) => (b.at ?? '9999').localeCompare(a.at ?? '9999'))
    .slice(0, limit);
}
