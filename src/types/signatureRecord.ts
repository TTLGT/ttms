/**
 * A signature recorded from a signed copy uploaded to a load — the BATS
 * e-signed SA or dispatch sheet of a load imported from BATS, or a scan of
 * one signed on paper — as opposed to a signature made on TTMS's own link.
 *
 * ## The flow
 *
 * 1. Anybody who can open the load uploads the signed copy into the Signed SA
 *    or Signed Carrier Agreement slot (an order file of kind `signed_sa` /
 *    `signed_ca`). It arrives `pending`.
 * 2. If it is a PDF, TTMS reads the signature block off it on the server
 *    (src/lib/signatureReader.ts) — the BATS formats print the signer, their
 *    IP and the time as text. Nothing leaves TTMS to do it. What was read is
 *    kept on the file as `detected` and pre-fills the form.
 * 3. The uploader checks those details or types them in (`signature`, with who
 *    entered them).
 * 4. Admin or dispatch (`orders.verifyRecords`) opens the file, confirms it is
 *    a real signed agreement for this load and that the details match, and
 *    approves it — on the Approvals screen or on the load itself. Only then is
 *    the signature written onto the order (`clientSignatureRecord` /
 *    `carrierSignatureRecord`) and does the copy count for anything: Mark
 *    Client Signed, the acceptance email, the client-signature gate on the
 *    carrier agreement, the dashboard's unsigned count.
 *
 * ## Why it is not `shipperSignedAt`
 *
 * `shipperSignedAt` and its IP and device fields are the legal audit trail of
 * a signature made on TTMS's link, captured by TTMS itself. A recorded
 * signature is what a person read off another system's paperwork. The two are
 * kept apart so nothing can mistake one for the other — the record names the
 * method, who entered it and who approved it, and the screens say "recorded
 * from a signed copy" every time they show one.
 */

import type { AgreementParty } from './saRequest';

// ── Method ──────────────────────────────────────────────────────────────────

export const SIGNATURE_METHODS = ['bats_esign', 'other_esign', 'paper', 'email', 'other'] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

export const SIGNATURE_METHOD_LABEL: Record<SignatureMethod, string> = {
  bats_esign:  'BATS e-signature',
  other_esign: 'Other e-signature service',
  paper:       'Signed on paper',
  email:       'Accepted by email',
  other:       'Other',
};

export function isSignatureMethod(v: unknown): v is SignatureMethod {
  return typeof v === 'string' && (SIGNATURE_METHODS as readonly string[]).includes(v);
}

// ── Time zones ──────────────────────────────────────────────────────────────

/**
 * The zone a signature time was printed in, by the abbreviation the document
 * printed, with its fixed offset from UTC in minutes.
 *
 * Fixed rather than "America/Chicago": the document says "PST", and that is
 * what it means — BATS prints PST in October too. Taking the abbreviation at
 * its word, and keeping it beside the time, keeps the record what the paper
 * says. Guatemala is CST all year, which is the same −6.
 */
export const SIGNATURE_ZONES = {
  PST: -480, PDT: -420,
  MST: -420, MDT: -360,
  CST: -360, CDT: -300,
  EST: -300, EDT: -240,
  UTC: 0,
} as const;
export type SignatureZone = keyof typeof SIGNATURE_ZONES;

export const SIGNATURE_ZONE_LABEL: Record<SignatureZone, string> = {
  PST: 'PST — Pacific standard',
  PDT: 'PDT — Pacific daylight',
  MST: 'MST — Mountain standard',
  MDT: 'MDT — Mountain daylight',
  CST: 'CST — Central standard (and Guatemala)',
  CDT: 'CDT — Central daylight',
  EST: 'EST — Eastern standard',
  EDT: 'EDT — Eastern daylight',
  UTC: 'UTC',
};

export function isSignatureZone(v: unknown): v is SignatureZone {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SIGNATURE_ZONES, v);
}

/** `GMT` and `Z` are UTC by another name; anything else unknown is not guessed. */
export function zoneFromText(text: string): SignatureZone | null {
  const t = text.trim().toUpperCase();
  if (t === 'GMT' || t === 'Z') return 'UTC';
  return isSignatureZone(t) ? t : null;
}

/** The instant a date, time and zone name. Null when any of them is not real. */
export function signedAtMillis(date: string, time: string, zone: SignatureZone): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const local = Date.UTC(y, mo - 1, da, h, mi);
  // Date.UTC rolls 31 February into March; a date that moved was not real.
  if (new Date(local).getUTCDate() !== da) return null;
  return local - SIGNATURE_ZONES[zone] * 60_000;
}

/** "7:49 PM" from "19:49". */
export function time12(time: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

// ── What is entered ─────────────────────────────────────────────────────────

/** The form, as the browser sends it and gets it back. */
export interface SignatureDetails {
  signerName: string;
  signerTitle: string;
  /** `YYYY-MM-DD`, as the document printed it — in `zone`, not the office's. */
  date: string;
  /** `HH:MM`, 24-hour, in `zone`. */
  time: string;
  zone: SignatureZone;
  signerIp: string;
  method: SignatureMethod;
  /** A checksum, envelope id or anything else that identifies the signed copy. */
  reference: string;
}

export const MAX_SIGNER_NAME = 120;
export const MAX_SIGNER_TITLE = 80;
export const MAX_SIGNATURE_REFERENCE = 200;

/**
 * The one check on a set of details, run in the form so somebody is told
 * before they save, and again by the route, which believes nothing.
 */
export function cleanSignatureDetails(raw: unknown): { value: SignatureDetails } | { error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

  const signerName = str(r.signerName, MAX_SIGNER_NAME);
  if (!signerName) return { error: 'Who signed it? Type the name as it appears on the document.' };
  const zone = isSignatureZone(r.zone) ? r.zone : null;
  if (!zone) return { error: 'Pick the time zone the signature time is in.' };
  const date = typeof r.date === 'string' ? r.date : '';
  const time = typeof r.time === 'string' ? r.time : '';
  const at = signedAtMillis(date, time, zone);
  if (at === null) return { error: 'Enter the date and time it was signed.' };
  // A day of slack for zones ahead of the office; a signature from next week is a typo.
  if (at > Date.now() + 24 * 60 * 60 * 1000) return { error: 'That signing time is in the future.' };
  if (at < Date.UTC(2000, 0, 1)) return { error: 'That signing date is too far back to be right.' };
  const signerIp = str(r.signerIp, 64);
  if (signerIp && !/^[0-9a-fA-F.:]+$/.test(signerIp)) return { error: 'The IP address should be numbers and dots, like 108.147.173.79.' };
  const method = isSignatureMethod(r.method) ? r.method : null;
  if (!method) return { error: 'Say how it was signed.' };

  return {
    value: {
      signerName,
      signerTitle: str(r.signerTitle, MAX_SIGNER_TITLE),
      date, time, zone, signerIp, method,
      reference: str(r.reference, MAX_SIGNATURE_REFERENCE),
    },
  };
}

/** Same details? Used to tell "read from the PDF" from "read, then corrected". */
export function sameDetails(a: Partial<SignatureDetails> | null | undefined, b: Partial<SignatureDetails> | null | undefined): boolean {
  if (!a || !b) return false;
  return (['signerName', 'date', 'time', 'zone', 'signerIp', 'reference'] as const)
    .every((k) => (a[k] ?? '') === (b[k] ?? ''));
}

// ── What was read off the PDF ───────────────────────────────────────────────

export const DETECTED_FORMATS = ['bats_sa', 'bats_ca', 'ttms'] as const;
export type DetectedFormat = (typeof DETECTED_FORMATS)[number];

export const DETECTED_FORMAT_LABEL: Record<DetectedFormat, string> = {
  bats_sa: 'BATS shipper agreement',
  bats_ca: 'BATS dispatch sheet (carrier agreement)',
  ttms:    'TTMS signed agreement',
};

/**
 * What src/lib/signatureReader.ts found. Every field may be missing — a scan
 * has no text at all, and an unfamiliar layout yields only some lines.
 */
export interface DetectedSignature {
  format: DetectedFormat | null;
  /** Whose agreement the document looks like, whatever slot it was put in. */
  party: AgreementParty | null;
  /** The order number printed on it, to compare with the load. */
  orderNumber: string | null;
  signerName: string | null;
  signerIp: string | null;
  date: string | null;
  time: string | null;
  zone: SignatureZone | null;
  /** The time exactly as printed, for the approver to compare. */
  signedAtText: string | null;
  reference: string | null;
  /**
   * The carrier and driver a BATS dispatch sheet names, to find or add the
   * carrier with. Absent on a reading made before it was read, and on every
   * other format.
   */
  carrier?: DetectedCarrier | null;
}

export interface DetectedCarrier {
  name: string | null;
  contact: string | null;
  phone: string | null;
  address: string | null;
  driverName: string | null;
  driverPhone: string | null;
  mc: string | null;
  dot: string | null;
}

/** The form's starting values from what was read, with the method it implies. */
export function detailsFromDetected(d: DetectedSignature | null): Partial<SignatureDetails> {
  if (!d) return {};
  return {
    ...(d.signerName ? { signerName: d.signerName } : {}),
    ...(d.date ? { date: d.date } : {}),
    ...(d.time ? { time: d.time } : {}),
    ...(d.zone ? { zone: d.zone } : {}),
    ...(d.signerIp ? { signerIp: d.signerIp } : {}),
    ...(d.reference ? { reference: d.reference } : {}),
    ...(d.format === 'bats_sa' || d.format === 'bats_ca' ? { method: 'bats_esign' as const } : {}),
    ...(d.format === 'ttms' ? { method: 'other_esign' as const } : {}),
  };
}

/** Whether the detection found enough to be worth offering. */
export function detectedAnything(d: DetectedSignature | null | undefined): boolean {
  return Boolean(d && (d.signerName || d.date || d.signerIp));
}

/**
 * Whether the number printed on the document is this load's. Compared as
 * digits, because BATS prints "25991695" where the load carries it as its
 * BATS id, and a TTMS number has letters in front.
 */
export function orderNumberMatches(printed: string | null, load: { batsId?: string | null; orderNumber?: string | null }): boolean | null {
  if (!printed) return null;
  const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
  const p = digits(printed);
  if (!p) return null;
  return [load.batsId, load.orderNumber].some((n) => digits(n) === p);
}

// ── The review of the uploaded copy ─────────────────────────────────────────

export const SIGNED_FILE_REVIEWS = ['pending', 'approved', 'rejected'] as const;
export type SignedFileReview = (typeof SIGNED_FILE_REVIEWS)[number];

/**
 * A signed-agreement file's review as stored. A file uploaded before reviews
 * existed has none and reads as approved — it was already accepted as proof
 * under the old rule, and loads were moved on it. Every upload since is
 * written `pending`, and a file cannot be re-kinded into a signed slot
 * (PATCH /api/orders/{id}/files/{fileId}), so absence cannot be manufactured.
 */
export function reviewOf(stored: unknown): SignedFileReview {
  return stored === 'pending' || stored === 'rejected' ? stored : 'approved';
}

export const MAX_REJECT_REASON = 300;

// ── What lands on the order ─────────────────────────────────────────────────

/**
 * The recorded signature, as stored on the order and on the file. Times are
 * epoch milliseconds — a nested map nothing queries, and the same value
 * whether it arrives over JSON or from Firestore.
 */
export interface SignatureRecord extends SignatureDetails {
  fileId: string;
  /** The instant `date` + `time` + `zone` name. */
  signedAt: number;
  /** Read off the PDF unchanged, read and then corrected, or typed by hand. */
  source: 'pdf' | 'pdf_edited' | 'typed';
  enteredByUid: string;
  enteredByName: string;
  enteredAt: number;
  approvedByUid: string;
  approvedByName: string;
  approvedAt: number;
}

/** The order fields each party's record and its mirror live in. */
export const RECORD_FIELD: Record<AgreementParty, { record: 'clientSignatureRecord' | 'carrierSignatureRecord'; flag: 'clientSignatureRecorded' | 'carrierSignatureRecorded' }> = {
  client:  { record: 'clientSignatureRecord',  flag: 'clientSignatureRecorded' },
  carrier: { record: 'carrierSignatureRecord', flag: 'carrierSignatureRecorded' },
};

/** Narrowing for a record read back off an order of unknown shape. */
export function asSignatureRecord(v: unknown): SignatureRecord | null {
  const r = v as Partial<SignatureRecord> | null | undefined;
  return r && typeof r.signerName === 'string' && typeof r.signedAt === 'number' ? r as SignatureRecord : null;
}
