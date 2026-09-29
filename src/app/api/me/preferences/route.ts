import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { USERS_COLLECTION } from '@/lib/accessControl';
import { cleanPreferences } from '@/types/userPreferences';

/**
 * Save the caller's own look-and-feel choices — see src/types/userPreferences.ts.
 *
 * `users/{uid}` is closed to client writes because it carries the permissions
 * array the rules read, so this goes through the Admin SDK like every other
 * change to it. Kept as narrow as PATCH /api/me for the same reason:
 *
 *  - **The uid is the verified one off the ID token.** There is no parameter
 *    for whose profile this is.
 *  - **Only the keys `cleanPreferences()` knows are written**, each under
 *    `preferences.` by dotted path, so nothing outside that map can be reached
 *    from here — not `permissions`, not a role flag.
 *  - **`update`, not `set`.** The session route is what provisions a profile;
 *    this must never bring one into existence, so a missing profile is a 404.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { uid } = await requireCompanyUser(req);

    const prefs = cleanPreferences(await req.json().catch(() => ({})));
    const entries = Object.entries(prefs);
    if (entries.length === 0) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    const patch = Object.fromEntries(entries.map(([key, value]) => [`preferences.${key}`, value]));
    try {
      await adminDb.collection(USERS_COLLECTION).doc(uid).update(patch);
    } catch (e) {
      // gRPC NOT_FOUND: no profile yet. Anything else is a real failure.
      if ((e as { code?: number }).code === 5) {
        return NextResponse.json({ error: 'No profile to save to. Sign out and back in.' }, { status: 404 });
      }
      throw e;
    }

    return NextResponse.json({ saved: prefs });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
