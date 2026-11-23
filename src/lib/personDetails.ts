import { otherPhone } from './phone';
import { splitName, type AllowedUser, type AllowedUserDetails } from '@/types/allowedUser';

/**
 * Everything the details save writes, as it stands on someone's entry now.
 *
 * `PATCH /api/admin/users` with `details` replaces the whole block — name,
 * phones, dates, site and team together — so anything that changes one of
 * them (the Teams org chart moving a person, the person page saving their
 * team) has to send the rest as it is, or it blanks them. This is that "as it
 * is", in one place.
 *
 * An entry saved before the name was split has only `displayName`; it is
 * split here so a save of anything else does not wipe the name.
 */
export function detailsOf(person: AllowedUser): AllowedUserDetails {
  const name = person.firstName || person.lastName
    ? { firstName: person.firstName ?? '', lastName: person.lastName ?? '' }
    : splitName(person.displayName);
  const other = otherPhone(person);
  return {
    ...name,
    legalName:        person.legalName ?? '',
    personalEmail:    person.personalEmail ?? '',
    phone:            person.phone ?? '',
    phoneOther:       other.value,
    phoneOtherRegion: other.region,
    extension:        person.extension ?? '',
    dateOfBirth:      person.dateOfBirth ?? '',
    startDate:        person.startDate ?? '',
    siteId:           person.siteId ?? null,
    teamId:           person.teamId ?? null,
  };
}
