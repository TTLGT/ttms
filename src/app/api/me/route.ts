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
        // Absent means yes — see the fields in src/types/allowedUser.ts. The
        // default is resolved here rather than in the browser so the checkbox
        // and the daily post can never disagree about what a missing field
        // means.
        announceBirthday:    entry.announceBirthday    !== false,
        announceAnniversary: entry.announceAnniversary !== false,
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

/**
 * The two celebration preferences, set by the one person they are about.
 *
 * **This is the only thing in TTMS that writes a person's own allowlist
 * entry, and the exception is deliberately this narrow.** Everything else on
 * the profile page is a *request* that admin or HR approves, because
 * `allowedUsers` is where access lives and an account that can edit its own
 * entry is an account that can promote itself. Neither of these two fields is
 * access: they grant nothing, they are read by nothing but the daily
 * congratulations post, and the worst a person can do with them is decline to
 * be congratulated.
 *
 * Putting them through the approval queue instead was the alternative, and it
 * is the wrong shape for what they are. "I would rather the whole company were
 * not told it is my birthday" is not a claim anybody needs to verify, and a
 * version of it that waits two days for HR is a version that arrives after the
 * birthday.
 *
 * Three things keep it narrow, and all three matter:
 *
 *  - **The key is the verified email off the ID token.** There is no parameter
 *    for whose record this is, so there is nothing to tamper with.
 *  - **Exactly two keys are read from the body**, by name, and each only when
 *    it is a boolean. A field not named is left alone, and a field named
 *    anything else is ignored rather than written.
 *  - **`update`, not `set`.** A `set` against an email with no entry would
 *    create an allowlist document, which is the one thing this must never be
 *    able to do — that document *is* the authorization. A bootstrap admin with
 *    no entry gets a 404 here, which is correct: there is nothing to write.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { email: rawEmail } = await requireCompanyUser(req);
    const email = normalizeEmail(rawEmail);

    const body = await req.json().catch(() => ({}));

    const patch: Record<string, boolean> = {};
    for (const key of ['announceBirthday', 'announceAnniversary'] as const) {
      if (typeof body?.[key] === 'boolean') patch[key] = body[key];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    }

    const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: 'You do not have an entry on the access list, so there is nothing to set.' },
        { status: 404 },
      );
    }

    await ref.update(patch);
    return NextResponse.json({ saved: patch });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
