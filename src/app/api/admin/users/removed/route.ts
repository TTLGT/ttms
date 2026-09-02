import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { REMOVED_USERS_COLLECTION } from '@/lib/accessControl';

/**
 * The removal log: everyone whose access has been revoked, newest first.
 *
 * Served through the Admin SDK rather than read from the client SDK, unlike
 * `allowedUsers`. The log keeps the same admin-only fields the entry had —
 * date of birth, personal email — for people who are no longer with the
 * company, so `firestore.rules` denies the collection to every client and this
 * guarded route is the only way in.
 */
export const maxDuration = 30;

/** Enough to cover years of turnover in a company this size, in one read. */
const LIMIT = 500;

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'people.manage');
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const snap = await adminDb
    .collection(REMOVED_USERS_COLLECTION)
    .orderBy('removedAt', 'desc')
    .limit(LIMIT)
    .get();

  const users = snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      // A Firestore Timestamp crosses JSON as a bare `{_seconds, _nanoseconds}`
      // with no `toDate()` on it, so every consumer would have to know that.
      // Converted here instead — see the note on RemovedUser.
      invitedAt:   iso(data.invitedAt),
      lastLoginAt: iso(data.lastLoginAt),
      removedAt:   iso(data.removedAt),
    };
  });

  return NextResponse.json({ users, truncated: users.length === LIMIT });
}

/** A Firestore Timestamp as an ISO string, or null for anything else. */
function iso(value: unknown): string | null {
  const ts = value as { toDate?: () => Date } | null;
  return ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : null;
}
