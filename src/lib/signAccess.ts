import { randomBytes, timingSafeEqual } from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { phoneKeysFor, phoneSearchKeys } from '@/types/party';

/**
 * The second check on a signing link: the signer types an email address or
 * phone number we hold for them before the agreement is shown.
 *
 * The token in the link was the whole credential, which meant a forwarded
 * email, a link pasted somewhere it should not be, or a phone left unlocked
 * opened our client's rate and load details to whoever held it. This is the
 * same small step BATS asked for: knowing the link is not enough, you also
 * have to know who it was for.
 *
 * It is a speed bump, not a password. The answers are not secret from the
 * people around the client — a colleague on the same thread knows the
 * address — and that is fine; it is aimed at the stranger holding the link.
 *
 * What counts as a right answer, for each side, and only that side:
 * - **Client (SA)**: the address the link was sent to, anybody copied on it,
 *   and every email and phone on the client's party record, contacts too.
 * - **Carrier (CA)**: the address it was sent to, anybody copied, and the
 *   carrier's main, dispatcher and billing emails and phones.
 *
 * The record is read when the answer is checked, not copied onto the link:
 * links already in inboxes have nothing copied, and a phone number corrected
 * after the send should be the one that works.
 *
 * Once answered, a cookie scoped to that one link (page and API paths only)
 * carries `accessKey` — a random value kept on the token document, which the
 * browser can never read (`signing_tokens` is closed in the rules). No
 * secret in the environment, so nothing new to set on Vercel or the start
 * script.
 */

export const SIGN_ACCESS_COOKIE = 'ttms_sign_access';

/** How long a browser that answered stays let in. Longer than the link's own life. */
export const SIGN_ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Wrong answers allowed before the link stops asking. Ten is plenty for
 * somebody trying their own two addresses with typos, and nothing like
 * enough to guess one. Sending the agreement again resets it — for a client
 * by `verifyFailures: 0` on the reused link, for a carrier because a send is
 * a new link.
 */
export const MAX_VERIFY_FAILURES = 10;

/** Every path the cookie is set on — the page and its API, nothing else. */
export function signAccessPaths(token: string): string[] {
  return [`/sign/${token}`, `/api/sign/${token}`];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TokenData = Record<string, any>;

/** True when the browser holds this link's key. Constant-time, as any key check should be. */
export function hasSignAccess(data: TokenData, cookieValue: string | undefined): boolean {
  const key = typeof data.accessKey === 'string' ? data.accessKey : '';
  if (!key || !cookieValue) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(cookieValue);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when the link has had its ten wrong answers. */
export function isVerifyLocked(data: TokenData): boolean {
  return Number(data.verifyFailures ?? 0) >= MAX_VERIFY_FAILURES;
}

/** A fresh key, for the first right answer on a link. */
export function newAccessKey(): string {
  return randomBytes(32).toString('hex');
}

interface OnFile {
  emails: Set<string>;
  phoneKeys: Set<string>;
}

function addEmail(into: OnFile, raw: unknown) {
  if (typeof raw !== 'string') return;
  const e = raw.trim().toLowerCase();
  if (e.includes('@')) into.emails.add(e);
}

function addPhone(into: OnFile, raw: unknown, region: unknown) {
  if (typeof raw !== 'string') return;
  // phoneKeysFor() is how the party phone lookup files a number, so a number
  // that finds the client in the app is a number that opens their link.
  for (const k of phoneKeysFor(raw, region as Parameters<typeof phoneKeysFor>[1])) into.phoneKeys.add(k);
}

/**
 * The emails and phones that open this link. One read: the client's party,
 * or the carrier. A record that has since been deleted or never existed
 * still leaves the address the link was sent to.
 */
async function onFileFor(data: TokenData): Promise<OnFile> {
  const out: OnFile = { emails: new Set(), phoneKeys: new Set() };
  // `shipper_agreement` is the client's load confirmation; the name is historical.
  const isClient = data.type === 'shipper_agreement';

  addEmail(out, isClient ? data.clientEmail : data.carrierEmail);
  if (Array.isArray(data.cc)) for (const e of data.cc) addEmail(out, e);

  if (isClient) {
    const id = typeof data.clientId === 'string' ? data.clientId : '';
    const p = id ? (await adminDb.collection('parties').doc(id).get()).data() : undefined;
    if (p) {
      addEmail(out, p.email);
      addEmail(out, p.email2);
      addPhone(out, p.phone, p.phoneRegion);
      addPhone(out, p.phone2, p.phone2Region);
      // A contact has no country beside its number; phoneKeysFor() reads that as US.
      for (const c of Array.isArray(p.contacts) ? p.contacts : []) {
        addEmail(out, c?.email);
        addPhone(out, c?.phone, undefined);
      }
    }
  } else {
    const id = typeof data.carrierId === 'string' ? data.carrierId : '';
    const c = id ? (await adminDb.collection('carriers').doc(id).get()).data() : undefined;
    if (c) {
      addEmail(out, c.email);
      addEmail(out, c.dispatcherEmail);
      addEmail(out, c.billingEmail);
      addPhone(out, c.phone, c.phoneRegion);
      addPhone(out, c.dispatcherPhone, c.dispatcherPhoneRegion);
      addPhone(out, c.billingPhone, c.billingPhoneRegion);
    }
  }
  return out;
}

/**
 * True when what was typed is an email or phone we hold for this link's
 * signer. Email ignores case and spaces; a phone ignores formatting and
 * matches with or without its country code, the same readings the party
 * phone search offers (`phoneSearchKeys()`).
 */
export async function matchesOnFile(data: TokenData, typed: string): Promise<boolean> {
  const value = typed.trim();
  if (!value) return false;
  const onFile = await onFileFor(data);
  if (value.includes('@')) return onFile.emails.has(value.toLowerCase());
  return phoneSearchKeys(value).some((k) => onFile.phoneKeys.has(k));
}

