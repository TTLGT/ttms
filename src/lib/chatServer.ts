import { adminDb, FieldValue } from './firebase-admin';
import { systemLine } from './chatAlerts';
import { MEMBER_EVENTS_COLLECTION, type MemberEventAction } from '@/types/conversation';

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
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Records a change to who is in a room, and says so in the room.
 *
 * Two things land here, and they land in the caller's batch alongside the
 * membership write itself so that all three are one act. A membership change
 * that saved without its history entry would be exactly the silent
 * reassignment the entries exist to make impossible, and a line announcing a
 * change that then failed to save would be worse than no line at all.
 *
 *  - **An entry per person** in `memberEvents`, which is the durable record
 *    and what Room settings reads back. See MemberEvent.
 *  - **One line in the room**, so the people in it find out where they are
 *    already looking rather than by noticing the member list is different.
 *    One line per save rather than one per person: a save that adds two and
 *    removes one is a single thing somebody did, and three lines in a row from
 *    TTMS reads as an outage.
 *
 * `created` is the exception that writes no line. The room is empty at that
 * moment and everybody in it has just been told it exists by its appearing in
 * their list — an opening line naming the people already named in the header
 * would be the first thing in every room and say nothing.
 *
 * Returns the fields the room itself needs — the preview line and the ordering
 * stamp the announcement carries — for the caller to merge into the update it
 * is already making. See systemLine for why they are handed back rather than
 * written here.
 */
export async function writeMembershipChange(
  batch: FirebaseFirestore.WriteBatch,
  room: FirebaseFirestore.DocumentReference,
  change: { created?: string[]; added?: string[]; removed?: string[]; left?: boolean },
  actor: { uid: string; name: string },
): Promise<Record<string, unknown>> {
  const created = change.created ?? [];
  const added   = change.added   ?? [];
  const removed = change.removed ?? [];
  const left    = change.left === true;

  if (created.length === 0 && added.length === 0 && removed.length === 0 && !left) return {};

  // The actor is in the map too: they are the subject of their own `left`
  // entry, and resolving them here keeps every name in the history captured
  // the same way.
  const names = await namesOf(
    Array.from(new Set([...created, ...added, ...removed, ...(left ? [actor.uid] : [])])),
  );
  const nameOf = (uid: string) => names.get(uid) ?? uid;

  const events: { action: MemberEventAction; uid: string }[] = [
    ...created.map((uid) => ({ action: 'created' as const, uid })),
    ...added.map((uid)   => ({ action: 'added'   as const, uid })),
    ...removed.map((uid) => ({ action: 'removed' as const, uid })),
    ...(left ? [{ action: 'left' as const, uid: actor.uid }] : []),
  ];

  const col = room.collection(MEMBER_EVENTS_COLLECTION);
  for (const event of events) {
    batch.set(col.doc(), {
      action:  event.action,
      uid:     event.uid,
      name:    nameOf(event.uid),
      byUid:   actor.uid,
      byName:  actor.name,
      at:      FieldValue.serverTimestamp(),
    });
  }

  if (left) {
    return systemLine(batch, room, `${actor.name} left the room.`);
  }

  const said = [
    added.length   ? `added ${nameList(added.map(nameOf))}`     : '',
    removed.length ? `removed ${nameList(removed.map(nameOf))}` : '',
  ].filter(Boolean);

  // Nothing said for `created`, and nothing to bump with it.
  if (said.length === 0) return {};

  return systemLine(batch, room, `${actor.name} ${said.join(' and ')}.`);
}
