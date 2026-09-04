import { NextRequest, NextResponse } from 'next/server';
import { AdminAuthError, adminDb, requireCompanyUser } from '@/lib/firebase-admin';
import { ALLOWED_USERS_COLLECTION, USERS_COLLECTION, normalizeEmail } from '@/lib/accessControl';
import { otherPhone } from '@/lib/phone';
import { ROLE_ORDER } from '@/types/permission';

/**
 * Everything the company holds about the person asking.
 *
 * The record lives on `allowedUsers`, which the Firestore rules open to admin
 * and HR alone — so until now somebody could not read their own row, including
 * the four payroll fields (legal name, birthday, personal address, start date)
 * that are deliberately never mirrored onto `users/{uid}`.
 *
 * That is the right rule and this is not a hole in it. A rule cannot narrow a
 * collection read to one document the way this route narrows it to one caller:
 * the key is the verified email off the ID token, and nothing in the request
 * body or the query string can name anybody else. Somebody's own date of birth
 * is not a secret from them.
 *
 * Roles come back too, read-only. Seeing "Broker" beside your name is ordinary
 * working information — the directory already shows it to everybody — and it
 * answers the question the profile page gets opened with second, after "is my
 * number right".
 */
export async function GET(req: NextRequest) {
  try {
    const { uid, email: rawEmail } = await requireCompanyUser(req);
    const email = normalizeEmail(rawEmail);

    const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();

    // A bootstrap admin can reach the app without an allowlist entry — that is
    // the whole point of the escape hatch — so fall back to their profile
    // rather than answering 404 to somebody who is legitimately signed in.
    const entry = snap.exists
      ? snap.data() ?? {}
      : (await adminDb.collection(USERS_COLLECTION).doc(uid).get()).data() ?? {};

    const other = otherPhone(entry);

    return NextResponse.json({
      me: {
        email,
        onAllowlist:   snap.exists,
        firstName:     entry.firstName     ?? '',
        lastName:      entry.lastName      ?? '',
        displayName:   entry.displayName   ?? '',
        phone:         entry.phone         ?? '',
        // Read through the helper, so somebody whose entry still holds the
        // pre-2025 `phoneGt` sees their number rather than a blank — see
        // otherPhone() in lib/phone.ts.
        phoneOther:       other.value,
        phoneOtherRegion: other.region,
        extension:     entry.extension     ?? '',
        siteId:        entry.siteId        ?? null,
        teamId:        entry.teamId        ?? null,
        photoPath:     entry.photoPath     ?? null,
        legalName:     entry.legalName     ?? '',
        personalEmail: entry.personalEmail ?? '',
        dateOfBirth:   entry.dateOfBirth   ?? '',
        startDate:     entry.startDate     ?? '',
        ...Object.fromEntries(ROLE_ORDER.map((role) => [role, entry[role] === true])),
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
