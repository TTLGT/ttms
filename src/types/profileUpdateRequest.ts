import type { Timestamp } from 'firebase/firestore';
import type { OtherPhoneRegion } from '@/lib/phone';

/**
 * A person asking for one thing on their own record to be changed.
 *
 * Everything the company holds about somebody is entered by an admin in
 * Settings → People, which is right — the access list is not a place people
 * should be able to edit themselves, and the whole access model rests on
 * nobody being able to write their own entry. But it left the person the
 * record is *about* with no way to say "that is my old number" other than
 * finding an admin, and no way at all to see what was on file.
 *
 * This is that channel, and it is deliberately a **request** rather than an
 * edit. Nothing here writes to `allowedUsers`; approving does, through the
 * Admin SDK, exactly as an admin editing the row would. The person raising it
 * never touches their own entry, so the invariant in CLAUDE.md — an account
 * cannot change its own standing — is untouched.
 *
 * What is deliberately **not** requestable: roles, permissions, suspension,
 * and the email address itself. Those are access rather than information, and
 * a queue for "please make me an admin" is a queue for the wrong question.
 * The catalog below is the whole of what can be asked for; adding a key to it
 * is the decision to let people ask about that field.
 */

export const PROFILE_UPDATE_REQUESTS_COLLECTION = 'profileUpdateRequests';

/**
 * How a value is typed and shown. Drives the editor on the profile page and
 * the normalisation the approve route runs before it writes anything.
 */
export type ProfileFieldKind =
  | 'text'
  /** The US work line. */
  | 'phone'
  /** The second number, which carries a country alongside it. */
  | 'otherPhone'
  /** `YYYY-MM-DD`, typed through DateField. */
  | 'date'
  | 'site'
  | 'team'
  /** A storage path under `avatars/`, uploaded before the request is raised. */
  | 'photo';

export type ProfileField =
  | 'firstName'
  | 'lastName'
  | 'legalName'
  | 'personalEmail'
  | 'phone'
  | 'phoneOther'
  | 'extension'
  | 'dateOfBirth'
  | 'startDate'
  | 'siteId'
  | 'teamId'
  | 'photoPath';

export interface ProfileFieldMeta {
  key: ProfileField;
  /** What the field is called on screen and in the approver's inbox. */
  label: string;
  kind: ProfileFieldKind;
  /** One line under the label, saying what the field is for. */
  detail: string;
  /**
   * True for the four fields that live only on `allowedUsers` and are never
   * mirrored onto `users/{uid}` — see MIRRORED_FIELDS in lib/userImport.ts.
   * The profile page marks them so somebody can see that their birthday is
   * not on the phone book page their colleagues read.
   */
  privateToHr?: boolean;
}

/**
 * Everything a person may ask to have changed about themselves, in the order
 * the profile page lists it.
 *
 * The wording is the same as Settings → People uses for the same field, on
 * purpose: the approver is reading a request about a row they are about to
 * open, and two names for one field is how the wrong one gets edited.
 */
export const PROFILE_FIELDS: ProfileFieldMeta[] = [
  { key: 'photoPath',     label: 'Profile photo',   kind: 'photo',
    detail: 'The picture beside your name here, in chat and in the directory.' },
  { key: 'firstName',     label: 'First name',      kind: 'text',
    detail: 'The name the office uses. Shown everywhere in TTMS.' },
  { key: 'lastName',      label: 'Last name',       kind: 'text',
    detail: 'Shown after your first name wherever you appear.' },
  { key: 'phone',         label: 'Work phone (US)', kind: 'phone',
    detail: 'Your US work line, in the company phone book.' },
  { key: 'extension',     label: 'Extension',       kind: 'text',
    detail: 'Your desk extension, on the sheet by the phones.' },
  { key: 'phoneOther',    label: 'Other phone',     kind: 'otherPhone',
    detail: 'A Guatemala or Mexico line, if you have one as well as the US number.' },
  { key: 'siteId',        label: 'Office',          kind: 'site',
    detail: 'Which office you work out of.' },
  { key: 'teamId',        label: 'Team',            kind: 'team',
    detail: 'Which team you report through.' },
  { key: 'legalName',     label: 'Legal name',      kind: 'text', privateToHr: true,
    detail: 'The name on payroll and legal paperwork, when it is not the one above.' },
  { key: 'personalEmail', label: 'Personal email',  kind: 'text', privateToHr: true,
    detail: 'For reaching you when the company account is unavailable. Never used to sign in.' },
  { key: 'dateOfBirth',   label: 'Date of birth',   kind: 'date', privateToHr: true,
    detail: 'Held for payroll. Only you, HR and admins can see it.' },
  { key: 'startDate',     label: 'Start date',      kind: 'date', privateToHr: true,
    detail: 'The day you joined the company.' },
];

export function profileFieldMeta(key: string): ProfileFieldMeta | null {
  return PROFILE_FIELDS.find((f) => f.key === key) ?? null;
}

/** Narrowing for anything arriving from a request body. */
export function isProfileField(value: unknown): value is ProfileField {
  return typeof value === 'string' && PROFILE_FIELDS.some((f) => f.key === value);
}

/**
 * `withdrawn` is the requester taking it back, and it is a fourth status
 * rather than a delete: a request that vanished would take with it the record
 * of somebody having asked, which is the thing an inbox exists to keep.
 */
export type ProfileUpdateStatus = 'pending' | 'approved' | 'denied' | 'withdrawn';

export interface ProfileUpdateRequest {
  id: string;

  /**
   * Whose record. The email is the key on `allowedUsers`, and it is what the
   * approve route writes against — a uid would be absent for somebody who has
   * never signed in, and they are exactly who has most to correct.
   */
  subjectEmail: string;
  subjectUid: string | null;
  /** Snapshot, so the inbox reads right even after the name itself changes. */
  subjectName: string;

  field: ProfileField;
  /**
   * The field's label as it read when the request was raised. Snapshotted for
   * the same reason the name is: the catalog above can be reworded, and an
   * old request should still say what was actually asked for.
   */
  fieldLabel: string;

  /** What the field held when the request was raised, for the approver. */
  currentValue: string;
  /** What the person wants it to be. '' means "clear this". */
  requestedValue: string;
  /** Only meaningful for `phoneOther` — which country the number is in. */
  requestedRegion?: OtherPhoneRegion;
  /**
   * The two values in words, for a field whose value is an id or a storage
   * path. An approver reading "siteId: 3f2a… → 9b1c…" learns nothing; these
   * carry the office names instead. Absent for plain text fields, where the
   * value is already the words.
   */
  currentLabel?: string;
  requestedLabel?: string;

  requestedByUid: string;
  requestedByName: string;
  requestedByEmail: string;
  /** Why — free text, shown to whoever decides it. */
  reason: string;

  status: ProfileUpdateStatus;

  decidedByUid: string | null;
  decidedByName: string | null;
  /**
   * Taken from the request headers, never sent by the browser. Same source
   * and the same reason as the party and order approvals: this is a record of
   * somebody changing a payroll field, and a client-supplied address could
   * say anything.
   */
  decidedByIp: string | null;
  decidedAt: Timestamp | null;
  denyReason: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** How long a reason may be, in both the form and the route that stores it. */
export const MAX_REASON = 500;

/**
 * What a request is asking for, as one line: "Work phone (US): +(469) 935-4100
 * → +(214) 555-0100".
 *
 * Built here rather than in the inbox so the profile page and the approvals
 * screen describe the same request identically — they are read side by side
 * by the two people involved in it.
 */
export function changeSummary(req: Pick<
  ProfileUpdateRequest,
  'currentValue' | 'requestedValue' | 'currentLabel' | 'requestedLabel'
>): { from: string; to: string } {
  return {
    from: req.currentLabel   || req.currentValue   || 'not set',
    to:   req.requestedLabel || req.requestedValue || 'cleared',
  };
}
