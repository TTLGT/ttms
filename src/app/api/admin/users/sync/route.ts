import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb, requireAdmin } from '@/lib/firebase-admin';
import { ALLOWED_USERS_COLLECTION } from '@/lib/accessControl';
import { syncPermissionsFor } from '@/lib/userSync';
import { syncManagedScopes } from '@/lib/teamScope';

/**
 * Recompute everybody's effective permissions and every manager's team scope.
 *
 * Normally nothing needs this. A permission list is rewritten whenever the
 * entry it comes from changes and again at every sign-in, and a profile that
 * has neither happened to yet keeps working through the legacy branch in
 * firestore.rules. This exists for the cases outside that loop:
 *
 * - somebody edited a document directly in the Firebase Console;
 * - a permission was added to the catalog and existing people should get it
 *   without waiting for their next sign-in;
 * - a scope sync failed earlier and was only logged.
 *
 * Safe to run at any time and safe to run twice: every write is derived from
 * the allowlist entry, so it either changes nothing or repairs a mirror. It
 * writes nothing to the allowlist itself.
 *
 * Admin only, and a POST rather than a GET because it writes.
 *
 *   curl -X POST -H "Authorization: Bearer <id token>" .../api/admin/users/sync
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();

    let mirrored = 0;
    let pending  = 0;
    for (const doc of snap.docs) {
      const email = String(doc.data().email ?? doc.id);
      const written = await syncPermissionsFor(email);
      // Null means they have never signed in, so there is no profile to write
      // to. Counted rather than treated as a failure — /api/auth/session builds
      // the list from scratch on their first sign-in.
      if (written) mirrored += 1;
      else pending += 1;
    }

    const scopes = await syncManagedScopes();

    return NextResponse.json({
      people: snap.size,
      mirrored,
      pending,
      scopesRewritten: scopes,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
