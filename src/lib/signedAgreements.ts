import { adminDb } from './firebase-admin';
import { signFormData } from './signFormProps';
import {
  generateSignedAgreementBuffer, signatureTime, type SignedAgreementData,
} from './signed-agreement-pdf';

/**
 * Every version of the client's Shipper Agreement a load has had, and each
 * one as a PDF.
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

function infoOf(token: string, d: Data, current: boolean, revoked: boolean): AgreementVersionInfo {
  const version = typeof d.version === 'number' ? d.version : 1;
  const signedAt = millis(d.usedAt);
  return {
    ref: `${token}~${version}`,
    version,
    sentAt: millis(d.lastSentAt) ?? millis(d.createdAt),
    sentTo: String(d.clientEmail ?? ''),
    signed: signedAt !== null
      ? { name: String(d.signerName ?? ''), title: String(d.signerTitle ?? ''), at: signedAt, device: String(d.signerDevice ?? '') }
      : null,
    supersededAt: current ? null : millis(d.supersededAt),
    current,
    revoked,
  };
}

/** The client links for a load. One equality filter, the type in memory — no composite index. */
async function clientTokens(orderId: string) {
  const snap = await adminDb.collection('signing_tokens').where('orderId', '==', orderId).get();
  // `shipper_agreement` is the client's load confirmation; the name is historical.
  return snap.docs.filter((d) => d.data().type === 'shipper_agreement');
}

/** Every version on the load, newest first. */
export async function listAgreementVersions(orderId: string): Promise<AgreementVersionInfo[]> {
  const tokens = await clientTokens(orderId);
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
export async function readAgreementVersion(orderId: string, ref: string): Promise<{ data: Data; current: boolean } | null> {
  const [token, raw] = ref.split('~');
  const n = Number(raw);
  if (!token || !/^[a-f0-9]{16,128}$/i.test(token) || !Number.isInteger(n) || n < 1) return null;
  const snap = await adminDb.collection('signing_tokens').doc(token).get();
  const d = snap.data();
  if (!d || d.orderId !== orderId || d.type !== 'shipper_agreement') return null;
  if ((typeof d.version === 'number' ? d.version : 1) === n) return { data: d, current: true };
  const v = await snap.ref.collection('versions').doc(String(n)).get();
  return v.exists ? { data: v.data()!, current: false } : null;
}

/** The PDF of one stored copy — the current link's, or an older version's. */
export async function agreementPdf(data: Data, current: boolean): Promise<Buffer> {
  const signedAt = data.usedAt?.toDate?.() as Date | undefined;
  const supersededAt = current ? null : data.supersededAt?.toDate?.() as Date | undefined;
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
    sentTo: String(data.clientEmail ?? ''),
    supersededNote: supersededAt
      ? `Replaced by a later version on ${supersededAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
      : '',
    generatedAt: signatureTime(new Date()),
  };
  return generateSignedAgreementBuffer(pdf);
}

/** "Signed SA TTL26000123 v2.pdf" — safe as a file name. */
export function agreementFileName(data: Data): string {
  const number = String(data.orderNumber ?? 'order').replace(/[\\/:*?"<>|]/g, '-');
  const version = typeof data.version === 'number' ? ` v${data.version}` : '';
  return `${data.usedAt ? 'Signed SA' : 'SA'} ${number}${version}.pdf`;
}
