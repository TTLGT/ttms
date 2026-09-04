import { adminDb, adminStorage } from './firebase-admin';
import {
  ALLOWED_USERS_COLLECTION,
  SITES_COLLECTION,
  TEAMS_COLLECTION,
  USERS_COLLECTION,
} from './accessControl';
import { MIRRORED_FIELDS } from './userImport';
import { syncManagedScopes } from './teamScope';
import { isOtherPhoneRegion, normalizePhone, type OtherPhoneRegion } from './phone';
import { normalizeCalendarDate } from '@/types/allowedUser';
import type { ProfileField } from '@/types/profileUpdateRequest';

/**
 * Writing one field of one person's record, from a request they raised.
 *
 * This is the *only* thing that acts on an approved profile update request,
 * and it is deliberately narrow: it takes a field name out of the catalog in
 * src/types/profileUpdateRequest.ts and a value, and it can do nothing else.
 * There is no branch here that could reach a role, a permission or somebody's
 * suspension, which is what makes it safe to hand the approval to HR.
 *
 * It is the single-field sibling of `updateDetails` in /api/admin/users, which
 * writes the same fields as one patch when an admin edits the row directly.
 * The two agree on three things and must go on agreeing:
 *
 * - **Normalisation.** A number typed here gets the same treatment as one
 *   typed in Settings, or the same line would sit in the directory two ways.
 * - **What is mirrored.** MIRRORED_FIELDS is imported from lib/userImport.ts
 *   rather than restated, because the four payroll fields must never reach
 *   `users/{uid}` — every signed-in user can read that document.
 * - **`displayName`.** It is stored, not derived, so changing either name part
 *   has to rewrite it or the rest of the app keeps showing the old one.
 */

/**
 * What actually reaches `users/{uid}`.
 *
 * `photoPath` is added to the imported list rather than being in it: the CSV
 * importer never writes a photo, so it has no business in a list that exists
 * for the importer, but /api/admin/users mirrors it and so must this. Getting
 * that wrong would leave the sidebar and the directory showing the old picture
 * until the person next signed in.
 */
const MIRRORS_TO_PROFILE = new Set<string>([...MIRRORED_FIELDS, 'photoPath']);

/** Trimmed and capped, the same way the admin editor caps the same field. */
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

const TEXT_LIMITS: Partial<Record<ProfileField, number>> = {
  firstName:     60,
  lastName:      60,
  legalName:     160,
  personalEmail: 120,
  extension:     12,
};

export interface FieldPatch {
  /** The fields to write on the allowlist entry. */
  patch: Record<string, unknown>;
  /** Why it was refused, when the value cannot be stored as given. */
  error?: string;
}

/**
 * Turn a requested value into the fields that would be written for it, or an
 * error saying why it cannot be.
 *
 * Run twice for every request, on purpose: once when it is raised, so somebody
 * is told about an unreadable phone number while they are still looking at the
 * box they typed it into, and again when it is approved, because a site or a
 * team named in a request can be deleted in the days before anybody decides it.
 */
export async function planProfileField(
  field: ProfileField,
  value: string,
  region?: OtherPhoneRegion,
): Promise<FieldPatch> {
  switch (field) {
    case 'firstName':
    case 'lastName':
    case 'legalName':
    case 'personalEmail':
    case 'extension':
      return { patch: { [field]: text(value, TEXT_LIMITS[field] ?? 60) } };

    case 'phone': {
      const { value: normalized, rejected, raw } = normalizePhone(value, 'US');
      if (rejected) return { patch: {}, error: `${raw} is not a 10-digit US number.` };
      return { patch: { phone: normalized } };
    }

    case 'phoneOther': {
      const country = isOtherPhoneRegion(region) ? region : 'GT';
      const { value: normalized, rejected, raw } = normalizePhone(value, country);
      if (rejected) {
        const shape = country === 'GT' ? 'an 8-digit Guatemala number' : 'a 10-digit Mexico number';
        return { patch: {}, error: `${raw} is not ${shape}.` };
      }
      // `phoneGt` is cleared in the same write for the reason lib/phone.ts
      // gives: a record must never hold the number in two places, or a
      // deliberately emptied field comes back from the old one.
      return { patch: { phoneOther: normalized, phoneOtherRegion: country, phoneGt: '' } };
    }

    case 'dateOfBirth':
    case 'startDate': {
      const date = normalizeCalendarDate(value);
      // Unlike the admin editor, which stores an unreadable date as '' because
      // its inputs cannot produce one, this refuses. A blank here would read as
      // "they asked for it to be cleared" — which somebody may well have meant,
      // so the two cases have to stay distinguishable.
      if (value.trim() && !date) return { patch: {}, error: 'That is not a real date.' };
      return { patch: { [field]: date } };
    }

    case 'siteId': {
      const id = value.trim();
      if (!id) return { patch: { siteId: null } };
      if (!(await adminDb.collection(SITES_COLLECTION).doc(id).get()).exists) {
        return { patch: {}, error: 'That office no longer exists.' };
      }
      return { patch: { siteId: id } };
    }

    case 'teamId': {
      const id = value.trim();
      if (!id) return { patch: { teamId: null } };
      if (!(await adminDb.collection(TEAMS_COLLECTION).doc(id).get()).exists) {
        return { patch: {}, error: 'That team no longer exists.' };
      }
      return { patch: { teamId: id } };
    }

    case 'photoPath': {
      const path = value.trim();
      if (!path) return { patch: { photoPath: null } };
      // The same check /api/admin/users makes on an uploaded path: it is
      // generated in the browser, so it is verified rather than trusted.
      if (!/^avatars\/[^.]/.test(path)) {
        return { patch: {}, error: 'Unexpected photo location.' };
      }
      return { patch: { photoPath: path } };
    }
  }
}

/**
 * Write the planned fields, mirror what belongs on the profile, and keep the
 * things that depend on them current.
 *
 * Returns the patch it wrote so the caller can record it on the request.
 */
export async function applyProfileField(
  email: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const ref  = adminDb.collection(ALLOWED_USERS_COLLECTION).doc(email);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('That person is not on the access list.');
  const entry = snap.data() ?? {};

  const write = { ...patch };

  // `displayName` is stored rather than joined at read time — work groups and
  // party approvals all read one name off the record — so a change to either
  // half has to rewrite it here.
  if ('firstName' in write || 'lastName' in write) {
    const first = 'firstName' in write ? String(write.firstName ?? '') : (entry.firstName ?? '');
    const last  = 'lastName'  in write ? String(write.lastName  ?? '') : (entry.lastName  ?? '');
    write.displayName = [first, last].filter(Boolean).join(' ');
  }

  const previousPhoto = typeof entry.photoPath === 'string' ? entry.photoPath : null;

  await ref.update(write);

  const mirror = Object.fromEntries(
    Object.entries(write).filter(([key]) => MIRRORS_TO_PROFILE.has(key)),
  );
  const uid = typeof entry.uid === 'string' ? entry.uid : null;
  if (uid && Object.keys(mirror).length > 0) {
    await adminDb.collection(USERS_COLLECTION).doc(uid).set(mirror, { merge: true });
  }

  // Moving somebody between teams moves them between two Sales Managers'
  // scopes, and a missed sync leaves a manager quietly seeing a former
  // report's loads. Nothing else in this file affects access.
  if ('teamId' in write) {
    await syncManagedScopes().catch((e) => {
      console.error('[profileFields] refreshing managed scopes failed', email, e);
    });
  }

  // The old picture is only deleted once the record points at the new one —
  // the other order strands the row on a file that is already gone if the
  // write fails. Same sequencing as the uploader in UserAvatar.tsx.
  if ('photoPath' in write && previousPhoto && previousPhoto !== write.photoPath) {
    await deleteAvatar(previousPhoto);
  }
}

/**
 * Remove an avatar file that nothing points at any more — the photo a request
 * replaced, or the one a refused request uploaded and will never use.
 *
 * Failures are swallowed: an orphaned image costs a few kilobytes, while a
 * decision that failed to record because the bucket was slow costs the person
 * waiting on it.
 */
export async function deleteAvatar(path: string): Promise<void> {
  if (!/^avatars\/[^.]/.test(path)) return;
  await adminStorage.bucket().file(path).delete().catch(() => {});
}
