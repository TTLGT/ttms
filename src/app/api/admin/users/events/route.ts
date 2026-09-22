import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requirePermission, AdminAuthError } from '@/lib/firebase-admin';
import { PEOPLE_EVENTS_COLLECTION } from '@/lib/accessControl';

/**
 * The access history: everyone added, removed or put back, newest first.
 *
 * Served through the Admin SDK for the same reason the removal log is — the
 * collection is denied to every client in `firestore.rules`, and this guarded
 * route is the only way to it. It carries less than the removal log does (no
 * birthday, no personal email), but who had access to the company's freight
 * and when is still not a list for everybody with a login.
 *
 * Unfiltered on purpose. A history is read as a sequence, and filtering it to
 * one address server-side would need a composite index on `email` + `at` for a
 * collection that will hold a few hundred rows in this company's lifetime. The
 * panel filters what it is given, in the browser.
 */
export const maxDuration = 30;

/** Years of turnover in a company this size, in one read. */
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
    .collection(PEOPLE_EVENTS_COLLECTION)
    .orderBy('at', 'desc')
    .limit(LIMIT)
    .get();

  const events = snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      // A Timestamp crosses JSON as a bare `{_seconds, _nanoseconds}` — see
      // the note on PeopleEvent.at.
      at: iso(data.at),
    };
  });

  return NextResponse.json({ events, truncated: events.length === LIMIT });
}

/** A Firestore Timestamp as an ISO string, or null for anything else. */
function iso(value: unknown): string | null {
  const ts = value as { toDate?: () => Date } | null;
  return ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : null;
}
