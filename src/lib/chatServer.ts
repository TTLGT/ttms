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
