import { auth } from './firebase';
import { canSeeDirectory, type RoleFlags } from './accessControl';
import { ROLE_ORDER, type RoleFlagSet } from '@/types/permission';
import { listAllowedUsers } from './allowedUsers';
import { listUserProfiles } from './userProfiles';
import type { OtherPhoneRegion } from './phone';
// Type only, so nothing from the Admin SDK reaches the browser bundle — the
// same arrangement lib/orders.ts has with lib/orderSummary.ts.
import type { BookOfBusiness } from './bookOfBusiness';

/**
 * The company directory — who works here and how to reach them.
 *
 * Two sources, deliberately:
 *
 * - **Everyone** reads `users/{uid}`, the profile provisioned server-side at
 *   first sign-in. It carries exactly the ordinary directory fields — name,
 *   company address, work numbers, extension, site, team — and none of the
 *   payroll ones, which is why the rules let every signed-in user read it.
 * - **Admin and HR** read the allowlist instead, which they are already
 *   allowed to. That is the same people plus everyone who has been set up but
 *   has never signed in: a new hire's desk number is in the system on their
 *   first day, and HR should not have to wait for Google to have seen them.
 *
 * How much of a person is shown is decided here rather than in the page, so
 * there is one place to look when asking what the directory gives away.
 * Everyone gets the name, the company address, the US work line, the
 * extension, the office and the team. Admin and HR get five things beyond
 * that, and **the two halves of that list are not the same kind of secret**:
 *
 * - The **second phone number** is on `users/{uid}` like the rest of the
 *   contact fields, so every signed-in user can already read it. Holding it
 *   back here is an editorial decision about what is useful to show a broker —
 *   it is usually someone's personal mobile in their home country rather than
 *   a desk they sit at — and **not a security boundary**. Anyone determined to
 *   read it can.
 * - **Legal name, personal email, date of birth and start date** are a real
 *   boundary, and it is enforced two layers down rather than here. They are
 *   never mirrored onto `users/{uid}` — see MIRRORED_FIELDS in
 *   lib/userImport.ts — so they exist only on `allowedUsers`, which the rules
 *   open to admin and HR alone. The narrow branch below is built from profiles
 *   that simply do not carry these fields, which is why a mistake in a view
 *   cannot leak them: there is nothing there to render.
 *
 * That difference is the thing to keep hold of when this list changes. Adding
 * a field to the admin/HR half is safe **only** while that field stays off
 * `users/{uid}`. If something must genuinely be kept from brokers, keep it off
 * the profile; hiding it here would only keep it off the screen.
 */

/**
 * Extends RoleFlagSet, so every person carries the roles they hold — Admin,
 * Dispatcher, Finance, HR, Sales Manager, Intern, or none of them, which is a
 * Broker.
 *
 * Shown to everyone, and safe to show: the flags are already on `users/{uid}`,
 * which every signed-in user can read, because the app and the Storage rules
 * both need them there. Putting them in the phone book gives away nothing new
 * and answers the question it is most often opened for after a phone number —
 * who do I ask about this?
 *
 * Note what is deliberately absent: the effective permission list. What
 * somebody's *role* is is ordinary working information. That one person has
 * been given the right to generate invoices is between them and an admin, and
 * a card showing it would turn the directory into a map of which accounts are
 * worth having.
 */
export interface DirectoryPerson extends RoleFlagSet {
  email: string;
  /**
   * Null for somebody invited who has never signed in — there is no account
   * to open a conversation with yet. Carried so the directory can offer a
   * message alongside the phone number; it is the same id chat already puts on
   * every message, so it discloses nothing new.
   */
  uid?: string | null;
  displayName: string;
  photoPath?: string | null;
  /** The US work line. Everyone sees this one. */
  phone?: string;
  extension?: string;
  /**
   * Where the person sits and who they report through. Shown to everyone:
   * knowing which office to walk to, or which team a load belongs with, is
   * ordinary working information and answers half the questions the phone
   * book gets asked.
   */
  siteId?: string | null;
  teamId?: string | null;
  /** The second number: only filled in for admin and HR. */
  phoneOther?: string;
  phoneOtherRegion?: OtherPhoneRegion;
  /** Legacy home for the second number — read through `otherPhone()`. */
  phoneGt?: string;
  /**
   * The four admin/HR-only fields, filled in from the allowlist and absent
   * from every other viewer's copy — not blanked, never fetched. See the note
   * above: these are the ones kept off `users/{uid}` on purpose, and they must
   * stay off it.
   */
  legalName?: string;
  personalEmail?: string;
  dateOfBirth?: string;
  startDate?: string;
  /** True for someone on the allowlist who has never signed in. */
  pending: boolean;
  /** Only ever true in the admin/HR view; suspended people are filtered out
   *  of everyone else's. */
  suspended: boolean;
}

/** Whoever the viewer is, this much of a person is shown. */
function common(p: {
  email: string;
  uid?: string | null;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  extension?: string;
  siteId?: string | null;
  teamId?: string | null;
  photoPath?: string | null;
  isAdmin?: boolean;
  isDispatcher?: boolean;
  isFinance?: boolean;
  isHr?: boolean;
  isSalesManager?: boolean;
  isIntern?: boolean;
}): DirectoryPerson {
  const joined = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return {
    email:       p.email,
    uid:         p.uid ?? null,
    // Falls back to the address so a person set up before anyone typed their
    // name still appears, rather than showing as a blank card.
    displayName: joined || (p.displayName ?? '').trim() || p.email,
    photoPath:   p.photoPath ?? null,
    phone:       p.phone,
    extension:   p.extension,
    siteId:      p.siteId ?? null,
    teamId:      p.teamId ?? null,
    // Spread from the source rather than listed one by one, so a role added to
    // the catalog reaches the directory without this function being found.
    ...Object.fromEntries(ROLE_ORDER.map((role) => [role, p[role] === true])),
    pending:     false,
    suspended:   false,
  };
}

export async function listDirectory(
  profile: RoleFlags | null | undefined,
): Promise<DirectoryPerson[]> {
  const full = canSeeDirectory(profile);

  const people: DirectoryPerson[] = full
    ? (await listAllowedUsers()).map((p) => ({
        ...common(p),
        phoneOther:       p.phoneOther,
        phoneOtherRegion: p.phoneOtherRegion,
        phoneGt:          p.phoneGt,
        legalName:        p.legalName,
        personalEmail:    p.personalEmail,
        dateOfBirth:      p.dateOfBirth,
        startDate:        p.startDate,
        // No uid means the invite is out but nobody has signed in against it.
        pending:          !p.uid,
        suspended:        p.suspended === true,
      }))
    : (await listUserProfiles())
        // Someone whose access is suspended is not in the directory at all for
        // an ordinary user: they cannot be reached through TTMS, and a card
        // for them would invite calls to a person who may have left. Admin and
        // HR still see them, marked, because managing that is their job.
        .filter((p) => p.suspended !== true)
        .map(common);

  // First name, then the address to break a tie — two people called Maria
  // must not swap places between loads.
  return people.sort(
    (a, b) =>
      a.displayName.localeCompare(b.displayName) || a.email.localeCompare(b.email),
  );
}

/**
 * How much work one colleague is carrying: clients owned, loads still open.
 *
 * Unlike everything else in this file it is a server call, because it is a
 * question about records rather than about people. Counting a book means
 * reading orders and parties, and both are filtered server-side — the browser
 * is never sent the rows, only the two totals it may be told.
 *
 * The route refuses with 403 for a reader who may not ask, which is why the
 * page checks `canSeeBookOfBusiness()` before calling: the check here is the
 * enforcement, the one on the page is what stops it asking a question it
 * already knows the answer to.
 */
export async function fetchBookOfBusiness(email: string): Promise<BookOfBusiness> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  const res = await fetch(`/api/directory/book?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as BookOfBusiness;
}
