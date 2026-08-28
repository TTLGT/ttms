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
 *
 * Be clear about what that narrowing is and is not. It is a decision about
 * what is *useful* to show a broker, **not a security boundary**. Every field
 * on `users/{uid}` is readable by any signed-in user under the Firestore
 * rules, and always has been. The real boundary is what gets mirrored onto
 * that document at all — MIRRORED_FIELDS in lib/userImport.ts — and legal
 * name, date of birth, personal email and start date are deliberately not in
 * it. If something must genuinely be kept from brokers, keep it off the
 * profile; hiding it here would only keep it off the screen.
 */

export interface DirectoryPerson {
  email: string;
  displayName: string;
  photoPath?: string | null;
  /** The US work line. Everyone sees this one. */
  phone?: string;
  extension?: string;
  /** Second number, office and team: only filled in for admin and HR. */
  phoneOther?: string;
  phoneOtherRegion?: OtherPhoneRegion;
  /** Legacy home for the second number — read through `otherPhone()`. */
  phoneGt?: string;
  siteId?: string | null;
  teamId?: string | null;
  /** True for someone on the allowlist who has never signed in. */
  pending: boolean;
  /** Only ever true in the admin/HR view; suspended people are filtered out
   *  of everyone else's. */
  suspended: boolean;
}

/** Whoever the viewer is, this much of a person is shown. */
function common(p: {
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  extension?: string;
  photoPath?: string | null;
}): DirectoryPerson {
  const joined = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return {
    email:       p.email,
    // Falls back to the address so a person set up before anyone typed their
    // name still appears, rather than showing as a blank card.
    displayName: joined || (p.displayName ?? '').trim() || p.email,
    photoPath:   p.photoPath ?? null,
    phone:       p.phone,
    extension:   p.extension,
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
        siteId:           p.siteId ?? null,
        teamId:           p.teamId ?? null,
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
