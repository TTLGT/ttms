import { adminDb } from './firebase-admin';

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
