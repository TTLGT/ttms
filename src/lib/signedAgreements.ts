import { adminDb } from './firebase-admin';
import type { AgreementParty } from '@/types/saRequest';
import { signFormData } from './signFormProps';
import {
  generateSignedAgreementBuffer, signatureTime, type SignedAgreementData,
} from './signed-agreement-pdf';

/**
 * Every version of an agreement a load has had, and each one as a PDF — the
 * client's Shipper Agreement or the carrier's Carrier Agreement.
 *
 * The carrier's works differently underneath: each send is a new link
 * rather than a revision of one, so its versions are its links, oldest
 * first, the newest being current. (Links from before versions were numbered
 * are counted in order.)
 *
 * Nothing new is stored for this. The versions were already kept: the live
 * link is `signing_tokens/{token}`, and each time it is revised the version it
 * replaced — with its signature, if it had one — is copied to
 * `signing_tokens/{token}/versions/{n}` (see src/lib/clientAgreements.ts). A
 * load that changed client has a second link, the first one revoked. The PDF
 * is drawn from those copies on request, so it is always exactly what the
 * client was shown and signed, and costs no storage.
 */

export interface AgreementVersionInfo {
  /** `{token}~{version}` — what the PDF route is asked for. */
  ref: string;
  version: number;
  sentAt: number | null;
  sentTo: string;
  signed: { name: string; title: string; at: number; device: string } | null;
  /** When a later version replaced this one. Null for the link's current version. */
  supersededAt: number | null;
  /** This is what the client's link shows now. */
  current: boolean;
  /** The link was cancelled — the client changed. */
  revoked: boolean;
}

function millis(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : null;
}

type Data = FirebaseFirestore.DocumentData;

/** The token type each party's links carry. `shipper_agreement` is the client's; the name is historical. */
const TOKEN_TYPE: Record<AgreementParty, string> = { client: 'shipper_agreement', carrier: 'carrier_agreement' };

function infoOf(token: string, d: Data, current: boolean, revoked: boolean, fallbackVersion = 1): AgreementVersionInfo {
  const version = typeof d.version === 'number' ? d.version : fallbackVersion;
  const signedAt = millis(d.usedAt);
  return {
    ref: `${token}~${version}`,
    version,
    sentAt: millis(d.lastSentAt) ?? millis(d.createdAt),
    sentTo: String(d.clientEmail ?? d.carrierEmail ?? ''),
    signed: signedAt !== null
      ? { name: String(d.signerName ?? ''), title: String(d.signerTitle ?? ''), at: signedAt, device: String(d.signerDevice ?? '') }
      : null,
    supersededAt: current ? null : millis(d.supersededAt),
    current,
    revoked,
  };
}

/** One party's links for a load. One equality filter, the type in memory — no composite index. */
async function partyTokens(orderId: string, party: AgreementParty) {
  const snap = await adminDb.collection('signing_tokens').where('orderId', '==', orderId).get();
  return snap.docs.filter((d) => d.data().type === TOKEN_TYPE[party]);
}

/** Every version on the load for one party, newest first. */
export async function listAgreementVersions(orderId: string, party: AgreementParty = 'client'): Promise<AgreementVersionInfo[]> {
  const tokens = await partyTokens(orderId, party);
  if (party === 'carrier') {
    // Oldest first: each link replaced the one before it.
    const sorted = tokens.sort((a, b) => (millis(a.data().createdAt) ?? 0) - (millis(b.data().createdAt) ?? 0));
    return sorted.map((t, i) => {
      const next = sorted[i + 1];
      const info = infoOf(t.id, t.data(), !next, Boolean(t.data().revokedAt), i + 1);
      return { ...info, supersededAt: next ? millis(next.data().createdAt) : null };
    }).reverse();
  }
  const out: AgreementVersionInfo[] = [];
  await Promise.all(tokens.map(async (t) => {
    const d = t.data();
    const revoked = Boolean(d.revokedAt);
    out.push(infoOf(t.id, d, true, revoked));
    const versions = await t.ref.collection('versions').get();
    for (const v of versions.docs) out.push(infoOf(t.id, v.data(), false, revoked));
  }));
  return out.sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0) || b.version - a.version);
}

/**
 * One version's stored copy, by ref — refused unless it belongs to this
 * order, so a ref from another load opens nothing.
 */
export async function readAgreementVersion(orderId: string, ref: string): Promise<{ data: Data; current: boolean; token: Data } | null> {
  const [token, raw] = ref.split('~');
  const n = Number(raw);
  if (!token || !/^[a-f0-9]{16,128}$/i.test(token) || !Number.isInteger(n) || n < 1) return null;
  const snap = await adminDb.collection('signing_tokens').doc(token).get();
  const d = snap.data();
  if (!d || d.orderId !== orderId) return null;
  // A carrier link is one version; its ref names the link, and the number is only a label.
  if (d.type === 'carrier_agreement') return { data: d, current: true, token: d };
  if (d.type !== 'shipper_agreement') return null;
  if ((typeof d.version === 'number' ? d.version : 1) === n) return { data: d, current: true, token: d };
  const v = await snap.ref.collection('versions').doc(String(n)).get();
  return v.exists ? { data: v.data()!, current: false, token: d } : null;
}

function spelled(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Why a version no longer counts, or '' while it still does. A non-empty
 * answer stamps the PDF VOID on every page (see signed-agreement-pdf.tsx), so
 * a superseded copy cannot be mistaken for the live one by anybody holding
 * it — staff, or a client or carrier it was sent or forwarded to.
 *
 * - A client version replaced by a revision (it lives in `versions/`).
 * - A link cancelled because the load moved to another client or carrier.
 * - A carrier link replaced by a later send — marked `replacedAt` since
 *   2026-10-13, and for links sent before that, any carrier link on the load
 *   created after it. That last test also voids a carrier's signed agreement
 *   once the load has gone out to somebody else.
 *
 * A client link on hold is not void: it is waiting on a review, and the
 * version on it is replaced only when the update is actually sent.
 *
 * `token` is the link itself and `version` the copy being drawn — the same
 * document for a current version, an entry in `versions/` for an older one.
 */
export async function voidNoteFor(token: Data, version: Data, current: boolean): Promise<string> {
  const carrier = token.type === 'carrier_agreement';
  const at = (v: unknown) => (v as { toDate?: () => Date } | null)?.toDate?.();

  const revokedAt = at(token.revokedAt);
  if (revokedAt) return `Cancelled on ${spelled(revokedAt)}: the load moved to another ${carrier ? 'carrier' : 'client'}`;

  if (!carrier) {
    if (current) return '';
    const supersededAt = at(version.supersededAt);
    return `Replaced by a later version${supersededAt ? ` on ${spelled(supersededAt)}` : ''}`;
  }

  const replacedAt = at(token.replacedAt);
  if (replacedAt) return `Replaced by a later Carrier Agreement on ${spelled(replacedAt)}`;
  if (!token.orderId) return '';
  const created = at(token.createdAt)?.getTime() ?? 0;
  const later = (await partyTokens(String(token.orderId), 'carrier'))
    .map((t) => at(t.data().createdAt)?.getTime() ?? 0)
    .filter((t) => t > created)
    .sort((a, b) => a - b)[0];
  return later ? `Replaced by a later Carrier Agreement on ${spelled(new Date(later))}` : '';
}

/**
 * The PDF of one stored copy — the current link's, or an older version's.
 * `voidNote` comes from voidNoteFor(); empty means a version still in force.
 */
export async function agreementPdf(data: Data, voidNote: string): Promise<Buffer> {
  const signedAt = data.usedAt?.toDate?.() as Date | undefined;
  const pdf: SignedAgreementData = {
    form: signFormData(data),
    signature: signedAt ? {
      name: String(data.signerName ?? ''),
      title: String(data.signerTitle ?? ''),
      at: signatureTime(signedAt),
      ip: String(data.signerIp ?? ''),
      device: String(data.signerDevice ?? ''),
      esignConsent: data.esignConsent === true,
      termsAccepted: data.termsAccepted === true,
    } : null,
    sentTo: String(data.clientEmail ?? data.carrierEmail ?? ''),
    voidNote,
    generatedAt: signatureTime(new Date()),
  };
  return generateSignedAgreementBuffer(pdf);
}

/**
 * "Signed SA TTL26000123 v2.pdf", "Carrier Agreement TTL26000123 v1 VOID.pdf"
 * — safe as a file name. VOID in the name too, so a superseded copy says so
 * in a downloads folder or an attachment list before anybody opens it.
 */
export function agreementFileName(data: Data, voided = false): string {
  const number = String(data.orderNumber ?? 'order').replace(/[\\/:*?"<>|]/g, '-');
  const version = typeof data.version === 'number' ? ` v${data.version}` : '';
  const doc = data.type === 'carrier_agreement' ? 'Carrier Agreement' : 'SA';
  return `${data.usedAt ? `Signed ${doc}` : doc} ${number}${version}${voided ? ' VOID' : ''}.pdf`;
}
