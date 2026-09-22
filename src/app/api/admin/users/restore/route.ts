import { NextRequest, NextResponse } from 'next/server';
import {
  FieldValue, adminAuth, adminDb, requireCompanyUser, AdminAuthError,
} from '@/lib/firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  REMOVED_USERS_COLLECTION,
  SITES_COLLECTION,
  TEAMS_COLLECTION,
  USERS_COLLECTION,
  can,
  type RoleFlags,
} from '@/lib/accessControl';
import { DEFAULT_OTHER_REGION, otherPhone } from '@/lib/phone';
import { syncManagedScopes } from '@/lib/teamScope';
import { personName, recordPeopleEvent, rolesHeld } from '@/lib/peopleEvents';

/**
 * Put somebody back: rebuild the allowlist entry from a removal record.
 *
 * Removal used to be final — the entry, the profile and the photo all went,
 * and undoing a mistaken one meant retyping a person's name, phones, birthday,
 * start date, site, team, roles and individual permissions out of the archive
 * by hand, with the photo gone for good. The archive already holds every one
 * of those fields, so this writes them back.
 *
 * Addressed by the **removal id**, never by email. The same address can have
 * been removed more than once, and "restore Ana" has no answer when Ana was
 * removed in March with one set of roles and again in September with another.
 * The row the admin is looking at is the one they mean.
 *
 * ## What comes back, and what deliberately does not
 *
 * Everything the entry held, plus the photo, plus the original `invitedAt` /
 * `invitedBy` — the log should read "added in February, removed in June, back
 * in July", not as though they joined the company on the day of the restore.
 *
 * Their **uid does not**. The `users/{uid}` profile was deleted with the
 * account, and an entry naming a uid with no profile behind it is a state
 * nothing else in this app produces: the rules read `users/{uid}.permissions`,
 * and there would be none. So the entry comes back as a pending invite, which
 * is exactly what it is — access granted, nobody signed in against it yet —
 * and `/api/auth/session` provisions the profile and fills the uid in on their
 * next sign-in, as it does for anybody new.
 *
 * Nothing they owned is lost by that. Google hands the same account the same
 * uid, so the `assignedToUids` on their parties and orders still name them the
 * moment they sign back in.
 */
export const maxDuration = 30;

type Caller = { uid: string; email: string | undefined };

export async function POST(req: NextRequest) {
  let caller: Caller;
  try {
    const { uid, email } = await requireCompanyUser(req);
    const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
    const profile = (snap.data() ?? {}) as RoleFlags;
    // Restoring is the mirror of removing, so it takes the same authority:
    // full `people.manage`, never a Sales Manager. Putting somebody back on
    // the system is a company-level act however it is spelled.
    if (!can(profile, 'people.manage')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    caller = { uid, email };
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'Missing the removal record.' }, { status: 400 });
  }

  const removalRef = adminDb.collection(REMOVED_USERS_COLLECTION).doc(id);
  const removal = await removalRef.get();
  if (!removal.exists) {
    return NextResponse.json({ error: 'That removal record no longer exists.' }, { status: 404 });
  }

  const archived = removal.data() ?? {};
  const email = typeof archived.email === 'string' ? archived.email : '';
  if (!email) {
    return NextResponse.json(
      { error: 'That removal record has no email address on it, so there is nobody to put back.' },
      { status: 400 },
    );
  }

  // Already undone. Refused rather than repeated: a second restore would write
  // a second "restored" line into the history for one removal, and the row's
  // own `restoredAt` would move to the later date, quietly rewriting when the
  // person actually came back.
  if (archived.restoredAt) {
    return NextResponse.json(
      { error: 'This removal has already been undone.' },
      { status: 409 },
    );
  }

  const entryRef = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  if ((await entryRef.get()).exists) {
    return NextResponse.json(
      { error: `${email} is already on the system — edit them in the list above instead.` },
      { status: 409 },
    );
  }

  // Read through the helper so a row archived while the second number still
  // lived in `phoneGt` comes back with its number rather than a blank.
  const restoredOther = otherPhone(archived);

  const text = (value: unknown) => (typeof value === 'string' ? value : '');

  try {
    // `create`, not `set`: the check above said this address was free. If it
    // was taken in the seconds since — added from another tab — this must fail
    // rather than overwrite a live entry with an old one.
    await entryRef.create({
      email,
      firstName:     text(archived.firstName),
      lastName:      text(archived.lastName),
      displayName:   text(archived.displayName),
      personalEmail: text(archived.personalEmail),
      legalName:     text(archived.legalName),
      phone:            text(archived.phone),
      phoneOther:       restoredOther.value,
      phoneOtherRegion: restoredOther.region || DEFAULT_OTHER_REGION,
      // Emptied rather than carried over: the number is in `phoneOther` now,
      // and leaving a copy in the legacy field is how the two drift apart.
      phoneGt:          '',
      extension:     text(archived.extension),
      dateOfBirth:   text(archived.dateOfBirth),
      startDate:     text(archived.startDate),
      // The file was never deleted, so this still points at a real object —
      // see RemovedUser.photoPath. Rows archived before that change carry no
      // path, and those people come back as an initial.
      photoPath:     typeof archived.photoPath === 'string' ? archived.photoPath : null,
      // A site or team deleted while they were gone would leave a dangling id
      // on a live entry, which reads on screen as a blank where a place should
      // be. Checked rather than trusted, and dropped if it no longer exists.
      siteId:        await stillExists(SITES_COLLECTION, archived.siteId),
      teamId:        await stillExists(TEAMS_COLLECTION, archived.teamId),
      isAdmin:        archived.isAdmin === true,
      isDispatcher:   archived.isDispatcher === true,
      isFinance:      archived.isFinance === true,
      isHr:           archived.isHr === true,
      isSalesManager: archived.isSalesManager === true,
      isIntern:       archived.isIntern === true,
      grantedPermissions: Array.isArray(archived.grantedPermissions)
        ? archived.grantedPermissions
        : [],
      // Pending again, on purpose — see the note at the top of this file.
      uid:           null,
      // The original invite, not this moment. When they joined is a fact about
      // them; when they were put back is a fact about the removal, and it is
      // recorded on the archive row and in the history.
      invitedBy:     text(archived.invitedBy),
      invitedAt:     archived.invitedAt ?? FieldValue.serverTimestamp(),
      lastLoginAt:   archived.lastLoginAt ?? null,
      // Never restored suspended. Somebody suspended and then removed has been
      // gone twice over, and an admin who restores them means "let them work",
      // not "put them back behind the same locked door".
      suspended:     false,
      suspendedAt:   null,
      suspendedBy:   null,
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not put them back — try again.' },
      { status: 500 },
    );
  }

  // Removal disabled the Auth account and revoked its tokens. Without this
  // they would have an allowlist entry they cannot use: Google signs them in
  // and Firebase refuses the disabled account.
  const authUser = await adminAuth.getUserByEmail(email).catch(() => null);
  if (authUser?.disabled) {
    await adminAuth.updateUser(authUser.uid, { disabled: false }).catch(() => {});
  }

  // Deliberately no permission sync here. The mirrored `permissions` array
  // lives on `users/{uid}`, and there is no profile to write it to — the entry
  // comes back with `uid: null` and /api/auth/session builds both at their next
  // sign-in, from the roles and grants restored above.

  await removalRef.update({
    restoredAt:    FieldValue.serverTimestamp(),
    restoredBy:    caller.email ?? caller.uid,
    restoredByUid: caller.uid,
  }).catch((e) => {
    // The person is back either way. Worth shouting about in the log, because
    // an unmarked row is one somebody can try to restore a second time — and
    // the `create` above is what refuses that, so the failure is loud rather
    // than silent.
    console.error('[admin/users/restore] could not mark the removal record', id, e);
  });

  // They may be back on a team, or be a Sales Manager again. Both are the
  // manager mirrors' business — see lib/teamScope.
  await syncManagedScopes().catch((e) => {
    console.error('[admin/users/restore] refreshing managed scopes failed', email, e);
  });

  await recordPeopleEvent({
    action:     'restored',
    email,
    name:       personName(archived),
    roles:      rolesHeld(archived),
    actorEmail: caller.email ?? caller.uid,
    actorUid:   caller.uid,
    source:     'restore',
    removalId:  id,
  });

  return NextResponse.json({ ok: true, email });
}

/** The id back if that document is still there, otherwise null. */
async function stillExists(
  collection: string,
  id: unknown,
): Promise<string | null> {
  if (typeof id !== 'string' || !id) return null;
  const snap = await adminDb.collection(collection).doc(id).get();
  return snap.exists ? id : null;
}
