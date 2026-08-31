import { canSeeDirectory, type RoleFlags } from './accessControl';
import { listAllowedUsers } from './allowedUsers';
import { listUserProfiles } from './userProfiles';
import type { OtherPhoneRegion } from './phone';

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

export interface DirectoryPerson {
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
