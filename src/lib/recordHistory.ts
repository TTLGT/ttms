/**
 * Writing and reading the change history of orders, parties and carriers.
 * See src/types/recordHistory.ts for what an entry is and why it is stored where.
 *
 * The one rule this module exists to keep: **an entry is written in the same
 * batch or transaction as the change it describes.** A change that landed
 * without its entry, or an entry for a change that failed, would make the
 * history a record of what probably happened, which is worse than none.
 */

import { FieldValue, Timestamp, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { decodeRecordPatch } from './recordWire';
import { OWNER_EVENTS_SUBCOLLECTION } from '@/types/ownerEvent';
import {
  CHANGES_SUBCOLLECTION,
  UNRECORDED_FIELDS,
  isBlankValue,
  type ChangeAction,
  type ChangeEntry,
  type ChangeVia,
  type FieldChange,
} from '@/types/recordHistory';

export interface ChangeActor {
  uid: string;
  name: string;
  email: string;
  via: ChangeVia;
}

/** The actor for a signed-in caller already resolved by requireCaller(). */
export function actorOf(caller: { uid: string; email?: string; displayName: string }): ChangeActor {
  return { uid: caller.uid, name: caller.displayName, email: caller.email ?? '', via: 'app' };
}

/**
 * The actor for a route that only has the uid — the ones guarded by
 * requirePermission(), which does not hand back a name. One profile read.
 */
export async function actorForUid(uid: string, email: string | undefined): Promise<ChangeActor> {
  const snap = await adminDb.collection('users').doc(uid).get();
  const name = (snap.data()?.displayName as string | undefined)?.trim() || email || 'Unknown user';
  return { uid, name, email: email ?? '', via: 'app' };
}

/** A JSON patch from the browser, with its dates turned back into Timestamps. */
export function decodePatch(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return decodeRecordPatch(raw, (ms) => Timestamp.fromMillis(ms)) as Record<string, unknown>;
}

/**
 * A stable string for a value, so two values can be compared regardless of
 * key order or of a Timestamp being a different object with the same time.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (isBlankValue(a) && isBlankValue(b)) return true;
  return canonical(a) === canonical(b);
}

function canonical(v: unknown): string {
  return JSON.stringify(normalise(v));
}

function normalise(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Timestamp) return { $ts: v.toMillis() };
  if (v instanceof Date) return { $ts: v.getTime() };
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.toMillis === 'function') return { $ts: (o.toMillis as () => number)() };
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, normalise(o[k])]));
  }
  return v;
}

/** Strings past this are kept cut short; a value past MAX_JSON is not kept at all. */
const MAX_STRING = 2000;
const MAX_JSON   = 8000;

/**
 * A value as it can be stored on an entry.
 *
 * Firestore refuses `undefined`, and one entry must never come near the 1 MiB
 * document limit however long somebody's notes are — so a very long value is
 * kept as its first two thousand characters, and a very large structure as a
 * note saying so. The record itself still holds the whole value.
 */
function storable(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'string') return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}…` : v;
  if (v instanceof FieldValue) return null;
  if (v && typeof v === 'object' && !(v instanceof Timestamp)) {
    if (JSON.stringify(normalise(v)).length > MAX_JSON) return '(too large to keep in the history)';
  }
  return v;
}

/**
 * What a patch actually changes on a record, field by field.
 *
 * Only the keys in the patch are looked at, and a key whose value is the
 * same as what is stored is left out — the edit screens send a whole
 * section back, and most of it is unchanged. A FieldValue sentinel
 * (serverTimestamp, increment) has no value to compare, so it is skipped.
 */
export function diffFields(before: DocumentData, patch: Record<string, unknown>): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [field, to] of Object.entries(patch)) {
    if (UNRECORDED_FIELDS.has(field)) continue;
    if (to instanceof FieldValue) continue;
    const from = before[field];
    if (sameValue(from, to)) continue;
    // A phone's country reads as US when it was never stored (phoneRegionOf),
    // so the first save of an older record writing 'US' is not a change.
    if (/Region$/.test(field) && isBlankValue(from) && to === 'US') continue;
    changes.push({ field, from: storable(from), to: storable(to) });
  }
  return changes;
}

/** Anything with a `set` — a WriteBatch or a Transaction. */
interface Writer {
  set(ref: DocumentReference, data: DocumentData): unknown;
}

export interface PendingChange {
  action: ChangeAction;
  summary?: string;
  fields?: FieldChange[];
}

/** Queues one entry on a batch or transaction that is about to commit. */
export function writeChange(
  writer: Writer,
  parent: DocumentReference,
  change: PendingChange,
  actor: ChangeActor,
  at: Timestamp = Timestamp.now(),
): void {
  writer.set(parent.collection(CHANGES_SUBCOLLECTION).doc(), {
    action:     change.action,
    summary:    change.summary ?? '',
    fields:     change.fields ?? [],
    actorUid:   actor.uid,
    actorName:  actor.name,
    actorEmail: actor.email,
    via:        actor.via,
    at,
  });
}

/**
 * Updates a record and records what changed, in one batch.
 *
 * For the server routes that used to call `ref.update(patch)` directly. It
 * costs one read of the record, to know what the fields were before. An
 * update that changes nothing recordable and carries no summary writes the
 * record but no entry — a re-save of the same values is not news.
 */
export async function updateWithHistory(
  ref: DocumentReference,
  patch: Record<string, unknown>,
  actor: ChangeActor,
  summary = '',
): Promise<void> {
  const before = (await ref.get()).data() ?? {};
  const fields = diffFields(before, patch);
  const batch  = adminDb.batch();
  batch.update(ref, patch);
  if (fields.length || summary) {
    writeChange(batch, ref, { action: summary ? 'event' : 'updated', summary, fields }, actor);
  }
  await batch.commit();
}

/** An entry with no change to the record behind it — an agreement emailed. */
export async function recordEvent(
  ref: DocumentReference,
  summary: string,
  actor: ChangeActor,
): Promise<void> {
  const batch = adminDb.batch();
  writeChange(batch, ref, { action: 'event', summary }, actor);
  await batch.commit();
}

/** How many entries one history read returns. Newest first. */
const HISTORY_LIMIT = 300;

/**
 * A record's whole timeline: its change entries, and — for orders and
 * parties — its ownership trail, written in the same shape so the screen
 * draws one list. The ownership trail is not copied into `changes` on write
 * because it already exists and is already written atomically with the
 * change it records; two copies would be two answers.
 *
 * Callers check the reader may see the record before calling this.
 */
export async function readHistory(
  ref: DocumentReference,
  withOwners: boolean,
): Promise<ChangeEntryOut[]> {
  const [changes, owners] = await Promise.all([
    ref.collection(CHANGES_SUBCOLLECTION).orderBy('at', 'desc').limit(HISTORY_LIMIT).get(),
    withOwners
      ? ref.collection(OWNER_EVENTS_SUBCOLLECTION).orderBy('at', 'desc').limit(HISTORY_LIMIT).get()
      : null,
  ]);

  const entries: ChangeEntryOut[] = changes.docs.map((d) => {
    const x = d.data();
    return {
      id:         d.id,
      action:     x.action ?? 'updated',
      summary:    x.summary ?? '',
      fields:     Array.isArray(x.fields) ? x.fields : [],
      actorUid:   x.actorUid ?? '',
      actorName:  x.actorName ?? '',
      actorEmail: x.actorEmail ?? '',
      via:        x.via ?? 'app',
      at:         x.at,
    };
  });

  for (const d of owners?.docs ?? []) {
    const x = d.data();
    const who = x.targetType === 'group' ? `the work group ${x.targetLabel}` : x.targetLabel;
    const summary = x.targetType === 'text'
      ? `Imported from BATS as belonging to ${x.targetLabel}`
      : x.action === 'removed'
        ? `Removed ${who} as an owner`
        : `Added ${who} as an owner`;
    entries.push({
      id:         `owner-${d.id}`,
      action:     'event',
      summary,
      fields:     [],
      actorUid:   x.actorUid ?? '',
      actorName:  x.actorName ?? '',
      actorEmail: '',
      via:        'app',
      at:         x.at,
    });
  }

  entries.sort((a, b) => millis(b.at) - millis(a.at));
  return entries.slice(0, HISTORY_LIMIT);
}

type ChangeEntryOut = Omit<ChangeEntry, 'at'> & { at: Timestamp };

function millis(t: unknown): number {
  return t instanceof Timestamp ? t.toMillis() : 0;
}
