import { NextRequest, NextResponse } from 'next/server';
import {
  FieldValue, adminAuth, adminDb, adminStorage, requireCompanyUser, AdminAuthError,
} from '@/lib/firebase-admin';
import {
  ALLOWED_EMAIL_DOMAIN,
  ALLOWED_USERS_COLLECTION,
  USERS_COLLECTION,
  isAllowedEmailDomain,
  isBootstrapAdmin,
  can,
  canManagePerson,
  normalizeEmail,
  parseEmailList,
  type RoleFlags,
  REMOVED_USERS_COLLECTION,
  SITES_COLLECTION,
  TEAMS_COLLECTION,
} from '@/lib/accessControl';
import { normalizeCalendarDate } from '@/types/allowedUser';
import { isPermission, ROLE_ORDER, type Permission, type RoleKey } from '@/types/permission';
import { applyClaims, claimsFor, syncPermissionsFor } from '@/lib/userSync';
import { syncManagedScopes } from '@/lib/teamScope';
import {
  DEFAULT_OTHER_REGION,
  PHONE_LABEL,
  isOtherPhoneRegion,
  normalizePhone,
  otherPhone,
  type OtherPhoneRegion,
} from '@/lib/phone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Guard = { uid: string; email: string | undefined; profile: RoleFlags };

/**
 * Who may reach this route at all.
 *
 * Two kinds of caller, and the difference matters on every handler below:
 *
 * - Somebody holding `people.manage` — an admin — who may do anything here.
 * - A **Sales Manager**, who may act only on the people on the team they lead,
 *   and only on some of it: their details, their suspension, and the
 *   permissions they are given. Never adding somebody to the company, never
 *   removing them, and never changing a role — see the checks at each handler.
 *
 * The split is enforced per operation rather than here, because "may you open
 * this route" and "may you do this to this person" are different questions and
 * collapsing them is how a scoped role quietly becomes an unscoped one.
 */
async function guard(req: NextRequest): Promise<Guard | NextResponse> {
  try {
    const { uid, email } = await requireCompanyUser(req);
    const snap = await adminDb.collection(USERS_COLLECTION).doc(uid).get();
    const profile = (snap.data() ?? {}) as RoleFlags;

    if (!can(profile, 'people.manage') && profile.isSalesManager !== true) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return { uid, email, profile };
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/** Refuses anybody who is not managing people company-wide. */
function requireFullManage(caller: Guard): NextResponse | null {
  if (can(caller.profile, 'people.manage')) return null;
  return NextResponse.json(
    { error: 'Only an admin can do that. A Sales Manager can edit the people on their own team.' },
    { status: 403 },
  );
}

/**
 * Refuses a caller who may not act on this particular person.
 *
 * A Sales Manager's scope is the mirror on their own profile, so this needs the
 * target's uid as well as their address — a team member who has never signed in
 * is held by email, and they are exactly who a manager is most often setting up.
 */
async function requirePersonInScope(caller: Guard, email: string): Promise<NextResponse | null> {
  if (can(caller.profile, 'people.manage')) return null;

  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email).get();
  const uid  = typeof snap.data()?.uid === 'string' ? snap.data()!.uid as string : null;

  if (canManagePerson(caller.profile, { uid, email })) return null;
  return NextResponse.json(
    { error: 'That person is not on your team.' },
    { status: 403 },
  );
}

/**
 * The people this caller is allowed to manage.
 *
 * Exists for the Sales Manager, and only for them. Everybody else who can open
 * Settings → People holds `people.view` and reads the allowlist straight from
 * Firestore, which the rules permit — see the note on `allowedUsers` in
 * firestore.rules.
 *
 * A manager cannot, and the reason is worth writing down: a rule cannot answer
 * "only the rows belonging to my team" for a collection read, because the query
 * would have to prove that up front and the Settings page reads the collection
 * whole. Opening the collection to them would hand a manager every colleague's
 * legal name, birthday and personal address. So the narrowing happens here,
 * with the Admin SDK, and they are served their own team and nobody else.
 *
 * The payroll fields do go out for the people they manage. That is the point:
 * a manager who can edit their team's details has to be able to see the
 * details they are editing.
 */
export async function GET(req: NextRequest) {
  const caller = await guard(req);
  if (caller instanceof NextResponse) return caller;

  const snap = await adminDb.collection(ALLOWED_USERS_COLLECTION).get();
  const all  = snap.docs.map((d) => d.data());

  const users = can(caller.profile, 'people.view')
    ? all
    : all.filter((entry) => canManagePerson(caller.profile, {
        uid:   typeof entry.uid === 'string' ? entry.uid : null,
        email: typeof entry.email === 'string' ? entry.email : null,
      }));

  return NextResponse.json({
    users: users.sort((a, b) => String(a.email).localeCompare(String(b.email))),
  });
}

/** Upper bound on one paste, so a runaway list cannot hammer Firestore. */
const MAX_BATCH = 100;

type InviteStatus = 'added' | 'exists' | 'suspended' | 'invalid' | 'wrong-domain' | 'error';
type InviteResult = { email: string; status: InviteStatus; message: string };

/**
 * The role flags an invite can carry. Built from the catalog rather than typed
 * out, so a role added there can be granted on the way in without this file
 * having to be found and edited.
 */
type Roles = Record<RoleKey, boolean>;

function rolesFrom(body: Record<string, unknown>): Roles {
  return Object.fromEntries(
    ROLE_ORDER.map((role) => [role, body[role] === true]),
  ) as Roles;
}

/**
 * The contact block an admin can fill in while adding someone, already
 * sanitised. Only ever set on a single-address add — see the POST below.
 */
type NewPersonDetails = Record<string, string>;

/** Add one address. Never throws — every outcome comes back as a result row. */
async function invite(
  email: string,
  roles: Roles,
  invitedBy: string,
  siteId: string | null,
  teamId: string | null,
  details: NewPersonDetails | null,
): Promise<InviteResult> {
  if (!EMAIL_RE.test(email)) {
    return { email, status: 'invalid', message: 'Not a valid email address.' };
  }
  if (!isAllowedEmailDomain(email)) {
    return {
      email,
      status: 'wrong-domain',
      message: `Only @${ALLOWED_EMAIL_DOMAIN} addresses can be added.`,
    };
  }

  try {
    const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
    const existingEntry = await ref.get();
    if (existingEntry.exists) {
      // Re-pasting a suspended address is a common way to try to fix access.
      // Saying "already has access" would be wrong — they have none until an
      // admin restores them, which is a different button.
      return existingEntry.data()?.suspended === true
        ? { email, status: 'suspended', message: 'Suspended — restore them below instead.' }
        : { email, status: 'exists', message: 'Already has access — skipped.' };
    }

    await ref.set({
      email,
      firstName:     '',
      lastName:      '',
      displayName:   '',
      personalEmail: '',
      legalName:     '',
      phone:            '',
      phoneOther:       '',
      phoneOtherRegion: DEFAULT_OTHER_REGION,
      // Written blank on a new entry too, so every document has the same shape
      // and `otherPhone()` never has to tell "never set" from "cleared".
      phoneGt:          '',
      extension:        '',
      dateOfBirth:   '',
      startDate:     '',
      photoPath:     null,
      siteId,
      teamId,
      // Written over the blanks above, so someone added with their details
      // filled in lands as one complete document instead of needing a second
      // pass in the editor. Never present on a multi-address batch.
      ...(details ?? {}),
      ...roles,
      // Written empty rather than left off, so the shape of an entry is the
      // same everywhere and the editor never has to tell "no extras" from
      // "this document predates permissions".
      grantedPermissions: [],
      uid:         null,
      invitedBy,
      invitedAt:   FieldValue.serverTimestamp(),
      lastLoginAt: null,
      suspended:   false,
      suspendedAt: null,
      suspendedBy: null,
    });

    // If they were previously revoked, lift the disable so they can sign in again.
    const existing = await adminAuth.getUserByEmail(email).catch(() => null);
    if (existing?.disabled) {
      await adminAuth.updateUser(existing.uid, { disabled: false });
    }

    return { email, status: 'added', message: 'Access granted.' };
  } catch {
    return { email, status: 'error', message: 'Could not be added — try again.' };
  }
}

/**
 * Invite one or many people: creates the allowlist entries that let them sign in.
 *
 * Accepts `email` (a single address or a pasted block) or `emails` (an array).
 * A bad address never fails the batch — the response carries one result row per
 * address so the caller can show exactly which ones landed.
 *
 * `details` fills in the new person's name, phones, dates and personal email at
 * the same time. It is honoured **only for a single address**: a name or a
 * birthday cannot be true of a whole batch, and silently stamping one person's
 * details onto everyone pasted in would be worse than ignoring the field. The
 * check is here rather than only in the UI, so it holds however the route is
 * called.
 */
export async function POST(req: NextRequest) {
  const caller = await guard(req);
  if (caller instanceof NextResponse) return caller;
  // Adding somebody to the company is a company-level act, not a team one: the
  // address becomes an account that can sign in, and a Sales Manager's reach
  // stops at the people already on their team.
  const denied = requireFullManage(caller);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body.emails) ? body.emails.join(' ') : String(body.email ?? '');
  const emails = parseEmailList(raw);

  if (emails.length === 0) {
    return NextResponse.json({ error: 'Enter at least one email address.' }, { status: 400 });
  }
  if (emails.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many addresses at once — ${MAX_BATCH} is the limit.` },
      { status: 400 },
    );
  }

  const roles = rolesFrom(body);
  const invitedBy = caller.email ?? caller.uid;

  // One site for the whole batch — a paste is normally one office's worth of
  // people. Rejected up front rather than silently dropped, so a stale picker
  // cannot quietly leave everyone unassigned.
  const siteId = typeof body.siteId === 'string' && body.siteId ? body.siteId : null;
  if (siteId && !(await adminDb.collection(SITES_COLLECTION).doc(siteId).get()).exists) {
    return NextResponse.json({ error: 'That site no longer exists.' }, { status: 400 });
  }

  // A team applies to the whole batch for the same reason a site does: a paste
  // is normally one team's worth of new hires.
  const teamId = typeof body.teamId === 'string' && body.teamId ? body.teamId : null;
  if (teamId && !(await adminDb.collection(TEAMS_COLLECTION).doc(teamId).get()).exists) {
    return NextResponse.json({ error: 'That team no longer exists.' }, { status: 400 });
  }

  // Only ever read for a single address — see the note above this function. A
  // batch carries no details, so it has no phone number to report on either.
  const { details, skippedPhones } = emails.length === 1
    ? newPersonDetails(body.details)
    : { details: null, skippedPhones: [] as string[] };

  // Sequential on purpose: keeps result order stable and stays well inside
  // Firestore/Auth rate limits even at the batch cap.
  const results: InviteResult[] = [];
  for (const email of emails) {
    results.push(await invite(email, roles, invitedBy, siteId, teamId, details));
  }

  const added = results.filter((r) => r.status === 'added').length;

  // A new hire dropped onto a team changes that team's manager's scope, and a
  // new Sales Manager arrives with none. Cheap, and it means no invite path can
  // leave a mirror stale — see src/lib/teamScope.ts.
  if (added > 0) {
    await syncManagedScopes().catch((e) => {
      console.error('[admin/users] refreshing managed scopes failed', e);
    });
  }

  // `skippedPhones` rides along with the results rather than failing the add:
  // the person still gets access, and the caller says which number to re-enter.
  return NextResponse.json({ ok: true, added, results, skippedPhones });
}

/** Free text an admin types, trimmed and length-capped before it is stored. */
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Both phone numbers in the one shape the directory stores them in, plus the
 * labels of any that could not be read at all.
 *
 * A number of the wrong length is stored blank rather than as typed — see
 * lib/phone.ts for why the length is the whole test — and the labels travel
 * back in the response so the admin is told which number to re-enter now,
 * instead of discovering the field empty a week later. No length cap: what
 * comes out of `normalizePhone` is either a fixed-width number or ''.
 *
 * The second number's country comes from the request, but only as one of the
 * two the picker offers — anything else falls back to the default rather than
 * being stored. A hand-built request must not be able to put an arbitrary
 * string where the rest of the app expects a region.
 *
 * `phoneGt` is written blank alongside, always. It is where this number used
 * to live, and leaving a stale value there would mean a record holding two
 * different answers, with the old one reappearing the moment the new field
 * was cleared. See `otherPhone()` in lib/phone.ts.
 */
function phones(d: Record<string, unknown>): {
  phone: string;
  phoneOther: string;
  phoneOtherRegion: OtherPhoneRegion;
  phoneGt: string;
  skippedPhones: string[];
} {
  const region = isOtherPhoneRegion(d.phoneOtherRegion)
    ? d.phoneOtherRegion
    : DEFAULT_OTHER_REGION;

  const us    = normalizePhone(d.phone, 'US');
  const other = normalizePhone(d.phoneOther, region);

  return {
    phone:            us.value,
    phoneOther:       other.value,
    phoneOtherRegion: region,
    phoneGt:          '',
    skippedPhones: [
      ...(us.rejected ? [PHONE_LABEL.US] : []),
      // Named by country, not as "Other phone": the admin needs to know which
      // number to re-enter, and the country is the half that identifies it.
      ...(other.rejected ? [PHONE_LABEL[region]] : []),
    ],
  };
}

/**
 * Sanitise the optional details block on a single-person add. `details` is null
 * when nothing usable was sent, so `invite` can tell "no details" from "details
 * that are all blank" and leave its own defaults in place either way.
 *
 * Same rules as the details PATCH: capped text, a date is stored only if it is
 * a real YYYY-MM-DD, and a phone only if it is the right length.
 */
function newPersonDetails(value: unknown): {
  details: Record<string, string> | null;
  skippedPhones: string[];
} {
  if (!value || typeof value !== 'object') return { details: null, skippedPhones: [] };
  const d = value as Record<string, unknown>;

  const firstName = text(d.firstName, 60);
  const lastName  = text(d.lastName, 60);
  const { phone, phoneOther, phoneOtherRegion, phoneGt, skippedPhones } = phones(d);

  const details = {
    firstName,
    lastName,
    // Kept in step with the parts, exactly as updateDetails does.
    displayName:   [firstName, lastName].filter(Boolean).join(' '),
    personalEmail: text(d.personalEmail, 120),
    // Longer cap than first/last together: this is a full legal name, which is
    // routinely four or five parts.
    legalName:     text(d.legalName, 160),
    phone,
    phoneOther,
    phoneOtherRegion,
    phoneGt,
    extension:     text(d.extension, 12),
    dateOfBirth:   normalizeCalendarDate(d.dateOfBirth),
    startDate:     normalizeCalendarDate(d.startDate),
  };

  // Reported even when every field came out blank: an add whose only content
  // was an unreadable phone number still needs to say so.
  return {
    details: Object.values(details).some(Boolean) ? details : null,
    skippedPhones,
  };
}

/**
 * Writes the contact block to the allowlist entry and mirrors *part* of it onto
 * the live profile, so the rest of the app sees the change without a re-login.
 *
 * Date of birth, personal email and start date are written to the allowlist
 * entry only. `users/{uid}` is readable by every signed-in user under
 * firestore.rules; those three are admin-only information and mirroring them
 * would publish them to the whole company.
 */
async function updateDetails(email: string, details: Record<string, unknown>) {
  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'That person is not on the access list.' }, { status: 404 });
  }

  const siteId = typeof details.siteId === 'string' && details.siteId ? details.siteId : null;
  if (siteId && !(await adminDb.collection(SITES_COLLECTION).doc(siteId).get()).exists) {
    return NextResponse.json({ error: 'That site no longer exists.' }, { status: 400 });
  }

  const teamId = typeof details.teamId === 'string' && details.teamId ? details.teamId : null;
  if (teamId && !(await adminDb.collection(TEAMS_COLLECTION).doc(teamId).get()).exists) {
    return NextResponse.json({ error: 'That team no longer exists.' }, { status: 400 });
  }

  const firstName = text(details.firstName, 60);
  const lastName  = text(details.lastName, 60);
  // A number that cannot be read is saved blank rather than as typed. The
  // editor warns about it under the field before this is ever sent, and the
  // response below names it again — this is the deliberate place to clear a
  // field, so silently keeping the old value would be the wrong call here.
  const { phone, phoneOther, phoneOtherRegion, phoneGt, skippedPhones } = phones(details);

  const patch = {
    firstName,
    lastName,
    // Written alongside the parts so everything that reads a single name off
    // the profile keeps working without having to join them itself.
    displayName: [firstName, lastName].filter(Boolean).join(' '),
    phone,
    phoneOther,
    phoneOtherRegion,
    phoneGt,
    extension:   text(details.extension, 12),
    siteId,
    teamId,
  };

  // Anything not a real YYYY-MM-DD is stored as '' rather than rejected: the
  // date inputs can only produce that shape or nothing, so a bad value here
  // means a hand-built request, not an admin who needs an error message.
  // Written to the allowlist entry only, never to `users/{uid}`. The legal name
  // is payroll data and belongs with the birthday and the personal address, not
  // with the phone number the whole office can look up.
  const privatePatch = {
    personalEmail: text(details.personalEmail, 120),
    legalName:     text(details.legalName, 160),
    dateOfBirth:   normalizeCalendarDate(details.dateOfBirth),
    startDate:     normalizeCalendarDate(details.startDate),
  };

  await ref.update({ ...patch, ...privatePatch });

  const uid = snap.data()?.uid;
  if (uid) {
    await adminDb.collection(USERS_COLLECTION).doc(uid).set(patch, { merge: true });
  }

  // `teamId` is in that patch, and moving somebody between teams moves them
  // between two managers' scopes. Nothing else in this block affects access.
  await syncManagedScopes().catch((e) => {
    console.error('[admin/users] refreshing managed scopes failed', email, e);
  });

  return NextResponse.json({ ok: true, skippedPhones });
}

/** Points the entry at an uploaded photo, or clears it. */
async function updatePhoto(email: string, photoPath: string | null) {
  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'That person is not on the access list.' }, { status: 404 });
  }

  // The path is generated by the uploader, so it is checked rather than
  // trusted: anything outside the avatars prefix is refused.
  if (photoPath !== null && !/^avatars\/[^.]/.test(photoPath)) {
    return NextResponse.json({ error: 'Unexpected photo location.' }, { status: 400 });
  }

  await ref.update({ photoPath });

  const uid = snap.data()?.uid;
  if (uid) {
    await adminDb.collection(USERS_COLLECTION).doc(uid).set({ photoPath }, { merge: true });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Change one thing about an existing entry: a role, a permission grant,
 * suspension, the contact details, or the photo.
 *
 * Every branch below decides for itself whether a Sales Manager may take it.
 * The rule across all of them: a manager may change what one of *their own
 * people* can do, but never what standing they have in the company. Roles are
 * company-wide by nature — Dispatcher hands over every client there is — so a
 * manager cannot grant one at all; individual permissions they hold themselves
 * they can pass on, because those are things they were already trusted with.
 */
export async function PATCH(req: NextRequest) {
  const caller = await guard(req);
  if (caller instanceof NextResponse) return caller;

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const field = body.field;
  const value = body.value === true;

  // Checked before anything looks a document up: doc('') throws rather than
  // returning nothing, which would turn a malformed request into a 500.
  if (!email) {
    return NextResponse.json({ error: 'Missing email.' }, { status: 400 });
  }

  // Every branch acts on one person, so scope is checked once, here.
  const outOfScope = await requirePersonInScope(caller, email);
  if (outOfScope) return outOfScope;

  // Contact details arrive as one object; roles and suspension as field/value.
  if (body.details && typeof body.details === 'object') {
    return updateDetails(email, body.details as Record<string, unknown>);
  }

  // Handled before `value` is read as a boolean below: this one carries a
  // storage path, or null to clear it.
  if (field === 'photoPath') {
    return updatePhoto(email, typeof body.value === 'string' ? body.value : null);
  }

  // The permission editor sends the whole granted list rather than one key at a
  // time: it is a set, and applying it as a set is what makes "these are the
  // extras this person has" a single writeable thing rather than a sequence of
  // toggles that can half-apply.
  if (field === 'grantedPermissions') {
    return updateGrants(caller, email, body.value);
  }

  if (!([...ROLE_ORDER, 'suspended'] as string[]).includes(field)) {
    return NextResponse.json({ error: 'Unknown field.' }, { status: 400 });
  }

  // Roles are company-wide, so only a company-wide people manager sets them.
  // Suspension is left out of this deliberately: taking a team member's access
  // away for the afternoon is exactly the kind of thing their manager should
  // not have to raise a ticket for.
  if ((ROLE_ORDER as string[]).includes(field)) {
    const denied = requireFullManage(caller);
    if (denied) return denied;
  }

  if (field === 'isAdmin' && !value && normalizeEmail(caller.email) === email) {
    return NextResponse.json({ error: 'You cannot remove your own admin access.' }, { status: 400 });
  }
  if (field === 'isAdmin' && !value && isBootstrapAdmin(email)) {
    return NextResponse.json(
      { error: 'This is a protected bootstrap admin account and must stay an admin.' },
      { status: 400 },
    );
  }
  // Same two guards as revoking: suspension also locks someone out, so it must
  // not be usable to lock out yourself or the last recoverable admin.
  if (field === 'suspended' && value && normalizeEmail(caller.email) === email) {
    return NextResponse.json({ error: 'You cannot suspend your own access.' }, { status: 400 });
  }
  if (field === 'suspended' && value && isBootstrapAdmin(email)) {
    return NextResponse.json(
      { error: 'This is a protected bootstrap admin account and cannot be suspended.' },
      { status: 400 },
    );
  }

  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'That person is not on the access list.' }, { status: 404 });
  }

  const entry = snap.data() ?? {};
  // A pending invite has no uid yet; fall back to Auth so an account that
  // signed in before the uid was bound still gets disabled.
  const uid: string | undefined =
    entry.uid ?? (await adminAuth.getUserByEmail(email).catch(() => null))?.uid;

  if (field === 'suspended') {
    await ref.update({
      suspended:   value,
      suspendedAt: value ? FieldValue.serverTimestamp() : null,
      suspendedBy: value ? caller.email ?? caller.uid : null,
    });

    // Mirrored onto the profile because the API guards and the Firestore rules
    // read `users/{uid}`, not the allowlist, on every request.
    if (entry.uid) {
      await adminDb
        .collection(USERS_COLLECTION)
        .doc(entry.uid)
        .set({ suspended: value }, { merge: true })
        .catch(() => {});
    }

    if (uid) {
      if (value) {
        // Same teardown as revoking, minus the deletion: end the session now
        // instead of letting the current ID token run out its hour.
        await adminAuth.setCustomUserClaims(uid, { ttlAccess: false }).catch(() => {});
        await adminAuth.revokeRefreshTokens(uid).catch(() => {});
        await adminAuth.updateUser(uid, { disabled: true }).catch(() => {});
      } else {
        // Re-enable and hand back the roles the entry still carries. The next
        // sign-in re-syncs these anyway; setting them here keeps Storage rules
        // correct from the moment access is restored.
        await adminAuth.updateUser(uid, { disabled: false }).catch(() => {});
        // Only the claims Storage reads — see claimsFor in src/lib/userSync.ts
        // for which those are and why the permission list is not among them.
        await adminAuth.setCustomUserClaims(uid, claimsFor(entry)).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  }

  await ref.update({ [field]: value });

  // Mirror onto the live profile so the change applies without a re-invite.
  if (entry.uid) {
    await adminDb.collection(USERS_COLLECTION).doc(entry.uid).set({ [field]: value }, { merge: true });
    // The role moved, so the permissions it expands to moved with it. This is
    // the write the rules actually read; without it the entry says Dispatcher
    // and the system still treats them as a broker until they sign in again.
    await syncPermissionsFor(email);
    // Force a fresh ID token so Storage rules see the new role.
    await applyClaims(entry.uid, { ...entry, [field]: value });
  }

  // Making somebody a Sales Manager, or taking it away, changes who they can
  // see. Nothing else here does, but working out which role it was would be
  // one more thing to get wrong for no saving.
  await syncManagedScopes().catch((e) => {
    console.error('[admin/users] refreshing managed scopes failed', email, e);
  });

  return NextResponse.json({ ok: true });
}

/**
 * Replace the set of permissions granted to one person individually.
 *
 * The whole set arrives at once rather than one key at a time — see the note
 * at the PATCH branch. Three things are enforced here:
 *
 * - Only keys in the catalog are stored. An unrecognised string would sit in
 *   the array forever and the rules match on strings.
 * - A **Sales Manager may only pass on what they hold themselves.** This is
 *   the ordinary delegation rule, and it is what keeps the team boundary
 *   meaningful: a manager with a broker's permissions can set up an intern,
 *   and cannot invent an ability nobody gave them.
 * - Two permissions can never be delegated by a manager at all, whatever they
 *   hold: managing people and managing settings. Either one would take the
 *   recipient outside the team the manager's own authority comes from.
 */
const NON_DELEGABLE: Permission[] = ['people.manage', 'settings.manage'];

async function updateGrants(caller: Guard, email: string, value: unknown) {
  if (!Array.isArray(value)) {
    return NextResponse.json({ error: 'Expected a list of permissions.' }, { status: 400 });
  }

  const requested = [...new Set(value.map(String))].filter(isPermission);
  const full      = can(caller.profile, 'people.manage');

  if (!full) {
    const refused = requested.filter(
      (p) => NON_DELEGABLE.includes(p) || !can(caller.profile, p),
    );
    if (refused.length > 0) {
      return NextResponse.json(
        { error: 'You can only give someone a permission you hold yourself.' },
        { status: 403 },
      );
    }
  }

  const ref  = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'That person is not on the access list.' }, { status: 404 });
  }

  /*
    A manager may only rewrite the part of the list they could have granted.
    Anything an admin gave this person that the manager does not hold is kept
    exactly as it was — otherwise saving the editor would silently strip
    abilities the manager cannot even see the point of.
  */
  const existing = Array.isArray(snap.data()?.grantedPermissions)
    ? (snap.data()!.grantedPermissions as string[]).filter(isPermission)
    : [];
  const kept = full ? [] : existing.filter((p) => !can(caller.profile, p));

  const grantedPermissions = [...new Set([...kept, ...requested])];
  await ref.update({ grantedPermissions });

  await syncPermissionsFor(email);

  return NextResponse.json({ ok: true, grantedPermissions });
}

/**
 * Copy the entry into the append-only removal log before it is deleted.
 *
 * Removal is otherwise total — entry, profile and photo all go — leaving no way
 * to answer "who took Ana off the system, and when?". This is the only trace
 * that survives it, so it is written *before* the delete: a failure here must
 * stop the removal rather than let it proceed unlogged.
 *
 * A generated document id, not the email: someone can be added, removed,
 * re-added and removed again, and keying on the address would overwrite the
 * first removal with the second.
 */
async function archiveRemoval(
  entry: FirebaseFirestore.DocumentData,
  email: string,
  caller: Guard,
) {
  const archivedOther = otherPhone(entry);

  await adminDb.collection(REMOVED_USERS_COLLECTION).add({
    email,
    firstName:     entry.firstName ?? '',
    lastName:      entry.lastName ?? '',
    displayName:   entry.displayName ?? '',
    personalEmail: entry.personalEmail ?? '',
    legalName:     entry.legalName ?? '',
    phone:         entry.phone ?? '',
    // Read through the helper so an entry still holding the old `phoneGt` is
    // archived with its number, not with a blank where the number was.
    phoneOther:       archivedOther.value,
    phoneOtherRegion: archivedOther.region,
    phoneGt:          '',
    extension:     entry.extension ?? '',
    dateOfBirth:   entry.dateOfBirth ?? '',
    startDate:     entry.startDate ?? '',
    siteId:        entry.siteId ?? null,
    teamId:        entry.teamId ?? null,
    isAdmin:        entry.isAdmin === true,
    isDispatcher:   entry.isDispatcher === true,
    isFinance:      entry.isFinance === true,
    isHr:           entry.isHr === true,
    isSalesManager: entry.isSalesManager === true,
    isIntern:       entry.isIntern === true,
    // What they had been given individually, kept with the roles: the removal
    // log is what answers "what could this person do" after the entry is gone.
    grantedPermissions: Array.isArray(entry.grantedPermissions) ? entry.grantedPermissions : [],
    // Removing an already-suspended account is routine offboarding; removing an
    // active one is the case someone may later need to ask about.
    wasSuspended:  entry.suspended === true,
    uid:           entry.uid ?? null,
    invitedBy:     entry.invitedBy ?? '',
    invitedAt:     entry.invitedAt ?? null,
    lastLoginAt:   entry.lastLoginAt ?? null,
    removedAt:     FieldValue.serverTimestamp(),
    removedBy:     caller.email ?? caller.uid,
    removedByUid:  caller.uid,
  });
}

/** Revoke access entirely: removes the invite, the profile, and the live session. */
export async function DELETE(req: NextRequest) {
  const caller = await guard(req);
  if (caller instanceof NextResponse) return caller;
  // Taking somebody off the system is company-level, like adding them: it
  // archives their payroll details and deletes the account outright. A Sales
  // Manager who needs a team member out of the way suspends them instead.
  const denied = requireFullManage(caller);
  if (denied) return denied;

  const email = normalizeEmail(new URL(req.url).searchParams.get('email'));

  if (!email) {
    return NextResponse.json({ error: 'Missing email.' }, { status: 400 });
  }
  if (normalizeEmail(caller.email) === email) {
    return NextResponse.json({ error: 'You cannot remove your own access.' }, { status: 400 });
  }
  if (isBootstrapAdmin(email)) {
    return NextResponse.json(
      { error: 'This is a protected bootstrap admin account and cannot be removed here.' },
      { status: 400 },
    );
  }

  const ref = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  const uid = snap.data()?.uid ?? (await adminAuth.getUserByEmail(email).catch(() => null))?.uid;

  // The log is written before anything is destroyed, and failing to write it
  // aborts the whole removal — an unlogged deletion is the exact gap this was
  // added to close, so it must not be possible to get one by having the log
  // write fail. Skipped when there is no entry to copy: a repeat DELETE on an
  // address that is already gone should not add a second, emptier row.
  if (snap.exists) {
    try {
      await archiveRemoval(snap.data() ?? {}, email, caller);
    } catch {
      return NextResponse.json(
        { error: 'Could not record the removal, so nothing was removed. Try again.' },
        { status: 500 },
      );
    }
  }

  // Removing the person should not leave their photo sitting in the bucket.
  // The archive stores no photoPath as a result — it would only point at a
  // file that no longer exists.
  const photoPath = snap.data()?.photoPath;
  if (typeof photoPath === 'string' && photoPath) {
    await adminStorage.bucket().file(photoPath).delete().catch(() => {});
  }

  await ref.delete();

  // A team pointing at someone who is no longer on the system would render a
  // blank lead with no way to tell it from "nobody named yet". Clearing it says
  // the true thing: this team needs a new lead. Suspension deliberately does
  // not do this — a suspended lead is still the lead they come back to.
  //
  // Both shapes have to be cleared, and the pending one runs even when there is
  // no uid: a lead who never signed in is held by email alone, and that is
  // exactly the person most likely to be removed before their first day.
  const led = await Promise.all([
    adminDb.collection(TEAMS_COLLECTION).where('leadEmail', '==', email).get(),
    uid
      ? adminDb.collection(TEAMS_COLLECTION).where('leadUid', '==', uid).get()
      : null,
  ]);
  const ledDocs = led.flatMap((snap) => snap?.docs ?? []);
  if (ledDocs.length) {
    const batch = adminDb.batch();
    for (const doc of ledDocs) batch.update(doc.ref, { leadUid: null, leadEmail: null });
    await batch.commit().catch(() => {});
  }

  if (uid) {
    await adminDb.collection(USERS_COLLECTION).doc(uid).delete().catch(() => {});
    // Kill the session now rather than waiting for the ID token to expire.
    await adminAuth.setCustomUserClaims(uid, { ttlAccess: false }).catch(() => {});
    await adminAuth.revokeRefreshTokens(uid).catch(() => {});
    await adminAuth.updateUser(uid, { disabled: true }).catch(() => {});
  }

  // They may have been on somebody's team, or have led one — the block above
  // just cleared any team they led. Either way a manager's mirror now names
  // somebody who is no longer here.
  await syncManagedScopes().catch((e) => {
    console.error('[admin/users] refreshing managed scopes failed', email, e);
  });

  return NextResponse.json({ ok: true });
}
