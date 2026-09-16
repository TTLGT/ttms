import { adminDb, FieldValue } from './firebase-admin';
import { systemLine } from './chatAlerts';
import {
  MEMBER_EVENTS_COLLECTION,
  ROOM_POLICY_SETTINGS,
  type MemberEventAction,
  type RoomAudience,
  type RoomPolicy,
} from '@/types/conversation';

/**
 * Server-side chat helpers, shared by the two /api/chat routes.
 *
 * This lives here rather than beside the routes because a Next route file may
 * only export HTTP handlers — anything else in it fails the build.
 */

/** Longest room name we store, so a title cannot become a paragraph. */
export const MAX_ROOM_NAME = 80;

/**
 * The requested members that actually exist, plus the caller.
 *
 * Every uid is checked against `users` rather than taken on trust: a room's
 * membership array is exactly what the security rules read, so a uid that got
 * in here unverified would be a membership nobody can account for.
 *
 * The caller is always included. A room its creator is not in would be
 * invisible to them in both views and impossible to get back into.
 */
export async function validMembers(raw: unknown, callerUid: string): Promise<string[]> {
  const requested = Array.isArray(raw)
    ? Array.from(new Set((raw as unknown[]).map((u) => String(u)).filter(Boolean)))
    : [];

  const checked: string[] = [];
  for (const uid of requested) {
    if (uid === callerUid) continue;
    const snap = await adminDb.collection('users').doc(uid).get();
    if (snap.exists) checked.push(uid);
  }
  return Array.from(new Set([callerUid, ...checked]));
}

/**
 * Whether a room picture path is one of this room's own files.
 *
 * The picture is uploaded straight to Storage from the browser, so the path
 * arrives here as a string somebody typed as easily as picked. Every allowed
 * account can read the whole `chat/` and `driver-licenses/` prefixes — storage
 * rules cannot read Firestore, so they cannot be narrower — which means an
 * unchecked path would let a member set their room's picture to any file in
 * the bucket whose path they know, and have it rendered for everyone in the
 * room. Confining it to the room's own folder makes the picture no more
 * reachable than the messages already in it.
 *
 * **Keep in sync with uploadRoomPhoto() in src/lib/chatUploads.ts**, which
 * builds the path and cannot be imported from a route.
 */
export function roomPhotoBelongsTo(path: string, conversationId: string): boolean {
  const prefix = `chat/${conversationId}/`;
  return path.startsWith(prefix)
    // No traversal back out of the folder, and no second path smuggled in on
    // the end of the first.
    && !path.slice(prefix.length).includes('..');
}

/* --------------------------------------------- who has been in a room, and
                                                  who put them there */

/**
 * What a room's members are called, as they are called right now.
 *
 * Read in one round trip rather than a document at a time: a save that adds
 * three people and removes two would otherwise be five sequential reads before
 * anything is written. The name is copied into the history entry at this
 * moment and never looked up again — see MemberEvent.
 */
async function namesOf(uids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (uids.length === 0) return names;

  const refs  = uids.map((uid) => adminDb.collection('users').doc(uid));
  const snaps = await adminDb.getAll(...refs);
  for (const snap of snaps) {
    const data = snap.data() ?? {};
    // The same fallback chain requireCaller uses, so one person does not read
    // as two different things depending on which end of the change they were.
    names.set(snap.id, data.displayName || data.email || snap.id);
  }
  return names;
}

/** "Vivian De Leon", "Vivian De Leon and Tom Reed", "A, B and C". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Everything one save can do to a room, as the history should record it.
 *
 * Membership and the rest arrive together because they are one act by one
 * person at one moment — a save that adds two people and makes one of them an
 * admin is a single thing that happened, and splitting it across two writers
 * would produce two lines in the room and two timestamps in the history that
 * a reader then has to work out were the same save.
 */
export interface RoomChange {
  /** The membership a room opened with. Recorded, never announced. */
  created?: string[];
  added?: string[];
  removed?: string[];
  /** The actor removing themselves, which is a different act from being removed. */
  left?: boolean;
  adminAdded?: string[];
  adminRemoved?: string[];
  /** Who was silenced and until when. */
  muted?: { uid: string; until: number }[];
  unmuted?: string[];
  /** Switches that moved, already worded — see MemberEvent.detail. */
  policy?: { key: keyof RoomPolicy; label: string; value: RoomAudience }[];
}

/**
 * Records what was done to a room, and says so in the room.
 *
 * Two things land here, and they land in the caller's batch alongside the
 * write itself so that all three are one act. A change that saved without its
 * history entry would be exactly the silent reassignment the entries exist to
 * make impossible, and a line announcing a change that then failed to save
 * would be worse than no line at all.
 *
 *  - **An entry per thing that happened** in `memberEvents`, which is the
 *    durable record and what Room settings reads back. See MemberEvent.
 *  - **One line in the room**, so the people in it find out where they are
 *    already looking rather than by noticing that the member list is different
 *    or that their composer has stopped working. One line per save rather than
 *    one per person: three lines in a row from TTMS reads as an outage.
 *
 * Two exceptions write no line, for opposite reasons.
 *
 * `created` is silent because the room is empty at that moment and everybody
 * in it has just been told it exists by its appearing in their list — an
 * opening line naming the people already named in the header would be the
 * first thing in every room and say nothing.
 *
 * **A mute is silent because announcing it is a punishment of its own.**
 * "Vivian muted Tom until Friday" posted in front of eleven colleagues is a
 * different and much larger act than stopping Tom writing for a day, and it is
 * not the one an admin chose. It is still recorded in the history, which every
 * member can open, and the person muted is told plainly in their own composer
 * — so it is on the record and never a mystery to the one person it is about.
 * What it is not is a notice on a wall.
 *
 * Returns the fields the room itself needs — the preview line and the ordering
 * stamp the announcement carries — for the caller to merge into the update it
 * is already making. See systemLine for why they are handed back rather than
 * written here.
 */
export async function writeRoomChange(
  batch: FirebaseFirestore.WriteBatch,
  room: FirebaseFirestore.DocumentReference,
  change: RoomChange,
  actor: { uid: string; name: string },
): Promise<Record<string, unknown>> {
  const created      = change.created      ?? [];
  const added        = change.added        ?? [];
  const removed      = change.removed      ?? [];
  const adminAdded   = change.adminAdded   ?? [];
  const adminRemoved = change.adminRemoved ?? [];
  const muted        = change.muted        ?? [];
  const unmuted      = change.unmuted      ?? [];
  const policy       = change.policy       ?? [];
  const left         = change.left === true;

  const touched = [
    ...created, ...added, ...removed, ...adminAdded, ...adminRemoved,
    ...muted.map((m) => m.uid), ...unmuted,
  ];
  if (touched.length === 0 && policy.length === 0 && !left) return {};

  // The actor is in the map too: they are the subject of their own `left`
  // entry, and resolving them here keeps every name in the history captured
  // the same way.
  const names  = await namesOf(Array.from(new Set([...touched, ...(left ? [actor.uid] : [])])));
  const nameOf = (uid: string) => names.get(uid) ?? uid;

  const events: { action: MemberEventAction; uid: string; until?: number; detail?: string }[] = [
    ...created.map((uid)      => ({ action: 'created'       as const, uid })),
    ...added.map((uid)        => ({ action: 'added'         as const, uid })),
    ...removed.map((uid)      => ({ action: 'removed'       as const, uid })),
    ...adminAdded.map((uid)   => ({ action: 'admin_added'   as const, uid })),
    ...adminRemoved.map((uid) => ({ action: 'admin_removed' as const, uid })),
    ...muted.map((m)          => ({ action: 'muted'         as const, uid: m.uid, until: m.until })),
    ...unmuted.map((uid)      => ({ action: 'unmuted'       as const, uid })),
    // A switch is about the room, not about a person, so it carries no uid.
    // The wording is fixed here rather than stored as a key and a value — see
    // MemberEvent.detail.
    ...policy.map((p) => ({
      action: 'policy' as const,
      uid:    '',
      detail: `${p.label} to ${p.value === 'admins' ? 'admins only' : 'everyone'}`,
    })),
    ...(left ? [{ action: 'left' as const, uid: actor.uid }] : []),
  ];

  const col = room.collection(MEMBER_EVENTS_COLLECTION);
  for (const event of events) {
    batch.set(col.doc(), {
      action:  event.action,
      uid:     event.uid,
      name:    event.uid ? nameOf(event.uid) : '',
      byUid:   actor.uid,
      byName:  actor.name,
      at:      FieldValue.serverTimestamp(),
      // Firestore refuses `undefined`, so the two optional fields are written
      // as explicit nulls rather than left off.
      until:   event.until  ?? null,
      detail:  event.detail ?? null,
    });
  }

  if (left) {
    return systemLine(batch, room, `${actor.name} left the room.`);
  }

  const said = [
    added.length        ? `added ${listOf(added.map(nameOf))}`                                        : '',
    removed.length      ? `removed ${listOf(removed.map(nameOf))}`                                    : '',
    adminAdded.length   ? `made ${listOf(adminAdded.map(nameOf))} ${adminAdded.length === 1 ? 'an admin' : 'admins'}` : '',
    adminRemoved.length ? `took admin away from ${listOf(adminRemoved.map(nameOf))}`                  : '',
    // Said because the room's behaviour has just changed under people who are
    // in the middle of using it. Somebody whose composer has gone grey is owed
    // the reason on the screen they are already looking at.
    ...policy.map((p) => p.value === 'admins'
      ? `set ${p.label.toLowerCase()} to admins only`
      : `opened ${p.label.toLowerCase()} to everyone`),
  ].filter(Boolean);

  // Nothing said for `created`, nor for a mute on its own, and nothing to bump
  // the room with either.
  if (said.length === 0) return {};

  return systemLine(batch, room, `${actor.name} ${listOf(said)}.`);
}

/* ------------------------------------------------- reading a policy patch */

const POLICY_KEYS = ROOM_POLICY_SETTINGS.map((s) => s.key);

/**
 * The switches a request is asking to move, checked against the catalog.
 *
 * Read key by key rather than taken as an object, because this is written onto
 * the document the security rules read: an unrecognised key would be stored
 * and then silently ignored by the rules, which is the worst of both — an
 * admin who believes they have locked something and a room that is open.
 *
 * Returns only the keys that actually differ from what the room already says,
 * so a save that touched the name does not write a history entry claiming
 * every switch was set to what it already was.
 */
export function readPolicyPatch(
  raw: unknown,
  current: Partial<RoomPolicy> | undefined,
): { key: keyof RoomPolicy; label: string; value: RoomAudience }[] {
  if (!raw || typeof raw !== 'object') return [];
  const body = raw as Record<string, unknown>;

  const moved: { key: keyof RoomPolicy; label: string; value: RoomAudience }[] = [];
  for (const setting of ROOM_POLICY_SETTINGS) {
    const value = body[setting.key];
    if (value !== 'everyone' && value !== 'admins') continue;
    if ((current?.[setting.key] ?? 'everyone') === value) continue;
    moved.push({ key: setting.key, label: setting.label, value });
  }
  return moved;
}

export function isPolicyKey(value: unknown): value is keyof RoomPolicy {
  return typeof value === 'string' && (POLICY_KEYS as string[]).includes(value);
}

/**
 * How far ahead a mute may be set.
 *
 * A year, which is not a limit anybody will meet — it is there so that a
 * mistyped year cannot silence a colleague until 2126 in a system with nothing
 * scheduled to notice. An admin who wants somebody permanently unable to write
 * in a room is describing removing them from it.
 */
export const MAX_MUTE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * When a requested mute should lift, or null if the request is not a mute.
 *
 * Throws rather than falling back to a default, because every default here is
 * wrong. Treating a missing deadline as "forever" is the thing mutes were
 * given a clock to prevent, and treating it as "an hour" would quietly not do
 * what the admin asked.
 */
export function readMuteUntil(raw: unknown, now = Date.now()): number {
  const until = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(until)) throw new Error('Say when the mute should lift.');
  if (until <= now)            throw new Error('That mute would already have lifted. Pick a time in the future.');
  if (until > now + MAX_MUTE_MS) throw new Error('A mute can run for at most a year. Remove them from the room instead.');
  return Math.round(until);
}
