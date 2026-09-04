import { auth } from './firebase';
import type { OtherPhoneRegion } from './phone';
import type { RoleFlagSet } from '@/types/permission';
import type { ProfileField, ProfileUpdateRequest } from '@/types/profileUpdateRequest';

/**
 * Your own record, and the changes you have asked for on it.
 *
 * Everything here goes through the API rather than the client SDK, because the
 * record lives on `allowedUsers` and the rules open that collection to admin
 * and HR alone. A rule cannot say "the one document whose id is your address"
 * — see the note at the top of /api/me — so the narrowing happens server-side
 * and the browser is handed one person: the caller.
 */

/** The caller's own entry, payroll fields included. It is their own record. */
export interface MyRecord extends RoleFlagSet {
  email: string;
  /**
   * False for a bootstrap admin who has never been invited — they are signed
   * in against the escape hatch rather than an entry, so there is nothing to
   * raise a request against and the page says so.
   */
  onAllowlist: boolean;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  phoneOther: string;
  phoneOtherRegion: OtherPhoneRegion;
  extension: string;
  siteId: string | null;
  teamId: string | null;
  photoPath: string | null;
  legalName: string;
  personalEmail: string;
  dateOfBirth: string;
  startDate: string;
}

export async function fetchMyRecord(): Promise<MyRecord> {
  const { me } = await apiGet<{ me: MyRecord }>('/api/me');
  return me;
}

/**
 * Ask for one field to be changed.
 *
 * `value` is what it should become; '' asks for it to be cleared. The two
 * labels are for a field whose value is an id or a file path — the office
 * name rather than the office id — and are worked out here because the page
 * already has the lists loaded and the server would have to re-read them.
 */
export async function requestProfileUpdate(input: {
  field: ProfileField;
  value: string;
  region?: OtherPhoneRegion;
  reason?: string;
  currentLabel?: string;
  requestedLabel?: string;
}): Promise<{ id: string }> {
  return apiPost('/api/profile/requests', input);
}

export async function listProfileUpdateRequests(
  box: 'incoming' | 'outgoing',
): Promise<ProfileUpdateRequest[]> {
  const { requests } = await apiGet<{ requests: ProfileUpdateRequest[] }>(
    `/api/profile/requests?box=${box}`,
  );
  return requests;
}

/**
 * `approve` and `deny` are for whoever holds `profile.decideUpdates`;
 * `withdraw` is for the person who raised it. The server enforces that split —
 * hiding the wrong button is a courtesy, not the control.
 */
export async function decideProfileUpdateRequest(
  requestId: string,
  action: 'approve' | 'deny' | 'withdraw',
  options: { reason?: string } = {},
) {
  return apiPost(`/api/profile/requests/${requestId}`, { action, reason: options.reason });
}

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: await authHeaders() });
  return unwrap<T>(res);
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  return unwrap<T>(res);
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}
